import { getSupabaseDatabaseConfig, type SupabaseDatabaseConfig } from "../storage/config";
import { SupabaseRestClient, type SupabaseFetch } from "../storage/supabase-rest";
import type { ActiveAgentContext, AgentRecipient, RegisteredAgent } from "./types";
import type { AgentRegistryRepository } from "./repository";

interface SupabaseAgentRegistryRepositoryOptions {
  config?: SupabaseDatabaseConfig;
  client?: SupabaseRestClient;
  fetch?: SupabaseFetch;
}

interface AgentRow {
  id: string;
  name: string;
  controller_wallet: string;
  created_at: string;
  status: RegisteredAgent["status"];
  daily_cap: string;
  current_daily_spent: string;
  vault_balance: string;
  ghost_allowance_live: string;
  ghost_allowance_max: string;
  ghost_refill_amount: string;
  ghost_refill_interval_minutes: number;
  preferred_rail: RegisteredAgent["preferredRail"];
  execution_mode: RegisteredAgent["executionMode"];
  api_token_hash: string | null;
  default_recipient_label: string | null;
  default_recipient_address: string | null;
}

interface ActiveAgentRow {
  controller_wallet: string;
  agent_id: string;
  updated_at: string;
}

interface RecipientRow {
  controller_wallet: string;
  label: string;
  address: string;
  agent_id: string | null;
  created_at: string;
}

const AGENTS_TABLE = "whispervault_agents";
const ACTIVE_AGENTS_TABLE = "whispervault_active_agents";
const RECIPIENTS_TABLE = "whispervault_agent_recipients";

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isDuplicateKeyError = (error: unknown): boolean => {
  const message = errorMessage(error).toLowerCase();
  return message.includes("23505") || message.includes("409") || message.includes("duplicate key");
};

const toAgent = (row: AgentRow): RegisteredAgent => ({
  id: row.id,
  name: row.name,
  controllerWallet: row.controller_wallet,
  createdAt: new Date(row.created_at).toISOString(),
  status: row.status,
  dailyCap: row.daily_cap,
  currentDailySpent: row.current_daily_spent,
  vaultBalance: row.vault_balance,
  ghostAllowanceLive: row.ghost_allowance_live,
  ghostAllowanceMax: row.ghost_allowance_max,
  ghostRefillAmount: row.ghost_refill_amount,
  ghostRefillIntervalMinutes: row.ghost_refill_interval_minutes,
  preferredRail: row.preferred_rail,
  executionMode: row.execution_mode,
  apiTokenHash: row.api_token_hash,
  ...(row.default_recipient_label ? { defaultRecipientLabel: row.default_recipient_label } : {}),
  ...(row.default_recipient_address ? { defaultRecipientAddress: row.default_recipient_address } : {})
});

const toAgentRow = (agent: RegisteredAgent): AgentRow => ({
  id: agent.id,
  name: agent.name,
  controller_wallet: agent.controllerWallet,
  created_at: agent.createdAt,
  status: agent.status,
  daily_cap: agent.dailyCap,
  current_daily_spent: agent.currentDailySpent,
  vault_balance: agent.vaultBalance,
  ghost_allowance_live: agent.ghostAllowanceLive,
  ghost_allowance_max: agent.ghostAllowanceMax,
  ghost_refill_amount: agent.ghostRefillAmount,
  ghost_refill_interval_minutes: agent.ghostRefillIntervalMinutes,
  preferred_rail: agent.preferredRail,
  execution_mode: agent.executionMode,
  api_token_hash: agent.apiTokenHash,
  default_recipient_label: agent.defaultRecipientLabel ?? null,
  default_recipient_address: agent.defaultRecipientAddress ?? null
});

const toContext = (row: ActiveAgentRow): ActiveAgentContext => ({
  controllerWallet: row.controller_wallet,
  agentId: row.agent_id,
  updatedAt: new Date(row.updated_at).toISOString()
});

const toRecipient = (row: RecipientRow): AgentRecipient => ({
  controllerWallet: row.controller_wallet,
  label: row.label,
  address: row.address,
  agentId: row.agent_id,
  createdAt: new Date(row.created_at).toISOString()
});

export class SupabaseAgentRegistryRepository implements AgentRegistryRepository {
  private readonly client: SupabaseRestClient;

  constructor(options: SupabaseAgentRegistryRepositoryOptions = {}) {
    this.client =
      options.client ??
      new SupabaseRestClient({
        config: options.config ?? getSupabaseDatabaseConfig(),
        fetch: options.fetch
      });
  }

  async createAgent(agent: RegisteredAgent): Promise<RegisteredAgent> {
    try {
      await this.client.insert<AgentRow>(AGENTS_TABLE, toAgentRow(agent));
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      return this.getOrThrow(agent.id);
    }

    return this.getOrThrow(agent.id);
  }

  async updateAgent(agent: RegisteredAgent): Promise<RegisteredAgent> {
    const updated = await this.client.update<AgentRow>(AGENTS_TABLE, { id: agent.id }, toAgentRow(agent));

    if (updated.length === 0) {
      try {
        await this.client.insert<AgentRow>(AGENTS_TABLE, toAgentRow(agent));
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    return this.getOrThrow(agent.id);
  }

  async getAgent(agentId: string): Promise<RegisteredAgent | null> {
    const [row] = await this.client.select<AgentRow>(AGENTS_TABLE, { id: agentId });
    return row ? toAgent(row) : null;
  }

  async findAgentByName(controllerWallet: string, name: string): Promise<RegisteredAgent | null> {
    const agents = await this.listAgents(controllerWallet);
    return agents.find((agent) => agent.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
  }

  async findAgentByTokenHash(tokenHash: string): Promise<RegisteredAgent | null> {
    const [row] = await this.client.select<AgentRow>(AGENTS_TABLE, { api_token_hash: tokenHash });
    return row ? toAgent(row) : null;
  }

  async listAgents(controllerWallet: string): Promise<RegisteredAgent[]> {
    const rows = await this.client.select<AgentRow>(AGENTS_TABLE, { controller_wallet: controllerWallet }, { order: "created_at.asc" });
    return rows.map(toAgent);
  }

  async getActiveAgent(controllerWallet: string): Promise<ActiveAgentContext | null> {
    const [row] = await this.client.select<ActiveAgentRow>(ACTIVE_AGENTS_TABLE, { controller_wallet: controllerWallet });
    return row ? toContext(row) : null;
  }

  async setActiveAgent(context: ActiveAgentContext): Promise<ActiveAgentContext> {
    const row: ActiveAgentRow = {
      controller_wallet: context.controllerWallet,
      agent_id: context.agentId,
      updated_at: context.updatedAt
    };
    const updated = await this.client.update<ActiveAgentRow>(
      ACTIVE_AGENTS_TABLE,
      { controller_wallet: context.controllerWallet },
      row
    );

    if (updated.length === 0) {
      try {
        await this.client.insert<ActiveAgentRow>(ACTIVE_AGENTS_TABLE, row);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        await this.client.update<ActiveAgentRow>(ACTIVE_AGENTS_TABLE, { controller_wallet: context.controllerWallet }, row);
      }
    }

    return context;
  }

  async upsertRecipient(recipient: AgentRecipient): Promise<AgentRecipient> {
    const row: RecipientRow = {
      controller_wallet: recipient.controllerWallet,
      label: recipient.label,
      address: recipient.address,
      agent_id: recipient.agentId ?? null,
      created_at: recipient.createdAt
    };
    const updated = await this.client.update<RecipientRow>(
      RECIPIENTS_TABLE,
      { controller_wallet: recipient.controllerWallet, label: recipient.label },
      row
    );

    if (updated.length === 0) {
      try {
        await this.client.insert<RecipientRow>(RECIPIENTS_TABLE, row);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }
      }
    }

    return recipient;
  }

  async getRecipient(controllerWallet: string, label: string): Promise<AgentRecipient | null> {
    const [row] = await this.client.select<RecipientRow>(RECIPIENTS_TABLE, {
      controller_wallet: controllerWallet,
      label
    });
    return row ? toRecipient(row) : null;
  }

  async listRecipients(controllerWallet: string): Promise<AgentRecipient[]> {
    const rows = await this.client.select<RecipientRow>(
      RECIPIENTS_TABLE,
      { controller_wallet: controllerWallet },
      { order: "created_at.asc" }
    );
    return rows.map(toRecipient);
  }

  private async getOrThrow(agentId: string): Promise<RegisteredAgent> {
    const agent = await this.getAgent(agentId);

    if (!agent) {
      throw new Error(`Agent registry row was not persisted for agent "${agentId}".`);
    }

    return agent;
  }
}
