import type {
  AgentBudget,
  AgentBudgetAmountInput,
  AgentBudgetConfirmationReceipt,
  AgentBudgetReleaseReceipt,
  AgentBudgetReservationReceipt,
  AgentBudgetReservationTransitionReceipt,
  AgentBudgetSpendDecision,
  CreateAgentBudgetInput,
  ReserveSpendReference
} from "../agent-budget";
import type { AgentBudgetPolicyAdapter } from "../agent-budget/policy-adapter";
import type { GhostTabService } from "./service";
import type { GhostTabSession } from "./types";

interface GhostTabPolicyAdapterOptions {
  basePolicy: AgentBudgetPolicyAdapter;
  ghostTabService: GhostTabService;
}

const toAmountString = (value: AgentBudgetAmountInput): string => (typeof value === "bigint" ? value.toString() : value);

const minBigInt = (left: bigint, right: bigint): bigint => (left < right ? left : right);

const calculateDailyCap = (budget: AgentBudget): string => {
  const currentBalance = BigInt(budget.currentBalance);
  const totalBudget = BigInt(budget.totalBudget);
  const capBase = minBigInt(currentBalance, totalBudget);
  return ((capBase * BigInt(budget.dailyCapPercent)) / 100n).toString();
};

const overlayBudget = (budget: AgentBudget, session: GhostTabSession): AgentBudget => ({
  ...budget,
  liveAllowance: session.allowanceLive,
  maxLiveAllowance: session.allowanceMax,
  refillAmount: session.refillAmount,
  refillIntervalMinutes: session.refillIntervalMinutes,
  lastRefillAt: session.lastRefillAt,
  sessionEndsAt: session.expiresAt,
  clawbackOnSessionEnd: session.clawbackEnabled
});

const buildBlockedDecision = (budget: AgentBudget, amount: string, reason: string, session: GhostTabSession): AgentBudgetSpendDecision => {
  const dailyCap = calculateDailyCap(budget);
  const remainingDailyCap = BigInt(dailyCap) > BigInt(budget.spentToday) ? (BigInt(dailyCap) - BigInt(budget.spentToday)).toString() : "0";

  return {
    allowed: false,
    reason,
    requestedAmount: amount,
    availableBalance: budget.currentBalance,
    dailyCap,
    remainingDailyCap,
    reservedAmount: "0",
    allowanceMode: budget.allowanceMode,
    ghostAllowanceBefore: session.allowanceLive,
    ghostAllowanceAfter: session.allowanceLive,
    budget: overlayBudget(budget, session)
  };
};

export class GhostTabPolicyAdapter implements AgentBudgetPolicyAdapter {
  readonly mode: AgentBudgetPolicyAdapter["mode"];

  private readonly basePolicy: AgentBudgetPolicyAdapter;

  private readonly ghostTabService: GhostTabService;

  constructor(options: GhostTabPolicyAdapterOptions) {
    this.basePolicy = options.basePolicy;
    this.ghostTabService = options.ghostTabService;
    this.mode = options.basePolicy.mode;
  }

  async createBudget(input: CreateAgentBudgetInput): Promise<AgentBudget> {
    const budget = await this.basePolicy.createBudget(input);
    const session = await this.ghostTabService.openFromBudget(budget);
    return overlayBudget(budget, session);
  }

  async getBudget(agentId: string): Promise<AgentBudget | null> {
    const budget = await this.basePolicy.getBudget(agentId);

    if (!budget) {
      return null;
    }

    const session = await this.ghostTabService.ensureSessionForBudget(budget);
    return overlayBudget(budget, session);
  }

  async listBudgets(): Promise<AgentBudget[]> {
    const budgets = await this.basePolicy.listBudgets();
    return Promise.all(
      budgets.map(async (budget) => {
        const session = await this.ghostTabService.ensureSessionForBudget(budget);
        return overlayBudget(budget, session);
      })
    );
  }

  async canSpend(agentId: string, amount: AgentBudgetAmountInput): Promise<AgentBudgetSpendDecision> {
    const amountString = toAmountString(amount);
    const budget = await this.basePolicy.getBudget(agentId);

    if (!budget) {
      throw new Error(`Agent budget not found for agent "${agentId}".`);
    }

    const session = await this.ghostTabService.ensureSessionForBudget(budget);
    const ghostDecision = await this.ghostTabService.evaluateSpend(agentId, amountString);

    if (!ghostDecision.allowed) {
      return buildBlockedDecision(budget, amountString, ghostDecision.reason ?? "Ghost Tab rejected spend.", ghostDecision.session);
    }

    const decision = await this.basePolicy.canSpend(agentId, amount);

    if (!decision.allowed) {
      await this.ghostTabService.evaluateSpend(agentId, amountString, decision.reason ?? "Spend rejected by policy.");
      return {
        ...decision,
        budget: overlayBudget(decision.budget, ghostDecision.session),
        ghostAllowanceBefore: ghostDecision.session.allowanceLive,
        ghostAllowanceAfter: ghostDecision.session.allowanceLive
      };
    }

    return {
      ...decision,
      budget: overlayBudget(decision.budget, ghostDecision.session),
      ghostAllowanceBefore: ghostDecision.session.allowanceLive,
      ghostAllowanceAfter: (BigInt(ghostDecision.session.allowanceLive) - BigInt(amountString)).toString()
    };
  }

  async reserveSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reference?: ReserveSpendReference
  ): Promise<AgentBudgetReservationReceipt> {
    const amountString = toAmountString(amount);
    const decision = await this.canSpend(agentId, amountString);

    if (!decision.allowed) {
      throw new Error(decision.reason ?? "Ghost Tab rejected spend.");
    }

    const receipt = await this.basePolicy.reserveSpend(agentId, amount, reference);
    const session = await this.ghostTabService.recordSpendApproved(
      agentId,
      amountString,
      typeof reference === "string" ? reference : reference?.reason
    );

    return {
      ...receipt,
      allowanceMode: receipt.allowanceMode,
      ghostAllowanceBefore: decision.ghostAllowanceBefore,
      ghostAllowanceAfter: session.allowanceLive,
      budget: overlayBudget(receipt.budget, session)
    };
  }

  confirmSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetConfirmationReceipt> {
    return this.basePolicy.confirmSpend(agentId, amount, paymentId);
  }

  releaseReservedSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReleaseReceipt> {
    return this.basePolicy.releaseReservedSpend(agentId, amount, reason);
  }

  async resetDailyIfNeeded(agentId: string): Promise<AgentBudget> {
    const budget = await this.basePolicy.resetDailyIfNeeded(agentId);
    const session = await this.ghostTabService.ensureSessionForBudget(budget);
    return overlayBudget(budget, session);
  }

  pauseBudget(agentId: string): Promise<AgentBudget> {
    return this.basePolicy.pauseBudget(agentId);
  }

  resumeBudget(agentId: string): Promise<AgentBudget> {
    return this.basePolicy.resumeBudget(agentId);
  }

  confirmReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetReservationTransitionReceipt> {
    return this.basePolicy.confirmReservedSpendByPaylink(agentId, paylinkId, amount, paymentId);
  }

  releaseReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReservationTransitionReceipt> {
    return this.basePolicy.releaseReservedSpendByPaylink(agentId, paylinkId, amount, reason);
  }
}
