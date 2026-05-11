import type { AgentBudget } from "../agent-budget";
import { InMemoryGhostTabRepository, type GhostTabRepository } from "./repository";
import type {
  GhostTabCrankIntent,
  GhostTabEvent,
  GhostTabEventType,
  GhostSessionRuntime,
  GhostTabSession,
  GhostTabSnapshot,
  GhostTimelineItem,
  GhostTabSpendDecision,
  OpenGhostTabInput
} from "./types";

interface GhostTabServiceOptions {
  repository?: GhostTabRepository;
  now?: () => Date;
  createId?: (prefix: string) => string;
  defaultSessionDurationMinutes?: number;
}

type EventInput = {
  session: GhostTabSession;
  type: GhostTabEventType;
  amount?: string;
  allowanceBefore?: string;
  allowanceAfter?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

const DEFAULT_SESSION_DURATION_MINUTES = 8 * 60;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const defaultCreateId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isDuplicateKeyError = (error: unknown): boolean => {
  const message = errorMessage(error).toLowerCase();
  return message.includes("23505") || message.includes("409") || message.includes("duplicate key") || message.includes("already exists");
};

const assertNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const parseAmount = (value: string, fieldName: string): bigint => {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${fieldName} must be an integer-safe decimal string.`);
  }

  return BigInt(value.trim());
};

const parsePositiveAmount = (value: string, fieldName: string): bigint => {
  const amount = parseAmount(value, fieldName);

  if (amount <= 0n) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return amount;
};

const normalizeIso = (value: string | null | undefined, fieldName: string): string | null => {
  if (!value) {
    return null;
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be a valid ISO date/time string.`);
  }

  return new Date(value).toISOString();
};

const minBigInt = (left: bigint, right: bigint): bigint => (left < right ? left : right);

const nextRefillAtForSession = (session: GhostTabSession): string | null =>
  session.status === "active"
    ? new Date(Date.parse(session.lastRefillAt) + session.refillIntervalMinutes * 60 * 1000).toISOString()
    : null;

const calculateSessionLifetimeMinutes = (session: GhostTabSession): number | null => {
  if (!session.expiresAt) {
    return null;
  }

  const lifetimeMs = Date.parse(session.expiresAt) - Date.parse(session.openedAt);
  return Number.isFinite(lifetimeMs) && lifetimeMs > 0 ? Math.round(lifetimeMs / 60000) : null;
};

const buildRuntime = (
  session: GhostTabSession | null,
  events: GhostTabEvent[]
): GhostSessionRuntime => {
  if (!session) {
    return {
      sessionStatus: "idle",
      refillEngine: "offchain-lazy",
      nextRefillAt: null,
      refillTickCount: 0,
      queuedRefill: "0",
      clawbackPending: false,
      clawbackCompleted: false,
      tickCadenceMinutes: null,
      sessionLifetimeMinutes: null
    };
  }

  const nextRefillAt = nextRefillAtForSession(session);
  const clawbackCompleted = session.clawbackExecuted || session.status === "clawed_back";
  const clawbackPending = session.clawbackEnabled && !clawbackCompleted && session.status === "expired";
  const sessionStatus =
    session.status === "clawed_back"
      ? "closed"
      : clawbackPending
        ? "closing"
        : session.status === "expired"
          ? "closed"
          : session.status;
  const allowanceLive = BigInt(session.allowanceLive);
  const allowanceMax = BigInt(session.allowanceMax);
  const queuedRefill =
    session.status === "active" && allowanceLive < allowanceMax
      ? minBigInt(BigInt(session.refillAmount), allowanceMax - allowanceLive).toString()
      : "0";

  return {
    sessionStatus,
    refillEngine: session.status === "active" ? "er-scheduled" : "offchain-lazy",
    nextRefillAt,
    refillTickCount: events.filter((event) => event.type === "refill_tick").length,
    queuedRefill,
    clawbackPending,
    clawbackCompleted,
    tickCadenceMinutes: session.refillIntervalMinutes,
    sessionLifetimeMinutes: calculateSessionLifetimeMinutes(session)
  };
};

const timelineItem = (
  session: GhostTabSession,
  event: GhostTabEvent,
  type: GhostTimelineItem["type"],
  label: string,
  synthetic = false
): GhostTimelineItem => ({
  id: `${event.id}:${type}`,
  type,
  label,
  at: event.at,
  ...(event.amount ? { amount: event.amount } : {}),
  ...(event.allowanceBefore ? { allowanceBefore: event.allowanceBefore } : {}),
  ...(event.allowanceAfter ? { allowanceAfter: event.allowanceAfter } : {}),
  ...(event.reason ? { reason: event.reason } : {}),
  ...(synthetic ? { synthetic } : {}),
  ...(!event.amount && type === "clawback_completed" && session.totalClawedBack !== "0"
    ? { amount: session.totalClawedBack }
    : {})
});

const buildTimeline = (
  session: GhostTabSession | null,
  events: GhostTabEvent[],
  runtime: GhostSessionRuntime
): GhostTimelineItem[] => {
  if (!session) {
    return [];
  }

  const items: GhostTimelineItem[] = [];

  for (const event of events) {
    if (event.type === "opened") {
      items.push(timelineItem(session, event, "session_opened", "Session opened"));
    } else if (event.type === "refill_tick") {
      items.push(timelineItem(session, event, "refill_tick_executed", "Refill tick executed"));
    } else if (event.type === "spend_approved") {
      items.push(timelineItem(session, event, "spend_reserved", "Spend reserved"));
    } else if (event.type === "paused") {
      items.push(timelineItem(session, event, "session_paused", "Session paused"));
    } else if (event.type === "clawback") {
      if (!items.some((item) => item.type === "clawback_queued")) {
        items.push(timelineItem(session, event, "clawback_queued", "Clawback queued", true));
      }
      items.push(timelineItem(session, event, "clawback_completed", "Clawback completed"));
    } else if (event.type === "expired" && session.clawbackEnabled) {
      items.push(timelineItem(session, event, "clawback_queued", "Clawback queued"));
    }
  }

  if (runtime.nextRefillAt) {
    items.push({
      id: `${session.id}:refill_tick_scheduled:${runtime.nextRefillAt}`,
      type: "refill_tick_scheduled",
      label: "Refill tick scheduled",
      at: runtime.nextRefillAt,
      amount: runtime.queuedRefill,
      synthetic: true
    });
  }

  if (items.length === 0) {
    items.push({
      id: `${session.id}:session_opened:synthetic`,
      type: "session_opened",
      label: "Session opened",
      at: session.openedAt,
      synthetic: true
    });
  }

  if (runtime.clawbackPending && !items.some((item) => item.type === "clawback_queued")) {
    items.push({
      id: `${session.id}:clawback_queued:synthetic`,
      type: "clawback_queued",
      label: "Clawback queued",
      at: session.expiresAt ?? session.openedAt,
      amount: session.allowanceLive,
      synthetic: true
    });
  }

  return items.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
};

export class GhostTabService {
  private readonly repository: GhostTabRepository;

  private readonly now: () => Date;

  private readonly createId: (prefix: string) => string;

  private readonly defaultSessionDurationMinutes: number;

  constructor(options: GhostTabServiceOptions = {}) {
    this.repository = options.repository ?? new InMemoryGhostTabRepository();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultCreateId;
    this.defaultSessionDurationMinutes = options.defaultSessionDurationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES;
  }

  async openFromBudget(budget: AgentBudget, expiresAt?: string | null): Promise<GhostTabSession> {
    return this.openSession({
      agentId: budget.agentId,
      controllerWallet: budget.owner,
      allowanceLive: budget.liveAllowance,
      allowanceMax: budget.maxLiveAllowance,
      refillAmount: budget.refillAmount,
      refillIntervalMinutes: budget.refillIntervalMinutes,
      clawbackEnabled: budget.clawbackOnSessionEnd,
      expiresAt: expiresAt ?? budget.sessionEndsAt,
      executionMode: "mirage-private-first",
      preferredRail: budget.rail
    });
  }

  async openSession(input: OpenGhostTabInput): Promise<GhostTabSession> {
    const now = this.now();
    const allowanceMax = parseAmount(input.allowanceMax, "allowanceMax");
    const allowanceLive = minBigInt(parseAmount(input.allowanceLive, "allowanceLive"), allowanceMax);
    const expiresAt =
      normalizeIso(input.expiresAt, "expiresAt") ??
      new Date(now.getTime() + this.defaultSessionDurationMinutes * 60 * 1000).toISOString();
    const session: GhostTabSession = {
      id: this.createId("gt"),
      agentId: assertNonEmptyString(input.agentId, "agentId"),
      controllerWallet: assertNonEmptyString(input.controllerWallet, "controllerWallet"),
      status: "active",
      openedAt: now.toISOString(),
      expiresAt,
      lastRefillAt: now.toISOString(),
      allowanceLive: allowanceLive.toString(),
      allowanceMax: allowanceMax.toString(),
      refillAmount: parseAmount(input.refillAmount, "refillAmount").toString(),
      refillIntervalMinutes: input.refillIntervalMinutes,
      clawbackEnabled: input.clawbackEnabled,
      clawbackExecuted: false,
      totalSpent: "0",
      totalRefilled: "0",
      totalClawedBack: "0",
      executionMode: input.executionMode,
      preferredRail: input.preferredRail
    };

    if (!Number.isInteger(session.refillIntervalMinutes) || session.refillIntervalMinutes <= 0) {
      throw new Error("refillIntervalMinutes must be a positive integer.");
    }

    const created = await this.repository.createSession(session);
    await this.appendEvent({ session: created, type: "opened" });
    return created;
  }

  async ensureSessionForBudget(budget: AgentBudget): Promise<GhostTabSession> {
    const latest = await this.repository.getLatestSession(budget.agentId);

    if (!latest || latest.status === "clawed_back") {
      try {
        return await this.openFromBudget(budget);
      } catch (error) {
        if (!isDuplicateKeyError(error)) {
          throw error;
        }

        const recovered = await this.repository.getLatestSession(budget.agentId);

        if (!recovered) {
          throw error;
        }

        return this.syncSession({
          ...recovered,
          controllerWallet: budget.owner,
          allowanceMax: budget.maxLiveAllowance,
          refillAmount: budget.refillAmount,
          refillIntervalMinutes: budget.refillIntervalMinutes,
          clawbackEnabled: budget.clawbackOnSessionEnd,
          preferredRail: budget.rail
        });
      }
    }

    return this.syncSession({
      ...latest,
      controllerWallet: budget.owner,
      allowanceMax: budget.maxLiveAllowance,
      refillAmount: budget.refillAmount,
      refillIntervalMinutes: budget.refillIntervalMinutes,
      clawbackEnabled: budget.clawbackOnSessionEnd,
      preferredRail: budget.rail
    });
  }

  async getSession(agentId: string): Promise<GhostTabSession | null> {
    const session = await this.repository.getLatestSession(agentId);
    return session ? this.syncSession(session) : null;
  }

  async getSnapshot(agentId: string): Promise<GhostTabSnapshot> {
    const session = await this.getSession(agentId);

    if (!session) {
      const runtime = buildRuntime(null, []);
      return {
        session: null,
        events: [],
        runtime,
        timeline: []
      };
    }
    const events = await this.repository.listEvents(session.id);
    const runtime = buildRuntime(session, events);

    return {
      session,
      events,
      runtime,
      timeline: buildTimeline(session, events, runtime)
    };
  }

  async listSnapshots(controllerWallet: string): Promise<GhostTabSnapshot[]> {
    const sessions = await this.repository.listSessions(controllerWallet);
    const latestByAgent = new Map<string, GhostTabSession>();

    for (const session of sessions) {
      if (!latestByAgent.has(session.agentId)) {
        latestByAgent.set(session.agentId, await this.syncSession(session));
      }
    }

    return Promise.all(
      Array.from(latestByAgent.values()).map(async (session) => ({
        session,
        events: await this.repository.listEvents(session.id)
      }))
    ).then((snapshots) =>
      snapshots.map((snapshot) => {
        const runtime = buildRuntime(snapshot.session, snapshot.events);
        return {
          ...snapshot,
          runtime,
          timeline: buildTimeline(snapshot.session, snapshot.events, runtime)
        };
      })
    );
  }

  async evaluateSpend(agentId: string, amount: string, reason?: string): Promise<GhostTabSpendDecision> {
    const spendAmount = parsePositiveAmount(amount, "amount");
    const existing = await this.repository.getLatestSession(agentId);

    if (!existing) {
      throw new Error(`Ghost Tab session was not found for agent "${agentId}".`);
    }

    const session = await this.syncSession(existing);
    let blockReason: string | null = null;

    if (session.status === "paused") {
      blockReason = "Ghost Tab is paused.";
    } else if (session.status === "expired") {
      blockReason = "Ghost Tab expired.";
    } else if (session.status === "clawed_back") {
      blockReason = "Ghost Tab was clawed back.";
    } else if (spendAmount > BigInt(session.allowanceLive)) {
      blockReason = "Requested spend exceeds live Ghost Allowance.";
    }

    if (blockReason) {
      await this.appendEvent({
        session,
        type: "spend_blocked",
        amount: spendAmount.toString(),
        allowanceBefore: session.allowanceLive,
        allowanceAfter: session.allowanceLive,
        reason: reason ?? blockReason
      });
    }

    return {
      allowed: blockReason === null,
      reason: blockReason,
      session
    };
  }

  async recordSpendApproved(agentId: string, amount: string, reason?: string): Promise<GhostTabSession> {
    const spendAmount = parsePositiveAmount(amount, "amount");
    const existing = await this.repository.getLatestSession(agentId);

    if (!existing) {
      throw new Error(`Ghost Tab session was not found for agent "${agentId}".`);
    }

    const session = await this.syncSession(existing);
    const allowanceBefore = BigInt(session.allowanceLive);
    const allowanceAfter = allowanceBefore > spendAmount ? allowanceBefore - spendAmount : 0n;
    const updated = await this.repository.saveSession({
      ...session,
      allowanceLive: allowanceAfter.toString(),
      totalSpent: (BigInt(session.totalSpent) + spendAmount).toString()
    });

    await this.appendEvent({
      session: updated,
      type: "spend_approved",
      amount: spendAmount.toString(),
      allowanceBefore: allowanceBefore.toString(),
      allowanceAfter: allowanceAfter.toString(),
      ...(reason ? { reason } : {})
    });

    return updated;
  }

  async pause(agentId: string): Promise<GhostTabSession> {
    const session = await this.requireSession(agentId);
    const synced = await this.syncSession(session);

    if (synced.status !== "active") {
      return synced;
    }

    const updated = await this.repository.saveSession({
      ...synced,
      status: "paused"
    });
    await this.appendEvent({ session: updated, type: "paused" });
    return updated;
  }

  async resume(agentId: string): Promise<GhostTabSession> {
    const session = await this.requireSession(agentId);
    const synced = await this.syncSession(session);

    if (synced.status !== "paused") {
      return synced;
    }

    const updated = await this.repository.saveSession({
      ...synced,
      status: "active",
      lastRefillAt: this.now().toISOString()
    });
    await this.appendEvent({ session: updated, type: "resumed" });
    return updated;
  }

  async close(agentId: string): Promise<GhostTabSession> {
    const session = await this.requireSession(agentId);
    const synced = await this.syncSession(session);
    const allowanceBefore = synced.allowanceLive;
    const updated = await this.repository.saveSession({
      ...synced,
      status: "clawed_back",
      allowanceLive: "0",
      clawbackExecuted: true,
      totalClawedBack: (BigInt(synced.totalClawedBack) + BigInt(allowanceBefore)).toString()
    });

    await this.appendEvent({
      session: updated,
      type: "clawback",
      amount: allowanceBefore,
      allowanceBefore,
      allowanceAfter: "0",
      reason: "Ghost Tab closed by controller."
    });

    return updated;
  }

  async syncSession(session: GhostTabSession): Promise<GhostTabSession> {
    const now = this.now();
    let next = clone(session);

    if (next.status === "active" && next.expiresAt && Date.parse(next.expiresAt) <= now.getTime()) {
      next = await this.repository.saveSession({
        ...next,
        status: "expired"
      });
      await this.appendEvent({ session: next, type: "expired" });

      if (next.clawbackEnabled && !next.clawbackExecuted) {
        const allowanceBefore = next.allowanceLive;
        next = await this.repository.saveSession({
          ...next,
          allowanceLive: "0",
          clawbackExecuted: true,
          totalClawedBack: (BigInt(next.totalClawedBack) + BigInt(allowanceBefore)).toString()
        });
        await this.appendEvent({
          session: next,
          type: "clawback",
          amount: allowanceBefore,
          allowanceBefore,
          allowanceAfter: "0",
          reason: "Ghost Tab expired."
        });
      }

      return next;
    }

    if (next.status !== "active") {
      return next;
    }

    const elapsedMs = now.getTime() - Date.parse(next.lastRefillAt);
    const intervalMs = next.refillIntervalMinutes * 60 * 1000;
    const intervals = elapsedMs > 0 ? Math.floor(elapsedMs / intervalMs) : 0;

    if (intervals <= 0) {
      return next;
    }

    const allowanceBefore = BigInt(next.allowanceLive);
    const refill = BigInt(next.refillAmount) * BigInt(intervals);
    const allowanceAfter = minBigInt(BigInt(next.allowanceMax), allowanceBefore + refill);
    const actualRefill = allowanceAfter - allowanceBefore;
    const lastRefillAt = new Date(Date.parse(next.lastRefillAt) + intervals * intervalMs).toISOString();

    next = await this.repository.saveSession({
      ...next,
      allowanceLive: allowanceAfter.toString(),
      totalRefilled: (BigInt(next.totalRefilled) + actualRefill).toString(),
      lastRefillAt
    });

    if (actualRefill > 0n) {
      await this.appendEvent({
        session: next,
        type: "refill_tick",
        amount: actualRefill.toString(),
        allowanceBefore: allowanceBefore.toString(),
        allowanceAfter: allowanceAfter.toString(),
        metadata: {
          intervals
        }
      });
    }

    return next;
  }

  getCrankIntent(session: GhostTabSession): GhostTabCrankIntent {
    // Future MagicBlock hook: this normalized intent is where ER/PER refill cranks
    // and Mirage refill settlement can attach without changing spend approval code.
    const nextRefillAt =
      session.status === "active"
        ? new Date(Date.parse(session.lastRefillAt) + session.refillIntervalMinutes * 60 * 1000).toISOString()
        : null;

    return {
      sessionId: session.id,
      agentId: session.agentId,
      controllerWallet: session.controllerWallet,
      nextRefillAt,
      preferredRail: session.preferredRail,
      executionMode: session.executionMode
    };
  }

  private async requireSession(agentId: string): Promise<GhostTabSession> {
    const session = await this.repository.getLatestSession(agentId);

    if (!session) {
      throw new Error(`Ghost Tab session was not found for agent "${agentId}".`);
    }

    return session;
  }

  private async appendEvent(input: EventInput): Promise<GhostTabEvent> {
    return this.repository.appendEvent({
      id: this.createId("gte"),
      sessionId: input.session.id,
      agentId: input.session.agentId,
      controllerWallet: input.session.controllerWallet,
      type: input.type,
      at: this.now().toISOString(),
      ...(input.amount ? { amount: input.amount } : {}),
      ...(input.allowanceBefore ? { allowanceBefore: input.allowanceBefore } : {}),
      ...(input.allowanceAfter ? { allowanceAfter: input.allowanceAfter } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.metadata ? { metadata: clone(input.metadata) } : {})
    });
  }
}
