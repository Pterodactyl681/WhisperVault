import { getSupabaseDatabaseConfig, type SupabaseDatabaseConfig } from "../storage/config";
import { SupabaseRestClient, type SupabaseFetch } from "../storage/supabase-rest";
import type { GhostTabRepository } from "./repository";
import type { GhostTabEvent, GhostTabSession } from "./types";

interface SupabaseGhostTabRepositoryOptions {
  config?: SupabaseDatabaseConfig;
  client?: SupabaseRestClient;
  fetch?: SupabaseFetch;
}

interface GhostTabSessionRow {
  id: string;
  agent_id: string;
  controller_wallet: string;
  status: GhostTabSession["status"];
  opened_at: string;
  expires_at: string | null;
  last_refill_at: string;
  allowance_live: string;
  allowance_max: string;
  refill_amount: string;
  refill_interval_minutes: number;
  clawback_enabled: boolean;
  clawback_executed: boolean;
  total_spent: string;
  total_refilled: string;
  total_clawed_back: string;
  execution_mode: GhostTabSession["executionMode"];
  preferred_rail: GhostTabSession["preferredRail"];
}

interface GhostTabEventRow {
  id: string;
  session_id: string;
  agent_id: string;
  controller_wallet: string;
  type: GhostTabEvent["type"];
  at: string;
  amount: string | null;
  allowance_before: string | null;
  allowance_after: string | null;
  reason: string | null;
  metadata: GhostTabEvent["metadata"] | null;
}

const SESSIONS_TABLE = "whispervault_ghost_tab_sessions";
const EVENTS_TABLE = "whispervault_ghost_tab_events";
const CONTROLLER_WALLETS_TABLE = "whispervault_controller_wallets";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toSession = (row: GhostTabSessionRow): GhostTabSession => ({
  id: row.id,
  agentId: row.agent_id,
  controllerWallet: row.controller_wallet,
  status: row.status,
  openedAt: new Date(row.opened_at).toISOString(),
  expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
  lastRefillAt: new Date(row.last_refill_at).toISOString(),
  allowanceLive: row.allowance_live,
  allowanceMax: row.allowance_max,
  refillAmount: row.refill_amount,
  refillIntervalMinutes: row.refill_interval_minutes,
  clawbackEnabled: row.clawback_enabled,
  clawbackExecuted: row.clawback_executed,
  totalSpent: row.total_spent,
  totalRefilled: row.total_refilled,
  totalClawedBack: row.total_clawed_back,
  executionMode: row.execution_mode,
  preferredRail: row.preferred_rail
});

const toSessionRow = (session: GhostTabSession): GhostTabSessionRow => ({
  id: session.id,
  agent_id: session.agentId,
  controller_wallet: session.controllerWallet,
  status: session.status,
  opened_at: session.openedAt,
  expires_at: session.expiresAt,
  last_refill_at: session.lastRefillAt,
  allowance_live: session.allowanceLive,
  allowance_max: session.allowanceMax,
  refill_amount: session.refillAmount,
  refill_interval_minutes: session.refillIntervalMinutes,
  clawback_enabled: session.clawbackEnabled,
  clawback_executed: session.clawbackExecuted,
  total_spent: session.totalSpent,
  total_refilled: session.totalRefilled,
  total_clawed_back: session.totalClawedBack,
  execution_mode: session.executionMode,
  preferred_rail: session.preferredRail
});

const toEvent = (row: GhostTabEventRow): GhostTabEvent => ({
  id: row.id,
  sessionId: row.session_id,
  agentId: row.agent_id,
  controllerWallet: row.controller_wallet,
  type: row.type,
  at: new Date(row.at).toISOString(),
  ...(row.amount ? { amount: row.amount } : {}),
  ...(row.allowance_before ? { allowanceBefore: row.allowance_before } : {}),
  ...(row.allowance_after ? { allowanceAfter: row.allowance_after } : {}),
  ...(row.reason ? { reason: row.reason } : {}),
  ...(row.metadata ? { metadata: clone(row.metadata) } : {})
});

const toEventRow = (event: GhostTabEvent): GhostTabEventRow => ({
  id: event.id,
  session_id: event.sessionId,
  agent_id: event.agentId,
  controller_wallet: event.controllerWallet,
  type: event.type,
  at: event.at,
  amount: event.amount ?? null,
  allowance_before: event.allowanceBefore ?? null,
  allowance_after: event.allowanceAfter ?? null,
  reason: event.reason ?? null,
  metadata: event.metadata ? clone(event.metadata) : null
});

export class SupabaseGhostTabRepository implements GhostTabRepository {
  private readonly client: SupabaseRestClient;

  constructor(options: SupabaseGhostTabRepositoryOptions = {}) {
    this.client =
      options.client ??
      new SupabaseRestClient({
        config: options.config ?? getSupabaseDatabaseConfig(),
        fetch: options.fetch
      });
  }

  async createSession(session: GhostTabSession): Promise<GhostTabSession> {
    await this.ensureControllerWallet(session.controllerWallet);
    await this.client.insert<GhostTabSessionRow>(SESSIONS_TABLE, toSessionRow(session));
    return this.getSessionOrThrow(session.id);
  }

  async saveSession(session: GhostTabSession): Promise<GhostTabSession> {
    await this.ensureControllerWallet(session.controllerWallet);
    const updated = await this.client.update<GhostTabSessionRow>(SESSIONS_TABLE, { id: session.id }, toSessionRow(session));

    if (updated.length === 0) {
      await this.client.insert<GhostTabSessionRow>(SESSIONS_TABLE, toSessionRow(session));
    }

    return this.getSessionOrThrow(session.id);
  }

  async getSession(sessionId: string): Promise<GhostTabSession | null> {
    const [row] = await this.client.select<GhostTabSessionRow>(SESSIONS_TABLE, { id: sessionId });
    return row ? toSession(row) : null;
  }

  async getLatestSession(agentId: string): Promise<GhostTabSession | null> {
    const [row] = await this.client.select<GhostTabSessionRow>(
      SESSIONS_TABLE,
      { agent_id: agentId },
      { order: "opened_at.desc" }
    );
    return row ? toSession(row) : null;
  }

  async listSessions(controllerWallet?: string): Promise<GhostTabSession[]> {
    const rows = await this.client.select<GhostTabSessionRow>(
      SESSIONS_TABLE,
      controllerWallet ? { controller_wallet: controllerWallet } : {},
      { order: "opened_at.desc" }
    );
    return rows.map(toSession);
  }

  async appendEvent(event: GhostTabEvent): Promise<GhostTabEvent> {
    await this.client.insert<GhostTabEventRow>(EVENTS_TABLE, toEventRow(event));
    return event;
  }

  async listEvents(sessionId: string): Promise<GhostTabEvent[]> {
    const rows = await this.client.select<GhostTabEventRow>(
      EVENTS_TABLE,
      { session_id: sessionId },
      { order: "at.asc" }
    );
    return rows.map(toEvent);
  }

  private async getSessionOrThrow(sessionId: string): Promise<GhostTabSession> {
    const session = await this.getSession(sessionId);

    if (!session) {
      throw new Error(`Ghost Tab session was not persisted for id "${sessionId}".`);
    }

    return session;
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
