import { DevFileAgentBudgetRepository } from "../lib/agent-budget";
import { printDemoSummary, printDevStorePath } from "./demo-agent-vault-common";

const run = async (): Promise<void> => {
  const repository = new DevFileAgentBudgetRepository();
  const removed = await repository.removeDemoRecords();

  if (removed.length === 0) {
    printDemoSummary("Agent Vault demo reset completed with no destructive action.", [
      "No persisted demo Agent Budget records were found, so nothing was deleted.",
      "Only records marked metadata.demo=true are eligible for reset.",
      `Dev store: ${printDevStorePath()}`
    ]);
    return;
  }

  printDemoSummary("Agent Vault demo reset completed.", [
    `Removed demo budgets: ${removed.map((record) => record.budget.agentId).join(", ")}`,
    "Only persisted demo Agent Budget records were cleared.",
    `Dev store: ${printDevStorePath()}`
  ]);
};

void run().catch((error: unknown) => {
  console.error(
    error instanceof Error ? `Agent Vault demo reset failed: ${error.message}` : "Agent Vault demo reset failed."
  );
  process.exitCode = 1;
});
