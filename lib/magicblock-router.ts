import { type Commitment, Connection, Transaction } from "@solana/web3.js";

interface MagicRouterBlockhashResult {
  blockhash: string;
  lastValidBlockHeight: number;
}

interface MagicRouterJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface MagicRouterJsonRpcResponse {
  result?: unknown;
  error?: MagicRouterJsonRpcError;
}

export type MagicRouterFallbackReason =
  | "router-disabled"
  | "router-rpc-missing"
  | "no-writable-accounts"
  | "router-http-error"
  | "router-jsonrpc-error"
  | "router-invalid-response"
  | "router-timeout"
  | "router-network-error";

export interface TransactionBlockhashResolution {
  source: "magicblock-router" | "solana-rpc-fallback";
  blockhash: string;
  lastValidBlockHeight: number;
  writableAccounts: string[];
  routerRpcUrl: string | null;
  confirmationRpcUrl: string;
  fallbackReason: MagicRouterFallbackReason | null;
}

interface ResolveTransactionBlockhashInput {
  transaction: Transaction;
  primaryConnection: Connection;
  primaryRpcUrl: string;
  fallbackRpcUrl?: string | null;
  routerRpcUrl?: string | null;
  routerEnabled?: boolean;
  routerTimeoutMs?: number;
  commitment?: Commitment;
}

const MAGICBLOCK_METHOD = "getBlockhashForAccounts";
const MAGICBLOCK_REQUEST_ID = "whisperpay-magicblock";
const DEFAULT_COMMITMENT: Commitment = "confirmed";
const DEFAULT_ROUTER_TIMEOUT_MS = 4500;

const isMagicRouterBlockhashResult = (value: unknown): value is MagicRouterBlockhashResult => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.blockhash === "string" && typeof candidate.lastValidBlockHeight === "number";
};

const normalizeUrl = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const toRouterFetchFailureReason = (error: unknown): MagicRouterFallbackReason => {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "router-timeout";
  }

  return "router-network-error";
};

export const getWritableAccounts = (transaction: Transaction): string[] => {
  const writable = new Set<string>();

  if (transaction.feePayer) {
    writable.add(transaction.feePayer.toBase58());
  }

  for (const instruction of transaction.instructions) {
    for (const key of instruction.keys) {
      if (key.isWritable) {
        writable.add(key.pubkey.toBase58());
      }
    }
  }

  return Array.from(writable);
};

const fetchMagicRouterBlockhash = async (
  routerRpcUrl: string,
  writableAccounts: string[],
  timeoutMs: number
): Promise<{ result: MagicRouterBlockhashResult | null; reason: MagicRouterFallbackReason | null }> => {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const response = await fetch(routerRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: abortController.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: MAGICBLOCK_REQUEST_ID,
        method: MAGICBLOCK_METHOD,
        params: [writableAccounts]
      })
    });

    if (!response.ok) {
      return { result: null, reason: "router-http-error" };
    }

    const payload = (await response.json()) as MagicRouterJsonRpcResponse;

    if (payload.error) {
      return { result: null, reason: "router-jsonrpc-error" };
    }

    if (!isMagicRouterBlockhashResult(payload.result)) {
      return { result: null, reason: "router-invalid-response" };
    }

    return { result: payload.result, reason: null };
  } catch (error) {
    return { result: null, reason: toRouterFetchFailureReason(error) };
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const resolveFallbackBlockhash = async (
  connection: Connection,
  commitment: Commitment
): Promise<MagicRouterBlockhashResult> => connection.getLatestBlockhash(commitment);

export const resolveTransactionBlockhash = async (
  input: ResolveTransactionBlockhashInput
): Promise<TransactionBlockhashResolution> => {
  const {
    transaction,
    primaryConnection,
    primaryRpcUrl,
    fallbackRpcUrl,
    routerRpcUrl,
    routerEnabled = true,
    routerTimeoutMs = DEFAULT_ROUTER_TIMEOUT_MS,
    commitment = DEFAULT_COMMITMENT
  } = input;

  const writableAccounts = getWritableAccounts(transaction);
  const normalizedRouterRpcUrl = normalizeUrl(routerRpcUrl);
  const normalizedPrimaryRpcUrl = primaryRpcUrl.trim();
  const normalizedFallbackRpcUrl = normalizeUrl(fallbackRpcUrl) ?? normalizedPrimaryRpcUrl;
  let fallbackReason: MagicRouterFallbackReason | null = null;

  if (!routerEnabled) {
    fallbackReason = "router-disabled";
  } else if (!normalizedRouterRpcUrl) {
    fallbackReason = "router-rpc-missing";
  } else if (writableAccounts.length === 0) {
    fallbackReason = "no-writable-accounts";
  } else {
    const routerResult = await fetchMagicRouterBlockhash(normalizedRouterRpcUrl, writableAccounts, routerTimeoutMs);

    if (routerResult.result) {
      return {
        source: "magicblock-router",
        blockhash: routerResult.result.blockhash,
        lastValidBlockHeight: routerResult.result.lastValidBlockHeight,
        writableAccounts,
        routerRpcUrl: normalizedRouterRpcUrl,
        confirmationRpcUrl: normalizedPrimaryRpcUrl,
        fallbackReason: null
      };
    }

    fallbackReason = routerResult.reason ?? "router-invalid-response";
  }

  const fallbackConnection =
    normalizedFallbackRpcUrl === normalizedPrimaryRpcUrl
      ? primaryConnection
      : new Connection(normalizedFallbackRpcUrl, commitment);

  try {
    const latestBlockhash = await resolveFallbackBlockhash(fallbackConnection, commitment);

    return {
      source: "solana-rpc-fallback",
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      writableAccounts,
      routerRpcUrl: normalizedRouterRpcUrl,
      confirmationRpcUrl: normalizedFallbackRpcUrl,
      fallbackReason
    };
  } catch (fallbackError) {
    if (normalizedFallbackRpcUrl !== normalizedPrimaryRpcUrl) {
      const latestBlockhash = await resolveFallbackBlockhash(primaryConnection, commitment);

      return {
        source: "solana-rpc-fallback",
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        writableAccounts,
        routerRpcUrl: normalizedRouterRpcUrl,
        confirmationRpcUrl: normalizedPrimaryRpcUrl,
        fallbackReason
      };
    }

    const detail = fallbackError instanceof Error ? fallbackError.message : "Unknown fallback RPC error";
    throw new Error(`Unable to resolve a recent blockhash using router or fallback RPC. ${detail}`);
  }
};

export const getMagicRouterFallbackReasonLabel = (reason: MagicRouterFallbackReason | null): string => {
  switch (reason) {
    case "router-disabled":
      return "router disabled by config";
    case "router-rpc-missing":
      return "router RPC URL is missing";
    case "no-writable-accounts":
      return "no writable accounts to route";
    case "router-http-error":
      return "router RPC returned HTTP error";
    case "router-jsonrpc-error":
      return "router RPC returned JSON-RPC error";
    case "router-invalid-response":
      return "router RPC returned invalid response";
    case "router-timeout":
      return "router RPC timed out";
    case "router-network-error":
      return "router RPC network error";
    default:
      return "fallback used";
  }
};
