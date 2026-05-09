import { agentBudgetPolicyAdapter } from "@/lib/agent-budget/server";
import { createCommandCenterHttpHandlers } from "@/lib/command-center/http";
import { agentRegistryService } from "@/lib/agent-registry/server";
import { ghostTabService } from "@/lib/ghost-tab/server";
import { whisperPayServerService } from "@/lib/whisperpay-server/server";

const handlers = createCommandCenterHttpHandlers({
  registryService: agentRegistryService,
  budgetPolicy: agentBudgetPolicyAdapter,
  paylinkService: whisperPayServerService,
  ghostTabService
});

export const POST = handlers.useRecipient;
