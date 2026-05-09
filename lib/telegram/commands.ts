import { DEFAULT_DEMO_AGENT_ID, DEFAULT_DEMO_AGENT_RECIPIENT, type AgentBudgetPolicyAdapter } from "../agent-budget";
import { createAgentPlanHttpHandlers } from "../agent-plan/http";
import { AGENT_BUDGET_OWNER_HEADER } from "../agent-vault/http";
import { AgentRegistryService } from "../agent-registry";
import { shortenAddress } from "../format";
import { GhostTabService } from "../ghost-tab/service";
import { isValidSolanaPublicKey } from "../solana-validation";
import { TelegramLinkService } from "../telegram-link/service";
import type { DemoReadinessService } from "../demo-readiness";
import type { WhisperPayServerService } from "../whisperpay-server";
import type { AgentBudget } from "../agent-budget";
import type { ParsedTelegramCommand } from "./types";
import { parseTelegramCommand } from "./types";

interface TelegramCommandServiceOptions {
  telegramLinkService: TelegramLinkService;
  budgetPolicy: AgentBudgetPolicyAdapter;
  paylinkService: WhisperPayServerService;
  agentRegistry?: AgentRegistryService;
  ghostTabService?: GhostTabService;
  demoReadinessService?: DemoReadinessService;
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

interface RogueSimulationAttempt {
  index: number;
  amount: string;
  goal: string;
  displayGoal: string;
  rail: "magicblock-private" | "public-solana";
  recipient: string;
  expectedBlock?: "recipient" | "rail";
}

interface RogueSimulationResult {
  attempt: RogueSimulationAttempt;
  result: "Approved" | "Blocked";
  reason: string;
}

const HELP_TEXT = [
  "WhisperVault commands:",
  "/link <code>",
  "/vaults",
  "/agents",
  "/agent use <name>",
  "/recipient add <label> <address>",
  "/recipient use <label>",
  "/recipients",
  "/ghost status",
  "/ghost open",
  "/ghost pause",
  "/ghost resume",
  "/ghost close",
  "/demo reset",
  "/demo status",
  "/spend 5 buy coffee",
  "/spend 100 buy gear",
  "/receipt <paylinkId>",
  "/rogue"
].join("\n");

const CARD_DIVIDER = "━━━━━━━━━━━━";
const SOLANA_DEVNET_EXPLORER_BASE_URL = "https://explorer.solana.com/tx";

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

const formatPrivateRailLabel = (rail: AgentBudget["rail"]): string =>
  rail === "magicblock-private" ? "Mirage Private" : "Solana Public";

const formatNativeFallbackLabel = (): string => "Solana Native Devnet";

const formatExecutionRailLabel = (executionRail?: string | null): string => {
  if (executionRail === "solana-devnet-native-fallback") {
    return "Solana Native Devnet Fallback";
  }

  if (executionRail === "solana-devnet-spl-fallback") {
    return "Solana Devnet SPL Fallback";
  }

  return "Mirage Private Rail";
};

const formatStatusLabel = (status: string): string => status.slice(0, 1).toUpperCase() + status.slice(1);

const formatDuration = (ms: number): string => {
  const absolute = Math.abs(ms);
  const minutes = Math.max(1, Math.round(absolute / 60000));

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h`;
};

const formatAgo = (iso: string): string => `${formatDuration(Date.now() - Date.parse(iso))} ago`;

const formatFromNow = (iso: string | null): string => {
  if (!iso) {
    return "not set";
  }

  const delta = Date.parse(iso) - Date.now();
  return delta >= 0 ? `in ${formatDuration(delta)}` : `${formatDuration(delta)} ago`;
};

const formatPolicyReason = (reason: string): string => {
  if (/live Ghost Allowance/i.test(reason)) {
    return "Ghost Allowance exceeded";
  }

  if (/remaining daily cap/i.test(reason)) {
    return "Daily cap exceeded";
  }

  if (/paused/i.test(reason)) {
    return "Agent Vault paused";
  }

  if (/exhausted/i.test(reason)) {
    return "Agent Vault exhausted";
  }

  if (/available balance/i.test(reason)) {
    return "Available balance exceeded";
  }

  return reason.replace(/\.$/, "");
};

const formatSpendBlockReason = (reason: string): string => {
  const normalized = formatPolicyReason(reason);
  return normalized === "Daily cap exceeded" ? "Daily budget exceeded" : normalized;
};

const formatGhostAllowanceBar = (liveAllowance: string, maxLiveAllowance: string): string => {
  const live = toBigInt(liveAllowance);
  const max = toBigInt(maxLiveAllowance);
  const width = 10n;

  if (max <= 0n) {
    return "░░░░░░░░░░";
  }

  const filled = Number((live * width) / max);
  return `${"█".repeat(Math.max(0, Math.min(10, filled)))}${"░".repeat(Math.max(0, 10 - filled))}`;
};

const formatShortSignature = (signature: string | null | undefined): string => {
  const normalized = signature?.trim();

  if (!normalized) {
    return "pending";
  }

  return normalized.length <= 16 ? normalized : `${normalized.slice(0, 8)}...${normalized.slice(-8)}`;
};

const formatSolanaExplorerDevnetLink = (signature: string): string =>
  `${SOLANA_DEVNET_EXPLORER_BASE_URL}/${signature}?cluster=devnet`;

const calculateDailyCap = (budget: AgentBudget): string => {
  const currentBalance = toBigInt(budget.currentBalance);
  const totalBudget = toBigInt(budget.totalBudget);
  const capBase = currentBalance < totalBudget ? currentBalance : totalBudget;
  return ((capBase * BigInt(budget.dailyCapPercent)) / 100n).toString();
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

const chooseVaultForContext = (vaults: AgentBudget[], activeAgentId?: string | null): AgentBudget | null =>
  (activeAgentId ? vaults.find((budget) => budget.agentId === activeAgentId) : null) ?? chooseDefaultVault(vaults);

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

  private readonly agentRegistry: AgentRegistryService;

  private readonly ghostTabService: GhostTabService;

  private readonly demoReadinessService?: DemoReadinessService;

  private readonly origin: string;

  private readonly activeAgentByTelegramUser = new Map<string, string>();

  constructor(options: TelegramCommandServiceOptions) {
    this.telegramLinkService = options.telegramLinkService;
    this.budgetPolicy = options.budgetPolicy;
    this.paylinkService = options.paylinkService;
    this.agentRegistry = options.agentRegistry ?? new AgentRegistryService();
    this.ghostTabService = options.ghostTabService ?? new GhostTabService();
    this.demoReadinessService = options.demoReadinessService;
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
      case "agents":
        return this.handleAgentsCommand(input.telegramUserId);
      case "agent":
        return this.handleAgentCommand(input.telegramUserId, parsed);
      case "recipient":
        return this.handleRecipientCommand(input.telegramUserId, parsed);
      case "recipients":
        return this.handleRecipientsCommand(input.telegramUserId);
      case "ghost":
        return this.handleGhostCommand(input.telegramUserId, parsed);
      case "demo":
        return this.handleDemoCommand(input.telegramUserId, parsed);
      case "spend":
        return this.handleSpendCommand(input.telegramUserId, input.telegramChatId ?? null, text, parsed);
      case "receipt":
        return this.handleReceiptCommand(input.telegramUserId, parsed);
      case "rogue":
        return this.handleRogueCommand(input.telegramUserId);
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

    const activeAgent = await this.agentRegistry.getActiveAgent(controllerWallet, budgets);
    const lines = await Promise.all(
      budgets.map(async (budget) => {
        const decision = await this.budgetPolicy.canSpend(budget.agentId, "1");
        const syncedBudget = decision.budget;
        const activeMarker = activeAgent?.id === syncedBudget.agentId ? "  Active" : "";
        const mint = formatMintLabel(syncedBudget.mint);
        const balance = `${syncedBudget.currentBalance} / ${syncedBudget.totalBudget} ${mint}`;
        const ghostAllowance = `${formatGhostAllowanceBar(syncedBudget.liveAllowance, syncedBudget.maxLiveAllowance)} ${syncedBudget.liveAllowance} / ${syncedBudget.maxLiveAllowance}`;
        return [
          CARD_DIVIDER,
          `☕ ${syncedBudget.agentId}${activeMarker}`,
          CARD_DIVIDER,
          "",
          "Balance",
          balance,
          "",
          "Ghost Allowance",
          `${ghostAllowance} ${mint}`,
          "",
          "Daily Budget",
          `${decision.remainingDailyCap} / ${calculateDailyCap(syncedBudget)} ${mint} remaining`,
          "",
          "Execution Rail",
          `Private Rail: ${formatPrivateRailLabel(syncedBudget.rail)}`,
          `Native Fallback: ${formatNativeFallbackLabel()}`,
          "",
          "Status",
          `● ${formatStatusLabel(syncedBudget.status)}`,
          "● Spend Firewall Enabled",
          "● Devnet Execution Ready"
        ].join("\n");
      })
    );

    return ["🧠 WhisperVault", "", "Controller", shortenAddress(controllerWallet), "", ...lines].join("\n");
  }

  private async handleAgentsCommand(telegramUserId: string | null): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const budgets = (await this.budgetPolicy.listBudgets()).filter((budget) => budget.owner === controllerWallet);

    if (budgets.length === 0) {
      return "No Agent Vaults found for this controller wallet yet. Create one in the WhisperVault web app first.";
    }

    const agents = await this.agentRegistry.listAgents(controllerWallet, budgets);
    const activeAgent = await this.agentRegistry.getActiveAgent(controllerWallet, budgets);
    const lines = await Promise.all(
      budgets.map(async (budget) => {
        const decision = await this.budgetPolicy.canSpend(budget.agentId, "1");
        const syncedBudget = decision.budget;
        const registeredAgent = agents.find((agent) => agent.id === syncedBudget.agentId);
        const activeSuffix = activeAgent?.id === syncedBudget.agentId ? "  Active" : "";
        return [
          `● ${registeredAgent?.name ?? syncedBudget.agentId}${activeSuffix}`,
          `Ghost: ${syncedBudget.liveAllowance}/${syncedBudget.maxLiveAllowance}`,
          syncedBudget.status === "paused" ? "Paused" : `Daily left: ${decision.remainingDailyCap}`
        ].join("\n");
      })
    );

    return ["🧠 Active Agents", "", ...lines].join("\n\n");
  }

  private async handleAgentCommand(telegramUserId: string | null, command: ParsedTelegramCommand): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const action = command.args[0]?.trim().toLowerCase() ?? "";
    const requestedName = command.args[1]?.trim() ?? "";
    const budgets = (await this.budgetPolicy.listBudgets()).filter((budget) => budget.owner === controllerWallet);

    if (action === "create" && requestedName) {
      const createdBudget = await this.budgetPolicy.createBudget({
        agentId: requestedName,
        owner: controllerWallet,
        agentWallet: `agent:${requestedName}`,
        mint: "USDC",
        totalBudget: "100",
        currentBalance: "100",
        rail: "magicblock-private"
      });
      const agent = await this.agentRegistry.createAgent({
        name: requestedName,
        controllerWallet,
        budget: createdBudget
      });
      await this.agentRegistry.setActiveAgent(controllerWallet, agent.id);

      return [
        "🧠 Agent Vault Created",
        "",
        "Agent",
        agent.name,
        "",
        "Spend Firewall",
        "Policy isolated"
      ].join("\n");
    }

    if (action === "token" && requestedName) {
      const generated = await this.agentRegistry.generateToken(controllerWallet, requestedName, budgets);
      return [
        "🔐 Agent API Token",
        "",
        "Agent",
        generated.agent.name,
        "",
        "Bearer Token",
        generated.token,
        "",
        "Warning",
        "Shown once. Store it securely."
      ].join("\n");
    }

    if (action !== "use" || !requestedName) {
      return "Usage: /agent use <name>\n/agent create <name>\n/agent token <name>";
    }

    const selected = await this.agentRegistry.findAgentByName(controllerWallet, requestedName, budgets);

    if (!selected) {
      return ["Agent Vault not found.", "", "Use /agents to view available Agent Vaults."].join("\n");
    }

    await this.agentRegistry.setActiveAgent(controllerWallet, selected.id);

    if (telegramUserId) {
      this.activeAgentByTelegramUser.set(telegramUserId, selected.id);
    }

    return [
      "🧠 Agent Vault Switched",
      "",
      "Active Agent",
      selected.name,
      "",
      "Spend Firewall",
      "Context updated"
    ].join("\n");
  }

  private async handleRecipientCommand(telegramUserId: string | null, command: ParsedTelegramCommand): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const action = command.args[0]?.trim().toLowerCase() ?? "";
    const label = command.args[1]?.trim() ?? "";

    if (action === "add") {
      const address = command.args[2]?.trim() ?? "";

      if (!label || !address) {
        return "Usage: /recipient add <label> <address>";
      }

      const recipient = await this.agentRegistry.addRecipient(controllerWallet, label, address);
      return ["Recipient added", "", recipient.label, recipient.address].join("\n");
    }

    if (action === "use") {
      if (!label) {
        return "Usage: /recipient use <label>";
      }

      const budgets = (await this.budgetPolicy.listBudgets()).filter((budget) => budget.owner === controllerWallet);
      const activeAgent = await this.agentRegistry.getActiveAgent(controllerWallet, budgets);

      if (!activeAgent) {
        return "No active Agent Vault. Use /agent use <name> first.";
      }

      const agent = await this.agentRegistry.setDefaultRecipient(controllerWallet, activeAgent.id, label);
      return [
        "Recipient selected",
        "",
        "Agent",
        agent.name,
        "",
        "Recipient",
        `${agent.defaultRecipientLabel}: ${agent.defaultRecipientAddress}`
      ].join("\n");
    }

    return "Usage: /recipient add <label> <address>\n/recipient use <label>";
  }

  private async handleRecipientsCommand(telegramUserId: string | null): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const recipients = await this.agentRegistry.listRecipients(controllerWallet);

    if (recipients.length === 0) {
      return "No recipients saved yet.";
    }

    return ["Recipients", "", ...recipients.map((recipient) => `● ${recipient.label}\n${shortenAddress(recipient.address)}`)].join("\n\n");
  }

  private async handleDemoCommand(telegramUserId: string | null, command: ParsedTelegramCommand): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    if (!this.demoReadinessService) {
      return "Demo readiness service is not available in this runtime.";
    }

    const action = command.args[0]?.trim().toLowerCase() || "status";

    try {
      if (action === "reset") {
        const result = await this.demoReadinessService.reset(controllerWallet);
        return [
          "Demo state ready",
          "",
          `Active agent: ${result.activeAgent.name}`,
          `Ghost Allowance: ${result.budget.liveAllowance}/${result.budget.maxLiveAllowance} ${formatMintLabel(result.budget.mint)}`,
          `Recipient: ${result.recipient.displayLabel}`
        ].join("\n");
      }

      if (action === "status") {
        const status = await this.demoReadinessService.status(controllerWallet);
        return [
          "Demo Status",
          "",
          `Active agent: ${status.activeAgentName ?? "Not set"}`,
          `Ghost Allowance: ${
            status.ghostAllowanceLive && status.ghostAllowanceMax
              ? `${status.ghostAllowanceLive}/${status.ghostAllowanceMax} USDC`
              : "Not open"
          }`,
          `Recipient: ${status.recipientDisplayLabel ?? status.recipientLabel ?? "Not set"}`,
          `Pending count: ${status.pendingCount}`,
          `Last confirmed tx: ${formatShortSignature(status.lastConfirmedTx)}`
        ].join("\n");
      }

      return "Usage: /demo reset\n/demo status";
    } catch (error) {
      return error instanceof Error ? error.message : "Demo command failed.";
    }
  }

  private async handleGhostCommand(telegramUserId: string | null, command: ParsedTelegramCommand): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const selectedVault = await this.resolveActiveVault(controllerWallet, telegramUserId);

    if (!selectedVault) {
      return "No Agent Vault is linked to this controller wallet yet. Create one in the WhisperVault web app first.";
    }

    const action = command.args[0]?.trim().toLowerCase() || "status";

    try {
      if (action === "open") {
        await this.ghostTabService.openFromBudget(selectedVault);
        return this.renderGhostStatus(selectedVault.agentId);
      }

      if (action === "pause") {
        await this.ghostTabService.ensureSessionForBudget(selectedVault);
        await this.ghostTabService.pause(selectedVault.agentId);
        return this.renderGhostStatus(selectedVault.agentId);
      }

      if (action === "resume") {
        await this.ghostTabService.resume(selectedVault.agentId);
        return this.renderGhostStatus(selectedVault.agentId);
      }

      if (action === "close") {
        await this.ghostTabService.close(selectedVault.agentId);
        return this.renderGhostStatus(selectedVault.agentId);
      }

      if (action !== "status") {
        return "Usage: /ghost status\n/ghost open\n/ghost pause\n/ghost resume\n/ghost close";
      }

      await this.ghostTabService.ensureSessionForBudget(selectedVault);
      return this.renderGhostStatus(selectedVault.agentId);
    } catch (error) {
      return error instanceof Error ? error.message : "Ghost Tab command failed.";
    }
  }

  private async renderGhostStatus(agentId: string): Promise<string> {
    const snapshot = await this.ghostTabService.getSnapshot(agentId);
    const session = snapshot.session;

    if (!session) {
      return "Ghost Tab is not open for this Agent Vault.";
    }

    return [
      "👻 Ghost Tab",
      "",
      "Status",
      `● ${formatStatusLabel(session.status)}`,
      "",
      "Allowance",
      `${session.allowanceLive} / ${session.allowanceMax} USDC`,
      "",
      "Refill",
      `+${session.refillAmount} every ${session.refillIntervalMinutes} min`,
      "",
      "Session",
      `Opened: ${formatAgo(session.openedAt)}`,
      `Expires: ${formatFromNow(session.expiresAt)}`,
      "",
      "Totals",
      `Spent: ${session.totalSpent} USDC`,
      `Refilled: ${session.totalRefilled} USDC`,
      `Clawed back: ${session.totalClawedBack} USDC`
    ].join("\n");
  }

  private async resolveActiveVault(controllerWallet: string, telegramUserId: string | null): Promise<AgentBudget | null> {
    const vaults = (await this.budgetPolicy.listBudgets()).filter((budget) => budget.owner === controllerWallet);
    const activeAgent = await this.agentRegistry.getActiveAgent(controllerWallet, vaults);
    return chooseVaultForContext(
      vaults,
      activeAgent?.id ?? (telegramUserId ? this.activeAgentByTelegramUser.get(telegramUserId) : null)
    );
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
    const activeAgent = await this.agentRegistry.getActiveAgent(controllerWallet, vaults);
    const selectedVault = chooseVaultForContext(
      vaults,
      activeAgent?.id ?? (telegramUserId ? this.activeAgentByTelegramUser.get(telegramUserId) : null)
    );

    if (!selectedVault) {
      return "No Agent Vault is linked to this controller wallet yet. Create one in the WhisperVault web app first.";
    }

    const selectedAgent = selectedVault ? await this.agentRegistry.upsertFromBudget(selectedVault) : null;
    const recipient = selectedAgent?.defaultRecipientAddress ?? DEFAULT_DEMO_AGENT_RECIPIENT;
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
          recipient,
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
      const decision = await this.budgetPolicy.canSpend(selectedVault.agentId, spend.amount);
      const mint = formatMintLabel(selectedVault.mint);
      const reason = formatSpendBlockReason(payload.reason);
      const available =
        /Ghost Allowance exceeded/i.test(reason)
          ? decision.ghostAllowanceBefore
          : /Daily budget exceeded/i.test(reason)
            ? decision.remainingDailyCap
            : decision.availableBalance;
      return [
        "🛑 Spend Blocked",
        "",
        "Reason",
        reason,
        "",
        "Requested",
        `${spend.amount} ${mint}`,
        "",
        "Available",
        `${available} ${mint}`,
        "",
        "No execution rail generated."
      ].join("\n");
    }

    const approvedLines = [
      "🛡 Spend Firewall Approved",
      "",
      "Agent",
      selectedVault.agentId,
      "",
      "Request",
      formatTokenAmount(payload.amount, payload.mint),
      `“${spend.goal}”`,
      "",
      "Execution Path",
      "Mirage Private Rail",
      "",
      "Native Fallback",
      formatNativeFallbackLabel(),
      ""
    ];

    if (payload.allowanceMode === "rolling" && payload.ghostAllowanceBefore && payload.ghostAllowanceAfter) {
      approvedLines.push(
        "Ghost Allowance",
        `${payload.ghostAllowanceBefore} → ${payload.ghostAllowanceAfter} ${formatMintLabel(payload.mint)}`,
        ""
      );
    }

    approvedLines.push("Receipt", payload.paylinkId, "", "Status", "Pending execution");

    return approvedLines.join("\n");
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

    const recipient = (await this.agentRegistry.listRecipients(controllerWallet)).find(
      (candidate) => candidate.address === paymentIntent.recipient
    );
    const recipientLine = recipient ? `${recipient.label}: ${shortenAddress(paymentIntent.recipient)}` : shortenAddress(paymentIntent.recipient);
    const reservationState = paymentIntent.metadata?.agentLifecycle?.budgetReservationState;
    const executionStatus =
      paymentIntent.metadata?.manualExecution?.txSignature || paymentIntent.txSignature
        ? "confirmed/manual"
        : "pending/manual";
    const status = reservationState === "confirmed" ? "confirmed" : paymentIntent.status;
    const manualExecution = paymentIntent.metadata?.manualExecution;
    const txSignature = manualExecution?.txSignature ?? paymentIntent.txSignature;

    if (txSignature) {
      return [
        "✅ Execution Confirmed",
        "",
        "Agent",
        agentId,
        "",
        "Amount",
        formatTokenAmount(paymentIntent.amount, paymentIntent.mint),
        "",
        "Recipient",
        recipientLine,
        "",
        "Execution Rail",
        formatExecutionRailLabel(manualExecution?.executionRail),
        "",
        "Policy Decision",
        "Approved by Spend Firewall",
        "",
        "Tx Signature",
        formatShortSignature(txSignature),
        "",
        "Explorer",
        formatSolanaExplorerDevnetLink(txSignature),
        "",
        "Receipt ID",
        paymentIntent.paylinkId,
        "",
        "Status",
        "Confirmed"
      ].join("\n");
    }

    return [
      "🧾 Agent Vault Receipt",
      "",
      "Agent",
      agentId,
      "",
      "Amount",
      formatTokenAmount(paymentIntent.amount, paymentIntent.mint),
      "",
      "Recipient",
      recipientLine,
      "",
      "Execution Rail",
      paymentIntent.magicPrivate?.enabled ? "Mirage Private Rail" : "Native Fallback",
      "",
      "Policy Decision",
      "Approved by Spend Firewall",
      "",
      "Receipt ID",
      paymentIntent.paylinkId,
      "",
      "Status",
      status === "pending" || executionStatus === "pending/manual" ? "Pending execution" : formatStatusLabel(status)
    ].join("\n");
  }

  private async handleRogueCommand(telegramUserId: string | null): Promise<string> {
    const controllerWallet = await this.resolveLinkedControllerWallet(telegramUserId);

    if (!controllerWallet) {
      return this.renderLinkRequiredMessage();
    }

    const budgets = (await this.budgetPolicy.listBudgets()).filter((budget) => budget.owner === controllerWallet);
    const activeAgent = await this.agentRegistry.getActiveAgent(controllerWallet, budgets);
    const selectedVault = chooseVaultForContext(budgets, activeAgent?.id);

    if (!selectedVault) {
      return "No Agent Vault is linked to this controller wallet yet. Create one in the WhisperVault web app first.";
    }

    const selectedAgent = await this.agentRegistry.getAgent(selectedVault.agentId);
    const defaultRecipient = selectedAgent?.defaultRecipientAddress ?? DEFAULT_DEMO_AGENT_RECIPIENT;
    const scopedRecipients = (await this.agentRegistry.listRecipients(controllerWallet)).filter(
      (recipient) => recipient.agentId === selectedVault.agentId
    );
    const attempts: RogueSimulationAttempt[] = [
      {
        index: 1,
        amount: "1",
        goal: "buy coffee",
        displayGoal: "buy coffee",
        rail: "magicblock-private",
        recipient: defaultRecipient
      },
      {
        index: 2,
        amount: "30",
        goal: "buy gear",
        displayGoal: "buy gear",
        rail: "magicblock-private",
        recipient: defaultRecipient
      },
      {
        index: 3,
        amount: "100",
        goal: "buy laptop",
        displayGoal: "buy laptop",
        rail: "magicblock-private",
        recipient: defaultRecipient
      },
      {
        index: 4,
        amount: "5",
        goal: "send to invalid recipient",
        displayGoal: "invalid recipient",
        rail: "magicblock-private",
        recipient: "invalid-recipient",
        expectedBlock: "recipient"
      },
      {
        index: 5,
        amount: "5",
        goal: "public transfer attempt",
        displayGoal: "public transfer attempt",
        rail: "public-solana",
        recipient: defaultRecipient,
        expectedBlock: "rail"
      }
    ];
    const results = await Promise.all(
      attempts.map((attempt) => this.evaluateRogueAttemptDryRun(selectedVault.agentId, attempt, scopedRecipients))
    );
    const approved = results.filter((result) => result.result === "Approved").length;
    const blocked = results.length - approved;

    return [
      "👾 Rogue Agent Simulator",
      "",
      `Agent: ${selectedAgent?.name ?? selectedVault.agentId}`,
      "Mode: dry-run",
      "Execution: disabled",
      "",
      ...results.flatMap((result) => [
        `Attempt ${result.attempt.index}`,
        `${result.attempt.amount} ${formatMintLabel(selectedVault.mint)} — ${result.attempt.displayGoal}`,
        `Result: ${result.result}`,
        `Reason: ${result.reason}`,
        ""
      ]),
      "Summary:",
      `Safe requests approved: ${approved}`,
      `Unsafe requests blocked: ${blocked}`,
      "Unsafe executions generated: 0",
      "",
      "Spend Firewall integrity maintained."
    ].join("\n");
  }

  private async evaluateRogueAttemptDryRun(
    agentId: string,
    attempt: RogueSimulationAttempt,
    scopedRecipients: Array<{ address: string }>
  ): Promise<RogueSimulationResult> {
    if (
      attempt.expectedBlock === "recipient" ||
      !isValidSolanaPublicKey(attempt.recipient) ||
      (scopedRecipients.length > 0 && !scopedRecipients.some((recipient) => recipient.address === attempt.recipient))
    ) {
      return {
        attempt,
        result: "Blocked",
        reason: "Recipient policy denied"
      };
    }

    if (attempt.expectedBlock === "rail" || attempt.rail !== "magicblock-private") {
      return {
        attempt,
        result: "Blocked",
        reason: "Private rail policy enforced"
      };
    }

    const decision = await this.budgetPolicy.canSpend(agentId, attempt.amount);

    if (!decision.allowed) {
      return {
        attempt,
        result: "Blocked",
        reason: formatPolicyReason(decision.reason ?? "Spend rejected by policy")
      };
    }

    return {
      attempt,
      result: "Approved",
      reason: "Within Spend Firewall policy"
    };
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
