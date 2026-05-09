import { getStorageMode } from "@/lib/storage/config";
import { DevFileAgentRegistryRepository, InMemoryAgentRegistryRepository } from "./repository";
import { SupabaseAgentRegistryRepository } from "./database-repository";
import { AgentRegistryService } from "./service";

type AgentRegistryGlobal = typeof globalThis & {
  __whisperVaultAgentRegistryService?: AgentRegistryService;
};

const globalForAgentRegistry = globalThis as AgentRegistryGlobal;

const createAgentRegistryRepository = () => {
  if (getStorageMode() === "database") {
    return new SupabaseAgentRegistryRepository();
  }

  return process.env.NODE_ENV === "development"
    ? new DevFileAgentRegistryRepository()
    : new InMemoryAgentRegistryRepository();
};

export const agentRegistryService =
  globalForAgentRegistry.__whisperVaultAgentRegistryService ??
  new AgentRegistryService({
    repository: createAgentRegistryRepository()
  });

if (process.env.NODE_ENV !== "production") {
  globalForAgentRegistry.__whisperVaultAgentRegistryService = agentRegistryService;
}
