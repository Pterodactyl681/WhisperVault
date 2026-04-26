import { defaultIsAgentVaultEnabled, errorResponse, handleKnownError, parseJsonObject, json } from "@/lib/agent-vault/http";
import { isLikelySolanaSignature } from "@/lib/solana-validation";
import { whisperPayServerService } from "@/lib/whisperpay-server";

const parseConfirmManualBody = (body: Record<string, unknown>): { paylinkId: string; txSignature: string; executor: string } => {
  const paylinkId = typeof body.paylinkId === "string" ? body.paylinkId.trim() : "";
  const txSignature = typeof body.txSignature === "string" ? body.txSignature.trim() : "";
  const executor = typeof body.executor === "string" ? body.executor.trim() : "";

  if (!paylinkId) {
    throw new Error("paylinkId is required.");
  }

  if (!txSignature || !isLikelySolanaSignature(txSignature)) {
    throw new Error("txSignature must look like a Solana signature.");
  }

  if (executor !== "mirage-cli") {
    throw new Error("executor must be mirage-cli.");
  }

  return {
    paylinkId,
    txSignature,
    executor
  };
};

export const POST = async (request: Request): Promise<Response> => {
  if (!defaultIsAgentVaultEnabled()) {
    return errorResponse(503, "feature_disabled", "Agent Vault API is disabled.");
  }

  try {
    const input = parseConfirmManualBody(await parseJsonObject(request));
    const paymentIntent = await whisperPayServerService.confirmManualAgentSpend(input);

    return json({
      paylinkId: paymentIntent.paylinkId,
      paymentId: paymentIntent.id,
      paymentStatus: paymentIntent.metadata?.agentLifecycle?.budgetReservationState === "confirmed" ? "Confirmed" : paymentIntent.status,
      execution: paymentIntent.metadata?.manualExecution?.executor ?? input.executor,
      txSignature: paymentIntent.txSignature,
      receipt: {
        paymentStatus: "Confirmed",
        execution: "Mirage CLI",
        devnetTx: paymentIntent.txSignature
      }
    });
  } catch (error) {
    return handleKnownError(error);
  }
};
