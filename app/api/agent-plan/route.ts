import { agentBudgetPolicyAdapter } from "@/lib/agent-budget/server";
import { createAgentPlanHttpHandlers } from "@/lib/agent-plan/http";
import { whisperPayServerService } from "@/lib/whisperpay-server";

const handlers = createAgentPlanHttpHandlers({
  budgetService: agentBudgetPolicyAdapter,
  paylinkService: whisperPayServerService
});

export const POST = handlers.createPlan;
