export type AgentBudgetAmountInput = bigint | string;

export type AgentBudgetStatus = "active" | "paused" | "exhausted";
export type AgentBudgetRail = "magicblock-private" | "public-solana";
export type AgentBudgetMetadata = Record<string, unknown>;

export interface AgentBudget {
  agentId: string;
  owner: string;
  agentWallet?: string;
  mint: string;
  totalBudget: string;
  currentBalance: string;
  dailyCapPercent: number;
  spentToday: string;
  lastResetAt: string;
  status: AgentBudgetStatus;
  rail: AgentBudgetRail;
  allowPublicFallback: boolean;
  metadata?: AgentBudgetMetadata;
}

export interface CreateAgentBudgetInput {
  agentId: string;
  owner: string;
  agentWallet?: string;
  mint: string;
  totalBudget: AgentBudgetAmountInput;
  currentBalance?: AgentBudgetAmountInput;
  dailyCapPercent?: number;
  spentToday?: AgentBudgetAmountInput;
  lastResetAt?: string;
  status?: AgentBudgetStatus;
  rail: AgentBudgetRail;
  allowPublicFallback?: boolean;
  metadata?: AgentBudgetMetadata;
}

export type ReserveSpendReference =
  | string
  | {
      reason?: string;
      paylinkId?: string;
    };

export interface AgentBudgetSpendDecision {
  allowed: boolean;
  reason: string | null;
  requestedAmount: string;
  availableBalance: string;
  dailyCap: string;
  remainingDailyCap: string;
  reservedAmount: string;
  budget: AgentBudget;
}

export interface AgentBudgetReservationReceipt {
  reservationId: string;
  amount: string;
  reference: string;
  paylinkId: string | null;
  reservedAmount: string;
  budget: AgentBudget;
}

export interface AgentBudgetConfirmationReceipt {
  paymentId: string;
  amount: string;
  reservedAmount: string;
  budget: AgentBudget;
}

export interface AgentBudgetReleaseReceipt {
  reason: string;
  releasedAmount: string;
  reservedAmount: string;
  budget: AgentBudget;
}

export type AgentBudgetReservationTransitionOutcome =
  | "confirmed"
  | "released"
  | "already_confirmed"
  | "already_released"
  | "missing_reservation";

export interface AgentBudgetReservationTransitionReceipt {
  outcome: AgentBudgetReservationTransitionOutcome;
  amount: string;
  reservedAmount: string;
  paylinkId: string;
  paymentId?: string | null;
  reason?: string | null;
  budget: AgentBudget;
}
