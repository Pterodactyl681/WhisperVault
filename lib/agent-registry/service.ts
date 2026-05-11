import { createHash, randomBytes } from "node:crypto";
import type { AgentBudget } from "../agent-budget";
import { isValidSolanaPublicKey } from "../solana-validation";
import { InMemoryAgentRegistryRepository, type AgentRegistryRepository } from "./repository";
import type {
  ActiveAgentContext,
  AgentRecipient,
  CreateRegisteredAgentInput,
  GeneratedAgentToken,
  RegisteredAgent
} from "./types";

interface AgentRegistryServiceOptions {
  repository?: AgentRegistryRepository;
  now?: () => Date;
  createToken?: () => string;
}

const normalizeName = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (!normalized) {
    throw new Error("agent name is required.");
  }

  return normalized;
};

const calculateDailyCap = (budget: AgentBudget): string => {
  const currentBalance = BigInt(budget.currentBalance);
  const totalBudget = BigInt(budget.totalBudget);
  const capBase = currentBalance < totalBudget ? currentBalance : totalBudget;
  return ((capBase * BigInt(budget.dailyCapPercent)) / 100n).toString();
};

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

const defaultCreateToken = (): string => `wva_${randomBytes(24).toString("base64url")}`;

export class AgentRegistryService {
  private readonly repository: AgentRegistryRepository;

  private readonly now: () => Date;

  private readonly createToken: () => string;

  constructor(options: AgentRegistryServiceOptions = {}) {
    this.repository = options.repository ?? new InMemoryAgentRegistryRepository();
    this.now = options.now ?? (() => new Date());
    this.createToken = options.createToken ?? defaultCreateToken;
  }

  tokenHash(token: string): string {
    return hashToken(token.trim());
  }

  async createAgent(input: CreateRegisteredAgentInput): Promise<RegisteredAgent> {
    const name = normalizeName(input.name);
    const id = input.id?.trim() || name;
    const existing = await this.repository.getAgent(id);

    if (existing) {
      throw new Error(`Agent already exists for id "${id}".`);
    }

    const agent = this.agentFromBudget(input.budget, name, input.controllerWallet, input.executionMode);
    return this.repository.createAgent({
      ...agent,
      id
    });
  }

  async upsertFromBudget(
    budget: AgentBudget,
    name = budget.agentId,
    executionMode: RegisteredAgent["executionMode"] = "mirage-private-first"
  ): Promise<RegisteredAgent> {
    const existing = await this.repository.getAgent(budget.agentId);
    const next = {
      ...this.agentFromBudget(budget, existing?.name ?? normalizeName(name), budget.owner, existing?.executionMode ?? executionMode),
      apiTokenHash: existing?.apiTokenHash ?? null,
      defaultRecipientLabel: existing?.defaultRecipientLabel,
      defaultRecipientAddress: existing?.defaultRecipientAddress,
      createdAt: existing?.createdAt ?? this.now().toISOString()
    };

    return existing ? this.repository.updateAgent(next) : this.repository.createAgent(next);
  }

  async listAgents(controllerWallet: string, budgets: AgentBudget[] = []): Promise<RegisteredAgent[]> {
    for (const budget of budgets.filter((candidate) => candidate.owner === controllerWallet)) {
      await this.upsertFromBudget(budget);
    }

    return this.repository.listAgents(controllerWallet);
  }

  async findAgentByName(controllerWallet: string, name: string, budgets: AgentBudget[] = []): Promise<RegisteredAgent | null> {
    await this.listAgents(controllerWallet, budgets);
    return this.repository.findAgentByName(controllerWallet, normalizeName(name));
  }

  async getAgent(agentId: string): Promise<RegisteredAgent | null> {
    return this.repository.getAgent(agentId);
  }

  async resolveAgentByToken(token: string): Promise<RegisteredAgent | null> {
    const normalized = token.trim();
    return normalized ? this.repository.findAgentByTokenHash(hashToken(normalized)) : null;
  }

  async generateToken(controllerWallet: string, name: string, budgets: AgentBudget[] = []): Promise<GeneratedAgentToken> {
    const agent = await this.findAgentByName(controllerWallet, name, budgets);

    if (!agent) {
      throw new Error(`Agent "${name}" was not found.`);
    }

    const token = this.createToken();
    const updated = await this.repository.updateAgent({
      ...agent,
      apiTokenHash: hashToken(token)
    });

    return {
      agent: updated,
      token
    };
  }

  async setActiveAgent(controllerWallet: string, agentId: string): Promise<ActiveAgentContext> {
    return this.repository.setActiveAgent({
      controllerWallet,
      agentId,
      updatedAt: this.now().toISOString()
    });
  }

  async getActiveAgent(controllerWallet: string, budgets: AgentBudget[] = []): Promise<RegisteredAgent | null> {
    const agents = await this.listAgents(controllerWallet, budgets);
    const context = await this.repository.getActiveAgent(controllerWallet);
    return agents.find((agent) => agent.id === context?.agentId) ?? agents[0] ?? null;
  }

  async getExplicitActiveAgent(controllerWallet: string, budgets: AgentBudget[] = []): Promise<RegisteredAgent | null> {
    const agents = await this.listAgents(controllerWallet, budgets);
    const context = await this.repository.getActiveAgent(controllerWallet);
    return context ? agents.find((agent) => agent.id === context.agentId) ?? null : null;
  }

  async clearActiveAgent(controllerWallet: string): Promise<void> {
    await this.repository.clearActiveAgent(controllerWallet);
  }

  async clearControllerState(controllerWallet: string): Promise<void> {
    await this.repository.clearControllerState(controllerWallet);
  }

  async addRecipient(controllerWallet: string, label: string, address: string, agentId?: string | null): Promise<AgentRecipient> {
    const normalizedLabel = normalizeName(label);

    if (!isValidSolanaPublicKey(address)) {
      throw new Error("Enter a valid recipient wallet address.");
    }

    return this.repository.upsertRecipient({
      controllerWallet,
      label: normalizedLabel,
      address,
      agentId: agentId ?? null,
      createdAt: this.now().toISOString()
    });
  }

  async listRecipients(controllerWallet: string): Promise<AgentRecipient[]> {
    return this.repository.listRecipients(controllerWallet);
  }

  async setDefaultRecipient(controllerWallet: string, agentId: string, label: string): Promise<RegisteredAgent> {
    const agent = await this.repository.getAgent(agentId);

    if (!agent || agent.controllerWallet !== controllerWallet) {
      throw new Error(`Agent "${agentId}" was not found.`);
    }

    const recipient = await this.repository.getRecipient(controllerWallet, normalizeName(label));

    if (!recipient) {
      throw new Error(`Recipient "${label}" was not found.`);
    }

    await this.repository.upsertRecipient({
      ...recipient,
      agentId: agent.id
    });

    return this.repository.updateAgent({
      ...agent,
      defaultRecipientLabel: recipient.label,
      defaultRecipientAddress: recipient.address
    });
  }

  private agentFromBudget(
    budget: AgentBudget,
    name: string,
    controllerWallet: string,
    executionMode: RegisteredAgent["executionMode"] = "mirage-private-first"
  ): RegisteredAgent {
    return {
      id: budget.agentId,
      name: normalizeName(name),
      controllerWallet,
      createdAt: this.now().toISOString(),
      status: budget.status,
      dailyCap: calculateDailyCap(budget),
      currentDailySpent: budget.spentToday,
      vaultBalance: budget.currentBalance,
      ghostAllowanceLive: budget.liveAllowance,
      ghostAllowanceMax: budget.maxLiveAllowance,
      ghostRefillAmount: budget.refillAmount,
      ghostRefillIntervalMinutes: budget.refillIntervalMinutes,
      preferredRail: budget.rail,
      executionMode,
      apiTokenHash: null
    };
  }
}
