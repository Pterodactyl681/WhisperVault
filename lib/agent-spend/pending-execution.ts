import { generateMirageTransferCommand } from "../mirage";
import type { WhisperPayServerService } from "../whisperpay-server/service";
import type { ServerPaymentIntent } from "../whisperpay-server/types";
import { isAgentSpendMagicPrivatePaymentIntent } from "../whisperpay-server/agent-spend-private-rail";
import type { ServerTelegramSpendMetadata } from "../whisperpay-server/types";

export interface PendingAgentSpendExecution {
  paylinkId: string;
  paymentIntentId: string;
  agentId: string;
  controllerWallet: string;
  amount: string;
  mint: string;
  requestedMint: string;
  displayAmount: string;
  recipient: string;
  memo: string;
  executionRail: "magicblock-private";
  executionMode: "mirage-private-first";
  txSignature: string | null;
  confirmedAt: string | null;
  status: "pending/manual" | "pending_execution";
  telegram?: ServerTelegramSpendMetadata;
  mirage: {
    command: "mirage";
    argv: string[];
    displayCommand: string;
    walletName: string;
  };
}

interface ListPendingAgentSpendExecutionsOptions {
  paylinkService: WhisperPayServerService;
}

const isPendingManualAgentSpend = (paymentIntent: ServerPaymentIntent): boolean => {
  if (!isAgentSpendMagicPrivatePaymentIntent(paymentIntent)) {
    return false;
  }

  if (paymentIntent.status !== "pending" || paymentIntent.txSignature) {
    return false;
  }

  const reservationState = paymentIntent.metadata?.agentLifecycle?.budgetReservationState;

  if (reservationState === "confirmed" || reservationState === "released") {
    return false;
  }

  return Boolean(paymentIntent.metadata?.agentPlan?.agentId && paymentIntent.metadata?.memo);
};

export const toPendingAgentSpendExecution = (
  paymentIntent: ServerPaymentIntent
): PendingAgentSpendExecution | null => {
  if (!isPendingManualAgentSpend(paymentIntent)) {
    return null;
  }

  const agentPlan = paymentIntent.metadata?.agentPlan;
  const memo = paymentIntent.metadata?.memo;

  if (!agentPlan?.agentId || !memo) {
    return null;
  }

  const mirage = generateMirageTransferCommand({
    walletName: "agent-treasury",
    recipient: paymentIntent.recipient,
    amount: paymentIntent.amount,
    mint: paymentIntent.mint,
    memo,
    visibility: "private",
    split: 4,
    minDelayMs: 500,
    maxDelayMs: 5000,
    cluster: "devnet"
  });

  return {
    paylinkId: paymentIntent.paylinkId,
    paymentIntentId: paymentIntent.id,
    agentId: agentPlan.agentId,
    controllerWallet: agentPlan.controllerWallet ?? paymentIntent.metadata?.telegram?.controllerWallet ?? paymentIntent.fromWallet,
    amount: paymentIntent.amount,
    mint: paymentIntent.mint,
    requestedMint: paymentIntent.mint,
    displayAmount: paymentIntent.amount,
    recipient: paymentIntent.recipient,
    memo,
    executionRail: "magicblock-private",
    executionMode: "mirage-private-first",
    txSignature: paymentIntent.txSignature,
    confirmedAt: paymentIntent.metadata?.manualExecution?.confirmedAt ?? null,
    status: "pending_execution",
    ...(paymentIntent.metadata?.telegram ? { telegram: paymentIntent.metadata.telegram } : {}),
    mirage: {
      command: mirage.command,
      argv: mirage.argv,
      displayCommand: mirage.displayCommand,
      walletName: mirage.walletName
    }
  };
};

export const listPendingAgentSpendExecutions = async (
  options: ListPendingAgentSpendExecutionsOptions
): Promise<PendingAgentSpendExecution[]> => {
  const paymentIntents = await options.paylinkService.listPaymentIntents();
  return paymentIntents
    .map(toPendingAgentSpendExecution)
    .filter((execution): execution is PendingAgentSpendExecution => Boolean(execution));
};
