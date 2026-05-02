import { getStorageMode } from "@/lib/storage/config";
import { SupabaseAgentBudgetRepository } from "./database-repository";
import { DevFileAgentBudgetRepository, InMemoryAgentBudgetRepository } from "./repository";
import { AgentBudgetService } from "./service";
import { getAgentBudgetPolicyAdapter, type AgentBudgetPolicyAdapter } from "./policy-adapter";
import { parseAgentBudgetPolicyConfig } from "./policy-config";

type AgentBudgetGlobal = typeof globalThis & {
  __whisperPayAgentBudgetService?: AgentBudgetService;
  __whisperPayAgentBudgetPolicyAdapter?: AgentBudgetPolicyAdapter;
};

const globalForAgentBudget = globalThis as AgentBudgetGlobal;

const createAgentBudgetRepository = () => {
  if (getStorageMode() === "database") {
    return new SupabaseAgentBudgetRepository();
  }

  return process.env.NODE_ENV === "development"
    ? new DevFileAgentBudgetRepository()
    : new InMemoryAgentBudgetRepository();
};

export const agentBudgetService =
  globalForAgentBudget.__whisperPayAgentBudgetService ??
  new AgentBudgetService({
    repository: createAgentBudgetRepository()
  });

export const agentBudgetPolicyConfig = parseAgentBudgetPolicyConfig();

export const agentBudgetPolicyAdapter =
  globalForAgentBudget.__whisperPayAgentBudgetPolicyAdapter?.mode === agentBudgetPolicyConfig.mode
    ? globalForAgentBudget.__whisperPayAgentBudgetPolicyAdapter
    : getAgentBudgetPolicyAdapter({
        config: agentBudgetPolicyConfig,
        service: agentBudgetService
      });

if (process.env.NODE_ENV !== "production") {
  globalForAgentBudget.__whisperPayAgentBudgetService = agentBudgetService;
  globalForAgentBudget.__whisperPayAgentBudgetPolicyAdapter = agentBudgetPolicyAdapter;
}
