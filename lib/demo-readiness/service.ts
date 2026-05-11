import {
  DEFAULT_DEMO_AGENT_ID,
  DEFAULT_DEMO_AGENT_MINT,
  DEFAULT_DEMO_AGENT_RECIPIENT,
  type AgentBudget,
  type AgentBudgetService
} from "../agent-budget";
import type { AgentRegistryService, RegisteredAgent } from "../agent-registry";
import type { GhostTabService } from "../ghost-tab/service";
import { listPendingAgentSpendExecutions } from "../agent-spend/pending-execution";
import type { ServerPaymentIntent, ServerPaymentIntentMetadata, WhisperPayServerService } from "../whisperpay-server";
import type { DemoReadinessClearResult, DemoReadinessResetResult, DemoReadinessStatus } from "./types";

interface DemoReadinessServiceOptions {
  budgetService: AgentBudgetService;
  registryService: AgentRegistryService;
  ghostTabService: GhostTabService;
  paylinkService: WhisperPayServerService;
  now?: () => Date;
}

const DEMO_AGENT_ID = DEFAULT_DEMO_AGENT_ID;
const DEMO_AGENT_NAME = "coffee-agent";
const DEMO_RECIPIENT_LABEL = "demo-merchant";
const DEMO_RECIPIENT_DISPLAY_LABEL = "Demo Merchant";
const DEMO_TOTAL_BUDGET = "300";
const DEMO_DAILY_CAP_PERCENT = 30;
const DEMO_GHOST_ALLOWANCE = "20";
const DEMO_REFILL_AMOUNT = "5";
const DEMO_REFILL_INTERVAL_MINUTES = 10;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isDemoAgentPayment = (
  paymentIntent: ServerPaymentIntent,
  controllerWallet: string,
  agentId: string
): boolean => {
  const agentPlan = paymentIntent.metadata?.agentPlan;
  return Boolean(
    agentPlan?.agentId === agentId &&
      (agentPlan.controllerWallet === controllerWallet || paymentIntent.metadata?.telegram?.controllerWallet === controllerWallet)
  );
};

const paymentSignature = (paymentIntent: ServerPaymentIntent): string | null =>
  paymentIntent.txSignature ?? paymentIntent.metadata?.manualExecution?.txSignature ?? null;

const paymentConfirmedAt = (paymentIntent: ServerPaymentIntent): string =>
  paymentIntent.metadata?.manualExecution?.confirmedAt ?? paymentIntent.createdAt;

const buildDemoMetadata = (
  paymentIntent: ServerPaymentIntent,
  now: string
): ServerPaymentIntentMetadata => {
  const metadata: ServerPaymentIntentMetadata = clone(
    paymentIntent.metadata ?? {
      mint: paymentIntent.mint,
      amount: paymentIntent.amount,
      recipient: paymentIntent.recipient,
      privacyMode: "private",
      allowPublicFallback: false
    }
  );

  return {
    ...metadata,
    agentLifecycle: {
      ...(metadata.agentLifecycle ?? {}),
      budgetReservationState: "released",
      lastProcessedStatus: paymentIntent.status,
      reservationPaylinkId: paymentIntent.paylinkId,
      releasedReason: "demo_archived"
    },
    demoArchived: {
      at: now,
      reason: "demo_archived"
    },
    timeline: [
      ...(metadata.timeline ?? []),
      {
        type: "budget_reservation_released",
        at: now,
        status: "demo_archived"
      }
    ]
  };
};

export class DemoReadinessService {
  private readonly budgetService: AgentBudgetService;

  private readonly registryService: AgentRegistryService;

  private readonly ghostTabService: GhostTabService;

  private readonly paylinkService: WhisperPayServerService;

  private readonly now: () => Date;

  constructor(options: DemoReadinessServiceOptions) {
    this.budgetService = options.budgetService;
    this.registryService = options.registryService;
    this.ghostTabService = options.ghostTabService;
    this.paylinkService = options.paylinkService;
    this.now = options.now ?? (() => new Date());
  }

  async reset(controllerWallet: string): Promise<DemoReadinessResetResult> {
    const budget = await this.ensureDemoBudget(controllerWallet);
    const activeAgent = await this.ensureActiveAgent(controllerWallet, budget);
    const recipient = await this.ensureDemoRecipient(controllerWallet, activeAgent);
    const ghostSession = await this.ghostTabService.openFromBudget({
      ...budget,
      liveAllowance: DEMO_GHOST_ALLOWANCE,
      maxLiveAllowance: DEMO_GHOST_ALLOWANCE,
      refillAmount: DEMO_REFILL_AMOUNT,
      refillIntervalMinutes: DEMO_REFILL_INTERVAL_MINUTES
    });
    const ghostSnapshot = await this.ghostTabService.getSnapshot(budget.agentId);
    const archivedPendingCount = await this.archiveStalePendingExecutions(controllerWallet, budget.agentId);
    const pendingCount = await this.countPendingExecutions(controllerWallet, budget.agentId);

    return {
      controllerWallet,
      activeAgent,
      budget,
      ghostTab: {
        ...ghostSnapshot,
        session: ghostSession
      },
      recipient,
      archivedPendingCount,
      pendingCount,
      lastConfirmedTx: await this.findLastConfirmedTx(controllerWallet, budget.agentId)
    };
  }

  async clear(controllerWallet: string): Promise<DemoReadinessClearResult> {
    await this.budgetService.clearBudgetsForOwner(controllerWallet);
    await this.registryService.clearControllerState(controllerWallet);

    return {
      controllerWallet,
      cleared: true
    };
  }

  async status(controllerWallet: string): Promise<DemoReadinessStatus> {
    const budgets = await this.budgetService.listAgentBudgets();
    const ownedBudgets = budgets.filter((budget) => budget.owner === controllerWallet);
    const activeAgent = await this.registryService.getActiveAgent(controllerWallet, ownedBudgets);
    const activeBudget = activeAgent ? ownedBudgets.find((budget) => budget.agentId === activeAgent.id) ?? null : null;
    const snapshot = activeAgent ? await this.ghostTabService.getSnapshot(activeAgent.id) : null;
    const pendingCount = activeAgent ? await this.countPendingExecutions(controllerWallet, activeAgent.id) : 0;
    const lastConfirmed = activeAgent ? await this.findLastConfirmedPayment(controllerWallet, activeAgent.id) : null;

    return {
      controllerWallet,
      activeAgentName: activeAgent?.name ?? null,
      activeAgentId: activeAgent?.id ?? null,
      ghostAllowanceLive: snapshot?.session?.allowanceLive ?? activeBudget?.liveAllowance ?? null,
      ghostAllowanceMax: snapshot?.session?.allowanceMax ?? activeBudget?.maxLiveAllowance ?? null,
      recipientLabel: activeAgent?.defaultRecipientLabel ?? null,
      recipientDisplayLabel: activeAgent?.defaultRecipientLabel === DEMO_RECIPIENT_LABEL ? DEMO_RECIPIENT_DISPLAY_LABEL : activeAgent?.defaultRecipientLabel ?? null,
      recipientAddress: activeAgent?.defaultRecipientAddress ?? null,
      pendingCount,
      lastConfirmedTx: lastConfirmed ? paymentSignature(lastConfirmed) : null,
      lastConfirmedPaylinkId: lastConfirmed?.paylinkId ?? null
    };
  }

  private async ensureDemoBudget(controllerWallet: string): Promise<AgentBudget> {
    const existing = await this.budgetService.getAgentBudget(DEMO_AGENT_ID);

    if (!existing) {
      await this.budgetService.createAgentBudget({
        agentId: DEMO_AGENT_ID,
        owner: controllerWallet,
        agentWallet: `agent:${DEMO_AGENT_ID}`,
        mint: DEFAULT_DEMO_AGENT_MINT,
        totalBudget: DEMO_TOTAL_BUDGET,
        currentBalance: DEMO_TOTAL_BUDGET,
        dailyCapPercent: DEMO_DAILY_CAP_PERCENT,
        spentToday: "0",
        status: "active",
        rail: "magicblock-private",
        allowPublicFallback: false,
        allowanceMode: "rolling",
        liveAllowance: DEMO_GHOST_ALLOWANCE,
        maxLiveAllowance: DEMO_GHOST_ALLOWANCE,
        refillAmount: DEMO_REFILL_AMOUNT,
        refillIntervalMinutes: DEMO_REFILL_INTERVAL_MINUTES,
        lastRefillAt: this.now().toISOString(),
        sessionEndsAt: null,
        clawbackOnSessionEnd: true,
        metadata: {
          demo: true,
          category: "coffee",
          description: "Hackathon demo agent budget"
        }
      });
    }

    return this.budgetService.resetAgentBudgetForDemo({
      agentId: DEMO_AGENT_ID,
      owner: controllerWallet,
      agentWallet: `agent:${DEMO_AGENT_ID}`,
      mint: DEFAULT_DEMO_AGENT_MINT,
      totalBudget: DEMO_TOTAL_BUDGET,
      currentBalance: DEMO_TOTAL_BUDGET,
      dailyCapPercent: DEMO_DAILY_CAP_PERCENT,
      spentToday: "0",
      liveAllowance: DEMO_GHOST_ALLOWANCE,
      maxLiveAllowance: DEMO_GHOST_ALLOWANCE,
      refillAmount: DEMO_REFILL_AMOUNT,
      refillIntervalMinutes: DEMO_REFILL_INTERVAL_MINUTES,
      rail: "magicblock-private",
      allowPublicFallback: false
    });
  }

  private async ensureActiveAgent(controllerWallet: string, budget: AgentBudget): Promise<RegisteredAgent> {
    const agent = await this.registryService.upsertFromBudget(budget, DEMO_AGENT_NAME, "mirage-private-first");
    await this.registryService.setActiveAgent(controllerWallet, agent.id);
    return agent;
  }

  private async ensureDemoRecipient(
    controllerWallet: string,
    activeAgent: RegisteredAgent
  ): Promise<DemoReadinessResetResult["recipient"]> {
    const recipient = await this.registryService.addRecipient(
      controllerWallet,
      DEMO_RECIPIENT_LABEL,
      DEFAULT_DEMO_AGENT_RECIPIENT,
      activeAgent.id
    );
    await this.registryService.setDefaultRecipient(controllerWallet, activeAgent.id, recipient.label);

    return {
      label: recipient.label,
      displayLabel: DEMO_RECIPIENT_DISPLAY_LABEL,
      address: recipient.address
    };
  }

  private async archiveStalePendingExecutions(controllerWallet: string, agentId: string): Promise<number> {
    const now = this.now().toISOString();
    const paymentIntents = await this.paylinkService.listPaymentIntents();
    let archivedCount = 0;

    for (const paymentIntent of paymentIntents) {
      if (!isDemoAgentPayment(paymentIntent, controllerWallet, agentId)) {
        continue;
      }

      if (paymentSignature(paymentIntent) || (paymentIntent.status !== "pending" && paymentIntent.status !== "failed")) {
        continue;
      }

      await this.paylinkService.overwritePaymentIntentMetadata(paymentIntent.id, buildDemoMetadata(paymentIntent, now));
      archivedCount += 1;
    }

    return archivedCount;
  }

  private async countPendingExecutions(controllerWallet: string, agentId: string): Promise<number> {
    const executions = await listPendingAgentSpendExecutions({
      paylinkService: this.paylinkService
    });

    return executions.filter((execution) => execution.controllerWallet === controllerWallet && execution.agentId === agentId).length;
  }

  private async findLastConfirmedTx(controllerWallet: string, agentId: string): Promise<string | null> {
    const paymentIntent = await this.findLastConfirmedPayment(controllerWallet, agentId);
    return paymentIntent ? paymentSignature(paymentIntent) : null;
  }

  private async findLastConfirmedPayment(controllerWallet: string, agentId: string): Promise<ServerPaymentIntent | null> {
    const paymentIntents = await this.paylinkService.listPaymentIntents();
    return (
      paymentIntents
        .filter((paymentIntent) => isDemoAgentPayment(paymentIntent, controllerWallet, agentId))
        .filter((paymentIntent) => Boolean(paymentSignature(paymentIntent)))
        .sort((left, right) => Date.parse(paymentConfirmedAt(right)) - Date.parse(paymentConfirmedAt(left)))[0] ?? null
    );
  }
}
