import type { AgentBudget } from "../agent-budget";
import type { RegisteredAgent } from "../agent-registry";
import type { GhostTabSnapshot } from "../ghost-tab/types";

export interface DemoReadinessResetResult {
  controllerWallet: string;
  activeAgent: RegisteredAgent;
  budget: AgentBudget;
  ghostTab: GhostTabSnapshot;
  recipient: {
    label: string;
    displayLabel: string;
    address: string;
  };
  archivedPendingCount: number;
  pendingCount: number;
  lastConfirmedTx: string | null;
}

export interface DemoReadinessStatus {
  controllerWallet: string;
  activeAgentName: string | null;
  activeAgentId: string | null;
  ghostAllowanceLive: string | null;
  ghostAllowanceMax: string | null;
  recipientLabel: string | null;
  recipientDisplayLabel: string | null;
  recipientAddress: string | null;
  pendingCount: number;
  lastConfirmedTx: string | null;
  lastConfirmedPaylinkId: string | null;
}
