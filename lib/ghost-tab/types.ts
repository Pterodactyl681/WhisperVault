import type { AgentBudgetRail } from "../agent-budget";
import type { AgentExecutionMode } from "../agent-registry/types";

export type GhostTabStatus = "active" | "paused" | "expired" | "clawed_back";

export type GhostTabEventType =
  | "opened"
  | "refill_tick"
  | "spend_approved"
  | "spend_blocked"
  | "paused"
  | "resumed"
  | "expired"
  | "clawback";

export interface GhostTabSession {
  id: string;
  agentId: string;
  controllerWallet: string;
  status: GhostTabStatus;
  openedAt: string;
  expiresAt: string | null;
  lastRefillAt: string;
  allowanceLive: string;
  allowanceMax: string;
  refillAmount: string;
  refillIntervalMinutes: number;
  clawbackEnabled: boolean;
  clawbackExecuted: boolean;
  totalSpent: string;
  totalRefilled: string;
  totalClawedBack: string;
  executionMode: AgentExecutionMode;
  preferredRail: AgentBudgetRail;
}

export interface GhostTabEvent {
  id: string;
  sessionId: string;
  agentId: string;
  controllerWallet: string;
  type: GhostTabEventType;
  at: string;
  amount?: string;
  allowanceBefore?: string;
  allowanceAfter?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface OpenGhostTabInput {
  agentId: string;
  controllerWallet: string;
  allowanceLive: string;
  allowanceMax: string;
  refillAmount: string;
  refillIntervalMinutes: number;
  clawbackEnabled: boolean;
  expiresAt?: string | null;
  executionMode: AgentExecutionMode;
  preferredRail: AgentBudgetRail;
}

export interface GhostTabSpendDecision {
  allowed: boolean;
  reason: string | null;
  session: GhostTabSession;
}

export interface GhostTabSnapshot {
  session: GhostTabSession | null;
  events: GhostTabEvent[];
}

export interface GhostTabCrankIntent {
  sessionId: string;
  agentId: string;
  controllerWallet: string;
  nextRefillAt: string | null;
  preferredRail: AgentBudgetRail;
  executionMode: AgentExecutionMode;
}
