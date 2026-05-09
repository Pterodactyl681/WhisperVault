import { agentBudgetService } from "@/lib/agent-budget/server";
import { agentRegistryService } from "@/lib/agent-registry/server";
import { ghostTabService } from "@/lib/ghost-tab/server";
import { whisperPayServerService } from "@/lib/whisperpay-server/server";
import { DemoReadinessService } from "./service";

type DemoReadinessGlobal = typeof globalThis & {
  __whisperVaultDemoReadinessService?: DemoReadinessService;
};

const globalForDemoReadiness = globalThis as DemoReadinessGlobal;

export const demoReadinessService =
  globalForDemoReadiness.__whisperVaultDemoReadinessService ??
  new DemoReadinessService({
    budgetService: agentBudgetService,
    registryService: agentRegistryService,
    ghostTabService,
    paylinkService: whisperPayServerService
  });

if (process.env.NODE_ENV !== "production") {
  globalForDemoReadiness.__whisperVaultDemoReadinessService = demoReadinessService;
}
