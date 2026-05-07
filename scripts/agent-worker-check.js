#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { clusterApiUrl, Connection, Keypair, PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } = require("@solana/spl-token");

const PENDING_EXECUTION_PATH = "/api/agent-spend/pending-execution";
const WORKER_SECRET_HEADER = "x-whispervault-worker-secret";
const DEFAULT_AGENT_WALLET_NAME = "agent-treasury";
const DEFAULT_ENDPOINT_TIMEOUT_MS = 5000;

const readEnv = (env, name) => env[name]?.trim() ?? "";

const boolEnv = (env, name) => readEnv(env, name).toLowerCase() === "true";

const parseExecutorKeypair = (secretKeyJson) => {
  let parsed;

  try {
    parsed = JSON.parse(secretKeyJson);
  } catch {
    throw new Error("SOLANA_EXECUTOR_SECRET_KEY_JSON must be a JSON array.");
  }

  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((value) => Number.isInteger(value))) {
    throw new Error("SOLANA_EXECUTOR_SECRET_KEY_JSON must be a JSON array keypair with 64 integer values.");
  }

  return Keypair.fromSecretKey(Uint8Array.from(parsed));
};

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
      log(`PASS Worker endpoint: reachable (${response.status})`);
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

const cleanCommandOutputLine = (output) =>
  String(output ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 160) ?? "";

const runMirageVersionCheck = (miragePath, execFileFn) =>
  new Promise((resolve) => {
    execFileFn(miragePath, ["--version"], { timeout: 10000 }, (error, stdout, stderr) => {
      if (error) {
        resolve({ ok: false });
        return;
      }

      const version = cleanCommandOutputLine(stdout) || cleanCommandOutputLine(stderr);
      resolve({ ok: true, version });
    });
  });

const runMirageAddressCheck = (miragePath, agentWalletName, execFileFn) =>
  new Promise((resolve) => {
    execFileFn(miragePath, ["address", "--wallet", agentWalletName], { timeout: 10000 }, (error) => {
      if (error) {
        resolve({
          ok: false,
          message: error instanceof Error ? error.message : String(error)
        });
        return;
      }

      resolve({ ok: true });
    });
  });

const runSolanaFallbackCheck = async (env, connectionFactory, pass, warn, fail) => {
  const fallbackMode = readEnv(env, "EXECUTION_FALLBACK_MODE");

  if (fallbackMode !== "solana-devnet-spl") {
    return 0;
  }

  const mintValue = readEnv(env, "MIRAGE_EXECUTION_MINT");
  const secretKeyJson = readEnv(env, "SOLANA_EXECUTOR_SECRET_KEY_JSON");
  let exitCode = 0;

  if (!mintValue) {
    fail("MIRAGE_EXECUTION_MINT is required when EXECUTION_FALLBACK_MODE=solana-devnet-spl.");
    exitCode = 1;
  }

  if (!secretKeyJson) {
    fail("SOLANA_EXECUTOR_SECRET_KEY_JSON is required when EXECUTION_FALLBACK_MODE=solana-devnet-spl.");
    exitCode = 1;
  }

  if (!mintValue || !secretKeyJson) {
    return exitCode;
  }

  let executor;
  let mint;

  try {
    executor = parseExecutorKeypair(secretKeyJson);
    pass(`SOLANA_EXECUTOR_SECRET_KEY_JSON parsed; executor public key ${executor.publicKey.toBase58()}.`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return 1;
  }

  try {
    mint = new PublicKey(mintValue);
    pass("MIRAGE_EXECUTION_MINT is a valid Solana public key.");
  } catch {
    fail("MIRAGE_EXECUTION_MINT must be a valid Solana public key.");
    return 1;
  }

  const connection =
    connectionFactory?.(env) ?? new Connection(readEnv(env, "SOLANA_RPC_URL") || clusterApiUrl("devnet"), "confirmed");

  try {
    const lamports = await connection.getBalance(executor.publicKey, "confirmed");

    if (lamports > 0) {
      pass("Executor has devnet SOL for transaction fees.");
    } else {
      fail("Executor has no devnet SOL for transaction fees.");
      exitCode = 1;
    }
  } catch (error) {
    warn(`Could not validate executor devnet SOL balance: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    const ata = getAssociatedTokenAddressSync(mint, executor.publicKey, false, TOKEN_PROGRAM_ID);
    const accountInfo = await connection.getAccountInfo(ata, "confirmed");

    if (accountInfo) {
      pass(`Executor associated token account exists: ${ata.toBase58()}.`);
    } else {
      warn(`Executor associated token account is missing but can be created: ${ata.toBase58()}.`);
    }
  } catch (error) {
    warn(`Could not validate executor associated token account: ${error instanceof Error ? error.message : String(error)}`);
  }

  return exitCode;
};

const runAgentWorkerCheck = async (options = {}) => {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? ((message) => console.log(message));
  const stderr = options.stderr ?? ((message) => console.error(message));
  const fetchFn = options.fetch ?? fetch;
  const execFileFn = options.execFile ?? execFile;
  const log = (message) => stdout(message);
  const pass = (message) => stdout(`PASS ${message}`);
  const warn = (message) => stderr(`WARN ${message}`);
  const fail = (message) => stderr(`FAIL ${message}`);
  const baseUrl = readEnv(env, "WHISPERVAULT_BASE_URL");
  const workerSecret = readEnv(env, "WHISPERVAULT_WORKER_SECRET");
  const telegramBotToken = readEnv(env, "TELEGRAM_BOT_TOKEN");
  const agentWalletName = readEnv(env, "AGENT_WALLET_NAME") || DEFAULT_AGENT_WALLET_NAME;
  const rawExecutionEnabled = readEnv(env, "MIRAGE_EXECUTION_ENABLED");
  const executionEnabled = boolEnv(env, "MIRAGE_EXECUTION_ENABLED");
  const fallbackMode = readEnv(env, "EXECUTION_FALLBACK_MODE");
  const miragePath = resolveExecutable("mirage", env);
  let exitCode = 0;

  log("WhisperVault Agent Worker check");
  log(`Node version: ${process.version}`);

  if (!baseUrl) {
    fail("WHISPERVAULT_BASE_URL is required for the worker.");
    exitCode = 1;
  } else {
    pass("WHISPERVAULT_BASE_URL is set.");
  }

  if (!workerSecret) {
    fail("WHISPERVAULT_WORKER_SECRET is required for the worker.");
    exitCode = 1;
  } else {
    pass("WHISPERVAULT_WORKER_SECRET is set.");
  }

  if (!telegramBotToken) {
    warn("TELEGRAM_BOT_TOKEN is missing; Telegram push will be skipped.");
  } else {
    pass("TELEGRAM_BOT_TOKEN is set.");
  }

  if (!readEnv(env, "AGENT_WALLET_NAME")) {
    warn(`AGENT_WALLET_NAME is missing; ${DEFAULT_AGENT_WALLET_NAME} will be used.`);
  } else {
    pass(`AGENT_WALLET_NAME is set to ${agentWalletName}.`);
  }

  if (executionEnabled) {
    pass("MIRAGE_EXECUTION_ENABLED=true; real Mirage execution checks are active.");
  } else if (!rawExecutionEnabled) {
    warn("MIRAGE_EXECUTION_ENABLED is missing; worker will run in dry-run/planning mode.");
  } else {
    warn("MIRAGE_EXECUTION_ENABLED is missing or not true; worker will run in dry-run/planning mode.");
  }

  if (fallbackMode) {
    log(`Execution fallback mode: ${fallbackMode}`);
  }

  if (!miragePath && executionEnabled) {
    fail("Mirage CLI is missing from PATH while MIRAGE_EXECUTION_ENABLED=true.");
    exitCode = 1;
  } else if (!miragePath) {
    warn("Mirage CLI is missing from PATH; real execution is unavailable until Mirage is installed.");
  } else {
    pass(`Mirage CLI found at ${miragePath}.`);
    const versionCheck = await runMirageVersionCheck(miragePath, execFileFn);

    if (versionCheck.ok && versionCheck.version) {
      pass(`Mirage version: ${versionCheck.version}`);
    } else if (versionCheck.ok) {
      warn("Mirage version command succeeded but printed no version.");
    } else {
      warn("Mirage version was not available from `mirage --version`.");
    }
  }

  if (executionEnabled && miragePath) {
    const addressCheck = await runMirageAddressCheck(miragePath, agentWalletName, execFileFn);

    if (addressCheck.ok) {
      pass("Mirage wallet address lookup succeeded.");
    } else {
      fail(
        `Mirage wallet address lookup failed for AGENT_WALLET_NAME=${agentWalletName}; confirm this wallet exists on the worker host or Railway volume.`
      );
      exitCode = 1;
    }
  }

  if (baseUrl && workerSecret) {
    const endpoint = buildPendingEndpoint(baseUrl);
    log(`Pending execution endpoint: ${endpoint}`);
    await fetchEndpoint(endpoint, workerSecret, env, fetchFn, log, warn);
  }

  const fallbackExitCode = await runSolanaFallbackCheck(env, options.solanaConnectionFactory, pass, warn, fail);
  if (fallbackExitCode !== 0) {
    exitCode = fallbackExitCode;
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
