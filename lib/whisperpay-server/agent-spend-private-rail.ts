import { checkPermissionMembershipForWallet, type PermissionMembershipCheckResult } from "../magicblock-er-permission";
import type { AgentPlanMetadata, ServerPaymentIntent } from "./types";

export interface AgentSpendPrivateRailContext {
  paymentIntentId: string;
  paylinkId: string;
  agentId: string;
  goal: string;
  category?: string;
  amount: string;
  mint: string;
  recipient: string;
  settlementRail: "magicblock-private-spl";
  allowPublicFallback: false;
  memo: string;
  receipt: {
    type: "agent-private-receipt";
    memoReveal: "permissioned";
    mode: "manual";
  };
  reveal: {
    source: "magicblock-private-memo";
    authorization: "magicblock-permission-membership";
  };
  budgetVaultPermissionHook: "not-connected";
}

export interface AgentSpendMemoRevealAccessInput {
  paymentIntent: ServerPaymentIntent;
  walletAddress: string;
  routerRpcUrl: string | null;
  permissionedAccount: string | null;
}

export interface AgentSpendMemoRevealAccessResult {
  context: AgentSpendPrivateRailContext | null;
  access: PermissionMembershipCheckResult | null;
}

const isAgentPlanMetadata = (metadata: AgentPlanMetadata | undefined): metadata is AgentPlanMetadata =>
  Boolean(metadata?.agentId && metadata.memo && metadata.privacyMode === "private");

export const isAgentSpendPaymentIntent = (paymentIntent: ServerPaymentIntent): boolean =>
  isAgentPlanMetadata(paymentIntent.metadata?.agentPlan);

export const isAgentSpendMagicPrivatePaymentIntent = (paymentIntent: ServerPaymentIntent): boolean =>
  isAgentSpendPaymentIntent(paymentIntent) &&
  paymentIntent.settlementRail === "magicblock-private-spl" &&
  paymentIntent.magicPrivate?.enabled === true &&
  paymentIntent.metadata?.allowPublicFallback === false;

export const getAgentSpendPrivateRailContext = (
  paymentIntent: ServerPaymentIntent
): AgentSpendPrivateRailContext | null => {
  const agentPlan = paymentIntent.metadata?.agentPlan;

  if (!agentPlan || !isAgentSpendMagicPrivatePaymentIntent(paymentIntent)) {
    return null;
  }

  return {
    paymentIntentId: paymentIntent.id,
    paylinkId: paymentIntent.paylinkId,
    agentId: agentPlan.agentId,
    goal: agentPlan.requestedGoal,
    ...(agentPlan.category ? { category: agentPlan.category } : {}),
    amount: paymentIntent.amount,
    mint: paymentIntent.mint,
    recipient: paymentIntent.recipient,
    settlementRail: "magicblock-private-spl",
    allowPublicFallback: false,
    memo: agentPlan.memo,
    receipt: agentPlan.receipt ?? {
      type: "agent-private-receipt",
      memoReveal: "permissioned",
      mode: "manual"
    },
    reveal: agentPlan.privateRail?.reveal ?? {
      source: "magicblock-private-memo",
      authorization: "magicblock-permission-membership"
    },
    budgetVaultPermissionHook: agentPlan.privateRail?.budgetVaultPermissionHook ?? "not-connected"
  };
};

export const checkAgentSpendMemoRevealAccess = async (
  input: AgentSpendMemoRevealAccessInput
): Promise<AgentSpendMemoRevealAccessResult> => {
  const context = getAgentSpendPrivateRailContext(input.paymentIntent);

  if (!context) {
    return {
      context: null,
      access: null
    };
  }

  return {
    context,
    access: await checkPermissionMembershipForWallet({
      routerRpcUrl: input.routerRpcUrl,
      permissionedAccount: input.permissionedAccount,
      walletAddress: input.walletAddress
    })
  };
};
