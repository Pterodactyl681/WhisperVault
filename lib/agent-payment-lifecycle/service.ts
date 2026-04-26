import type { WhisperPayServerService } from "@/lib/whisperpay-server";
import { asAgentBudgetPolicyAdapter, type AgentBudgetPolicyAdapter, type AgentBudgetService } from "../agent-budget";
import type {
  ServerPaymentIntent,
  ServerPaymentIntentMetadata,
  ServerPaymentIntentStatusChange,
  ServerPaymentLifecycleEvent
} from "@/lib/whisperpay-server/types";
import { isAgentSpendMagicPrivatePaymentIntent } from "../whisperpay-server/agent-spend-private-rail";

type AgentLifecycleTransitionOutcome =
  | "non_agent"
  | "noop"
  | "confirmed"
  | "released"
  | "already_confirmed"
  | "already_released"
  | "missing_reservation";

interface AgentPaymentLifecycleServiceOptions {
  budgetService: AgentBudgetService | AgentBudgetPolicyAdapter;
  paylinkService: WhisperPayServerService;
  now?: () => Date;
}

interface HandleStatusChangeInput {
  paymentIntent: ServerPaymentIntent;
  previousStatus: string;
  nextStatus: ServerPaymentIntentStatusChange;
}

const SUCCESS_STATUSES = new Set<ServerPaymentIntentStatusChange>(["sent", "confirmed", "succeeded"]);
const RELEASE_STATUSES = new Set<ServerPaymentIntentStatusChange>(["failed", "expired", "cancelled"]);

const isAgentPayment = (paymentIntent: ServerPaymentIntent): boolean =>
  Boolean(paymentIntent.metadata?.agentPlan?.agentId) ||
  paymentIntent.settlementRail === "magicblock-private-spl";

const normalizeTimeline = (metadata: ServerPaymentIntentMetadata | undefined): ServerPaymentLifecycleEvent[] =>
  metadata?.timeline ? metadata.timeline.map((event) => ({ ...event })) : [];

const cloneMetadata = (metadata: ServerPaymentIntentMetadata | undefined): ServerPaymentIntentMetadata | undefined =>
  metadata ? (JSON.parse(JSON.stringify(metadata)) as ServerPaymentIntentMetadata) : undefined;

export class AgentPaymentLifecycleService {
  private readonly budgetService: AgentBudgetPolicyAdapter;

  private readonly paylinkService: WhisperPayServerService;

  private readonly now: () => Date;

  constructor(options: AgentPaymentLifecycleServiceOptions) {
    this.budgetService = asAgentBudgetPolicyAdapter(options.budgetService);
    this.paylinkService = options.paylinkService;
    this.now = options.now ?? (() => new Date());
  }

  async recordBudgetReserved(paymentIntentId: string): Promise<ServerPaymentIntent> {
    const paymentIntent = await this.paylinkService.getPaymentIntent(paymentIntentId);

    if (!paymentIntent || !isAgentPayment(paymentIntent)) {
      return paymentIntent as ServerPaymentIntent;
    }

    const metadata = cloneMetadata(paymentIntent.metadata) ?? {
      mint: paymentIntent.mint,
      amount: paymentIntent.amount,
      recipient: paymentIntent.recipient,
      privacyMode: "private",
      allowPublicFallback: false
    };

    metadata.agentLifecycle = {
      ...(metadata.agentLifecycle ?? {}),
      budgetReservationState: "reserved",
      lastProcessedStatus: paymentIntent.status,
      lastBudgetError: null
    };
    metadata.timeline = this.appendTimeline(metadata.timeline, "budget_reserved");

    return this.paylinkService.overwritePaymentIntentMetadata(paymentIntent.id, metadata);
  }

  async handleStatusChange(input: HandleStatusChangeInput): Promise<{ paymentIntent: ServerPaymentIntent; outcome: AgentLifecycleTransitionOutcome }> {
    const { paymentIntent, previousStatus, nextStatus } = input;

    if (!isAgentPayment(paymentIntent)) {
      return {
        paymentIntent,
        outcome: "non_agent"
      };
    }

    const agentPlan = paymentIntent.metadata?.agentPlan;

    if (!agentPlan) {
      return {
        paymentIntent,
        outcome: "non_agent"
      };
    }

    const metadata = cloneMetadata(paymentIntent.metadata) ?? {
      mint: paymentIntent.mint,
      amount: paymentIntent.amount,
      recipient: paymentIntent.recipient,
      privacyMode: "private",
      allowPublicFallback: false,
      agentPlan
    };
    metadata.agentLifecycle = {
      budgetReservationState: metadata.agentLifecycle?.budgetReservationState ?? "reserved",
      lastProcessedStatus: metadata.agentLifecycle?.lastProcessedStatus ?? previousStatus,
      reservationPaylinkId: metadata.agentLifecycle?.reservationPaylinkId ?? paymentIntent.paylinkId,
      confirmedPaymentId: metadata.agentLifecycle?.confirmedPaymentId ?? null,
      releasedReason: metadata.agentLifecycle?.releasedReason ?? null,
      lastBudgetError: metadata.agentLifecycle?.lastBudgetError ?? null
    };
    metadata.timeline = normalizeTimeline(metadata);

    if (metadata.agentLifecycle.lastProcessedStatus === nextStatus) {
      return {
        paymentIntent,
        outcome: "noop"
      };
    }

    let outcome: AgentLifecycleTransitionOutcome = "noop";

    if (SUCCESS_STATUSES.has(nextStatus)) {
      if (isAgentSpendMagicPrivatePaymentIntent(paymentIntent)) {
        metadata.timeline = this.appendTimeline(metadata.timeline, "private_transfer_sent", nextStatus);
      }
      metadata.timeline = this.appendTimeline(metadata.timeline, "payment_confirmed", nextStatus);

      const receipt = await this.budgetService.confirmReservedSpendByPaylink(
        agentPlan.agentId,
        paymentIntent.paylinkId,
        paymentIntent.amount,
        paymentIntent.id
      );

      outcome = receipt.outcome;
      metadata.agentLifecycle.budgetReservationState =
        receipt.outcome === "confirmed" || receipt.outcome === "already_confirmed"
          ? "confirmed"
          : receipt.outcome === "already_released"
            ? "released"
            : metadata.agentLifecycle.budgetReservationState;
      metadata.agentLifecycle.confirmedPaymentId =
        receipt.outcome === "confirmed" || receipt.outcome === "already_confirmed" ? paymentIntent.id : metadata.agentLifecycle.confirmedPaymentId;
      metadata.agentLifecycle.lastBudgetError =
        receipt.outcome === "missing_reservation" ? "No matching reserved spend found for this agent payment." : null;

      if (receipt.outcome === "confirmed") {
        metadata.timeline = this.appendTimeline(metadata.timeline, "budget_spend_confirmed");
      }
    } else if (RELEASE_STATUSES.has(nextStatus)) {
      if (isAgentSpendMagicPrivatePaymentIntent(paymentIntent)) {
        metadata.timeline = this.appendTimeline(metadata.timeline, "private_transfer_failed", nextStatus);
      }
      metadata.timeline = this.appendTimeline(metadata.timeline, "payment_failed", nextStatus);

      const receipt = await this.budgetService.releaseReservedSpendByPaylink(
        agentPlan.agentId,
        paymentIntent.paylinkId,
        paymentIntent.amount,
        nextStatus
      );

      outcome = receipt.outcome;
      if (receipt.outcome === "released" || receipt.outcome === "already_released") {
        metadata.agentLifecycle.budgetReservationState = "released";
        metadata.agentLifecycle.releasedReason = receipt.reason ?? nextStatus;
        metadata.agentLifecycle.lastBudgetError = null;
      } else if (receipt.outcome === "missing_reservation") {
        metadata.agentLifecycle.lastBudgetError = "No matching reserved spend found for this agent payment.";
      }

      if (receipt.outcome === "released") {
        metadata.timeline = this.appendTimeline(metadata.timeline, "budget_reservation_released", nextStatus);
      }
    }

    metadata.agentLifecycle.lastProcessedStatus = nextStatus;

    const updatedPaymentIntent = await this.paylinkService.overwritePaymentIntentMetadata(paymentIntent.id, metadata);

    return {
      paymentIntent: updatedPaymentIntent,
      outcome
    };
  }

  private appendTimeline(
    timeline: ServerPaymentLifecycleEvent[] | undefined,
    type: ServerPaymentLifecycleEvent["type"],
    status?: string
  ): ServerPaymentLifecycleEvent[] {
    return [
      ...(timeline ?? []),
      {
        type,
        at: this.now().toISOString(),
        ...(status ? { status } : {})
      }
    ];
  }
}
