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

export type WorkerFetch = typeof fetch;
export type MirageExecutor = (argv: string[]) => Promise<MirageExecutionResult>;
export type WorkerLogger = Pick<Console, "log" | "error"> & Partial<Pick<Console, "warn">>;

interface RunAgentWorkerOnceOptions {
  config: AgentWorkerConfig;
  fetch?: WorkerFetch;
  executeMirage?: MirageExecutor;
  telegramClient?: TelegramBotClient;
  logger?: WorkerLogger;
}

interface PendingExecutionResponse {
  pending?: PendingAgentSpendExecution[];
}

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_AGENT_WALLET_NAME = "agent-treasury";

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
    telegramBotToken: env.TELEGRAM_BOT_TOKEN?.trim() || null
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

const fetchPendingExecutions = async (
  baseUrl: string,
  workerSecret: string | null | undefined,
  fetchFn: WorkerFetch
): Promise<PendingAgentSpendExecution[]> => {
  const response = await fetchFn(`${baseUrl}/api/agent-spend/pending-execution`, {
    method: "GET",
    headers: buildHeaders(workerSecret)
  });

  if (!response.ok) {
    throw new Error(`Pending execution request failed with ${response.status} ${response.statusText}.`);
  }

  const payload = (await response.json()) as PendingExecutionResponse;
  return Array.isArray(payload.pending) ? payload.pending : [];
};

const confirmExecution = async (
  baseUrl: string,
  workerSecret: string | null | undefined,
  spend: PendingAgentSpendExecution,
  txSignature: string,
  fetchFn: WorkerFetch
): Promise<void> => {
  const response = await fetchFn(`${baseUrl}/api/agent-spend/confirm-manual`, {
    method: "POST",
    headers: buildHeaders(workerSecret),
    body: JSON.stringify({
      paylinkId: spend.paylinkId,
      txSignature,
      executor: "mirage-cli"
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
  txSignature: string
): string =>
  [
    "Execution confirmed",
    `Agent: ${spend.agentId}`,
    `Amount: ${spend.amount} ${formatMintLabel(spend.mint)}`,
    `Devnet tx: ${txSignature}`,
    "Receipt: confirmed"
  ].join("\n");

const notifyTelegramConfirmation = async (
  spend: PendingAgentSpendExecution,
  txSignature: string,
  config: AgentWorkerConfig,
  logger: WorkerLogger,
  telegramClient?: TelegramBotClient
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
    await client.sendMessage(chatId, buildTelegramConfirmationMessage(spend, txSignature), {
      disableWebPagePreview: true
    });
    logger.log("Telegram notification: sent");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(logger, `Telegram notification: failed (${reason})`);
  }
};

export const runAgentWorkerOnce = async (
  options: RunAgentWorkerOnceOptions
): Promise<AgentWorkerRunResult> => {
  const fetchFn = options.fetch ?? fetch;
  const logger = options.logger ?? console;
  const pending = await fetchPendingExecutions(options.config.baseUrl, options.config.workerSecret, fetchFn);
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
      result.planned += 1;
      logger.log(`Pending spend ${spend.paylinkId}: mirage ${argv.join(" ")}`);

      if (options.config.dryRun) {
        continue;
      }

      if (!options.config.executionEnabled) {
        throw new Error("MIRAGE_EXECUTION_ENABLED must be true for non-dry-run execution.");
      }

      if (!options.executeMirage) {
        throw new Error("Mirage executor is not configured.");
      }

      const execution = await options.executeMirage(argv);
      result.executed += 1;
      const txSignature = extractSolanaTxSignature(`${execution.stdout}\n${execution.stderr}`);

      if (!txSignature) {
        logger.log(execution.stdout);
        logger.error(execution.stderr);
        throw new Error("Could not parse a Solana tx signature from Mirage output. Confirm manually in the UI.");
      }

      await confirmExecution(options.config.baseUrl, options.config.workerSecret, spend, txSignature, fetchFn);
      result.confirmed += 1;
      logger.log(`Confirmed ${spend.paylinkId} with tx ${txSignature}`);
      await notifyTelegramConfirmation(spend, txSignature, options.config, logger, options.telegramClient);
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
