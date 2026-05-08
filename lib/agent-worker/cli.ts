import { execFile } from "node:child_process";
import { accessSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { TelegramBotClient } from "../telegram/client";
import {
  parseAgentWorkerConfig,
  runAgentWorkerOnce,
  type MirageExecutionResult,
  type AgentWorkerConfig,
  type AgentWorkerRunResult,
  type MirageExecutor,
  type SolanaDevnetNativeExecutor,
  type WorkerFetch,
  type WorkerLogger
} from "./runner";
import { createSolanaDevnetNativeExecutor } from "./solana-devnet-native";

const execFileAsync = promisify(execFile);

const executableCandidates = (command: string): string[] => {
  const extension = path.extname(command);

  if (process.platform !== "win32" || extension) {
    return [command];
  }

  return (process.env.PATHEXT?.trim() || ".EXE;.CMD;.BAT;.COM")
    .split(";")
    .filter(Boolean)
    .map((ext) => `${command}${ext.toLowerCase()}`);
};

const canAccessFile = (filePath: string): boolean => {
  try {
    accessSync(filePath);
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
};

export const resolveExecutable = (command: string): string | null => {
  const directories = process.env.PATH?.split(path.delimiter) ?? [];

  for (const directory of directories) {
    if (!directory) {
      continue;
    }

    for (const candidate of executableCandidates(command)) {
      const fullPath = path.join(directory, candidate);
      if (canAccessFile(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
};

export const executeMirage = async (argv: string[]): Promise<MirageExecutionResult> => {
  try {
    const result = await execFileAsync("mirage", argv, {
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (error) {
    const maybeNodeError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };

    if (maybeNodeError.code === "ENOENT") {
      throw new Error("Mirage CLI was not found on PATH. Install Mirage locally or run agent:worker:dry-run.");
    }

    const output = [maybeNodeError.stdout, maybeNodeError.stderr].filter(Boolean).join("\n");
    throw new Error(output || (error instanceof Error ? error.message : "Mirage CLI execution failed."));
  }
};

interface RunAgentWorkerCliOptions {
  argv?: string[];
  config?: AgentWorkerConfig;
  env?: NodeJS.ProcessEnv;
  executeMirage?: MirageExecutor;
  executeSolanaDevnetNative?: SolanaDevnetNativeExecutor;
  fetch?: WorkerFetch;
  telegramClient?: TelegramBotClient;
}

export const runAgentWorkerCliIteration = async (
  logger: WorkerLogger = console,
  options: RunAgentWorkerCliOptions = {}
): Promise<AgentWorkerRunResult> => {
  const config = options.config ?? parseAgentWorkerConfig(options.env, options.argv);
  const mirageExecutable = resolveExecutable("mirage");
  const nativeFallbackEnabled = config.executionFallbackMode?.trim() === "solana-devnet-native";

  logger.log("WORKER_BUILD_MARKER=native-fallback-v4");
  logger.log(config.dryRun ? "WhisperVault Agent Worker dry-run" : "WhisperVault Agent Worker");
  logger.log(`Control plane: ${config.baseUrl}`);
  logger.log(`Mirage executable: ${mirageExecutable ?? "not found on PATH"}`);
  logger.log(`Mirage execution enabled: ${config.executionEnabled ? "true" : "false"}`);
  logger.log(`Execution fallback mode: ${config.executionFallbackMode || "disabled"}`);
  logger.log(
    nativeFallbackEnabled
      ? "Mirage execution mint: ignored for native fallback"
      : `Mirage execution mint: ${config.mirageExecutionMint || "USDC"}`
  );
  logger.log(
    config.telegramBotToken
      ? "Telegram notification: configured"
      : "Telegram notification: skipped unless TELEGRAM_BOT_TOKEN is set"
  );

  if (!config.dryRun && !config.executionEnabled) {
    logger.log("MIRAGE_EXECUTION_ENABLED is not true, so no Mirage execution will run.");
  }

  const result = await runAgentWorkerOnce({
    config,
    executeMirage: options.executeMirage ?? executeMirage,
    executeSolanaDevnetNative: options.executeSolanaDevnetNative ?? createSolanaDevnetNativeExecutor(),
    fetch: options.fetch,
    telegramClient: options.telegramClient,
    logger
  });

  logger.log(
    `Worker result: fetched=${result.fetched} planned=${result.planned} executed=${result.executed} confirmed=${result.confirmed}`
  );

  return result;
};

export const runAgentWorkerCliOnce = async (
  logger: WorkerLogger = console,
  options: RunAgentWorkerCliOptions = {}
): Promise<number> => {
  const result = await runAgentWorkerCliIteration(logger, options);
  return result.errors.length > 0 ? 1 : 0;
};
