import {
  assertRequiredAgentWorkerDaemonEnv,
  parseWorkerPollIntervalMs,
  runAgentWorkerCliIteration,
  runAgentWorkerDaemon
} from "../lib/agent-worker";

const run = async (): Promise<void> => {
  assertRequiredAgentWorkerDaemonEnv();
  const pollIntervalMs = parseWorkerPollIntervalMs();
  await runAgentWorkerDaemon({
    pollIntervalMs,
    runOnce: () => runAgentWorkerCliIteration()
  });
};

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
