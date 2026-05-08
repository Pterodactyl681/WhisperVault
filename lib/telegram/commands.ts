import { DEFAULT_DEMO_AGENT_ID, DEFAULT_DEMO_AGENT_RECIPIENT, type AgentBudgetPolicyAdapter } from "../agent-budget";
import { createAgentPlanHttpHandlers } from "../agent-plan/http";
import { AGENT_BUDGET_OWNER_HEADER } from "../agent-vault/http";
import { shortenAddress } from "../format";
import { TelegramLinkService } from "../telegram-link/service";
import type { WhisperPayServerService } from "../whisperpay-server";
import type { AgentBudget } from "../agent-budget";
import type { ParsedTelegramCommand } from "./types";
import { parseTelegramCommand } from "./types";

interface TelegramCommandServiceOptions {
  telegramLinkService: TelegramLinkService;
  budgetPolicy: AgentBudgetPolicyAdapter;
  paylinkService: WhisperPayServerService;
  origin?: string;
}

interface TelegramTextCommandInput {
  telegramUserId: string | null;
  telegramChatId?: string | null;
  text: string;
  username?: string | null;
}

interface ParsedSpendCommand {
  amount: string;
  goal: string;
}

interface AgentPlanSuccessPayload {
  allowed: true;
  paylinkId: string;
  amount: string;
  mint: string;
  allowanceMode?: "static" | "rolling";
  ghostAllowanceBefore?: string;
  ghostAllowanceAfter?: string;
  executionStatus?: string;
  paymentStatus?: string;
}

interface AgentPlanRejectedPayload {
  allowed: false;
  reason: string;
}

const HELP_TEXT = [
  "WhisperVault commands:",
  "/link <code>",
  "/vaults",
  "/spend 5 buy coffee",
  "/spend 100 buy gear",
  "/receipt <paylinkId>"
].join("\n");

const assertNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const toBigInt = (value: string): bigint => BigInt(value);

const formatTokenAmount = (amount: string, mint: string): string => `${amount} ${formatMintLabel(mint)}`;

const formatMintLabel = (mint: string): string => {
  const normalized = mint.trim().toUpperCase();

  if (normalized === "USDC" || normalized === "USDC_OR_MINT_ADDRESS") {
    return "USDC";
  }

  return mint.trim() || "USDC";
};

const formatRail = (budget: AgentBudget): string =>
  `${budget.rail}${budget.allowPublicFallback ? " (fallback on)" : " (fallback off)"}`;

const calculateDailyCap = (budget: AgentBudget): string => {
  const currentBalance = toBigInt(budget.currentBalance);
  const totalBudget = toBigInt(budget.totalBudget);
  const capBase = currentBalance < totalBudget ? currentBalance : totalBudget;
  return ((capBase * BigInt(budget.dailyCapPercent)) / 100n).toString();
};

const formatNextRefill = (budget: AgentBudget): string => {
  if (budget.allowanceMode !== "rolling") {
    return "off";
  }

  if (BigInt(budget.liveAllowance) >= BigInt(budget.maxLiveAllowance)) {
    return "ready";
  }

  const intervalMs = budget.refillIntervalMinutes * 60 * 1000;
  const nextRefillAt = Date.parse(budget.lastRefillAt) + intervalMs;
  const remainingMs = nextRefillAt - Date.now();

  if (remainingMs <= 0) {
    return "now";
  }

  const remainingMinutes = Math.ceil(remainingMs / 60_000);
  return remainingMinutes === 1 ? "in 1 min" : `in ${remainingMinutes} min`;
};

const parseSpendShortcut = (command: ParsedTelegramCommand): ParsedSpendCommand | null => {
  if (command.args.length !== 1) {
    return null;
  }

  const shortcut = command.args[0]?.trim().toLowerCase();

  if (shortcut === "coffee") {
    return {
      amount: "5",
      goal: "buy coffee"
    };
  }

  if (shortcut === "gear") {
    return {
      amount: "100",
      goal: "buy expensive gear"
    };
  }

  return null;
};

const parseSpendCommand = (command: ParsedTelegramCommand): ParsedSpendCommand | null => {
  const shortcut = parseSpendShortcut(command);

  if (shortcut) {
    return shortcut;
  }

  if (command.args.length < 2) {
    return null;
  }

  const [amount, ...goalParts] = command.args;
  const normalizedAmount = amount?.trim() ?? "";
  const goal = goalParts.join(" ").trim();

  if (!/^\d+$/.test(normalizedAmount) || normalizedAmount === "0" || !goal) {
    return null;
  }

  return {
    amount: normalizedAmount,
    goal
  };
};

const chooseDefaultVault = (vaults: AgentBudget[]): AgentBudget | null =>
  vaults.find((budget) => budget.agentId === DEFAULT_DEMO_AGENT_ID) ??
  vaults.find((budget) => budget.status === "active") ??
  vaults[0] ??
  null;

const asOwnerHeaders = (controllerWallet: string): Headers => {
  const headers = new Headers();
  headers.set(AGENT_BUDGET_OWNER_HEADER, controllerWallet);
  headers.set("Content-Type", "application/json");
  return headers;
};

const isAllowedResult = (value: unknown): value is AgentPlanSuccessPayload | AgentPlanRejectedPayload =>
  Boolean(value) && typeof value === "object" && "allowed" in (value as Record<string, unknown>);

export class TelegramCommandService {
  private readonly telegramLinkService: TelegramLinkService;

  private readonly budgetPolicy: AgentBudgetPolicyAdapter;

  private readonly paylinkService: WhisperPayServerService;

  private readonly origin: string;

  constructor(options: TelegramCommandServiceOptions) {
    this.telegramLinkService = options.telegramLinkService;
    this.budgetPolicy = options.budgetPolicy;
    this.paylinkService = options.paylinkService;
    this.origin = options.origin ?? "http://localhost";
  }

  async handleTextCommand(input: TelegramTextCommandInput): Promise<string> {
    const text = assertNonEmptyString(input.text, "text");
    const parsed = parseTelegramCommand(text);

    if (!parsed) {
      return `Text commands only right now.\n\n${HELP_TEXT}`;
    }

    switch (parsed.name) {
      case "start":
        return this.renderStartMessage();
      case "help":
        return HELP_TEXT;
      case "link":
        return this.handleLinkCommand(input.telegramUserId, parsed);
      case "vaults":
        return this.handleVaultsCommand(input.telegramUserId);
      case "spend":
        return this.handleSpendCommand(input.telegramUserId, input.telegramChatId ?? null, text, parsed);
      case "receipt":
        return this.handleReceiptCommand(input.telegramUserId, parsed);
      default:
        return HELP_TEXT;
    }
  }

  private renderStartMessage(): string {
    return [
      "WhisperVault lets your linked Telegram account request private Agent Vault spends on devnet.",
      "1. Open the WhisperVault web app.",
      "2. Connect your Solana controller wallet.",
      "3. Generate a link code.",
      "4. Send /link <code> here.",
      "",
      "Use /help to see available commands."
    ].join("\n");
  }

  private async handleLinkCommand(telegramUserId: string | null, command: ParsedTelegramCommand): Promise<string> {
    if (!telegramUserId) {
      return "Telegram user id was not present in this update. Try again from a direct message with the bot.";
    }

    const code = command.args[0]?.trim() ?? "";

    if (!code) {
      return "Usage: /link <code>";
    }

    try {
      const linked = await this.telegramLinkService.consumeLinkCode(telegramUserId, code);
      return `Linked to controller wallet ${shortenAddress(linked.controllerWallet)}. You can now use /vaults, /spend, and /receipt.`;
    } catch (error) {
      return error instanceof Error ? error.message : "Failed to link Telegram account.";
    }
  }

  private async handleVaultsCommand(telegramUserId: string | null): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const budgets = (await this.budgetPolicy.listBudgets()).filter((budget) => budget.owner === controllerWallet);

    if (budgets.length === 0) {
      return "No Agent Vaults found for this controller wallet yet. Create one in the WhisperVault web app first.";
    }

    const lines = await Promise.all(
      budgets.map(async (budget) => {
        const decision = await this.budgetPolicy.canSpend(budget.agentId, "1");
        const syncedBudget = decision.budget;
        const balance = `${syncedBudget.currentBalance}/${syncedBudget.totalBudget} ${formatMintLabel(syncedBudget.mint)}`;
        return [
          `- ${syncedBudget.agentId}`,
          `  Balance: ${balance}`,
          `  Daily cap: ${calculateDailyCap(syncedBudget)} ${formatMintLabel(syncedBudget.mint)}`,
          `  Daily left: ${decision.remainingDailyCap} ${formatMintLabel(syncedBudget.mint)}`,
          `  Ghost Allowance: ${syncedBudget.liveAllowance}/${syncedBudget.maxLiveAllowance} ${formatMintLabel(syncedBudget.mint)}`,
          `  Refill: +${syncedBudget.refillAmount} every ${syncedBudget.refillIntervalMinutes} min`,
          `  Next refill: ${formatNextRefill(syncedBudget)}`,
          `  Rail: ${formatRail(syncedBudget)}`
        ].join("\n");
      })
    );

    return [`Agent Vaults for ${shortenAddress(controllerWallet)}:`, ...lines].join("\n");
  }

  private async handleSpendCommand(
    telegramUserId: string | null,
    telegramChatId: string | null,
    originalTelegramCommand: string,
    command: ParsedTelegramCommand
  ): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const spend = parseSpendCommand(command);

    if (!spend) {
      return [
        "Usage: /spend <amount> <goal>",
        "Examples:",
        "/spend 5 buy coffee",
        "/spend 100 buy gear",
        "/spend coffee",
        "/spend gear"
      ].join("\n");
    }

    const vaults = (await this.budgetPolicy.listBudgets()).filter((budget) => budget.owner === controllerWallet);
    const selectedVault = chooseDefaultVault(vaults);

    if (!selectedVault) {
      return "No Agent Vault is linked to this controller wallet yet. Create one in the WhisperVault web app first.";
    }

    const handlers = createAgentPlanHttpHandlers({
      budgetService: this.budgetPolicy,
      paylinkService: this.paylinkService,
      allowTelegramMetadata: true
    });

    const response = await handlers.createPlan(
      new Request(`${this.origin}/api/agent-plan`, {
        method: "POST",
        headers: asOwnerHeaders(controllerWallet),
        body: JSON.stringify({
          agentId: selectedVault.agentId,
          goal: spend.goal,
          amount: spend.amount,
          mint: selectedVault.mint,
          recipient: DEFAULT_DEMO_AGENT_RECIPIENT,
          rail: "magicblock-private",
          ...(telegramUserId && telegramChatId
            ? {
                telegram: {
                  source: "telegram",
                  telegramUserId,
                  telegramChatId,
                  controllerWallet,
                  originalTelegramCommand
                }
              }
            : {})
        })
      })
    );

    const payload = (await response.json()) as unknown;

    if (!isAllowedResult(payload)) {
      return "WhisperVault could not create a spend reply for this request. Try again in the web app.";
    }

    if (!payload.allowed) {
      return [
        "Spend Firewall: Blocked",
        `Reason: ${payload.reason}`,
        "Private spend: none",
        "Mirage command: not generated"
      ].join("\n");
    }

    return [
      "Spend Firewall: Passed",
      `Agent: ${selectedVault.agentId}`,
      `Amount: ${formatTokenAmount(payload.amount, payload.mint)}`,
      ...(payload.allowanceMode === "rolling" && payload.ghostAllowanceBefore && payload.ghostAllowanceAfter
        ? [`Ghost Allowance: ${payload.ghostAllowanceBefore} → ${payload.ghostAllowanceAfter} ${formatMintLabel(payload.mint)}`]
        : []),
      "Private spend: created",
      "Mirage command: ready",
      "Execution: pending/manual",
      "Receipt: available",
      `Paylink/Receipt id: ${payload.paylinkId}`
    ].join("\n");
  }

  private async handleReceiptCommand(telegramUserId: string | null, command: ParsedTelegramCommand): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const paylinkId = command.args[0]?.trim() ?? "";

    if (!paylinkId) {
      return "Usage: /receipt <paylinkId>";
    }

    const paymentIntent = await this.paylinkService.getPaymentIntentByPaylinkId(paylinkId);

    if (!paymentIntent) {
      return "Receipt not found for that paylink id.";
    }

    const agentId = paymentIntent.metadata?.agentPlan?.agentId;

    if (!agentId) {
      return "Receipt not found for that paylink id.";
    }

    const budget = await this.budgetPolicy.getBudget(agentId);

    if (!budget || budget.owner !== controllerWallet) {
      return "Receipt not found or not authorized for this Telegram account.";
    }

    const reservationState = paymentIntent.metadata?.agentLifecycle?.budgetReservationState;
    const executionStatus =
      paymentIntent.metadata?.manualExecution?.txSignature || paymentIntent.txSignature
        ? "confirmed/manual"
        : "pending/manual";
    const status = reservationState === "confirmed" ? "confirmed" : paymentIntent.status;

    return [
      `Status: ${status}`,
      `Agent: ${agentId}`,
      `Amount: ${formatTokenAmount(paymentIntent.amount, paymentIntent.mint)}`,
      "Policy decision: approved",
      `Mirage ready: ${paymentIntent.magicPrivate?.enabled ? "yes" : "no"}`,
      `Execution status: ${executionStatus}`,
      `Tx signature: ${paymentIntent.txSignature ?? "pending"}`
    ].join("\n");
  }

  private async resolveLinkedControllerWallet(telegramUserId: string | null): Promise<string | null> {
    if (!telegramUserId) {
      return null;
    }

    return this.telegramLinkService.resolveControllerWalletForTelegramUser(telegramUserId);
  }

  private renderLinkRequiredMessage(): string {
    return [
      "This Telegram account is not linked yet.",
      "Open the WhisperVault web app, connect your wallet, generate a link code, then send /link <code> here."
    ].join("\n");
  }
}
