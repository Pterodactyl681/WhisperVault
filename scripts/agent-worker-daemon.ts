import { parseWorkerPollIntervalMs, runAgentWorkerCliOnce, runAgentWorkerDaemon } from "../lib/agent-worker";

const run = async (): Promise<void> => {
  const pollIntervalMs = parseWorkerPollIntervalMs();
  await runAgentWorkerDaemon({
    pollIntervalMs,
    runOnce: () => runAgentWorkerCliOnce()
  });
};

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
