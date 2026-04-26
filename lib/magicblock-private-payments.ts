import {
  getAuthToken,
  verifyTeeRpcIntegrity
} from "@magicblock-labs/ephemeral-rollups-sdk";
import {
  type Commitment,
  Connection,
  PublicKey,
  type Signer,
  Transaction
} from "@solana/web3.js";
import { sendRoutedTransaction, type RoutedTransactionResolution } from "./magicblock-transaction";

const DEFAULT_COMMITMENT: Commitment = "confirmed";

type PrivateApiCluster = "devnet" | "mainnet";
type PrivateSendTarget = "base" | "ephemeral";

interface PrivateTransferApiResponse {
  transactionBase64: string;
  sendTo: PrivateSendTarget;
  recentBlockhash?: string;
  lastValidBlockHeight?: number;
}

interface BuildPrivateTransferInput {
  apiBaseUrl: string;
  cluster: PrivateApiCluster;
  senderWallet: PublicKey;
  recipientWallet: PublicKey;
  mint: PublicKey;
  amountBaseUnits: bigint;
  memo: string | null;
}

interface BuildPrivateTransferResult {
  transaction: Transaction;
  sendTarget: PrivateSendTarget;
  mint: string;
  visibility: "private";
  txBuilderSource: "magicblock-private-payments-api";
}

interface SendPrivateTransferInput {
  prepared: BuildPrivateTransferResult;
  primaryConnection: Connection;
  primaryRpcUrl: string;
  fallbackRpcUrl: string | null;
  routerRpcUrl: string | null;
  routerEnabled: boolean;
  routerTimeoutMs: number;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  sendFallbackTransaction: (transaction: Transaction) => Promise<string>;
  onStageChange?: (stage: "resolving-route" | "awaiting-wallet" | "submitting-router" | "confirming") => void;
}

interface SendPrivateTransferResult {
  signature: string;
  routing: RoutedTransactionResolution;
  sendTarget: PrivateSendTarget;
}

interface FetchPrivateTransferMemoInput {
  teeRpcUrl: string;
  signature: string;
  walletPublicKey: PublicKey;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  verifyTeeIntegrity: boolean;
}

const parsePrivateApiResponse = async (response: Response): Promise<PrivateTransferApiResponse> => {
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Private Payments API HTTP ${response.status}${body ? `: ${body}` : ""}`);
  }

  const payload = (await response.json()) as Partial<PrivateTransferApiResponse>;

  if (!payload.transactionBase64 || !payload.sendTo) {
    throw new Error("Private Payments API returned an invalid transfer payload.");
  }

  return {
    transactionBase64: payload.transactionBase64,
    sendTo: payload.sendTo,
    recentBlockhash: payload.recentBlockhash,
    lastValidBlockHeight: payload.lastValidBlockHeight
  };
};

export const resolvePrivateApiCluster = (network: string): PrivateApiCluster =>
  network === "mainnet-beta" || network === "mainnet" ? "mainnet" : "devnet";

export const buildMagicPrivateTransferTransaction = async (
  input: BuildPrivateTransferInput
): Promise<BuildPrivateTransferResult> => {
  const { apiBaseUrl, cluster, senderWallet, recipientWallet, mint, amountBaseUnits, memo } = input;
  const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/v1/spl/transfer`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: senderWallet.toBase58(),
      to: recipientWallet.toBase58(),
      mint: mint.toBase58(),
      amount: amountBaseUnits.toString(),
      visibility: "private",
      fromBalance: "base",
      toBalance: "base",
      initFromBalance: true,
      initToBalance: true,
      memo: memo?.trim() || undefined,
      cluster
    })
  });

  const payload = await parsePrivateApiResponse(response);
  const raw = Uint8Array.from(atob(payload.transactionBase64), (char) => char.charCodeAt(0));
  const transaction = Transaction.from(raw);

  return {
    transaction,
    sendTarget: payload.sendTo,
    mint: mint.toBase58(),
    visibility: "private",
    txBuilderSource: "magicblock-private-payments-api"
  };
};

export const sendMagicPrivateTransferTransaction = async (
  input: SendPrivateTransferInput
): Promise<SendPrivateTransferResult> => {
  const { prepared, ...sendInput } = input;

  const result = await sendRoutedTransaction({
    transaction: prepared.transaction,
    primaryConnection: sendInput.primaryConnection,
    primaryRpcUrl: sendInput.primaryRpcUrl,
    fallbackRpcUrl: sendInput.fallbackRpcUrl,
    routerRpcUrl: sendInput.routerRpcUrl,
    routerEnabled: sendInput.routerEnabled,
    routerTimeoutMs: sendInput.routerTimeoutMs,
    commitment: DEFAULT_COMMITMENT,
    signTransaction: sendInput.signTransaction,
    sendFallbackTransaction: sendInput.sendFallbackTransaction,
    onStageChange: sendInput.onStageChange
  });

  return {
    signature: result.signature,
    routing: result.routing,
    sendTarget: prepared.sendTarget
  };
};

const resolveAuthenticatedRpcUrl = (teeRpcUrl: string, token: string): string => {
  const separator = teeRpcUrl.includes("?") ? "&" : "?";
  return `${teeRpcUrl}${separator}token=${encodeURIComponent(token)}`;
};

const extractMemoFromParsedTransaction = (transaction: Awaited<ReturnType<Connection["getParsedTransaction"]>>): string | null => {
  if (!transaction) {
    return null;
  }

  for (const instruction of transaction.transaction.message.instructions) {
    const candidate = instruction as
      | { program?: string; parsed?: unknown }
      | { programId?: PublicKey; parsed?: unknown };

    if ("program" in candidate && candidate.program === "spl-memo") {
      if (typeof candidate.parsed === "string") {
        return candidate.parsed;
      }

      if (
        candidate.parsed &&
        typeof candidate.parsed === "object" &&
        "memo" in candidate.parsed &&
        typeof (candidate.parsed as { memo?: unknown }).memo === "string"
      ) {
        return (candidate.parsed as { memo: string }).memo;
      }
    }
  }

  return null;
};

export const fetchMagicPrivateTransferMemo = async (
  input: FetchPrivateTransferMemoInput
): Promise<{ memo: string | null; authTokenExpiresAt: number }> => {
  const { teeRpcUrl, signature, walletPublicKey, signMessage, verifyTeeIntegrity } = input;

  if (verifyTeeIntegrity) {
    const integrity = await verifyTeeRpcIntegrity(teeRpcUrl);

    if (!integrity) {
      throw new Error("TEE integrity verification failed.");
    }
  }

  const auth = await getAuthToken(teeRpcUrl, walletPublicKey, signMessage);
  const authenticatedRpcUrl = resolveAuthenticatedRpcUrl(teeRpcUrl, auth.token);
  const connection = new Connection(authenticatedRpcUrl, DEFAULT_COMMITMENT);
  const parsedTransaction = await connection.getParsedTransaction(signature, {
    commitment: DEFAULT_COMMITMENT,
    maxSupportedTransactionVersion: 0
  });

  return {
    memo: extractMemoFromParsedTransaction(parsedTransaction),
    authTokenExpiresAt: auth.expiresAt
  };
};

export const toTokenBaseUnits = (displayAmount: number, decimals: number): bigint => {
  if (!Number.isFinite(displayAmount) || displayAmount <= 0) {
    return 0n;
  }

  const multiplier = 10 ** decimals;
  const amount = Math.round(displayAmount * multiplier);
  return BigInt(amount);
};
