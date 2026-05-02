import { getSupabaseDatabaseConfig } from "../storage/config";
import type { SupabaseDatabaseConfig } from "../storage/config";
import { SupabaseRestClient, type SupabaseFetch } from "../storage/supabase-rest";
import type { AgentBudget } from "./types";
import type {
  AgentBudgetRepository,
  StoredAgentBudgetRecord,
  StoredAgentBudgetReservation,
  StoredAgentBudgetReservationStatus
} from "./repository";

interface SupabaseAgentBudgetRepositoryOptions {
  config?: SupabaseDatabaseConfig;
  client?: SupabaseRestClient;
  fetch?: SupabaseFetch;
}

interface AgentBudgetRow {
  agent_id: string;
  owner: string;
  agent_wallet: string | null;
  mint: string;
  total_budget: string;
  current_balance: string;
  daily_cap_percent: number;
  spent_today: string;
  last_reset_at: string;
  status: AgentBudget["status"];
  rail: AgentBudget["rail"];
  allow_public_fallback: boolean;
  metadata: AgentBudget["metadata"] | null;
}

interface AgentBudgetReservationRow {
  id: string;
  agent_id: string;
  amount: string;
  reference: string;
  paylink_id: string | null;
  created_at: string;
  status: StoredAgentBudgetReservationStatus | null;
  payment_id: string | null;
  settled_at: string | null;
  released_at: string | null;
  released_reason: string | null;
}

const BUDGETS_TABLE = "whispervault_agent_budgets";
const RESERVATIONS_TABLE = "whispervault_agent_budget_reservations";
const CONTROLLER_WALLETS_TABLE = "whispervault_controller_wallets";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toBudget = (row: AgentBudgetRow): AgentBudget => ({
  agentId: row.agent_id,
  owner: row.owner,
  ...(row.agent_wallet ? { agentWallet: row.agent_wallet } : {}),
  mint: row.mint,
  totalBudget: row.total_budget,
  currentBalance: row.current_balance,
  dailyCapPercent: row.daily_cap_percent,
  spentToday: row.spent_today,
  lastResetAt: new Date(row.last_reset_at).toISOString(),
  status: row.status,
  rail: row.rail,
  allowPublicFallback: row.allow_public_fallback,
  ...(row.metadata ? { metadata: clone(row.metadata) } : {})
});

const toBudgetRow = (budget: AgentBudget): AgentBudgetRow => ({
  agent_id: budget.agentId,
  owner: budget.owner,
  agent_wallet: budget.agentWallet ?? null,
  mint: budget.mint,
  total_budget: budget.totalBudget,
  current_balance: budget.currentBalance,
  daily_cap_percent: budget.dailyCapPercent,
  spent_today: budget.spentToday,
  last_reset_at: budget.lastResetAt,
  status: budget.status,
  rail: budget.rail,
  allow_public_fallback: budget.allowPublicFallback,
  metadata: budget.metadata ? clone(budget.metadata) : null
});

const toReservation = (row: AgentBudgetReservationRow): StoredAgentBudgetReservation => ({
  id: row.id,
  amount: row.amount,
  reference: row.reference,
  paylinkId: row.paylink_id,
  createdAt: new Date(row.created_at).toISOString(),
  status: row.status ?? "reserved",
  paymentId: row.payment_id,
  settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
  releasedAt: row.released_at ? new Date(row.released_at).toISOString() : null,
  releasedReason: row.released_reason
});

const toReservationRow = (
  agentId: string,
  reservation: StoredAgentBudgetReservation
): AgentBudgetReservationRow => ({
  id: reservation.id,
  agent_id: agentId,
  amount: reservation.amount,
  reference: reservation.reference,
  paylink_id: reservation.paylinkId,
  created_at: reservation.createdAt,
  status: reservation.status ?? "reserved",
  payment_id: reservation.paymentId ?? null,
  settled_at: reservation.settledAt ?? null,
  released_at: reservation.releasedAt ?? null,
  released_reason: reservation.releasedReason ?? null
});

export class SupabaseAgentBudgetRepository implements AgentBudgetRepository {
  private readonly client: SupabaseRestClient;

  constructor(options: SupabaseAgentBudgetRepositoryOptions = {}) {
    this.client =
      options.client ??
      new SupabaseRestClient({
        config: options.config ?? getSupabaseDatabaseConfig(),
        fetch: options.fetch
      });
  }

  async create(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord> {
    await this.ensureControllerWallet(record.budget.owner);
    await this.client.insert<AgentBudgetRow>(BUDGETS_TABLE, toBudgetRow(record.budget));

    if (record.reservations.length > 0) {
      await this.client.insert<AgentBudgetReservationRow[]>(
        RESERVATIONS_TABLE,
        record.reservations.map((reservation) => toReservationRow(record.budget.agentId, reservation))
      );
    }

    return this.getOrThrow(record.budget.agentId);
  }

  async get(agentId: string): Promise<StoredAgentBudgetRecord | null> {
    const [budgetRow] = await this.client.select<AgentBudgetRow>(BUDGETS_TABLE, { agent_id: agentId });

    if (!budgetRow) {
      return null;
    }

    const reservations = await this.client.select<AgentBudgetReservationRow>(
      RESERVATIONS_TABLE,
      { agent_id: agentId },
      { order: "created_at.asc" }
    );

    return {
      budget: toBudget(budgetRow),
      reservations: reservations.map(toReservation)
    };
  }

  async list(): Promise<StoredAgentBudgetRecord[]> {
    const budgetRows = await this.client.select<AgentBudgetRow>(BUDGETS_TABLE, {}, { order: "created_at.asc" });
    const records = await Promise.all(budgetRows.map((row) => this.get(row.agent_id)));

    return records.filter((record): record is StoredAgentBudgetRecord => Boolean(record));
  }

  async save(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord> {
    await this.ensureControllerWallet(record.budget.owner);
    const updated = await this.client.update<AgentBudgetRow>(
      BUDGETS_TABLE,
      { agent_id: record.budget.agentId },
      toBudgetRow(record.budget)
    );

    if (updated.length === 0) {
      await this.client.insert<AgentBudgetRow>(BUDGETS_TABLE, toBudgetRow(record.budget));
    }

    await this.client.delete(RESERVATIONS_TABLE, { agent_id: record.budget.agentId });

    if (record.reservations.length > 0) {
      await this.client.insert<AgentBudgetReservationRow[]>(
        RESERVATIONS_TABLE,
        record.reservations.map((reservation) => toReservationRow(record.budget.agentId, reservation))
      );
    }

    return this.getOrThrow(record.budget.agentId);
  }

  private async getOrThrow(agentId: string): Promise<StoredAgentBudgetRecord> {
    const record = await this.get(agentId);

    if (!record) {
      throw new Error(`Agent budget was not persisted for agent "${agentId}".`);
    }

    return record;
  }

  private async ensureControllerWallet(owner: string): Promise<void> {
    const existing = await this.client.select<{ address: string }>(CONTROLLER_WALLETS_TABLE, { address: owner });

    if (existing.length > 0) {
      await this.client.update(CONTROLLER_WALLETS_TABLE, { address: owner }, { updated_at: new Date().toISOString() });
      return;
    }

    await this.client.insert(CONTROLLER_WALLETS_TABLE, {
      address: owner,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
}
