import type { AgentWorkerRunResult, WorkerLogger } from "./runner";

const DEFAULT_WORKER_POLL_INTERVAL_MS = 30_000;

type AgentWorkerSignal = "SIGINT" | "SIGTERM";
type SignalHandler = () => void;

interface AgentWorkerSignalHost {
  off(signal: AgentWorkerSignal, handler: SignalHandler): void;
  on(signal: AgentWorkerSignal, handler: SignalHandler): void;
}

interface AgentWorkerSleep {
  cancel(): void;
  promise: Promise<void>;
}

interface RunAgentWorkerDaemonOptions {
  logger?: WorkerLogger;
  pollIntervalMs?: number;
  runOnce: () => Promise<number | AgentWorkerRunResult>;
  signalHost?: AgentWorkerSignalHost;
  sleep?: (ms: number) => AgentWorkerSleep;
}

const defaultSleep = (ms: number): AgentWorkerSleep => {
  let timeout: NodeJS.Timeout | undefined;
  let settled = false;
  let resolvePromise = (): void => {};

  const promise = new Promise<void>((resolve) => {
    resolvePromise = () => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    };

    timeout = setTimeout(resolvePromise, ms);
  });

  return {
    promise,
    cancel() {
      if (timeout) {
        clearTimeout(timeout);
      }

      resolvePromise();
    }
  };
};

export const parseWorkerPollIntervalMs = (
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>
): number => {
  const rawValue = env.WORKER_POLL_INTERVAL_MS?.trim();

  if (!rawValue) {
    return DEFAULT_WORKER_POLL_INTERVAL_MS;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("WORKER_POLL_INTERVAL_MS must be a positive number of milliseconds.");
  }

  return Math.floor(parsed);
};

const isWorkerRunResult = (value: number | AgentWorkerRunResult): value is AgentWorkerRunResult =>
  typeof value === "object" && value !== null;

export const runAgentWorkerDaemon = async (options: RunAgentWorkerDaemonOptions): Promise<void> => {
  const logger = options.logger ?? console;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_WORKER_POLL_INTERVAL_MS;
  const signalHost = options.signalHost ?? process;
  const sleep = options.sleep ?? defaultSleep;
  let currentSleep: AgentWorkerSleep | null = null;
  let shouldStop = false;
  let iteration = 0;

  const requestShutdown = (): void => {
    if (shouldStop) {
      return;
    }

    shouldStop = true;
    logger.log("Worker daemon shutting down...");
    currentSleep?.cancel();
  };

  signalHost.on("SIGINT", requestShutdown);
  signalHost.on("SIGTERM", requestShutdown);

  logger.log(`WhisperVault Agent Worker daemon started. Poll interval: ${pollIntervalMs}ms.`);

  try {
    while (!shouldStop) {
      iteration += 1;

      try {
        const runResult = await options.runOnce();

        if (isWorkerRunResult(runResult)) {
          logger.log(
            `Worker iteration completed: fetched=${runResult.fetched} planned=${runResult.planned} executed=${runResult.executed} confirmed=${runResult.confirmed}`
          );

          if (runResult.errors.length > 0) {
            logger.error(`Worker iteration ${iteration} had ${runResult.errors.length} spend error(s); continuing.`);
          }
        } else if (runResult !== 0) {
          logger.error(`Worker iteration ${iteration} completed with exit code ${runResult}; continuing.`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Worker iteration ${iteration} failed: ${message}; continuing.`);
      }

      if (shouldStop) {
        break;
      }

      logger.log("Waiting for next poll...");
      currentSleep = sleep(pollIntervalMs);
      await currentSleep.promise;
      currentSleep = null;
    }
  } finally {
    currentSleep?.cancel();
    signalHost.off("SIGINT", requestShutdown);
    signalHost.off("SIGTERM", requestShutdown);
    logger.log("WhisperVault Agent Worker daemon stopped.");
  }
};
