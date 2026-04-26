import { createAgentBudgetHttpHandlers } from "@/lib/agent-budget/http";
import { agentBudgetPolicyAdapter } from "@/lib/agent-budget/server";

const handlers = createAgentBudgetHttpHandlers({
  policyAdapter: agentBudgetPolicyAdapter
});

export const GET = handlers.getBudget;
