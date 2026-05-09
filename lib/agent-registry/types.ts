import type { AgentBudget, AgentBudgetRail, AgentBudgetStatus } from "../agent-budget";

export type AgentExecutionMode = "mirage-private-first" | "native-fallback-devnet";

export interface RegisteredAgent {
  id: string;
  name: string;
  controllerWallet: string;
  createdAt: string;
  status: AgentBudgetStatus;
  dailyCap: string;
  currentDailySpent: string;
  vaultBalance: string;
  ghostAllowanceLive: string;
  ghostAllowanceMax: string;
  ghostRefillAmount: string;
  ghostRefillIntervalMinutes: number;
  preferredRail: AgentBudgetRail;
  executionMode: AgentExecutionMode;
  apiTokenHash: string | null;
  defaultRecipientLabel?: string;
  defaultRecipientAddress?: string;
}

export interface AgentRecipient {
  controllerWallet: string;
  label: string;
  address: string;
  agentId?: string | null;
  createdAt: string;
}

export interface ActiveAgentContext {
  controllerWallet: string;
  agentId: string;
  updatedAt: string;
}

export interface CreateRegisteredAgentInput {
  id?: string;
  name: string;
  controllerWallet: string;
  budget: AgentBudget;
  executionMode?: AgentExecutionMode;
}

export interface GeneratedAgentToken {
  agent: RegisteredAgent;
  token: string;
}
