import { DevFileAgentBudgetRepository } from "../lib/agent-budget";
import {
  createDeterministicDemoRecord,
  isDemoBudgetRecord,
  printDemoBudgetShape,
  printDemoSummary,
  printDevStorePath
} from "./demo-agent-vault-common";

const run = async (): Promise<void> => {
  const repository = new DevFileAgentBudgetRepository();
  const now = new Date();
  const nextRecord = createDeterministicDemoRecord(now);
  const existing = await repository.get(nextRecord.budget.agentId);

  if (existing && !isDemoBudgetRecord(existing) && existing.budget.owner !== nextRecord.budget.owner) {
    printDemoSummary("Agent Vault demo seed skipped.", [
      `Found non-demo budget with the same agentId: ${existing.budget.agentId}`,
      "No changes were made to avoid overwriting non-demo data.",
      `Dev store: ${printDevStorePath()}`
    ]);
    return;
  }

  if (!existing || isDemoBudgetRecord(existing)) {
    await repository.removeDemoRecords();
  }

  if (existing && !isDemoBudgetRecord(existing)) {
    await repository.save(nextRecord);
    printDemoSummary("Agent Vault demo budget upserted.", [
      `Updated deterministic demo budget: ${printDemoBudgetShape()}`,
      `Reservations cleared for a fresh demo state at ${now.toISOString()}`,
      "Cleared stale metadata.demo=true vaults before seeding.",
      `Dev store: ${printDevStorePath()}`
    ]);
    return;
  }

  await repository.create(nextRecord);
  printDemoSummary("Agent Vault demo budget created.", [
    `Created deterministic demo budget: ${printDemoBudgetShape()}`,
    "Cleared stale metadata.demo=true vaults before seeding.",
    `Dev store: ${printDevStorePath()}`
  ]);
};

void run().catch((error: unknown) => {
  console.error(
    error instanceof Error ? `Agent Vault demo seed failed: ${error.message}` : "Agent Vault demo seed failed."
  );
  process.exitCode = 1;
});
