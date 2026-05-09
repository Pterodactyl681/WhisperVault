import { agentBudgetPolicyAdapter } from "@/lib/agent-budget/server";
import { createAgentIntentsHttpHandlers } from "@/lib/agent-registry/intents-http";
import { agentRegistryService } from "@/lib/agent-registry/server";
import { whisperPayServerService } from "@/lib/whisperpay-server/server";

const handlers = createAgentIntentsHttpHandlers({
  registryService: agentRegistryService,
  budgetPolicy: agentBudgetPolicyAdapter,
  paylinkService: whisperPayServerService
});

export const POST = handlers.createIntent;
