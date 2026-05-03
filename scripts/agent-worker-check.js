#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const PENDING_EXECUTION_PATH = "/api/agent-spend/pending-execution";
const WORKER_SECRET_HEADER = "x-whispervault-worker-secret";
const DEFAULT_AGENT_WALLET_NAME = "agent-treasury";
const DEFAULT_ENDPOINT_TIMEOUT_MS = 5000;

const readEnv = (env, name) => env[name]?.trim() ?? "";

const boolEnv = (env, name) => readEnv(env, name).toLowerCase() === "true";

const executableCandidates = (command, env) => {
  const extension = path.extname(command);
  if (process.platform !== "win32" || extension) {
    return [command];
  }

  const pathExt = readEnv(env, "PATHEXT") || ".EXE;.CMD;.BAT;.COM";
  return pathExt
    .split(";")
    .filter(Boolean)
    .map((ext) => `${command}${ext.toLowerCase()}`);
};

const canAccessFile = (filePath) => {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const resolveExecutable = (command, env) => {
  const pathValue = readEnv(env, "PATH");
  const directories = pathValue ? pathValue.split(path.delimiter) : [];

  for (const directory of directories) {
    if (!directory) {
      continue;
    }

    for (const candidate of executableCandidates(command, env)) {
      const fullPath = path.join(directory, candidate);
      if (canAccessFile(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
};

const buildPendingEndpoint = (baseUrl) => `${baseUrl.replace(/\/+$/, "")}${PENDING_EXECUTION_PATH}`;

const fetchEndpoint = async (endpoint, workerSecret, env, fetchFn, log, warn) => {
  const timeoutMs = Number(readEnv(env, "WHISPERVAULT_WORKER_CHECK_TIMEOUT_MS")) || DEFAULT_ENDPOINT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(endpoint, {
      method: "GET",
      headers: {
        [WORKER_SECRET_HEADER]: workerSecret
      },
      signal: controller.signal
    });

    if (response.ok) {
      log(`Worker endpoint: reachable (${response.status})`);
    } else {
      warn(`Worker endpoint responded with HTTP ${response.status}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(`Worker endpoint was not reachable: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }
};

const runAgentWorkerCheck = async (options = {}) => {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? ((message) => console.log(message));
  const stderr = options.stderr ?? ((message) => console.error(message));
  const fetchFn = options.fetch ?? fetch;
  const log = (message) => stdout(message);
  const warn = (message) => stderr(`WARN ${message}`);
  const fail = (message) => stderr(`ERROR ${message}`);
  const baseUrl = readEnv(env, "WHISPERVAULT_BASE_URL");
  const workerSecret = readEnv(env, "WHISPERVAULT_WORKER_SECRET");
  const telegramBotToken = readEnv(env, "TELEGRAM_BOT_TOKEN");
  const agentWalletName = readEnv(env, "AGENT_WALLET_NAME") || DEFAULT_AGENT_WALLET_NAME;
  const rawExecutionEnabled = readEnv(env, "MIRAGE_EXECUTION_ENABLED");
  const executionEnabled = boolEnv(env, "MIRAGE_EXECUTION_ENABLED");
  const miragePath = resolveExecutable("mirage", env);
  let exitCode = 0;

  log("WhisperVault Agent Worker check");
  log(`Node version: ${process.version}`);
  log(`WHISPERVAULT_BASE_URL: ${baseUrl ? "set" : "missing"}`);
  log(`WHISPERVAULT_WORKER_SECRET: ${workerSecret ? "set" : "missing"}`);
  log(`TELEGRAM_BOT_TOKEN: ${telegramBotToken ? "set" : "missing"}`);
  log(`AGENT_WALLET_NAME: ${agentWalletName}`);
  log(`MIRAGE_EXECUTION_ENABLED: ${rawExecutionEnabled ? (executionEnabled ? "true" : "not true") : "missing"}`);
  log(`Mirage executable: ${miragePath ?? "not found on PATH"}`);

  if (!baseUrl) {
    fail("WHISPERVAULT_BASE_URL is required for the worker.");
    exitCode = 1;
  }

  if (!workerSecret) {
    fail("WHISPERVAULT_WORKER_SECRET is required for the worker.");
    exitCode = 1;
  }

  if (!telegramBotToken) {
    warn("TELEGRAM_BOT_TOKEN is missing; Telegram push will be skipped.");
  }

  if (!readEnv(env, "AGENT_WALLET_NAME")) {
    warn(`AGENT_WALLET_NAME is missing; ${DEFAULT_AGENT_WALLET_NAME} will be used.`);
  }

  if (!executionEnabled) {
    warn("MIRAGE_EXECUTION_ENABLED is missing or not true; worker will run in dry-run/planning mode.");
  }

  if (!miragePath && executionEnabled) {
    fail("Mirage CLI is missing from PATH while MIRAGE_EXECUTION_ENABLED=true.");
    exitCode = 1;
  } else if (!miragePath) {
    warn("Mirage CLI is missing from PATH; real execution is unavailable until Mirage is installed.");
  }

  if (baseUrl && workerSecret) {
    const endpoint = buildPendingEndpoint(baseUrl);
    log(`Pending execution endpoint: ${endpoint}`);
    await fetchEndpoint(endpoint, workerSecret, env, fetchFn, log, warn);
  }

  return exitCode;
};

module.exports = {
  buildPendingEndpoint,
  resolveExecutable,
  runAgentWorkerCheck
};

if (require.main === module) {
  void runAgentWorkerCheck()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    });
}
