import type { AgentBudgetRail } from "../agent-budget";
import type { AgentExecutionMode } from "../agent-registry/types";

export type GhostTabStatus = "active" | "paused" | "expired" | "clawed_back";
export type GhostSessionRuntimeStatus = "idle" | "active" | "paused" | "closing" | "closed";
export type GhostRefillEngine = "offchain-lazy" | "er-scheduled";

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

// Derived runtime state returned by GhostTabService snapshots for Command Center PER/ER visibility.
export interface GhostSessionRuntime {
  sessionStatus: GhostSessionRuntimeStatus;
  refillEngine: GhostRefillEngine;
  nextRefillAt: string | null;
  refillTickCount: number;
  queuedRefill: string;
  clawbackPending: boolean;
  clawbackCompleted: boolean;
  tickCadenceMinutes: number | null;
  sessionLifetimeMinutes: number | null;
}

export type GhostTimelineItemType =
  | "session_opened"
  | "refill_tick_scheduled"
  | "refill_tick_executed"
  | "spend_reserved"
  | "spend_confirmed"
  | "session_paused"
  | "clawback_queued"
  | "clawback_completed";

// Derived timeline item returned by GhostTabService snapshots alongside persisted events.
export interface GhostTimelineItem {
  id: string;
  type: GhostTimelineItemType;
  label: string;
  at: string;
  amount?: string;
  allowanceBefore?: string;
  allowanceAfter?: string;
  reason?: string;
  synthetic?: boolean;
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
  // Keep runtime/timeline on the canonical snapshot type because service.ts always returns them.
  runtime: GhostSessionRuntime;
  timeline: GhostTimelineItem[];
}

export interface GhostTabCrankIntent {
  sessionId: string;
  agentId: string;
  controllerWallet: string;
  nextRefillAt: string | null;
  preferredRail: AgentBudgetRail;
  executionMode: AgentExecutionMode;
}
