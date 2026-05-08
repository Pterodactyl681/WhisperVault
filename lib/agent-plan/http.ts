import type { WhisperPayServerService } from "@/lib/whisperpay-server";
import { asAgentBudgetPolicyAdapter, type AgentBudgetPolicyAdapter, type AgentBudgetService } from "../agent-budget";
import { generateMirageTransferCommand } from "../mirage";
import { isValidSolanaPublicKey } from "../solana-validation";
import { buildApprovedPrivateReceiptPreview, buildRejectedPolicyReceipt } from "./receipt";
import {
  assertOwnerMatches,
  defaultIsAgentVaultEnabled,
  errorResponse,
  handleKnownError,
  json,
  parseJsonObject,
  requireOwner
} from "../agent-vault/http";
import type { ServerTelegramSpendMetadata } from "../whisperpay-server/types";

type AgentPlanRail = "magicblock-private" | "public-solana";

interface AgentPlanRequest {
  agentId: string;
  goal: string;
  amount: string;
  mint: string;
  recipient: string;
  category?: string;
  rail: AgentPlanRail;
  telegram?: Omit<ServerTelegramSpendMetadata, "controllerWallet">;
}

interface AgentPlanHttpHandlers {
  createPlan: (request: Request) => Promise<Response>;
}

interface AgentPlanHttpOptions {
  budgetService: AgentBudgetService | AgentBudgetPolicyAdapter;
  paylinkService: WhisperPayServerService;
  isEnabled?: () => boolean;
  allowTelegramMetadata?: boolean;
}

const parseAmountString = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim()) || value.trim() === "0") {
    throw new Error("amount must be a non-zero integer-safe decimal string.");
  }

  return value.trim();
};

const parseOptionalTelegramSpendMetadata = (
  value: unknown
): Omit<ServerTelegramSpendMetadata, "controllerWallet"> | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("telegram metadata must be a JSON object.");
  }

  const record = value as Record<string, unknown>;
  const source = record.source === "telegram" ? "telegram" : null;
  const telegramUserId = typeof record.telegramUserId === "string" ? record.telegramUserId.trim() : "";
  const telegramChatId = typeof record.telegramChatId === "string" ? record.telegramChatId.trim() : "";
  const originalTelegramCommand =
    typeof record.originalTelegramCommand === "string" ? record.originalTelegramCommand.trim() : "";

  if (!source || !telegramUserId || !telegramChatId) {
    throw new Error("telegram metadata requires source, telegramUserId, and telegramChatId.");
  }

  return {
    source,
    telegramUserId,
    telegramChatId,
    ...(originalTelegramCommand ? { originalTelegramCommand } : {})
  };
};

const parseAgentPlanBody = (body: Record<string, unknown>): AgentPlanRequest => {
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const goal = typeof body.goal === "string" ? body.goal.trim() : "";
  const mint = typeof body.mint === "string" ? body.mint.trim() : "";
  const recipient = typeof body.recipient === "string" ? body.recipient.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : undefined;
  const rail = body.rail === "public-solana" ? "public-solana" : "magicblock-private";

  if (!agentId) {
    throw new Error("agentId is required.");
  }

  if (!goal) {
    throw new Error("goal is required.");
  }

  if (!mint) {
    throw new Error("mint is required.");
  }

  if (!recipient || !isValidSolanaPublicKey(recipient)) {
    throw new Error("Enter a valid recipient wallet address.");
  }

  return {
    agentId,
    goal,
    amount: parseAmountString(body.amount),
    mint,
    recipient,
    ...(category ? { category } : {}),
    rail,
    ...(body.telegram ? { telegram: parseOptionalTelegramSpendMetadata(body.telegram) } : {})
  };
};

const subtractAmounts = (left: string, right: string): string => (BigInt(left) - BigInt(right)).toString();

export const createAgentPlanHttpHandlers = (options: AgentPlanHttpOptions): AgentPlanHttpHandlers => {
  const { paylinkService, isEnabled = defaultIsAgentVaultEnabled, allowTelegramMetadata = false } = options;
  const budgetPolicy = asAgentBudgetPolicyAdapter(options.budgetService);

  return {
    createPlan: async (request) => {
      if (!isEnabled()) {
        return errorResponse(503, "feature_disabled", "Agent Vault API is disabled.");
      }

      const auth = requireOwner(request);

      if (auth instanceof Response) {
        return auth;
      }

      try {
        const input = parseAgentPlanBody(await parseJsonObject(request));

        if (input.telegram && !allowTelegramMetadata) {
          return errorResponse(400, "invalid_request", "telegram metadata is only allowed for Telegram command spends.");
        }

        if (input.rail !== "magicblock-private") {
          return errorResponse(400, "invalid_request", "unsupported rail for MVP agent plan endpoint.");
        }

        const budget = await budgetPolicy.getBudget(input.agentId);

        if (!budget) {
          return errorResponse(404, "not_found", `Agent budget not found for agent "${input.agentId}".`);
        }

        const ownerError = assertOwnerMatches(budget, auth);

        if (ownerError) {
          return ownerError;
        }

        if (budget.mint !== input.mint) {
          return errorResponse(400, "invalid_request", "mint mismatch for this agent budget.");
        }

        const decision = await budgetPolicy.canSpend(input.agentId, input.amount);
        const syncedBudget = decision.budget;

        if (!decision.allowed) {
          const reason = decision.reason ?? "Spend rejected by policy.";
          return json({
            allowed: false,
            reason,
            remainingDailyCap: decision.remainingDailyCap,
            policy: {
              dailyCapPercent: syncedBudget.dailyCapPercent,
              spentToday: syncedBudget.spentToday,
              currentBalance: syncedBudget.currentBalance,
              allowanceMode: decision.allowanceMode,
              ghostAllowanceBefore: decision.ghostAllowanceBefore,
              ghostAllowanceAfter: decision.ghostAllowanceAfter
            },
            receipt: buildRejectedPolicyReceipt({
              agentId: input.agentId,
              goal: input.goal,
              ...(input.category ? { category: input.category } : {}),
              amount: input.amount,
              mint: input.mint,
              reason,
              dailyCapPercent: syncedBudget.dailyCapPercent,
              remainingDailyCap: decision.remainingDailyCap,
              spentToday: syncedBudget.spentToday,
              currentBalance: syncedBudget.currentBalance
            })
          });
        }

        const remainingDailyCapAfter = subtractAmounts(decision.remainingDailyCap, input.amount);
        const artifacts = await paylinkService.createAgentPlanArtifacts({
          agentId: input.agentId,
          requestedGoal: input.goal,
          ...(input.category ? { category: input.category } : {}),
          amount: input.amount,
          mint: input.mint,
          recipient: input.recipient,
          rail: input.rail,
          allowPublicFallback: false,
          budgetPolicySnapshot: {
            dailyCapPercent: syncedBudget.dailyCapPercent,
            spentToday: syncedBudget.spentToday,
            remainingDailyCapBefore: decision.remainingDailyCap,
            remainingDailyCapAfter,
            allowanceMode: decision.allowanceMode,
            ghostAllowanceBefore: decision.ghostAllowanceBefore,
            ghostAllowanceAfter: decision.ghostAllowanceAfter
          },
          fromWallet: syncedBudget.agentWallet ?? `agent:${input.agentId}`,
          ...(input.telegram
            ? {
                telegram: {
                  ...input.telegram,
                  controllerWallet: auth.owner
                }
              }
            : {})
        });

        let reservedAmount = input.amount;
        let totalReservedAfter = input.amount;
        let reservationState = "reserved";
        let ghostAllowanceAfter = decision.ghostAllowanceAfter;

        try {
          const reservationReceipt = await budgetPolicy.reserveSpend(input.agentId, input.amount, {
            reason: input.category ?? input.goal,
            paylinkId: artifacts.paylink.id
          });
          reservedAmount = reservationReceipt.amount;
          totalReservedAfter = reservationReceipt.reservedAmount;
          ghostAllowanceAfter = reservationReceipt.ghostAllowanceAfter;
          await paylinkService.recordAgentBudgetReserved(artifacts.paymentIntent.id);
          reservationState = artifacts.paymentIntent.metadata?.agentLifecycle?.budgetReservationState ?? "reserved";
        } catch (error) {
          await paylinkService.deactivatePaylink(
            artifacts.paylink.id,
            "reservation-failed"
          );
          await paylinkService.markPaymentIntentFailed(artifacts.paymentIntent.id);

          return errorResponse(
            500,
            "reservation_failed",
            error instanceof Error
              ? `Agent plan paylink was created but disabled because reservation failed: ${error.message}`
              : "Agent plan paylink was created but disabled because reservation failed."
          );
        }

        const origin = new URL(request.url).origin;
        const memoPreview = artifacts.paymentIntent.metadata?.agentPlan?.memo ?? `whisperpay:agent:${input.agentId}:paylink:${artifacts.paylink.id}`;
        const mirage = generateMirageTransferCommand({
          walletName: "agent-treasury",
          recipient: artifacts.paymentIntent.recipient,
          amount: artifacts.paymentIntent.amount,
          mint: artifacts.paymentIntent.mint,
          memo: memoPreview,
          visibility: "private",
          split: 4,
          minDelayMs: 500,
          maxDelayMs: 5000,
          cluster: "devnet"
        });
        const paylinkUrl = `${origin}/pay/${artifacts.paylink.id}`;
        const receipt = buildApprovedPrivateReceiptPreview({
          agentId: input.agentId,
          goal: input.goal,
          ...(input.category ? { category: input.category } : {}),
          amount: input.amount,
          mint: input.mint,
          recipient: input.recipient,
          paylinkId: artifacts.paylink.id,
          paylinkUrl,
          rail: input.rail,
          dailyCapPercent: syncedBudget.dailyCapPercent,
          remainingDailyCapBefore: decision.remainingDailyCap,
          remainingDailyCapAfter,
          allowanceMode: decision.allowanceMode,
          ghostAllowanceBefore: decision.ghostAllowanceBefore,
          ghostAllowanceAfter,
          reservedAmount,
          totalReservedAfter,
          reservationState,
          memoPreview,
          paymentStatus: artifacts.paymentIntent.status,
          mirageReady: Boolean(mirage.displayCommand)
        });

        return json(
          {
            allowed: true,
            paylinkId: artifacts.paylink.id,
            paylinkUrl,
            amount: input.amount,
            mint: input.mint,
            recipient: input.recipient,
            rail: input.rail,
            privacyMode: "private",
            allowPublicFallback: false,
            remainingDailyCap: remainingDailyCapAfter,
            allowanceMode: decision.allowanceMode,
            ghostAllowanceBefore: decision.ghostAllowanceBefore,
            ghostAllowanceAfter,
            memoPreview,
            executionStatus: "Mirage command ready",
            executionInstruction: "Execution pending \u2014 run Mirage command manually",
            paymentStatus: "Payment status: Pending/manual",
            mirage: {
              walletName: mirage.walletName,
              displayCommand: mirage.displayCommand,
              argv: mirage.argv,
              warnings: mirage.warnings
            },
            receipt
          },
          201
        );
      } catch (error) {
        return handleKnownError(error);
      }
    }
  };
};


