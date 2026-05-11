import { defaultIsAgentVaultEnabled, errorResponse, handleKnownError, parseJsonObject, json } from "@/lib/agent-vault/http";
import { isLikelySolanaSignature } from "@/lib/solana-validation";
import { whisperPayServerService } from "@/lib/whisperpay-server";

const parseConfirmManualBody = (
  body: Record<string, unknown>
): {
  paylinkId: string;
  txSignature: string;
  executor: string;
  executionRail?: string;
  mirageAttempted?: boolean;
  mirageError?: string;
  magicblockRailAttempted?: boolean;
  magicblockRailMode?: string;
  magicblockRailStatus?: string;
  magicblockRailError?: string;
  magicblockRailRawResponse?: unknown;
  fallbackUsed?: boolean;
} => {
  const paylinkId = typeof body.paylinkId === "string" ? body.paylinkId.trim() : "";
  const txSignature = typeof body.txSignature === "string" ? body.txSignature.trim() : "";
  const executor = typeof body.executor === "string" ? body.executor.trim() : "";
  const executionRail = typeof body.executionRail === "string" ? body.executionRail.trim() : "";
  const mirageAttempted = typeof body.mirageAttempted === "boolean" ? body.mirageAttempted : undefined;
  const mirageError = typeof body.mirageError === "string" ? body.mirageError.trim() : "";
  const magicblockRailAttempted =
    typeof body.magicblockRailAttempted === "boolean" ? body.magicblockRailAttempted : undefined;
  const magicblockRailMode = typeof body.magicblockRailMode === "string" ? body.magicblockRailMode.trim() : "";
  const magicblockRailStatus = typeof body.magicblockRailStatus === "string" ? body.magicblockRailStatus.trim() : "";
  const magicblockRailError = typeof body.magicblockRailError === "string" ? body.magicblockRailError.trim() : "";
  const magicblockRailRawResponse =
    body.magicblockRailRawResponse !== undefined ? body.magicblockRailRawResponse : undefined;
  const fallbackUsed = typeof body.fallbackUsed === "boolean" ? body.fallbackUsed : undefined;

  if (!paylinkId) {
    throw new Error("paylinkId is required.");
  }

  if (!txSignature || !isLikelySolanaSignature(txSignature)) {
    throw new Error("txSignature must look like a Solana signature.");
  }

  const allowedExecutors = new Set([
    "mirage-cli",
    "magicblock-mirage",
    "magicblock-private-payments-api",
    "native-devnet-fallback",
    "solana-devnet-native-fallback",
    "solana-devnet-spl-fallback"
  ]);

  if (!allowedExecutors.has(executor)) {
    throw new Error("executor must be a supported execution rail.");
  }

  return {
    paylinkId,
    txSignature,
    executor,
    ...(executionRail ? { executionRail } : {}),
    ...(mirageAttempted !== undefined ? { mirageAttempted } : {}),
    ...(mirageError ? { mirageError } : {}),
    ...(magicblockRailAttempted !== undefined ? { magicblockRailAttempted } : {}),
    ...(magicblockRailMode ? { magicblockRailMode } : {}),
    ...(magicblockRailStatus ? { magicblockRailStatus } : {}),
    ...(magicblockRailError ? { magicblockRailError } : {}),
    ...(magicblockRailRawResponse !== undefined ? { magicblockRailRawResponse } : {}),
    ...(fallbackUsed !== undefined ? { fallbackUsed } : {})
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
        execution:
          paymentIntent.metadata?.manualExecution?.executionRail === "solana-devnet-native-fallback"
            ? "Solana devnet native fallback"
            : "Mirage CLI",
        devnetTx: paymentIntent.txSignature,
        ...(paymentIntent.metadata?.manualExecution?.executionRail
          ? { executionRail: paymentIntent.metadata.manualExecution.executionRail }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.mirageAttempted !== undefined
          ? { mirageAttempted: paymentIntent.metadata.manualExecution.mirageAttempted }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.mirageError
          ? { mirageError: paymentIntent.metadata.manualExecution.mirageError }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.magicblockRailAttempted !== undefined
          ? { magicblockRailAttempted: paymentIntent.metadata.manualExecution.magicblockRailAttempted }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.magicblockRailMode
          ? { magicblockRailMode: paymentIntent.metadata.manualExecution.magicblockRailMode }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.magicblockRailStatus
          ? { magicblockRailStatus: paymentIntent.metadata.manualExecution.magicblockRailStatus }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.magicblockRailError
          ? { magicblockRailError: paymentIntent.metadata.manualExecution.magicblockRailError }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.magicblockRailRawResponse !== undefined
          ? { magicblockRailRawResponse: paymentIntent.metadata.manualExecution.magicblockRailRawResponse }
          : {}),
        ...(paymentIntent.metadata?.manualExecution?.fallbackUsed !== undefined
          ? { fallbackUsed: paymentIntent.metadata.manualExecution.fallbackUsed }
          : {})
      }
    });
  } catch (error) {
    return handleKnownError(error);
  }
};
