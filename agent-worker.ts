import { runAgentWorkerCliOnce } from "../lib/agent-worker";

const run = async (): Promise<void> => {
  process.exitCode = await runAgentWorkerCliOnce();
};

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
