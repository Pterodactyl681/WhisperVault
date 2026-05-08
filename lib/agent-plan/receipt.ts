type AgentPlanRail = "magicblock-private" | "public-solana";

export interface AgentPrivateReceiptPreview {
  type: "agent-private-receipt";
  agentId: string;
  runtime: "Claude + Mirage";
  goal: string;
  category?: string;
  amount: string;
  mint: string;
  recipient: string;
  paylinkId: string;
  paylinkUrl: string;
  policy: {
    decision: "approved";
    dailyCapPercent: number;
    remainingDailyCapBefore: string;
    remainingDailyCapAfter: string;
    allowanceMode: "static" | "rolling";
    ghostAllowanceBefore: string;
    ghostAllowanceAfter: string;
  };
  reservation: {
    amountReserved: string;
    totalReservedAfter: string;
    state: string;
  };
  execution: {
    rail: AgentPlanRail;
    visibility: "private";
    fallback: "off";
    mirageReady: boolean;
    status: "Mirage command ready";
    instruction: "Execution pending \u2014 run Mirage command manually";
  };
  memo: {
    preview: string;
    reveal: "permissioned";
  };
  payment: {
    status: string;
    mode: "manual";
    label: "Payment status: Pending/manual";
  };
}

export interface AgentRejectedPolicyReceipt {
  type: "agent-policy-decision";
  decision: "rejected";
  reason: string;
  agentId: string;
  runtime: "Claude + Mirage";
  goal: string;
  category?: string;
  amount: string;
  mint: string;
  policy: {
    dailyCapPercent: number;
    remainingDailyCap: string;
    spentToday: string;
    currentBalance: string;
  };
  artifacts: {
    paylinkCreated: false;
    mirageCommandGenerated: false;
  };
}

interface BuildApprovedPrivateReceiptInput {
  agentId: string;
  goal: string;
  category?: string;
  amount: string;
  mint: string;
  recipient: string;
  paylinkId: string;
  paylinkUrl: string;
  rail: AgentPlanRail;
  dailyCapPercent: number;
  remainingDailyCapBefore: string;
  remainingDailyCapAfter: string;
  reservedAmount: string;
  totalReservedAfter: string;
  reservationState: string;
  memoPreview: string;
  paymentStatus: string;
  mirageReady: boolean;
  allowanceMode: "static" | "rolling";
  ghostAllowanceBefore: string;
  ghostAllowanceAfter: string;
}

interface BuildRejectedPolicyReceiptInput {
  agentId: string;
  goal: string;
  category?: string;
  amount: string;
  mint: string;
  reason: string;
  dailyCapPercent: number;
  remainingDailyCap: string;
  spentToday: string;
  currentBalance: string;
}

export const buildApprovedPrivateReceiptPreview = (
  input: BuildApprovedPrivateReceiptInput
): AgentPrivateReceiptPreview => ({
  type: "agent-private-receipt",
  agentId: input.agentId,
  runtime: "Claude + Mirage",
  goal: input.goal,
  ...(input.category ? { category: input.category } : {}),
  amount: input.amount,
  mint: input.mint,
  recipient: input.recipient,
  paylinkId: input.paylinkId,
  paylinkUrl: input.paylinkUrl,
  policy: {
    decision: "approved",
    dailyCapPercent: input.dailyCapPercent,
    remainingDailyCapBefore: input.remainingDailyCapBefore,
    remainingDailyCapAfter: input.remainingDailyCapAfter,
    allowanceMode: input.allowanceMode,
    ghostAllowanceBefore: input.ghostAllowanceBefore,
    ghostAllowanceAfter: input.ghostAllowanceAfter
  },
  reservation: {
    amountReserved: input.reservedAmount,
    totalReservedAfter: input.totalReservedAfter,
    state: input.reservationState
  },
  execution: {
    rail: input.rail,
    visibility: "private",
    fallback: "off",
    mirageReady: input.mirageReady,
    status: "Mirage command ready",
    instruction: "Execution pending \u2014 run Mirage command manually"
  },
  memo: {
    preview: input.memoPreview,
    reveal: "permissioned"
  },
  payment: {
    status: input.paymentStatus,
    mode: "manual",
    label: "Payment status: Pending/manual"
  }
});

export const buildRejectedPolicyReceipt = (
  input: BuildRejectedPolicyReceiptInput
): AgentRejectedPolicyReceipt => ({
  type: "agent-policy-decision",
  decision: "rejected",
  reason: input.reason,
  agentId: input.agentId,
  runtime: "Claude + Mirage",
  goal: input.goal,
  ...(input.category ? { category: input.category } : {}),
  amount: input.amount,
  mint: input.mint,
  policy: {
    dailyCapPercent: input.dailyCapPercent,
    remainingDailyCap: input.remainingDailyCap,
    spentToday: input.spentToday,
    currentBalance: input.currentBalance
  },
  artifacts: {
    paylinkCreated: false,
    mirageCommandGenerated: false
  }
});


