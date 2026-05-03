import { execFile } from "node:child_process";
import { accessSync, statSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { parseAgentWorkerConfig, runAgentWorkerOnce, type MirageExecutionResult } from "../lib/agent-worker";

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

const resolveExecutable = (command: string): string | null => {
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

const executeMirage = async (argv: string[]): Promise<MirageExecutionResult> => {
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

const run = async (): Promise<void> => {
  const config = parseAgentWorkerConfig();
  const mirageExecutable = resolveExecutable("mirage");

  console.log(config.dryRun ? "WhisperVault Agent Worker dry-run" : "WhisperVault Agent Worker");
  console.log(`Control plane: ${config.baseUrl}`);
  console.log(`Mirage executable: ${mirageExecutable ?? "not found on PATH"}`);
  console.log(`Mirage execution enabled: ${config.executionEnabled ? "true" : "false"}`);
  console.log(
    config.telegramBotToken
      ? "Telegram notification: configured"
      : "Telegram notification: skipped unless TELEGRAM_BOT_TOKEN is set"
  );

  if (!config.dryRun && !config.executionEnabled) {
    console.log("MIRAGE_EXECUTION_ENABLED is not true, so no Mirage execution will run.");
  }

  const result = await runAgentWorkerOnce({
    config,
    executeMirage
  });

  console.log(
    `Worker result: fetched=${result.fetched} planned=${result.planned} executed=${result.executed} confirmed=${result.confirmed}`
  );

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
};

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
