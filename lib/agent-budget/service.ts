import {
  type AgentBudget,
  type AgentBudgetAmountInput,
  type AgentBudgetConfirmationReceipt,
  type AgentBudgetReleaseReceipt,
  type AgentBudgetReservationReceipt,
  type AgentBudgetReservationTransitionReceipt,
  type AgentBudgetSpendDecision,
  type AgentBudgetAllowanceMode,
  type AgentBudgetStatus,
  type CreateAgentBudgetInput,
  type ReserveSpendReference
} from "./types";
import {
  type AgentBudgetRepository,
  InMemoryAgentBudgetRepository,
  type StoredAgentBudgetRecord,
  type StoredAgentBudgetReservation
} from "./repository";

const DEFAULT_DAILY_CAP_PERCENT = 30;
const DEFAULT_RESERVATION_REFERENCE = "reserved-spend";
const DEFAULT_ALLOWANCE_MODE: AgentBudgetAllowanceMode = "rolling";
const DEFAULT_LIVE_ALLOWANCE = "10";
const DEFAULT_REFILL_AMOUNT = "5";
const DEFAULT_REFILL_INTERVAL_MINUTES = 10;
const DEFAULT_MAX_LIVE_ALLOWANCE = "20";
const DEFAULT_CLAWBACK_ON_SESSION_END = true;

interface AgentBudgetServiceOptions {
  repository?: AgentBudgetRepository;
  now?: () => Date;
}

interface ResetAgentBudgetForDemoInput {
  agentId: string;
  owner: string;
  agentWallet?: string;
  mint?: string;
  totalBudget?: AgentBudgetAmountInput;
  currentBalance?: AgentBudgetAmountInput;
  dailyCapPercent?: number;
  spentToday?: AgentBudgetAmountInput;
  liveAllowance?: AgentBudgetAmountInput;
  maxLiveAllowance?: AgentBudgetAmountInput;
  refillAmount?: AgentBudgetAmountInput;
  refillIntervalMinutes?: number;
  rail?: AgentBudget["rail"];
  allowPublicFallback?: boolean;
}

interface NormalizedReservationReference {
  reference: string;
  paylinkId: string | null;
}

interface ReservationConsumptionResult {
  reservations: StoredAgentBudgetReservation[];
  remainingReservedAmount: bigint;
}

const assertNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const parseAmount = (value: AgentBudgetAmountInput, fieldName: string): bigint => {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${fieldName} must be non-negative.`);
    }

    return value;
  }

  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${fieldName} must be an integer-safe decimal string or bigint.`);
  }

  return BigInt(normalized);
};

const parsePositiveAmount = (value: AgentBudgetAmountInput, fieldName: string): bigint => {
  const amount = parseAmount(value, fieldName);

  if (amount <= 0n) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }

  return amount;
};

const normalizeDailyCapPercent = (dailyCapPercent?: number): number => {
  const value = dailyCapPercent ?? DEFAULT_DAILY_CAP_PERCENT;

  if (!Number.isInteger(value) || value < 0 || value > 100) {
    throw new Error("dailyCapPercent must be an integer between 0 and 100.");
  }

  return value;
};

const normalizeAllowanceMode = (allowanceMode?: AgentBudgetAllowanceMode): AgentBudgetAllowanceMode =>
  allowanceMode === "static" ? "static" : DEFAULT_ALLOWANCE_MODE;

const normalizePositiveInteger = (value: number | undefined, fallback: number, fieldName: string): number => {
  const normalized = value ?? fallback;

  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return normalized;
};

const normalizeIsoTimestamp = (value: string | undefined, fallback: Date, fieldName: string): string => {
  const candidate = value?.trim() || fallback.toISOString();

  if (Number.isNaN(Date.parse(candidate))) {
    throw new Error(`${fieldName} must be a valid ISO date/time string.`);
  }

  return new Date(candidate).toISOString();
};

const normalizeOptionalIsoTimestamp = (value: string | null | undefined, fieldName: string): string | null => {
  if (value === undefined || value === null || !value.trim()) {
    return null;
  }

  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be a valid ISO date/time string.`);
  }

  return new Date(value).toISOString();
};

const normalizeMetadata = (metadata: AgentBudget["metadata"]): AgentBudget["metadata"] => {
  if (metadata === undefined) {
    return undefined;
  }

  if (metadata === null || Array.isArray(metadata) || typeof metadata !== "object") {
    throw new Error("metadata must be an object when provided.");
  }

  return JSON.parse(JSON.stringify(metadata)) as AgentBudget["metadata"];
};

const normalizeStatus = (status: AgentBudgetStatus | undefined, currentBalance: bigint): AgentBudgetStatus => {
  if (status === "paused") {
    return "paused";
  }

  if (status === "exhausted") {
    return "exhausted";
  }

  return currentBalance === 0n ? "exhausted" : "active";
};

const normalizeReservationReference = (input: ReserveSpendReference | undefined): NormalizedReservationReference => {
  if (typeof input === "string") {
    const normalized = input.trim();
    return {
      reference: normalized || DEFAULT_RESERVATION_REFERENCE,
      paylinkId: null
    };
  }

  const paylinkId = input?.paylinkId?.trim() || null;
  const reason = input?.reason?.trim() || paylinkId || DEFAULT_RESERVATION_REFERENCE;

  return {
    reference: reason,
    paylinkId
  };
};

const cloneBudget = (budget: AgentBudget): AgentBudget => ({
  ...budget,
  metadata: normalizeMetadata(budget.metadata)
});

const getReservationStatus = (reservation: StoredAgentBudgetReservation): "reserved" | "confirmed" | "released" =>
  reservation.status ?? "reserved";

const sumReservations = (record: StoredAgentBudgetRecord): bigint =>
  record.reservations.reduce(
    (total, reservation) => total + (getReservationStatus(reservation) === "reserved" ? BigInt(reservation.amount) : 0n),
    0n
  );

const sameUtcDay = (leftIso: string, rightIso: string): boolean => leftIso.slice(0, 10) === rightIso.slice(0, 10);

const minBigInt = (left: bigint, right: bigint): bigint => (left < right ? left : right);

const maxBigInt = (left: bigint, right: bigint): bigint => (left > right ? left : right);

const isSessionExpired = (budget: AgentBudget, now: Date): boolean =>
  Boolean(budget.sessionEndsAt && Date.parse(budget.sessionEndsAt) <= now.getTime());

const normalizeBudgetAllowanceFields = (budget: AgentBudget, now: Date): AgentBudget => ({
  ...budget,
  allowanceMode: normalizeAllowanceMode(budget.allowanceMode),
  liveAllowance: parseAmount(budget.liveAllowance ?? DEFAULT_LIVE_ALLOWANCE, "liveAllowance").toString(),
  refillAmount: parseAmount(budget.refillAmount ?? DEFAULT_REFILL_AMOUNT, "refillAmount").toString(),
  refillIntervalMinutes: normalizePositiveInteger(
    budget.refillIntervalMinutes,
    DEFAULT_REFILL_INTERVAL_MINUTES,
    "refillIntervalMinutes"
  ),
  maxLiveAllowance: parseAmount(budget.maxLiveAllowance ?? DEFAULT_MAX_LIVE_ALLOWANCE, "maxLiveAllowance").toString(),
  lastRefillAt: normalizeIsoTimestamp(budget.lastRefillAt, now, "lastRefillAt"),
  sessionEndsAt: normalizeOptionalIsoTimestamp(budget.sessionEndsAt, "sessionEndsAt"),
  clawbackOnSessionEnd: budget.clawbackOnSessionEnd ?? DEFAULT_CLAWBACK_ON_SESSION_END
});

/**
 * Daily cap uses the safer interpretation: we apply the percentage to the smaller of
 * currentBalance and totalBudget, then floor the result with bigint division.
 */
const calculateDailyCap = (budget: AgentBudget): bigint => {
  const currentBalance = BigInt(budget.currentBalance);
  const totalBudget = BigInt(budget.totalBudget);
  const capBase = minBigInt(currentBalance, totalBudget);

  return (capBase * BigInt(budget.dailyCapPercent)) / 100n;
};

const formatError = (decision: AgentBudgetSpendDecision): string =>
  decision.reason ?? "Spend is not allowed for this budget.";

const consumeReservations = (
  reservations: StoredAgentBudgetReservation[],
  amount: bigint,
  filter?: (reservation: StoredAgentBudgetReservation) => boolean
): ReservationConsumptionResult => {
  let remaining = amount;
  const nextReservations: StoredAgentBudgetReservation[] = [];

  for (const reservation of reservations) {
    if (remaining === 0n || getReservationStatus(reservation) !== "reserved" || (filter && !filter(reservation))) {
      nextReservations.push({ ...reservation });
      continue;
    }

    const reservationAmount = BigInt(reservation.amount);

    if (reservationAmount <= remaining) {
      remaining -= reservationAmount;
      continue;
    }

      nextReservations.push({
        ...reservation,
        amount: (reservationAmount - remaining).toString()
    });
    remaining = 0n;
  }

  if (remaining > 0n) {
    throw new Error("Reserved amount is insufficient for this operation.");
  }

  return {
    reservations: nextReservations,
    remainingReservedAmount: nextReservations.reduce((total, reservation) => total + BigInt(reservation.amount), 0n)
  };
};

const applyReservationTransition = (
  reservations: StoredAgentBudgetReservation[],
  amount: bigint,
  filter: (reservation: StoredAgentBudgetReservation) => boolean,
  mutate: (reservation: StoredAgentBudgetReservation) => StoredAgentBudgetReservation
): ReservationConsumptionResult => {
  let remaining = amount;
  const nextReservations: StoredAgentBudgetReservation[] = [];

  for (const reservation of reservations) {
    const status = getReservationStatus(reservation);

    if (remaining === 0n || status !== "reserved" || !filter(reservation)) {
      nextReservations.push({ ...reservation });
      continue;
    }

    const reservationAmount = BigInt(reservation.amount);

    if (reservationAmount <= remaining) {
      nextReservations.push(mutate({ ...reservation }));
      remaining -= reservationAmount;
      continue;
    }

    nextReservations.push({
      ...reservation,
      amount: (reservationAmount - remaining).toString()
    });
    nextReservations.push(
      mutate({
        ...reservation,
        id: `abr_${uid()}`,
        amount: remaining.toString()
      })
    );
    remaining = 0n;
  }

  if (remaining > 0n) {
    throw new Error("Reserved amount is insufficient for this operation.");
  }

  return {
    reservations: nextReservations,
    remainingReservedAmount: nextReservations.reduce(
      (total, reservation) => total + (getReservationStatus(reservation) === "reserved" ? BigInt(reservation.amount) : 0n),
      0n
    )
  };
};

const uid = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export class AgentBudgetService {
  private readonly repository: AgentBudgetRepository;

  private readonly now: () => Date;

  constructor(options: AgentBudgetServiceOptions = {}) {
    this.repository = options.repository ?? new InMemoryAgentBudgetRepository();
    this.now = options.now ?? (() => new Date());
  }

  async createAgentBudget(input: CreateAgentBudgetInput): Promise<AgentBudget> {
    const now = this.now();
    const totalBudget = parseAmount(input.totalBudget, "totalBudget");
    const currentBalance = parseAmount(input.currentBalance ?? input.totalBudget, "currentBalance");
    const spentToday = parseAmount(input.spentToday ?? "0", "spentToday");
    const maxLiveAllowance = parseAmount(input.maxLiveAllowance ?? DEFAULT_MAX_LIVE_ALLOWANCE, "maxLiveAllowance");
    const liveAllowance = parseAmount(input.liveAllowance ?? DEFAULT_LIVE_ALLOWANCE, "liveAllowance");
    const agentWallet = input.agentWallet?.trim() || undefined;

    const budget: AgentBudget = {
      agentId: assertNonEmptyString(input.agentId, "agentId"),
      owner: assertNonEmptyString(input.owner, "owner"),
      mint: assertNonEmptyString(input.mint, "mint"),
      totalBudget: totalBudget.toString(),
      currentBalance: currentBalance.toString(),
      dailyCapPercent: normalizeDailyCapPercent(input.dailyCapPercent),
      spentToday: spentToday.toString(),
      lastResetAt: normalizeIsoTimestamp(input.lastResetAt, now, "lastResetAt"),
      status: normalizeStatus(input.status, currentBalance),
      rail: input.rail,
      allowPublicFallback: input.allowPublicFallback ?? false,
      allowanceMode: normalizeAllowanceMode(input.allowanceMode),
      liveAllowance: minBigInt(liveAllowance, maxLiveAllowance).toString(),
      refillAmount: parseAmount(input.refillAmount ?? DEFAULT_REFILL_AMOUNT, "refillAmount").toString(),
      refillIntervalMinutes: normalizePositiveInteger(
        input.refillIntervalMinutes,
        DEFAULT_REFILL_INTERVAL_MINUTES,
        "refillIntervalMinutes"
      ),
      maxLiveAllowance: maxLiveAllowance.toString(),
      lastRefillAt: normalizeIsoTimestamp(input.lastRefillAt, now, "lastRefillAt"),
      sessionEndsAt: normalizeOptionalIsoTimestamp(input.sessionEndsAt, "sessionEndsAt"),
      clawbackOnSessionEnd: input.clawbackOnSessionEnd ?? DEFAULT_CLAWBACK_ON_SESSION_END,
      ...(agentWallet ? { agentWallet } : {}),
      metadata: normalizeMetadata(input.metadata)
    };

    const created = await this.repository.create({
      budget,
      reservations: []
    });

    return cloneBudget(created.budget);
  }

  async getAgentBudget(agentId: string): Promise<AgentBudget | null> {
    const record = await this.repository.get(agentId);
    if (!record) {
      return null;
    }

    const normalized = await this.normalizeRecord(record);
    return cloneBudget(normalized.budget);
  }

  async listAgentBudgets(): Promise<AgentBudget[]> {
    const records = await this.repository.list();
    const normalized = await Promise.all(records.map((record) => this.normalizeRecord(record)));
    return normalized.map((record) => cloneBudget(record.budget));
  }

  async resetAgentBudgetForDemo(input: ResetAgentBudgetForDemoInput): Promise<AgentBudget> {
    const now = this.now();
    const record = await this.getRecordOrThrow(input.agentId);
    const totalBudget = parseAmount(input.totalBudget ?? record.budget.totalBudget, "totalBudget");
    const currentBalance = parseAmount(input.currentBalance ?? totalBudget.toString(), "currentBalance");
    const liveAllowance = parseAmount(input.liveAllowance ?? record.budget.liveAllowance, "liveAllowance");
    const maxLiveAllowance = parseAmount(input.maxLiveAllowance ?? record.budget.maxLiveAllowance, "maxLiveAllowance");
    const agentWallet = input.agentWallet?.trim() || record.budget.agentWallet;
    const nextBudget = normalizeBudgetAllowanceFields(
      {
        ...record.budget,
        owner: assertNonEmptyString(input.owner, "owner"),
        mint: assertNonEmptyString(input.mint ?? record.budget.mint, "mint"),
        totalBudget: totalBudget.toString(),
        currentBalance: currentBalance.toString(),
        dailyCapPercent: normalizeDailyCapPercent(input.dailyCapPercent ?? record.budget.dailyCapPercent),
        spentToday: parseAmount(input.spentToday ?? "0", "spentToday").toString(),
        lastResetAt: now.toISOString(),
        status: normalizeStatus("active", currentBalance),
        rail: input.rail ?? record.budget.rail,
        allowPublicFallback: input.allowPublicFallback ?? false,
        allowanceMode: "rolling",
        liveAllowance: minBigInt(liveAllowance, maxLiveAllowance).toString(),
        maxLiveAllowance: maxLiveAllowance.toString(),
        refillAmount: parseAmount(input.refillAmount ?? record.budget.refillAmount, "refillAmount").toString(),
        refillIntervalMinutes: normalizePositiveInteger(
          input.refillIntervalMinutes ?? record.budget.refillIntervalMinutes,
          DEFAULT_REFILL_INTERVAL_MINUTES,
          "refillIntervalMinutes"
        ),
        lastRefillAt: now.toISOString(),
        sessionEndsAt: null,
        clawbackOnSessionEnd: true,
        ...(agentWallet ? { agentWallet } : {})
      },
      now
    );

    const saved = await this.repository.save({
      budget: nextBudget,
      reservations: []
    });

    return cloneBudget(saved.budget);
  }

  async canSpend(agentId: string, amount: AgentBudgetAmountInput): Promise<AgentBudgetSpendDecision> {
    const record = await this.getSyncedRecord(agentId);
    const spendAmount = parsePositiveAmount(amount, "amount");
    return this.evaluateSpend(record, spendAmount);
  }

  async reserveSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reference?: ReserveSpendReference
  ): Promise<AgentBudgetReservationReceipt> {
    const record = await this.getSyncedRecord(agentId);
    const spendAmount = parsePositiveAmount(amount, "amount");
    const decision = this.evaluateSpend(record, spendAmount);

    if (!decision.allowed) {
      throw new Error(formatError(decision));
    }

    const normalizedReference = normalizeReservationReference(reference);
    const reservation: StoredAgentBudgetReservation = {
      id: `abr_${uid()}`,
      amount: spendAmount.toString(),
      reference: normalizedReference.reference,
      paylinkId: normalizedReference.paylinkId,
      createdAt: this.now().toISOString(),
      status: "reserved",
      paymentId: null,
      settledAt: null,
      releasedAt: null,
      releasedReason: null
    };

    const nextBudget: AgentBudget =
      record.budget.allowanceMode === "rolling"
        ? {
            ...record.budget,
            liveAllowance: decision.ghostAllowanceAfter
          }
        : record.budget;

    const saved = await this.repository.save({
      ...record,
      budget: nextBudget,
      reservations: [...record.reservations, reservation]
    });

    return {
      reservationId: reservation.id,
      amount: reservation.amount,
      reference: reservation.reference,
      paylinkId: reservation.paylinkId,
      reservedAmount: sumReservations(saved).toString(),
      allowanceMode: decision.allowanceMode,
      ghostAllowanceBefore: decision.ghostAllowanceBefore,
      ghostAllowanceAfter: decision.ghostAllowanceAfter,
      budget: cloneBudget(saved.budget)
    };
  }

  async confirmSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetConfirmationReceipt> {
    const record = await this.getSyncedRecord(agentId);
    const spendAmount = parsePositiveAmount(amount, "amount");
    const normalizedPaymentId = assertNonEmptyString(paymentId, "paymentId");
    const reservedAmount = sumReservations(record);

    let nextReservations = record.reservations;

    if (reservedAmount > 0n) {
      if (spendAmount > reservedAmount) {
        throw new Error("Confirmation amount exceeds reserved funds.");
      }

      nextReservations = applyReservationTransition(
        record.reservations,
        spendAmount,
        () => true,
        (reservation) => ({
          ...reservation,
          status: "confirmed",
          paymentId: normalizedPaymentId,
          settledAt: this.now().toISOString(),
          releasedAt: null,
          releasedReason: null
        })
      ).reservations;
    } else {
      const decision = this.evaluateSpend(record, spendAmount);

      if (!decision.allowed) {
        throw new Error(formatError(decision));
      }
    }

    const currentBalance = BigInt(record.budget.currentBalance);
    const nextBalance = currentBalance - spendAmount;

    if (nextBalance < 0n) {
      throw new Error("Cannot confirm spend larger than current balance.");
    }

    const nextSpentToday = BigInt(record.budget.spentToday) + spendAmount;
    const nextBudget: AgentBudget = {
      ...record.budget,
      currentBalance: nextBalance.toString(),
      spentToday: nextSpentToday.toString(),
      status: normalizeStatus(record.budget.status, nextBalance)
    };

    const saved = await this.repository.save({
      budget: nextBudget,
      reservations: nextReservations
    });

    return {
      paymentId: normalizedPaymentId,
      amount: spendAmount.toString(),
      reservedAmount: sumReservations(saved).toString(),
      budget: cloneBudget(saved.budget)
    };
  }

  async releaseReservedSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReleaseReceipt> {
    const record = await this.getSyncedRecord(agentId);
    const releaseAmount = parsePositiveAmount(amount, "amount");
    const normalizedReason = assertNonEmptyString(reason, "reason");
    const consumed = applyReservationTransition(
      record.reservations,
      releaseAmount,
      (reservation) => reservation.reference === normalizedReason,
      (reservation) => ({
        ...reservation,
        status: "released",
        releasedAt: this.now().toISOString(),
        releasedReason: normalizedReason,
        paymentId: null,
        settledAt: null
      })
    );

    const saved = await this.repository.save({
      ...record,
      reservations: consumed.reservations
    });

    return {
      reason: normalizedReason,
      releasedAmount: releaseAmount.toString(),
      reservedAmount: consumed.remainingReservedAmount.toString(),
      budget: cloneBudget(saved.budget)
    };
  }

  async resetDailyIfNeeded(agentId: string): Promise<AgentBudget> {
    const record = await this.getRecordOrThrow(agentId);
    const { record: syncedRecord } = await this.syncDailySpend(record);
    return cloneBudget(syncedRecord.budget);
  }

  async pauseAgentBudget(agentId: string): Promise<AgentBudget> {
    const record = await this.getRecordOrThrow(agentId);
    const saved = await this.repository.save({
      ...record,
      budget: {
        ...record.budget,
        status: "paused"
      }
    });

    return cloneBudget(saved.budget);
  }

  async resumeAgentBudget(agentId: string): Promise<AgentBudget> {
    const record = await this.getRecordOrThrow(agentId);
    const { record: syncedRecord } = await this.syncDailySpend(record);
    const nextStatus = BigInt(syncedRecord.budget.currentBalance) === 0n ? "exhausted" : "active";
    const saved = await this.repository.save({
      ...syncedRecord,
      budget: {
        ...syncedRecord.budget,
        status: nextStatus
      }
    });

    return cloneBudget(saved.budget);
  }

  async confirmReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetReservationTransitionReceipt> {
    const record = await this.getSyncedRecord(agentId);
    const normalizedPaylinkId = assertNonEmptyString(paylinkId, "paylinkId");
    const spendAmount = parsePositiveAmount(amount, "amount");
    const normalizedPaymentId = assertNonEmptyString(paymentId, "paymentId");
    const matching = record.reservations.filter((reservation) => reservation.paylinkId === normalizedPaylinkId);
    const reservedMatching = matching.filter((reservation) => getReservationStatus(reservation) === "reserved");

    if (reservedMatching.length === 0) {
      const alreadyConfirmed = matching.find((reservation) => getReservationStatus(reservation) === "confirmed");
      if (alreadyConfirmed) {
        return {
          outcome: "already_confirmed",
          amount: spendAmount.toString(),
          reservedAmount: sumReservations(record).toString(),
          paylinkId: normalizedPaylinkId,
          paymentId: alreadyConfirmed.paymentId ?? normalizedPaymentId,
          budget: cloneBudget(record.budget)
        };
      }

      const alreadyReleased = matching.find((reservation) => getReservationStatus(reservation) === "released");
      if (alreadyReleased) {
        return {
          outcome: "already_released",
          amount: spendAmount.toString(),
          reservedAmount: sumReservations(record).toString(),
          paylinkId: normalizedPaylinkId,
          paymentId: normalizedPaymentId,
          reason: alreadyReleased.releasedReason ?? null,
          budget: cloneBudget(record.budget)
        };
      }

      return {
        outcome: "missing_reservation",
        amount: spendAmount.toString(),
        reservedAmount: sumReservations(record).toString(),
        paylinkId: normalizedPaylinkId,
        paymentId: normalizedPaymentId,
        budget: cloneBudget(record.budget)
      };
    }

    const updatedReservations = applyReservationTransition(
      record.reservations,
      spendAmount,
      (reservation) => reservation.paylinkId === normalizedPaylinkId,
      (reservation) => ({
        ...reservation,
        status: "confirmed",
        paymentId: normalizedPaymentId,
        settledAt: this.now().toISOString(),
        releasedAt: null,
        releasedReason: null
      })
    );

    const currentBalance = BigInt(record.budget.currentBalance);
    const nextBalance = currentBalance - spendAmount;

    if (nextBalance < 0n) {
      throw new Error("Cannot confirm spend larger than current balance.");
    }

    const nextBudget: AgentBudget = {
      ...record.budget,
      currentBalance: nextBalance.toString(),
      spentToday: (BigInt(record.budget.spentToday) + spendAmount).toString(),
      status: normalizeStatus(record.budget.status, nextBalance)
    };

    const saved = await this.repository.save({
      budget: nextBudget,
      reservations: updatedReservations.reservations
    });

    return {
      outcome: "confirmed",
      amount: spendAmount.toString(),
      reservedAmount: sumReservations(saved).toString(),
      paylinkId: normalizedPaylinkId,
      paymentId: normalizedPaymentId,
      budget: cloneBudget(saved.budget)
    };
  }

  async releaseReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReservationTransitionReceipt> {
    const record = await this.getSyncedRecord(agentId);
    const normalizedPaylinkId = assertNonEmptyString(paylinkId, "paylinkId");
    const releaseAmount = parsePositiveAmount(amount, "amount");
    const normalizedReason = assertNonEmptyString(reason, "reason");
    const matching = record.reservations.filter((reservation) => reservation.paylinkId === normalizedPaylinkId);
    const reservedMatching = matching.filter((reservation) => getReservationStatus(reservation) === "reserved");

    if (reservedMatching.length === 0) {
      const alreadyReleased = matching.find((reservation) => getReservationStatus(reservation) === "released");
      if (alreadyReleased) {
        return {
          outcome: "already_released",
          amount: releaseAmount.toString(),
          reservedAmount: sumReservations(record).toString(),
          paylinkId: normalizedPaylinkId,
          reason: alreadyReleased.releasedReason ?? normalizedReason,
          budget: cloneBudget(record.budget)
        };
      }

      const alreadyConfirmed = matching.find((reservation) => getReservationStatus(reservation) === "confirmed");
      if (alreadyConfirmed) {
        return {
          outcome: "already_confirmed",
          amount: releaseAmount.toString(),
          reservedAmount: sumReservations(record).toString(),
          paylinkId: normalizedPaylinkId,
          paymentId: alreadyConfirmed.paymentId ?? null,
          reason: normalizedReason,
          budget: cloneBudget(record.budget)
        };
      }

      return {
        outcome: "missing_reservation",
        amount: releaseAmount.toString(),
        reservedAmount: sumReservations(record).toString(),
        paylinkId: normalizedPaylinkId,
        reason: normalizedReason,
        budget: cloneBudget(record.budget)
      };
    }

    const updatedReservations = applyReservationTransition(
      record.reservations,
      releaseAmount,
      (reservation) => reservation.paylinkId === normalizedPaylinkId,
      (reservation) => ({
        ...reservation,
        status: "released",
        releasedAt: this.now().toISOString(),
        releasedReason: normalizedReason,
        paymentId: null,
        settledAt: null
      })
    );

    const saved = await this.repository.save({
      ...record,
      reservations: updatedReservations.reservations
    });

    return {
      outcome: "released",
      amount: releaseAmount.toString(),
      reservedAmount: sumReservations(saved).toString(),
      paylinkId: normalizedPaylinkId,
      reason: normalizedReason,
      budget: cloneBudget(saved.budget)
    };
  }

  private async getRecordOrThrow(agentId: string): Promise<StoredAgentBudgetRecord> {
    const record = await this.repository.get(assertNonEmptyString(agentId, "agentId"));

    if (!record) {
      throw new Error(`Agent budget not found for agent "${agentId}".`);
    }

    return this.normalizeRecord(record);
  }

  private async getSyncedRecord(agentId: string): Promise<StoredAgentBudgetRecord> {
    const record = await this.getRecordOrThrow(agentId);
    const { record: dailySyncedRecord } = await this.syncDailySpend(record);
    const { record: allowanceSyncedRecord } = await this.syncAllowance(dailySyncedRecord);
    return allowanceSyncedRecord;
  }

  private async normalizeRecord(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord> {
    const now = this.now();
    const normalizedBudget = normalizeBudgetAllowanceFields(record.budget, now);

    if (JSON.stringify(normalizedBudget) === JSON.stringify(record.budget)) {
      return record;
    }

    return this.repository.save({
      ...record,
      budget: normalizedBudget
    });
  }

  private async syncDailySpend(
    record: StoredAgentBudgetRecord
  ): Promise<{ record: StoredAgentBudgetRecord; didReset: boolean }> {
    const now = this.now().toISOString();

    if (sameUtcDay(record.budget.lastResetAt, now)) {
      return {
        record,
        didReset: false
      };
    }

    const nextRecord: StoredAgentBudgetRecord = {
      ...record,
      budget: {
        ...record.budget,
        spentToday: "0",
        lastResetAt: now
      },
      reservations: record.reservations.map((reservation) => ({
        ...reservation
      }))
    };

    const saved = await this.repository.save(nextRecord);

    return {
      record: saved,
      didReset: true
    };
  }

  private async syncAllowance(
    record: StoredAgentBudgetRecord
  ): Promise<{ record: StoredAgentBudgetRecord; didRefill: boolean }> {
    const now = this.now();
    const budget = normalizeBudgetAllowanceFields(record.budget, now);
    let nextBudget = budget;
    let didRefill = false;

    if (budget.clawbackOnSessionEnd && isSessionExpired(budget, now)) {
      if (budget.liveAllowance !== "0") {
        nextBudget = {
          ...budget,
          liveAllowance: "0"
        };
        didRefill = true;
      }
    } else if (budget.allowanceMode === "rolling") {
      const elapsedMs = now.getTime() - Date.parse(budget.lastRefillAt);
      const intervalMs = budget.refillIntervalMinutes * 60 * 1000;
      const intervals = elapsedMs > 0 ? Math.floor(elapsedMs / intervalMs) : 0;

      if (intervals > 0) {
        const refill = BigInt(budget.refillAmount) * BigInt(intervals);
        const liveAllowance = BigInt(budget.liveAllowance);
        const maxLiveAllowance = BigInt(budget.maxLiveAllowance);
        const nextLiveAllowance = minBigInt(maxLiveAllowance, liveAllowance + refill);
        const nextLastRefillAt = new Date(Date.parse(budget.lastRefillAt) + intervals * intervalMs).toISOString();

        nextBudget = {
          ...budget,
          liveAllowance: nextLiveAllowance.toString(),
          lastRefillAt: nextLastRefillAt
        };
        didRefill = true;
      }
    }

    if (!didRefill && JSON.stringify(nextBudget) === JSON.stringify(record.budget)) {
      return {
        record,
        didRefill: false
      };
    }

    const saved = await this.repository.save({
      ...record,
      budget: nextBudget
    });

    return {
      record: saved,
      didRefill
    };
  }

  private evaluateSpend(record: StoredAgentBudgetRecord, amount: bigint): AgentBudgetSpendDecision {
    const reservedAmount = sumReservations(record);
    const currentBalance = BigInt(record.budget.currentBalance);
    const dailyCap = calculateDailyCap(record.budget);
    const availableBalance = maxBigInt(0n, currentBalance - reservedAmount);
    const usedToday = BigInt(record.budget.spentToday) + reservedAmount;
    const remainingDailyCap = maxBigInt(0n, dailyCap - usedToday);
    const liveAllowance = BigInt(record.budget.liveAllowance);
    const ghostAllowanceAfter =
      record.budget.allowanceMode === "rolling" && amount <= liveAllowance ? liveAllowance - amount : liveAllowance;

    let reason: string | null = null;

    if (record.budget.clawbackOnSessionEnd && isSessionExpired(record.budget, this.now())) {
      reason = "Agent session has ended; live Ghost Allowance was clawed back.";
    } else if (record.budget.status === "paused") {
      reason = "Agent budget is paused.";
    } else if (record.budget.status === "exhausted" || currentBalance === 0n) {
      reason = "Agent budget is exhausted.";
    } else if (amount > availableBalance) {
      reason = "Requested spend exceeds available balance.";
    } else if (amount > remainingDailyCap) {
      reason = "Requested spend exceeds the remaining daily cap.";
    } else if (record.budget.allowanceMode === "rolling" && amount > liveAllowance) {
      reason = "Requested spend exceeds live Ghost Allowance.";
    }

    return {
      allowed: reason === null,
      reason,
      requestedAmount: amount.toString(),
      availableBalance: availableBalance.toString(),
      dailyCap: dailyCap.toString(),
      remainingDailyCap: remainingDailyCap.toString(),
      reservedAmount: reservedAmount.toString(),
      allowanceMode: record.budget.allowanceMode,
      ghostAllowanceBefore: liveAllowance.toString(),
      ghostAllowanceAfter: ghostAllowanceAfter.toString(),
      budget: cloneBudget(record.budget)
    };
  }
}
