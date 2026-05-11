import { generateMirageTransferCommand } from "../mirage";
import type { MirageExecutor, MirageExecutionResult, WorkerFetch } from "../agent-worker/runner";

export type NativeDevnetFallbackRail = "native-devnet-fallback";
export type MagicBlockRailMode = "mirage" | "payments-api" | "off";
export type MagicBlockExecutionRail = "magicblock-mirage" | "magicblock-private-payments-api";
export type ExecutionRail = NativeDevnetFallbackRail | MagicBlockExecutionRail;
export type MagicBlockRailStatus = "attempted" | "confirmed" | "failed";

export interface ExecuteMagicBlockRailInput {
  paylinkId: string;
  agentId: string;
  controllerWallet: string;
  recipient: string;
  amount: string;
  displayMint: string;
  executionMint: string;
  memo: string;
  visibility: "private";
  split: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export interface ExecuteMagicBlockRailResult {
  status: MagicBlockRailStatus;
  txSignature: string | null;
  rail: MagicBlockExecutionRail;
  error: string | null;
  rawResponse: unknown | null;
}

interface ExecuteMagicBlockRailOptions {
  env?: Record<string, string | undefined>;
  fetch?: WorkerFetch;
  executeMirage?: MirageExecutor;
  mirageArgv?: string[];
  mirageDisplayCommand?: string;
  walletName?: string;
}

interface MagicBlockPaymentsApiResponse {
  txSignature?: unknown;
  signature?: unknown;
  transactionSignature?: unknown;
  status?: unknown;
  error?: unknown;
  [key: string]: unknown;
}

const DEFAULT_CLUSTER = "devnet";
const DEFAULT_WALLET_NAME = "agent-treasury";
const NOT_CONFIGURED_ERROR = "MagicBlock Private Payments API is not configured.";
const SOLANA_SIGNATURE_PATTERN = /[1-9A-HJ-NP-Za-km-z]{64,96}/g;

const readEnv = (options?: ExecuteMagicBlockRailOptions): Record<string, string | undefined> =>
  options?.env ?? process.env;

export const parseMagicBlockRailMode = (
  value: string | null | undefined
): MagicBlockRailMode => {
  const normalized = value?.trim().toLowerCase();

  if (normalized === "mirage" || normalized === "payments-api") {
    return normalized;
  }

  return "off";
};

export const getMagicBlockRailMode = (
  env: Record<string, string | undefined> = process.env
): MagicBlockRailMode => parseMagicBlockRailMode(env.MAGICBLOCK_RAIL_MODE);

export const getMagicBlockCluster = (
  env: Record<string, string | undefined> = process.env
): string => env.MAGICBLOCK_CLUSTER?.trim() || DEFAULT_CLUSTER;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const safeMirageRawResponse = (
  displayCommand: string,
  error: string | null,
  execution?: MirageExecutionResult
) => ({
  attempted: true,
  command: displayCommand,
  ...(execution?.stdout ? { stdoutPreview: execution.stdout.slice(0, 500) } : {}),
  ...(execution?.stderr ? { stderrPreview: execution.stderr.slice(0, 500) } : {}),
  ...(error ? { error } : {})
});

const sanitizePaymentsApiResponse = (payload: unknown): unknown => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const source = payload as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (/api[-_]?key|authorization|token|secret|private/i.test(key)) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
};

const readResponsePayload = async (response: Response): Promise<unknown> => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("application/json")) {
    return response.json() as Promise<unknown>;
  }

  return response.text();
};

const extractPaymentsApiSignature = (payload: unknown): string | null => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const response = payload as MagicBlockPaymentsApiResponse;
  const candidate = response.txSignature ?? response.signature ?? response.transactionSignature;
  const parsed = typeof candidate === "string" ? candidate.match(SOLANA_SIGNATURE_PATTERN)?.[0] ?? candidate.trim() : "";
  return parsed || null;
};

const extractMirageSignature = (output: string): string | null => output.match(SOLANA_SIGNATURE_PATTERN)?.[0] ?? null;

const buildPaymentsApiRequestBody = (input: ExecuteMagicBlockRailInput, cluster: string) => ({
  paylinkId: input.paylinkId,
  agentId: input.agentId,
  controllerWallet: input.controllerWallet,
  recipient: input.recipient,
  amount: input.amount,
  displayMint: input.displayMint,
  executionMint: input.executionMint,
  memo: input.memo,
  visibility: input.visibility,
  split: input.split,
  minDelayMs: input.minDelayMs,
  maxDelayMs: input.maxDelayMs,
  cluster
});

const executeMirageRail = async (
  input: ExecuteMagicBlockRailInput,
  options?: ExecuteMagicBlockRailOptions
): Promise<ExecuteMagicBlockRailResult> => {
  const generatedCommand = generateMirageTransferCommand({
    walletName: options?.walletName ?? DEFAULT_WALLET_NAME,
    recipient: input.recipient,
    amount: input.amount,
    mint: input.executionMint,
    memo: input.memo,
    visibility: input.visibility,
    split: input.split,
    minDelayMs: input.minDelayMs,
    maxDelayMs: input.maxDelayMs,
    cluster: getMagicBlockCluster(readEnv(options))
  });
  const argv = options?.mirageArgv ?? generatedCommand.argv;
  const displayCommand = options?.mirageDisplayCommand ?? generatedCommand.displayCommand;

  if (!options?.executeMirage) {
    const error = "Mirage executor is not configured.";
    return {
      status: "failed",
      txSignature: null,
      rail: "magicblock-mirage",
      error,
      rawResponse: safeMirageRawResponse(displayCommand, error)
    };
  }

  try {
    const execution = await options.executeMirage(argv);
    const txSignature = extractMirageSignature(`${execution.stdout}\n${execution.stderr}`);

    if (!txSignature) {
      const error = "Could not parse a Solana tx signature from Mirage output.";
      return {
        status: "failed",
        txSignature: null,
        rail: "magicblock-mirage",
        error,
        rawResponse: safeMirageRawResponse(displayCommand, error, execution)
      };
    }

    return {
      status: "confirmed",
      txSignature,
      rail: "magicblock-mirage",
      error: null,
      rawResponse: safeMirageRawResponse(displayCommand, null, execution)
    };
  } catch (error) {
    const message = errorMessage(error);
    return {
      status: "failed",
      txSignature: null,
      rail: "magicblock-mirage",
      error: message,
      rawResponse: safeMirageRawResponse(displayCommand, message)
    };
  }
};

const executePaymentsApiRail = async (
  input: ExecuteMagicBlockRailInput,
  options?: ExecuteMagicBlockRailOptions
): Promise<ExecuteMagicBlockRailResult> => {
  const env = readEnv(options);
  const apiUrl = env.MAGICBLOCK_PRIVATE_PAYMENTS_API_URL?.trim();

  if (!apiUrl) {
    return {
      status: "failed",
      txSignature: null,
      rail: "magicblock-private-payments-api",
      error: NOT_CONFIGURED_ERROR,
      rawResponse: null
    };
  }

  const apiKey = env.MAGICBLOCK_PRIVATE_PAYMENTS_API_KEY?.trim();
  const fetchFn = options?.fetch ?? fetch;
  const headers = new Headers({
    "Content-Type": "application/json"
  });

  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  try {
    const response = await fetchFn(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(buildPaymentsApiRequestBody(input, getMagicBlockCluster(env)))
    });
    const payload = await readResponsePayload(response);
    const rawResponse = sanitizePaymentsApiResponse(payload);

    if (!response.ok) {
      const apiError =
        payload && typeof payload === "object" && !Array.isArray(payload) && typeof (payload as MagicBlockPaymentsApiResponse).error === "string"
          ? String((payload as MagicBlockPaymentsApiResponse).error)
          : `MagicBlock Private Payments API failed with HTTP ${response.status}.`;
      return {
        status: "failed",
        txSignature: null,
        rail: "magicblock-private-payments-api",
        error: apiError,
        rawResponse
      };
    }

    const txSignature = extractPaymentsApiSignature(payload);

    if (!txSignature) {
      return {
        status: "attempted",
        txSignature: null,
        rail: "magicblock-private-payments-api",
        error: null,
        rawResponse
      };
    }

    return {
      status: "confirmed",
      txSignature,
      rail: "magicblock-private-payments-api",
      error: null,
      rawResponse
    };
  } catch (error) {
    return {
      status: "failed",
      txSignature: null,
      rail: "magicblock-private-payments-api",
      error: errorMessage(error),
      rawResponse: null
    };
  }
};

export const executeMagicBlockRail = async (
  input: ExecuteMagicBlockRailInput,
  options?: ExecuteMagicBlockRailOptions
): Promise<ExecuteMagicBlockRailResult> => {
  const mode = getMagicBlockRailMode(readEnv(options));

  if (mode === "payments-api") {
    return executePaymentsApiRail(input, options);
  }

  if (mode === "off") {
    return {
      status: "failed",
      txSignature: null,
      rail: "magicblock-mirage",
      error: "MagicBlock rail mode is off.",
      rawResponse: null
    };
  }

  return executeMirageRail(input, options);
};
