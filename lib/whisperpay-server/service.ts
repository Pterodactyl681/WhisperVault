import type { PaymentSettlementRail, TokenSymbol } from "@/types/whisperpay";
import type { AgentPaymentLifecycleService } from "@/lib/agent-payment-lifecycle";
import {
  InMemoryWhisperPayServerRepository,
  type WhisperPayServerRepository
} from "./repository";
import type {
  AgentPlanMetadata,
  ServerPaymentIntent,
  ServerPaymentIntentMetadata,
  ServerPaymentIntentStatusChange,
  ServerPaylink,
  ServerPaylinkMetadata,
  ServerTelegramSpendMetadata
} from "./types";
import {
  checkAgentSpendMemoRevealAccess,
  getAgentSpendPrivateRailContext,
  isAgentSpendMagicPrivatePaymentIntent,
  type AgentSpendPrivateRailContext
} from "./agent-spend-private-rail";

interface WhisperPayServerServiceOptions {
  repository?: WhisperPayServerRepository;
  now?: () => Date;
  createId?: (prefix: string) => string;
  agentPaymentLifecycle?: AgentPaymentLifecycleService;
}

interface CreatePaylinkInput {
  ownerWallet: string;
  nickname: string;
  defaultToken: TokenSymbol;
  metadata?: ServerPaylinkMetadata;
}

interface CreatePaymentIntentInput {
  paylinkId: string;
  fromWallet: string;
  toWallet: string;
  amount: string;
  mint: string;
  recipient: string;
  settlementRail: PaymentSettlementRail;
  tokenSymbol: TokenSymbol;
  metadata?: ServerPaymentIntentMetadata;
  magicPrivate?: ServerPaymentIntent["magicPrivate"];
}

interface CreateAgentPlanArtifactsInput {
  agentId: string;
  controllerWallet?: string;
  requestedGoal: string;
  category?: string;
  amount: string;
  mint: string;
  recipient: string;
  rail: AgentPlanMetadata["rail"];
  allowPublicFallback: boolean;
  budgetPolicySnapshot: AgentPlanMetadata["budgetPolicySnapshot"];
  fromWallet: string;
  telegram?: ServerTelegramSpendMetadata;
}

interface ConfirmManualAgentSpendInput {
  paylinkId: string;
  txSignature: string;
  executor: string;
  executionRail?: string;
  mirageAttempted?: boolean;
  mirageError?: string | null;
  magicblockRailAttempted?: boolean;
  magicblockRailMode?: string;
  magicblockRailStatus?: string;
  magicblockRailError?: string | null;
  magicblockRailRawResponse?: unknown;
  fallbackUsed?: boolean;
}

const assertNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const normalizeTokenSymbol = (mint: string): TokenSymbol => {
  const normalized = mint.trim().toUpperCase();

  if (normalized === "SOL" || normalized === "SO11111111111111111111111111111111111111112") {
    return "SOL";
  }

  return "USDC";
};

const normalizeNickname = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return normalized || "private-lane";
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const defaultCreateId = (prefix: string): string => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;

const appendTimeline = (
  metadata: ServerPaymentIntentMetadata,
  type: NonNullable<ServerPaymentIntentMetadata["timeline"]>[number]["type"],
  at: string,
  status?: string
): ServerPaymentIntentMetadata["timeline"] => [
  ...(metadata.timeline ?? []),
  {
    type,
    at,
    ...(status ? { status } : {})
  }
];

export class WhisperPayServerService {
  private readonly repository: WhisperPayServerRepository;

  private readonly now: () => Date;

  private readonly createId: (prefix: string) => string;

  private agentPaymentLifecycle?: AgentPaymentLifecycleService;

  constructor(options: WhisperPayServerServiceOptions = {}) {
    this.repository = options.repository ?? new InMemoryWhisperPayServerRepository();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? defaultCreateId;
    this.agentPaymentLifecycle = options.agentPaymentLifecycle;
  }

  attachAgentPaymentLifecycle(agentPaymentLifecycle: AgentPaymentLifecycleService): void {
    this.agentPaymentLifecycle = agentPaymentLifecycle;
  }

  async createPaylink(input: CreatePaylinkInput): Promise<ServerPaylink> {
    const paylink: ServerPaylink = {
      id: this.createId("pl"),
      ownerWallet: assertNonEmptyString(input.ownerWallet, "ownerWallet"),
      nickname: normalizeNickname(input.nickname),
      defaultToken: input.defaultToken,
      createdAt: this.now().toISOString(),
      isActive: true,
      metadata: input.metadata ? clone(input.metadata) : undefined
    };

    return this.repository.createPaylink(paylink);
  }

  async createPaymentIntent(input: CreatePaymentIntentInput): Promise<ServerPaymentIntent> {
    const paymentIntent: ServerPaymentIntent = {
      id: this.createId("pub"),
      paylinkId: assertNonEmptyString(input.paylinkId, "paylinkId"),
      fromWallet: assertNonEmptyString(input.fromWallet, "fromWallet"),
      toWallet: assertNonEmptyString(input.toWallet, "toWallet"),
      settlementRail: input.settlementRail,
      tokenSymbol: input.tokenSymbol,
      status: "pending",
      createdAt: this.now().toISOString(),
      txSignature: null,
      erLifecycle: null,
      magicPrivate: input.magicPrivate ?? null,
      amount: assertNonEmptyString(input.amount, "amount"),
      mint: assertNonEmptyString(input.mint, "mint"),
      recipient: assertNonEmptyString(input.recipient, "recipient"),
      metadata: input.metadata ? clone(input.metadata) : undefined
    };

    return this.repository.createPaymentIntent(paymentIntent);
  }

  async createAgentPlanArtifacts(input: CreateAgentPlanArtifactsInput): Promise<{ paylink: ServerPaylink; paymentIntent: ServerPaymentIntent }> {
    const recipient = assertNonEmptyString(input.recipient, "recipient");
    const paylink = await this.createPaylink({
      ownerWallet: recipient,
      nickname: `${input.agentId} ${input.category ?? "private"} pay`,
      defaultToken: normalizeTokenSymbol(input.mint),
      metadata: {
        mint: input.mint,
        amount: input.amount,
        recipient,
        privacyMode: "private",
        allowPublicFallback: input.allowPublicFallback
      }
    });

    const agentPlanMetadata: AgentPlanMetadata = {
      agentId: input.agentId,
      ...(input.controllerWallet ? { controllerWallet: input.controllerWallet } : {}),
      requestedGoal: input.requestedGoal,
      rail: input.rail,
      privacyMode: "private",
      allowPublicFallback: input.allowPublicFallback,
      budgetPolicySnapshot: clone(input.budgetPolicySnapshot),
      memo: `whisperpay:agent:${input.agentId}:paylink:${paylink.id}`,
      privateRail:
        input.rail === "magicblock-private"
          ? {
              settlementRail: "magicblock-private-spl",
              magicPrivateEnabled: true,
              memoSource: "agent-spend",
              reveal: {
                source: "magicblock-private-memo",
                authorization: "magicblock-permission-membership"
              },
              budgetVaultPermissionHook: "not-connected"
            }
          : undefined,
      receipt: {
        type: "agent-private-receipt",
        memoReveal: "permissioned",
        mode: "manual",
        ...(input.budgetPolicySnapshot.allowanceMode
          ? {
              allowanceMode: input.budgetPolicySnapshot.allowanceMode,
              ghostAllowanceBefore: input.budgetPolicySnapshot.ghostAllowanceBefore,
              ghostAllowanceAfter: input.budgetPolicySnapshot.ghostAllowanceAfter
            }
          : {})
      },
      ...(input.telegram ? { source: "telegram" as const, telegram: clone(input.telegram) } : {}),
      ...(input.category ? { category: input.category } : {})
    };

    const paylinkWithMetadata: ServerPaylink = {
      ...paylink,
      metadata: {
        ...(paylink.metadata ?? {
          mint: input.mint,
          amount: input.amount,
          recipient,
          privacyMode: "private" as const,
          allowPublicFallback: input.allowPublicFallback
        }),
        agentPlan: agentPlanMetadata,
        ...(input.telegram ? { telegram: clone(input.telegram) } : {})
      }
    };
    const savedPaylink = await this.repository.updatePaylink(paylinkWithMetadata);

    const settlementRail: PaymentSettlementRail =
      input.rail === "magicblock-private" ? "magicblock-private-spl" : "sol-public";
    const paymentIntent = await this.createPaymentIntent({
      paylinkId: savedPaylink.id,
      fromWallet: input.fromWallet,
      toWallet: recipient,
      amount: input.amount,
      mint: input.mint,
      recipient,
      settlementRail,
      tokenSymbol: normalizeTokenSymbol(input.mint),
      metadata: {
        mint: input.mint,
        amount: input.amount,
        recipient,
        privacyMode: "private",
        allowPublicFallback: input.allowPublicFallback,
        agentPlan: agentPlanMetadata,
        memo: agentPlanMetadata.memo,
        ...(input.telegram ? { telegram: clone(input.telegram) } : {})
      },
      magicPrivate:
        input.rail === "magicblock-private"
          ? {
              enabled: true,
              visibility: "private",
              mint: input.mint,
              sendTarget: null,
              txBuilderSource: null
            }
          : null
    });

    return {
      paylink: savedPaylink,
      paymentIntent
    };
  }

  async deactivatePaylink(paylinkId: string, reason: string): Promise<ServerPaylink> {
    const paylink = await this.getPaylink(paylinkId);

    if (!paylink) {
      throw new Error(`Paylink not found for id "${paylinkId}".`);
    }

    const nextPaylink: ServerPaylink = {
      ...paylink,
      isActive: false,
      metadata: paylink.metadata
        ? {
            ...paylink.metadata,
            unusableReason: reason
          }
        : undefined
    };

    return this.repository.updatePaylink(nextPaylink);
  }

  async markPaymentIntentFailed(paymentIntentId: string): Promise<ServerPaymentIntent> {
    return this.updatePaymentIntentStatus(paymentIntentId, "failed");
  }

  async overwritePaymentIntentMetadata(
    paymentIntentId: string,
    metadata: ServerPaymentIntentMetadata
  ): Promise<ServerPaymentIntent> {
    const paymentIntent = await this.getPaymentIntent(paymentIntentId);

    if (!paymentIntent) {
      throw new Error(`Payment intent not found for id "${paymentIntentId}".`);
    }

    return this.repository.updatePaymentIntent({
      ...paymentIntent,
      metadata: clone(metadata)
    });
  }

  async recordAgentBudgetReserved(paymentIntentId: string): Promise<ServerPaymentIntent> {
    if (!this.agentPaymentLifecycle) {
      const paymentIntent = await this.getPaymentIntent(paymentIntentId);

      if (!paymentIntent) {
        throw new Error(`Payment intent not found for id "${paymentIntentId}".`);
      }

      return paymentIntent;
    }

    return this.agentPaymentLifecycle.recordBudgetReserved(paymentIntentId);
  }

  async updatePaymentIntentStatus(
    paymentIntentId: string,
    nextStatus: ServerPaymentIntentStatusChange,
    txSignature?: string | null
  ): Promise<ServerPaymentIntent> {
    const paymentIntent = await this.getPaymentIntent(paymentIntentId);

    if (!paymentIntent) {
      throw new Error(`Payment intent not found for id "${paymentIntentId}".`);
    }

    const previousStatus = paymentIntent.metadata?.agentLifecycle?.lastProcessedStatus ?? paymentIntent.status;
    const persistedStatus = nextStatus === "sent" || nextStatus === "confirmed" || nextStatus === "succeeded" ? "sent" : nextStatus === "pending" ? "pending" : "failed";
    let updatedPaymentIntent = await this.repository.updatePaymentIntent({
      ...paymentIntent,
      status: persistedStatus,
      txSignature: txSignature === undefined ? paymentIntent.txSignature : txSignature?.trim() || null
    });

    if (this.agentPaymentLifecycle) {
      const lifecycleResult = await this.agentPaymentLifecycle.handleStatusChange({
        paymentIntent: updatedPaymentIntent,
        previousStatus,
        nextStatus
      });
      updatedPaymentIntent = lifecycleResult.paymentIntent;
    }

    return updatedPaymentIntent;
  }

  async getPaylink(paylinkId: string): Promise<ServerPaylink | null> {
    return this.repository.getPaylink(paylinkId);
  }

  async listPaylinks(): Promise<ServerPaylink[]> {
    return this.repository.listPaylinks();
  }

  async getPaymentIntent(paymentIntentId: string): Promise<ServerPaymentIntent | null> {
    return this.repository.getPaymentIntent(paymentIntentId);
  }

  async getPaymentIntentByPaylinkId(paylinkId: string): Promise<ServerPaymentIntent | null> {
    const normalizedPaylinkId = assertNonEmptyString(paylinkId, "paylinkId");
    const paymentIntents = await this.listPaymentIntents();
    return paymentIntents.find((paymentIntent) => paymentIntent.paylinkId === normalizedPaylinkId) ?? null;
  }

  async confirmManualAgentSpend(input: ConfirmManualAgentSpendInput): Promise<ServerPaymentIntent> {
    const paylinkId = assertNonEmptyString(input.paylinkId, "paylinkId");
    const txSignature = assertNonEmptyString(input.txSignature, "txSignature");
    const executor = assertNonEmptyString(input.executor, "executor");
    const paylink = await this.getPaylink(paylinkId);

    if (!paylink) {
      throw new Error(`Paylink not found for id "${paylinkId}".`);
    }

    const paymentIntent = await this.getPaymentIntentByPaylinkId(paylinkId);

    if (!paymentIntent || !isAgentSpendMagicPrivatePaymentIntent(paymentIntent)) {
      throw new Error("Paylink does not belong to an Agent Spend private rail intent.");
    }

    const reservationState = paymentIntent.metadata?.agentLifecycle?.budgetReservationState ?? "reserved";

    if (reservationState === "released" || paymentIntent.status === "failed") {
      throw new Error("Rejected or released spends cannot be confirmed.");
    }

    if (reservationState === "confirmed" && paymentIntent.txSignature) {
      return paymentIntent;
    }

    if (paymentIntent.status !== "pending" && reservationState !== "reserved") {
      throw new Error("Spend is not pending or reserved.");
    }

    const now = this.now().toISOString();
    const metadata: ServerPaymentIntentMetadata = clone(paymentIntent.metadata ?? {
      mint: paymentIntent.mint,
      amount: paymentIntent.amount,
      recipient: paymentIntent.recipient,
      privacyMode: "private",
      allowPublicFallback: false
    });

    metadata.manualExecution = {
      executor,
      txSignature,
      confirmedAt: now,
      ...(input.executionRail ? { executionRail: input.executionRail } : {}),
      ...(input.mirageAttempted !== undefined ? { mirageAttempted: input.mirageAttempted } : {}),
      ...(input.mirageError ? { mirageError: input.mirageError } : {}),
      ...(input.magicblockRailAttempted !== undefined
        ? { magicblockRailAttempted: input.magicblockRailAttempted }
        : {}),
      ...(input.magicblockRailMode ? { magicblockRailMode: input.magicblockRailMode } : {}),
      ...(input.magicblockRailStatus ? { magicblockRailStatus: input.magicblockRailStatus } : {}),
      ...(input.magicblockRailError ? { magicblockRailError: input.magicblockRailError } : {}),
      ...(input.magicblockRailRawResponse !== undefined
        ? { magicblockRailRawResponse: clone(input.magicblockRailRawResponse) }
        : {}),
      ...(input.fallbackUsed !== undefined ? { fallbackUsed: input.fallbackUsed } : {})
    };
    metadata.timeline = appendTimeline(metadata, "manual_mirage_execution_confirmed", now, "confirmed");

    await this.overwritePaymentIntentMetadata(paymentIntent.id, metadata);
    return this.updatePaymentIntentStatus(paymentIntent.id, "confirmed", txSignature);
  }

  async getAgentSpendPrivateRailContext(paymentIntentId: string): Promise<AgentSpendPrivateRailContext | null> {
    const paymentIntent = await this.getPaymentIntent(paymentIntentId);
    return paymentIntent ? getAgentSpendPrivateRailContext(paymentIntent) : null;
  }

  async checkAgentSpendMemoRevealAccess(input: {
    paymentIntentId: string;
    walletAddress: string;
    routerRpcUrl: string | null;
    permissionedAccount: string | null;
  }): Promise<Awaited<ReturnType<typeof checkAgentSpendMemoRevealAccess>>> {
    const paymentIntent = await this.getPaymentIntent(input.paymentIntentId);

    if (!paymentIntent) {
      return {
        context: null,
        access: null
      };
    }

    return checkAgentSpendMemoRevealAccess({
      paymentIntent,
      walletAddress: input.walletAddress,
      routerRpcUrl: input.routerRpcUrl,
      permissionedAccount: input.permissionedAccount
    });
  }

  async listPaymentIntents(): Promise<ServerPaymentIntent[]> {
    return this.repository.listPaymentIntents();
  }
}
