import { agentBudgetPolicyAdapter } from "@/lib/agent-budget/server";
import { AgentPaymentLifecycleService } from "@/lib/agent-payment-lifecycle";
import { getStorageMode } from "@/lib/storage/config";
import { SupabaseWhisperPayServerRepository } from "./database-repository";
import { WhisperPayServerService } from "./service";

type WhisperPayGlobal = typeof globalThis & {
  __whisperPayServerService?: WhisperPayServerService;
};

const globalForWhisperPay = globalThis as WhisperPayGlobal;

const createWhisperPayServerRepository = () =>
  getStorageMode() === "database" ? new SupabaseWhisperPayServerRepository() : undefined;

export const whisperPayServerService =
  globalForWhisperPay.__whisperPayServerService ??
  new WhisperPayServerService({
    repository: createWhisperPayServerRepository()
  });

const agentPaymentLifecycleService = new AgentPaymentLifecycleService({
  budgetService: agentBudgetPolicyAdapter,
  paylinkService: whisperPayServerService
});

whisperPayServerService.attachAgentPaymentLifecycle(agentPaymentLifecycleService);

if (process.env.NODE_ENV !== "production") {
  globalForWhisperPay.__whisperPayServerService = whisperPayServerService;
}
