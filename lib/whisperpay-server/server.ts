import { agentBudgetPolicyAdapter } from "@/lib/agent-budget/server";
import { AgentPaymentLifecycleService } from "@/lib/agent-payment-lifecycle";
import { WhisperPayServerService } from "./service";

type WhisperPayGlobal = typeof globalThis & {
  __whisperPayServerService?: WhisperPayServerService;
};

const globalForWhisperPay = globalThis as WhisperPayGlobal;

export const whisperPayServerService =
  globalForWhisperPay.__whisperPayServerService ?? new WhisperPayServerService();

const agentPaymentLifecycleService = new AgentPaymentLifecycleService({
  budgetService: agentBudgetPolicyAdapter,
  paylinkService: whisperPayServerService
});

whisperPayServerService.attachAgentPaymentLifecycle(agentPaymentLifecycleService);

if (process.env.NODE_ENV !== "production") {
  globalForWhisperPay.__whisperPayServerService = whisperPayServerService;
}
