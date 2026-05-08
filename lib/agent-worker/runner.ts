import type { PendingAgentSpendExecution } from "../agent-spend/pending-execution";
import { WORKER_SECRET_HEADER } from "../agent-spend/worker-auth";
import { isLikelySolanaSignature } from "../solana-validation";
import { createTelegramBotClient, type TelegramBotClient } from "../telegram/client";
import { validateMirageTransferArgv } from "./validation";

export interface AgentWorkerConfig {
  baseUrl: string;
  workerSecret?: string | null;
  agentWalletName: string;
  dryRun: boolean;
  executionEnabled: boolean;
  telegramBotToken?: string | null;
  mirageExecutionMint?: string | null;
  executionFallbackMode?: string | null;
  solanaExecutorSecretKeyJson?: string | null;
}

export interface AgentWorkerRunResult {
  fetched: number;
  planned: number;
  executed: number;
  confirmed: number;
  errors: string[];
}

export interface MirageExecutionResult {
  stdout: string;
  stderr: string;
}

export interface SolanaDevnetNativeTransferInput {
  paylinkId: string;
  agentId: string;
  recipient: string;
  amount: string;
  displayMint: string;
  secretKeyJson: string;
}

export interface SolanaDevnetNativeTransferResult {
  txSignature: string;
}

export interface SolanaDevnetSplTransferInput {
  recipient: string;
  amount: string;
  mint: string;
  secretKeyJson: string;
}

export interface SolanaDevnetSplTransferResult {
  txSignature: string;
}

export type WorkerFetch = typeof fetch;
export type MirageExecutor = (argv: string[]) => Promise<MirageExecutionResult>;
export type SolanaDevnetNativeExecutor = (
  input: SolanaDevnetNativeTransferInput
) => Promise<SolanaDevnetNativeTransferResult>;
export type SolanaDevnetSplExecutor = (input: SolanaDevnetSplTransferInput) => Promise<SolanaDevnetSplTransferResult>;
export type WorkerLogger = Pick<Console, "log" | "error"> & Partial<Pick<Console, "warn">>;

interface RunAgentWorkerOnceOptions {
  config: AgentWorkerConfig;
  fetch?: WorkerFetch;
  executeMirage?: MirageExecutor;
  executeSolanaDevnetNative?: SolanaDevnetNativeExecutor;
  executeSolanaDevnetSpl?: SolanaDevnetSplExecutor;
  telegramClient?: TelegramBotClient;
  logger?: WorkerLogger;
}

interface PendingExecutionBody {
  pending?: PendingAgentSpendExecution[];
}

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_AGENT_WALLET_NAME = "agent-treasury";
const PENDING_EXECUTION_PATH = "/api/agent-spend/pending-execution";
const CONFIRM_MANUAL_PATH = "/api/agent-spend/confirm-manual";

export const assertRequiredAgentWorkerDaemonEnv = (
  env: Record<string, string | undefined> = process.env
): void => {
  if (!env.WHISPERVAULT_BASE_URL?.trim()) {
    throw new Error("WHISPERVAULT_BASE_URL is required for the Agent Worker daemon.");
  }

  if (!env.WHISPERVAULT_WORKER_SECRET?.trim()) {
    throw new Error("WHISPERVAULT_WORKER_SECRET is required for the Agent Worker daemon.");
  }
};

export const parseAgentWorkerConfig = (
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): AgentWorkerConfig => {
  const dryRun = argv.includes("--dry-run");
  const baseUrl = env.WHISPERVAULT_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const executionEnabled = env.MIRAGE_EXECUTION_ENABLED?.trim().toLowerCase() === "true";

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    workerSecret: env.WHISPERVAULT_WORKER_SECRET?.trim() || null,
    agentWalletName: env.AGENT_WALLET_NAME?.trim() || DEFAULT_AGENT_WALLET_NAME,
    dryRun,
    executionEnabled,
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || null,
    mirageExecutionMint: env.MIRAGE_EXECUTION_MINT?.trim() || null,
    executionFallbackMode: env.EXECUTION_FALLBACK_MODE?.trim() || null,
    solanaExecutorSecretKeyJson: env.SOLANA_EXECUTOR_SECRET_KEY_JSON?.trim() || null
  };
};

export const extractSolanaTxSignature = (output: string): string | null => {
  const candidates = output.match(/[1-9A-HJ-NP-Za-km-z]{64,96}/g) ?? [];
  return candidates.find(isLikelySolanaSignature) ?? null;
};

const buildHeaders = (workerSecret?: string | null): Headers => {
  const headers = new Headers({
    "Content-Type": "application/json"
  });

  if (workerSecret) {
    headers.set(WORKER_SECRET_HEADER, workerSecret);
  }

  return headers;
};

const buildControlPlaneUrl = (baseUrl: string, path: string): string => `${baseUrl.replace(/\/+$/, "")}${path}`;

const readResponseBody = async (response: Response): Promise<string> => {
  try {
    return await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `(failed to read response body: ${message})`;
  }
};

const formatErrorCause = (error: unknown): string | null => {
  if (!(error instanceof Error)) {
    return error === undefined || error === null ? null : String(error);
  }

  const cause = (error as Error & { cause?: unknown }).cause;

  if (!cause) {
    return null;
  }

  const maybeAggregate = cause as { errors?: unknown[]; message?: string };

  if (Array.isArray(maybeAggregate.errors)) {
    const messages = maybeAggregate.errors
      .map((nested: unknown) => (nested instanceof Error ? nested.message : String(nested)))
      .filter(Boolean);
    return messages.length > 0 ? messages.join("; ") : maybeAggregate.message ?? null;
  }

  return cause instanceof Error ? cause.message : String(cause);
};

const parsePendingExecutionPayload = (payload: unknown): PendingAgentSpendExecution[] => {
  if (Array.isArray(payload)) {
    return payload as PendingAgentSpendExecution[];
  }

  const body = payload as PendingExecutionBody | null;
  return Array.isArray(body?.pending) ? body.pending : [];
};

const fetchPendingExecutions = async (
  baseUrl: string,
  workerSecret: string | null | undefined,
  fetchFn: WorkerFetch,
  logger: WorkerLogger
): Promise<PendingAgentSpendExecution[]> => {
  const endpoint = buildControlPlaneUrl(baseUrl, PENDING_EXECUTION_PATH);
  logger.log(`Pending execution endpoint: ${endpoint}`);

  let response: Response;

  try {
    response = await fetchFn(endpoint, {
      method: "GET",
      headers: buildHeaders(workerSecret)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = formatErrorCause(error);
    throw new Error(`Pending execution fetch failed for ${endpoint}: ${message}${cause ? ` (cause: ${cause})` : ""}`);
  }

  if (!response.ok) {
    const responseBody = await readResponseBody(response);
    throw new Error(
      `Pending execution request failed for ${endpoint}: HTTP ${response.status} ${response.statusText}. Body: ${responseBody}`
    );
  }

  const payload = (await response.json()) as unknown;
  return parsePendingExecutionPayload(payload);
};

const confirmExecution = async (
  baseUrl: string,
  workerSecret: string | null | undefined,
  spend: PendingAgentSpendExecution,
  txSignature: string,
  fetchFn: WorkerFetch,
  metadata?: {
    executor?: string;
    executionRail?: string;
    mirageAttempted?: boolean;
    mirageError?: string | null;
  }
): Promise<void> => {
  const response = await fetchFn(buildControlPlaneUrl(baseUrl, CONFIRM_MANUAL_PATH), {
    method: "POST",
    headers: buildHeaders(workerSecret),
    body: JSON.stringify({
      paylinkId: spend.paylinkId,
      txSignature,
      executor: metadata?.executor ?? "mirage-cli",
      ...(metadata?.executionRail ? { executionRail: metadata.executionRail } : {}),
      ...(metadata?.mirageAttempted !== undefined ? { mirageAttempted: metadata.mirageAttempted } : {}),
      ...(metadata?.mirageError ? { mirageError: metadata.mirageError } : {})
    })
  });

  if (!response.ok) {
    throw new Error(`Confirmation request failed with ${response.status} ${response.statusText}.`);
  }
};

const warn = (logger: WorkerLogger, message: string): void => {
  (logger.warn ?? logger.error)(message);
};

const formatMintLabel = (mint: string): string => {
  const normalized = mint.trim().toUpperCase();

  if (normalized === "USDC" || normalized === "USDC_OR_MINT_ADDRESS") {
    return "USDC";
  }

  return mint.trim() || "USDC";
};

const buildTelegramConfirmationMessage = (
  spend: PendingAgentSpendExecution,
  txSignature: string,
  metadata?: {
    executionRail?: string;
    mirageAttempted?: boolean;
  }
): string => {
  if (metadata?.executionRail === "solana-devnet-native-fallback") {
    return [
      "Execution confirmed",
      "Rail: Solana devnet native fallback",
      `Display spend: ${spend.amount} ${formatMintLabel(spend.mint)}`,
      `Mirage command: ${metadata.mirageAttempted ? "attempted" : "not attempted"}`,
      `Tx: ${txSignature}`
    ].join("\n");
  }

  return [
    "Execution confirmed",
    `Agent: ${spend.agentId}`,
    `Amount: ${spend.amount} ${formatMintLabel(spend.mint)}`,
    `Devnet tx: ${txSignature}`,
    "Receipt: confirmed"
  ].join("\n");
};

const notifyTelegramConfirmation = async (
  spend: PendingAgentSpendExecution,
  txSignature: string,
  config: AgentWorkerConfig,
  logger: WorkerLogger,
  telegramClient?: TelegramBotClient,
  metadata?: {
    executionRail?: string;
    mirageAttempted?: boolean;
  }
): Promise<void> => {
  const chatId = spend.telegram?.telegramChatId?.trim();

  if (!chatId) {
    logger.log("Telegram notification: skipped (no telegramChatId)");
    return;
  }

  if (!config.telegramBotToken) {
    warn(logger, "Telegram notification: skipped (missing TELEGRAM_BOT_TOKEN)");
    return;
  }

  const client =
    telegramClient ??
    createTelegramBotClient({
      token: config.telegramBotToken
    });

  try {
    await client.sendMessage(chatId, buildTelegramConfirmationMessage(spend, txSignature, metadata), {
      disableWebPagePreview: true
    });
    logger.log("Telegram notification: sent");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(logger, `Telegram notification: failed (${reason})`);
  }
};

const replaceMirageMintArg = (argv: string[], mint: string | null | undefined): string[] => {
  const executionMint = mint?.trim();

  if (!executionMint) {
    return [...argv];
  }

  const nextArgv = [...argv];
  const mintIndex = nextArgv.indexOf("--mint");

  if (mintIndex < 0 || mintIndex + 1 >= nextArgv.length) {
    return nextArgv;
  }

  nextArgv[mintIndex + 1] = executionMint;
  return nextArgv;
};

const resolveExecutionMint = (spend: PendingAgentSpendExecution, config: AgentWorkerConfig): string => {
  const executionMint = process.env.MIRAGE_EXECUTION_MINT || config.mirageExecutionMint || spend.mint;
  return executionMint.trim() || spend.mint;
};

const isSolanaDevnetNativeFallbackEnabled = (config: AgentWorkerConfig): boolean =>
  config.executionFallbackMode?.trim() === "solana-devnet-native";

const isSolanaDevnetSplFallbackEnabled = (config: AgentWorkerConfig): boolean =>
  config.executionFallbackMode?.trim() === "solana-devnet-spl";

const buildFallbackMetadata = (executionRail: string, mirageError: string) => ({
  executor: executionRail,
  executionRail,
  mirageAttempted: true,
  mirageError
});

const runSolanaDevnetFallbackCompletion = async (
  spend: PendingAgentSpendExecution,
  mirageError: string,
  executionRail: string,
  txSignature: string,
  options: RunAgentWorkerOnceOptions,
  fetchFn: WorkerFetch,
  logger: WorkerLogger,
  result: AgentWorkerRunResult
): Promise<void> => {
  result.executed += 1;
  const fallbackMetadata = buildFallbackMetadata(executionRail, mirageError);
  await confirmExecution(options.config.baseUrl, options.config.workerSecret, spend, txSignature, fetchFn, fallbackMetadata);
  result.confirmed += 1;
  logger.log(`Confirmed ${spend.paylinkId} with tx ${txSignature}`);
  await notifyTelegramConfirmation(spend, txSignature, options.config, logger, options.telegramClient, fallbackMetadata);
};

export const runAgentWorkerOnce = async (
  options: RunAgentWorkerOnceOptions
): Promise<AgentWorkerRunResult> => {
  const fetchFn = options.fetch ?? fetch;
  const logger = options.logger ?? console;
  const pending = await fetchPendingExecutions(options.config.baseUrl, options.config.workerSecret, fetchFn, logger);
  const result: AgentWorkerRunResult = {
    fetched: pending.length,
    planned: 0,
    executed: 0,
    confirmed: 0,
    errors: []
  };

  for (const spend of pending) {
    try {
      const argv = validateMirageTransferArgv(spend.mirage.argv, {
        agentWalletName: options.config.agentWalletName
      });
      const nativeFallbackEnabled = isSolanaDevnetNativeFallbackEnabled(options.config);
      const executionMint = resolveExecutionMint(spend, options.config);
      let executionArgv = argv;
      result.planned += 1;
      if (nativeFallbackEnabled) {
        logger.log(`displayMint=${spend.mint} nativeFallback=true`);
        logger.log(
          `Planned spend ${spend.paylinkId}: amount=${spend.amount} displayMint=${spend.mint} agentId=${spend.agentId}`
        );
      } else {
        executionArgv = replaceMirageMintArg(argv, executionMint);
        logger.log(`displayMint=${spend.mint} executionMint=${executionMint}`);
        logger.log(
          `Planned spend ${spend.paylinkId}: amount=${spend.amount} displayMint=${spend.mint} executionMint=${executionMint} agentId=${spend.agentId}`
        );
      }
      logger.log(`Pending spend ${spend.paylinkId}: mirage ${executionArgv.join(" ")}`);

      if (options.config.dryRun) {
        continue;
      }

      if (!options.config.executionEnabled) {
        logger.log(`Safe mode skip ${spend.paylinkId}: MIRAGE_EXECUTION_ENABLED=false; Mirage execution disabled.`);
        continue;
      }

      if (!options.executeMirage) {
        throw new Error("Mirage executor is not configured.");
      }

      let txSignature: string | null = null;
      let mirageError: string | null = null;

      try {
        const execution = await options.executeMirage(executionArgv);
        result.executed += 1;
        txSignature = extractSolanaTxSignature(`${execution.stdout}\n${execution.stderr}`);

        if (!txSignature) {
          logger.log(execution.stdout);
          logger.error(execution.stderr);
          throw new Error("Could not parse a Solana tx signature from Mirage output. Confirm manually in the UI.");
        }
      } catch (error) {
        mirageError = error instanceof Error ? error.message : String(error);

        if (isSolanaDevnetSplFallbackEnabled(options.config)) {
          if (!options.executeSolanaDevnetSpl) {
            throw new Error(`Mirage failed (${mirageError}) and Solana devnet SPL fallback executor is not configured.`);
          }

          if (!options.config.solanaExecutorSecretKeyJson?.trim()) {
            throw new Error(`Mirage failed (${mirageError}) and SOLANA_EXECUTOR_SECRET_KEY_JSON is required for fallback.`);
          }

          logger.log("trying Solana devnet SPL fallback");
          const fallback = await options.executeSolanaDevnetSpl({
            recipient: spend.recipient,
            amount: spend.amount,
            mint: executionMint,
            secretKeyJson: options.config.solanaExecutorSecretKeyJson
          });
          await runSolanaDevnetFallbackCompletion(
            spend,
            mirageError,
            "solana-devnet-spl-fallback",
            fallback.txSignature,
            options,
            fetchFn,
            logger,
            result
          );
          continue;
        }

        if (!isSolanaDevnetNativeFallbackEnabled(options.config)) {
          throw error;
        }

        logger.log("trying Solana devnet native fallback");
        if (!options.executeSolanaDevnetNative) {
          throw new Error(`Mirage failed (${mirageError}) and Solana devnet native fallback executor is not configured.`);
        }

        if (!options.config.solanaExecutorSecretKeyJson?.trim()) {
          throw new Error(`Mirage failed (${mirageError}) and SOLANA_EXECUTOR_SECRET_KEY_JSON is required for fallback.`);
        }

        const fallback = await options.executeSolanaDevnetNative({
          paylinkId: spend.paylinkId,
          agentId: spend.agentId,
          recipient: spend.recipient,
          amount: spend.amount,
          displayMint: formatMintLabel(spend.mint),
          secretKeyJson: options.config.solanaExecutorSecretKeyJson
        });
        logger.log(`native fallback tx confirmed: ${fallback.txSignature}`);
        await runSolanaDevnetFallbackCompletion(
          spend,
          mirageError,
          "solana-devnet-native-fallback",
          fallback.txSignature,
          options,
          fetchFn,
          logger,
          result
        );
        continue;
      }

      if (!txSignature) {
        throw new Error("Execution did not return a Solana tx signature.");
      }

      const fallbackMetadata =
        mirageError && nativeFallbackEnabled
          ? buildFallbackMetadata("solana-devnet-native-fallback", mirageError)
          : undefined;

      await confirmExecution(options.config.baseUrl, options.config.workerSecret, spend, txSignature, fetchFn, fallbackMetadata);
      result.confirmed += 1;
      logger.log(`Confirmed ${spend.paylinkId} with tx ${txSignature}`);
      await notifyTelegramConfirmation(spend, txSignature, options.config, logger, options.telegramClient, fallbackMetadata);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${spend.paylinkId}: ${message}`);
      logger.error(`Skipped ${spend.paylinkId}: ${message}`);
    }
  }

  if (pending.length === 0) {
    logger.log("No pending Agent Spend executions found.");
  }

  return result;
};
