import type { PublicPayment, TokenSymbol } from "@/types/whisperpay";

export type AgentPlanRail = "magicblock-private" | "public-solana";
export type AgentPlanPrivacyMode = "private";

export interface AgentPlanBudgetPolicySnapshot {
  dailyCapPercent: number;
  spentToday: string;
  remainingDailyCapBefore: string;
  remainingDailyCapAfter: string;
  allowanceMode?: "static" | "rolling";
  ghostAllowanceBefore?: string;
  ghostAllowanceAfter?: string;
}

export interface AgentPlanPrivateRailMetadata {
  settlementRail: "magicblock-private-spl";
  magicPrivateEnabled: boolean;
  memoSource: "agent-spend";
  reveal: {
    source: "magicblock-private-memo";
    authorization: "magicblock-permission-membership";
  };
  budgetVaultPermissionHook: "not-connected";
}

export interface AgentPlanReceiptMetadata {
  type: "agent-private-receipt";
  memoReveal: "permissioned";
  mode: "manual";
  allowanceMode?: "static" | "rolling";
  ghostAllowanceBefore?: string;
  ghostAllowanceAfter?: string;
}

export interface ServerTelegramSpendMetadata {
  source: "telegram";
  telegramUserId: string;
  telegramChatId: string;
  controllerWallet: string;
  originalTelegramCommand?: string;
}

export interface AgentPlanMetadata {
  agentId: string;
  category?: string;
  requestedGoal: string;
  rail: AgentPlanRail;
  privacyMode: AgentPlanPrivacyMode;
  allowPublicFallback: boolean;
  budgetPolicySnapshot: AgentPlanBudgetPolicySnapshot;
  memo: string;
  privateRail?: AgentPlanPrivateRailMetadata;
  receipt?: AgentPlanReceiptMetadata;
  source?: "telegram";
  telegram?: ServerTelegramSpendMetadata;
}

export interface AgentPaymentLifecycleState {
  budgetReservationState?: "reserved" | "confirmed" | "released";
  lastProcessedStatus?: string | null;
  reservationPaylinkId?: string | null;
  confirmedPaymentId?: string | null;
  releasedReason?: string | null;
  lastBudgetError?: string | null;
}

export interface ServerPaymentLifecycleEvent {
  type:
    | "budget_reserved"
    | "manual_mirage_execution_confirmed"
    | "private_transfer_sent"
    | "private_transfer_failed"
    | "payment_confirmed"
    | "budget_spend_confirmed"
    | "payment_failed"
    | "budget_reservation_released";
  at: string;
  status?: string;
}

export interface ServerManualExecutionMetadata {
  executor: "mirage-cli" | string;
  txSignature: string;
  confirmedAt: string;
  executionRail?: string;
  mirageAttempted?: boolean;
  mirageError?: string;
}

export type ServerPaymentIntentStatusChange =
  | "pending"
  | "sent"
  | "confirmed"
  | "succeeded"
  | "failed"
  | "expired"
  | "cancelled";

export interface ServerPaylinkMetadata {
  mint: string;
  amount: string;
  recipient: string;
  privacyMode: AgentPlanPrivacyMode;
  allowPublicFallback: boolean;
  agentPlan?: AgentPlanMetadata;
  telegram?: ServerTelegramSpendMetadata;
  unusableReason?: string | null;
}

export interface ServerPaylink {
  id: string;
  ownerWallet: string;
  nickname: string;
  defaultToken: TokenSymbol;
  createdAt: string;
  isActive: boolean;
  metadata?: ServerPaylinkMetadata;
}

export interface ServerPaymentIntentMetadata {
  mint: string;
  amount: string;
  recipient: string;
  privacyMode: AgentPlanPrivacyMode;
  allowPublicFallback: boolean;
  agentPlan?: AgentPlanMetadata;
  memo?: string;
  agentLifecycle?: AgentPaymentLifecycleState;
  timeline?: ServerPaymentLifecycleEvent[];
  manualExecution?: ServerManualExecutionMetadata;
  telegram?: ServerTelegramSpendMetadata;
}

export interface ServerPaymentIntent extends PublicPayment {
  amount: string;
  mint: string;
  recipient: string;
  metadata?: ServerPaymentIntentMetadata;
}
