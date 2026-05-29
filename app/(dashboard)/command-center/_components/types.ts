export interface CommandCenterAgent {
  id: string;
  name: string;
  status: "active" | "paused" | "exhausted";
  dailyCap: string;
  currentDailySpent: string;
  dailyLeft: string;
  vaultBalance: string;
  ghostAllowanceLive: string;
  ghostAllowanceMax: string;
  ghostRefillAmount: string;
  ghostRefillIntervalMinutes: number;
  preferredRail: string;
  executionMode: string;
  defaultRecipientLabel?: string | null;
  defaultRecipientAddress?: string | null;
  isActive: boolean;
  hasApiToken?: boolean;
  ghostTab: CommandCenterGhostTab | null;
}

export interface CommandCenterGhostTabEvent {
  id: string;
  type: string;
  at: string;
  amount?: string;
  allowanceBefore?: string;
  allowanceAfter?: string;
  reason?: string;
  label?: string;
  synthetic?: boolean;
}

export interface CommandCenterGhostRuntime {
  sessionStatus: "idle" | "active" | "paused" | "closing" | "closed";
  refillEngine: "offchain-lazy" | "er-scheduled";
  nextRefillAt: string | null;
  refillTickCount: number;
  queuedRefill: string;
  clawbackPending: boolean;
  clawbackCompleted: boolean;
  tickCadenceMinutes: number | null;
  sessionLifetimeMinutes: number | null;
}

export interface CommandCenterGhostTab {
  id: string;
  status: "active" | "paused" | "expired" | "clawed_back";
  openedAt: string;
  expiresAt: string | null;
  nextRefillAt: string | null;
  allowanceLive: string;
  allowanceMax: string;
  refillAmount: string;
  refillIntervalMinutes: number;
  totalSpent: string;
  totalRefilled: string;
  totalClawedBack: string;
  events: CommandCenterGhostTabEvent[];
  runtime?: CommandCenterGhostRuntime;
  timeline?: CommandCenterGhostTabEvent[];
}

export interface CommandCenterRecipient {
  label: string;
  address: string;
  agentId?: string | null;
  isDefaultForActiveAgent: boolean;
  isAllowedForActiveAgent: boolean;
}

export interface CommandCenterReceipt {
  id: string;
  paylinkId: string;
  agent: string;
  amount: string;
  mint: string;
  requestedAmount: string;
  status: string;
  executionRail: string;
  settlementRailLabel: string;
  txSignature?: string | null;
  txSignatureShort: string | null;
  explorerUrl: string | null;
  magicblockRailAttempted?: boolean | null;
  magicblockRailMode?: string | null;
  magicblockRailStatus?: string | null;
  fallbackUsed?: boolean | null;
  createdAt: string;
  confirmedAt: string | null;
  recipient: string;
  goal: string | null;
}

export type Notice =
  | {
      tone: "success" | "warning" | "error";
      message: string;
    }
  | null;

export type SectionId = "overview" | "allowance" | "firewall" | "executions" | "receipts" | "agents" | "simulator" | "settings";

export type SpendResult =
  | {
      decision?: string;
      reason?: string;
      paylinkId?: string;
      status?: string;
      rail?: string;
      recipient?: string;
      agent?: string;
      agentId?: string;
    }
  | null;

export type SimulatorResult =
  | {
      decision: "approved" | "blocked";
      reason: string;
      amount: string;
      mint: string;
      recipient: string;
      agent: string;
    }
  | null;

export interface GeneratedAgentTokenState {
  agentId: string;
  agentName: string;
  token: string;
}
