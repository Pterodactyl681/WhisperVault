import type { AgentBudget, AgentBudgetPolicyAdapter, CreateAgentBudgetInput } from "../agent-budget";
import { DEFAULT_DEMO_AGENT_MINT, DEFAULT_DEMO_AGENT_OWNER, DEFAULT_DEMO_AGENT_RECIPIENT } from "../agent-budget/demo-constants";
import { createAgentPlanHttpHandlers } from "../agent-plan/http";
import { AGENT_BUDGET_OWNER_HEADER, errorResponse, handleKnownError, json, parseJsonObject, readOwnerHeader } from "../agent-vault/http";
import type { AgentRegistryService } from "../agent-registry/service";
import type { AgentRecipient, RegisteredAgent } from "../agent-registry/types";
import type { GhostTabService } from "../ghost-tab/service";
import type { GhostTabSnapshot } from "../ghost-tab/types";
import type { ServerPaymentIntent, WhisperPayServerService } from "../whisperpay-server";

interface CommandCenterHttpOptions {
  registryService: AgentRegistryService;
  budgetPolicy: AgentBudgetPolicyAdapter;
  paylinkService: WhisperPayServerService;
  ghostTabService?: GhostTabService;
  demoControllerWallet?: string;
}

interface CommandCenterHttpHandlers {
  listAgents: (request: Request) => Promise<Response>;
  createAgent: (request: Request) => Promise<Response>;
  generateAgentToken: (request: Request) => Promise<Response>;
  useAgent: (request: Request) => Promise<Response>;
  clearActiveAgent: (request: Request) => Promise<Response>;
  listRecipients: (request: Request) => Promise<Response>;
  addRecipient: (request: Request) => Promise<Response>;
  useRecipient: (request: Request) => Promise<Response>;
  listReceipts: (request: Request) => Promise<Response>;
  createSpendIntent: (request: Request) => Promise<Response>;
}

type AgentPlanPayload = {
  allowed?: boolean;
  reason?: string;
  paylinkId?: string;
  rail?: string;
  receipt?: unknown;
};

type CommandCenterRouteName =
  | "/api/agents"
  | "/api/agents/create"
  | "/api/agents/token"
  | "/api/agents/use"
  | "/api/agents/clear-active"
  | "/api/recipients"
  | "/api/recipients/add"
  | "/api/recipients/use"
  | "/api/receipts"
  | "/api/spend-intent";

const readyLogs = new Set<string>();

const logReadyOnce = (key: string, message: string): void => {
  if (readyLogs.has(key)) {
    return;
  }

  readyLogs.add(key);
  console.info(`[Command Center] ${message}`);
};

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const isMissingSchemaError = (error: unknown): boolean => {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("could not find the column") ||
    message.includes("schema cache") ||
    message.includes("undefined_table") ||
    message.includes("undefined_column")
  );
};

const isDuplicateKeyError = (error: unknown): boolean => {
  const message = errorMessage(error).toLowerCase();
  return message.includes("23505") || message.includes("409") || message.includes("duplicate key");
};

const uniqueWarnings = (warnings: string[]): string[] => Array.from(new Set(warnings.filter(Boolean)));

const logRouteError = (route: CommandCenterRouteName, error: unknown): void => {
  console.error(`[Command Center] ${route} failed: ${errorMessage(error)}`);
};

const logSchemaFallback = (route: CommandCenterRouteName, detail: string, error: unknown): void => {
  console.warn(`[Command Center] ${route} returning empty data because ${detail}: ${errorMessage(error)}`);
};

const GHOST_TAB_MIGRATION_WARNING = "Ghost Tab tables are not available. Run latest Supabase migrations.";
const GHOST_TAB_PARTIAL_WARNING = "Some Ghost Tab runtime rows could not be loaded.";

const normalizeAgentName = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const normalizeAmount = (value: unknown): string => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim()) && value.trim() !== "0") {
    return value.trim();
  }

  throw new Error("amount must be a positive integer.");
};

const readControllerWallet = (request: Request, body?: Record<string, unknown>, fallback = DEFAULT_DEMO_AGENT_OWNER): string => {
  const headerOwner = readOwnerHeader(request);
  const bodyOwner = typeof body?.controllerWallet === "string" ? body.controllerWallet.trim() : "";
  return headerOwner ?? (bodyOwner || fallback);
};

const calculateDailyLeft = (agent: RegisteredAgent): string => {
  const dailyCap = BigInt(agent.dailyCap);
  const spent = BigInt(agent.currentDailySpent);
  return dailyCap > spent ? (dailyCap - spent).toString() : "0";
};

const formatPolicyReason = (reason: string): string => {
  if (/live Ghost Allowance/i.test(reason)) {
    return "Ghost Allowance exceeded";
  }

  if (/remaining daily cap/i.test(reason)) {
    return "Daily cap exceeded";
  }

  return reason.replace(/\.$/, "");
};

const explorerUrl = (signature: string | null | undefined): string | null =>
  signature ? `https://explorer.solana.com/tx/${signature}?cluster=devnet` : null;

const shortSignature = (signature: string | null | undefined): string | null =>
  signature ? `${signature.slice(0, 6)}...${signature.slice(-6)}` : null;

const railLabel = (rail: string | null | undefined): string => {
  if (!rail) {
    return "Private Rail";
  }

  if (rail === "solana-devnet-native-fallback" || /native/i.test(rail)) {
    return "Solana Devnet Native Fallback";
  }

  if (rail === "magicblock-private" || rail === "magicblock-private-spl") {
    return "MagicBlock Private Rail";
  }

  return rail;
};

const serializeGhostTab = (snapshot?: GhostTabSnapshot | null) => {
  if (!snapshot?.session) {
    return null;
  }

  const session = snapshot.session;
  const nextRefillAt = snapshot.runtime.nextRefillAt;

  return {
    ...session,
    nextRefillAt,
    runtime: snapshot.runtime,
    timeline: snapshot.timeline.slice(-12).reverse(),
    events: snapshot.events.slice(-8).reverse()
  };
};

const serializeAgent = (agent: RegisteredAgent, isActive: boolean, ghostTab?: GhostTabSnapshot | null) => ({
  ...agent,
  isActive,
  dailyLeft: calculateDailyLeft(agent),
  hasApiToken: Boolean(agent.apiTokenHash),
  ghostTab: serializeGhostTab(ghostTab)
});

const serializeRecipient = (recipient: AgentRecipient, activeAgent: RegisteredAgent | null) => ({
  ...recipient,
  isDefaultForActiveAgent: Boolean(activeAgent?.defaultRecipientLabel && recipient.label === activeAgent.defaultRecipientLabel),
  isAllowedForActiveAgent: !recipient.agentId || recipient.agentId === activeAgent?.id
});

const receiptBelongsToController = (
  paymentIntent: ServerPaymentIntent,
  controllerWallet: string,
  ownedAgentIds: Set<string>
): boolean => {
  const agentPlan = paymentIntent.metadata?.agentPlan;

  if (!agentPlan) {
    return false;
  }

  return ownedAgentIds.has(agentPlan.agentId) && agentPlan.controllerWallet === controllerWallet;
};

const serializeReceipt = (paymentIntent: ServerPaymentIntent) => {
  const agentPlan = paymentIntent.metadata?.agentPlan;
  const executionRail =
    paymentIntent.metadata?.manualExecution?.executionRail ??
    agentPlan?.privateRail?.settlementRail ??
    agentPlan?.rail ??
    paymentIntent.settlementRail;
  const signature = paymentIntent.txSignature ?? paymentIntent.metadata?.manualExecution?.txSignature ?? null;
  const confirmedAt = paymentIntent.metadata?.manualExecution?.confirmedAt ?? null;
  const lifecycleState = paymentIntent.metadata?.agentLifecycle?.budgetReservationState;
  const status = signature || lifecycleState === "confirmed" ? "confirmed" : paymentIntent.status === "pending" ? "pending" : paymentIntent.status;

  return {
    id: paymentIntent.id,
    paylinkId: paymentIntent.paylinkId,
    agentId: agentPlan?.agentId ?? "unknown-agent",
    agent: agentPlan?.agentId ?? "unknown-agent",
    goal: agentPlan?.requestedGoal ?? null,
    amount: paymentIntent.amount,
    mint: paymentIntent.mint,
    requestedAmount: paymentIntent.amount,
    status,
    executionRail,
    settlementRailLabel: railLabel(executionRail),
    txSignature: signature,
    txSignatureShort: shortSignature(signature),
    explorerUrl: explorerUrl(signature),
    createdAt: paymentIntent.createdAt,
    confirmedAt,
    recipient: paymentIntent.recipient
  };
};

export const createCommandCenterHttpHandlers = (options: CommandCenterHttpOptions): CommandCenterHttpHandlers => {
  const demoControllerWallet = options.demoControllerWallet ?? DEFAULT_DEMO_AGENT_OWNER;

  const loadAgentState = async (controllerWallet: string) => {
    const budgets = await options.budgetPolicy.listBudgets();
    const ownedBudgets = budgets.filter((budget) => budget.owner === controllerWallet);
    const agents = await options.registryService.listAgents(controllerWallet, ownedBudgets);
    const activeAgent = await options.registryService.getExplicitActiveAgent(controllerWallet, ownedBudgets);
    const ghostTabs = new Map<string, GhostTabSnapshot>();
    const warnings: string[] = [];

    if (options.ghostTabService) {
      for (const budget of ownedBudgets) {
        try {
          await options.ghostTabService.ensureSessionForBudget(budget);
          ghostTabs.set(budget.agentId, await options.ghostTabService.getSnapshot(budget.agentId));
        } catch (error) {
          if (isMissingSchemaError(error)) {
            logSchemaFallback("/api/agents", "Ghost Tab schema is not migrated", error);
            warnings.push(GHOST_TAB_MIGRATION_WARNING);
            continue;
          }

          console.warn(`[Command Center] Ghost Tab runtime skipped for ${budget.agentId}: ${errorMessage(error)}`);
          warnings.push(GHOST_TAB_PARTIAL_WARNING);
        }
      }
    }

    return {
      budgets,
      ownedBudgets,
      agents,
      activeAgent,
      ghostTabs,
      warnings: uniqueWarnings(warnings)
    };
  };

  const loadAgentStateForRead = async (route: CommandCenterRouteName, controllerWallet: string) => {
    try {
      return await loadAgentState(controllerWallet);
    } catch (error) {
      if (!isMissingSchemaError(error)) {
        throw error;
      }

      logSchemaFallback(route, "Command Center schema is not fully migrated", error);
      return {
        budgets: [] as AgentBudget[],
        ownedBudgets: [] as AgentBudget[],
        agents: [] as RegisteredAgent[],
        activeAgent: null,
        ghostTabs: new Map<string, GhostTabSnapshot>(),
        warnings: [GHOST_TAB_MIGRATION_WARNING]
      };
    }
  };

  const findAgentForRequest = async (controllerWallet: string, value: unknown): Promise<RegisteredAgent> => {
    const normalized = typeof value === "string" ? normalizeAgentName(value) : "";
    const { agents } = await loadAgentState(controllerWallet);
    const agent = agents.find((candidate) => candidate.id === normalized || candidate.name === normalized);

    if (!agent) {
      throw new Error(`Agent "${normalized || "unknown"}" was not found.`);
    }

    return agent;
  };

  const getGhostSnapshotForAgent = async (
    route: CommandCenterRouteName,
    agentId: string
  ): Promise<{ ghostTab: GhostTabSnapshot | null; warning?: string }> => {
    if (!options.ghostTabService) {
      return { ghostTab: null };
    }

    try {
      return {
        ghostTab: await options.ghostTabService.getSnapshot(agentId)
      };
    } catch (error) {
      if (isMissingSchemaError(error)) {
        logSchemaFallback(route, "Ghost Tab schema is not migrated", error);
        return {
          ghostTab: null,
          warning: GHOST_TAB_MIGRATION_WARNING
        };
      }

      console.warn(`[Command Center] ${route} could not load Ghost Tab snapshot for ${agentId}: ${errorMessage(error)}`);
      return {
        ghostTab: null,
        warning: GHOST_TAB_PARTIAL_WARNING
      };
    }
  };

  return {
    listAgents: async (request) => {
      try {
        const controllerWallet = readControllerWallet(request, undefined, demoControllerWallet);
        const { agents, activeAgent, ghostTabs, warnings } = await loadAgentStateForRead("/api/agents", controllerWallet);
        logReadyOnce("agent-registry", "agent registry ready");

        return json({
          controllerWallet,
          activeAgentId: activeAgent?.id ?? null,
          agents: agents.map((agent) => serializeAgent(agent, agent.id === activeAgent?.id, ghostTabs.get(agent.id))),
          warnings
        });
      } catch (error) {
        logRouteError("/api/agents", error);
        return handleKnownError(error);
      }
    },

    createAgent: async (request) => {
      try {
        const body = await parseJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        const name = typeof body.name === "string" ? normalizeAgentName(body.name) : "";

        if (!name) {
          throw new Error("name is required.");
        }

        const totalBudget = normalizeAmount(body.totalBudget ?? "100");
        const maxLiveAllowance = normalizeAmount(body.ghostAllowanceMax ?? "20");
        const liveAllowance = normalizeAmount(body.ghostAllowanceLive ?? maxLiveAllowance);
        const refillAmount = normalizeAmount(body.ghostRefillAmount ?? "5");
        const refillIntervalMinutes =
          typeof body.ghostRefillIntervalMinutes === "number" && Number.isInteger(body.ghostRefillIntervalMinutes)
            ? body.ghostRefillIntervalMinutes
            : 10;
        const budgetInput: CreateAgentBudgetInput = {
          agentId: name,
          owner: controllerWallet,
          agentWallet: `agent:${name}`,
          mint: typeof body.mint === "string" && body.mint.trim() ? body.mint.trim() : DEFAULT_DEMO_AGENT_MINT,
          totalBudget,
          currentBalance: totalBudget,
          dailyCapPercent:
            typeof body.dailyCapPercent === "number" && Number.isInteger(body.dailyCapPercent) ? body.dailyCapPercent : 30,
          rail: "magicblock-private",
          allowPublicFallback: false,
          allowanceMode: "rolling",
          liveAllowance,
          maxLiveAllowance,
          refillAmount,
          refillIntervalMinutes,
          metadata: {
            source: "web-command-center"
          }
        };
        let budget = await options.budgetPolicy.getBudget(name);
        let alreadyExisted = Boolean(budget);

        if (!budget) {
          try {
            budget = await options.budgetPolicy.createBudget(budgetInput);
          } catch (error) {
            if (!isDuplicateKeyError(error)) {
              throw error;
            }

            const recovered = await options.budgetPolicy.getBudget(name);

            if (!recovered) {
              throw error;
            }

            budget = recovered;
            alreadyExisted = true;
          }
        }

        const agent = await options.registryService.upsertFromBudget(budget, name, "mirage-private-first");

        await options.registryService.setActiveAgent(controllerWallet, agent.id);
        const ghostSnapshot = await getGhostSnapshotForAgent("/api/agents/create", agent.id);
        const message = alreadyExisted ? "Agent Vault already exists and is now active" : "Agent Vault ready";

        return json(
          {
            controllerWallet,
            activeAgentId: agent.id,
            status: "ready",
            message,
            nextAction: "Connect your agent next",
            agent: serializeAgent(agent, true, ghostSnapshot.ghostTab),
            ...(ghostSnapshot.warning ? { warning: ghostSnapshot.warning } : {})
          },
          alreadyExisted ? 200 : 201
        );
      } catch (error) {
        logRouteError("/api/agents/create", error);
        return handleKnownError(error);
      }
    },

    generateAgentToken: async (request) => {
      try {
        const body = await parseJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        const { ownedBudgets } = await loadAgentStateForRead("/api/agents/token", controllerWallet);
        const agentName =
          typeof body.agentId === "string" && body.agentId.trim()
            ? body.agentId.trim()
            : typeof body.name === "string"
              ? body.name.trim()
              : "";

        if (!agentName) {
          throw new Error("agentId is required.");
        }

        const generated = await options.registryService.generateToken(controllerWallet, agentName, ownedBudgets);

        return json({
          controllerWallet,
          agent: serializeAgent(generated.agent, true, null),
          token: generated.token
        });
      } catch (error) {
        logRouteError("/api/agents/token", error);
        return handleKnownError(error);
      }
    },

    useAgent: async (request) => {
      try {
        const body = await parseJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        const agent = await findAgentForRequest(controllerWallet, body.agentId ?? body.name);
        await options.registryService.setActiveAgent(controllerWallet, agent.id);

        return json({
          controllerWallet,
          activeAgentId: agent.id,
          agent: serializeAgent(agent, true, options.ghostTabService ? await options.ghostTabService.getSnapshot(agent.id) : null)
        });
      } catch (error) {
        logRouteError("/api/agents/clear-active", error);
        return handleKnownError(error);
      }
    },

    clearActiveAgent: async (request) => {
      try {
        const body = await parseJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        await options.registryService.clearActiveAgent(controllerWallet);

        return json({
          controllerWallet,
          activeAgentId: null,
          message: "Active Agent Vault cleared"
        });
      } catch (error) {
        logRouteError("/api/agents/use", error);
        return handleKnownError(error);
      }
    },

    listRecipients: async (request) => {
      try {
        const controllerWallet = readControllerWallet(request, undefined, demoControllerWallet);
        const { activeAgent } = await loadAgentStateForRead("/api/recipients", controllerWallet);
        let recipients: AgentRecipient[] = [];

        try {
          recipients = await options.registryService.listRecipients(controllerWallet);
        } catch (error) {
          if (!isMissingSchemaError(error)) {
            throw error;
          }

          logSchemaFallback("/api/recipients", "recipient registry table is not migrated", error);
        }

        logReadyOnce("recipient-registry", "recipient registry ready");

        return json({
          controllerWallet,
          activeAgentId: activeAgent?.id ?? null,
          activeRecipientLabel: activeAgent?.defaultRecipientLabel ?? null,
          activeRecipientAddress: activeAgent?.defaultRecipientAddress ?? null,
          recipients: recipients.map((recipient) => serializeRecipient(recipient, activeAgent))
        });
      } catch (error) {
        logRouteError("/api/recipients", error);
        return handleKnownError(error);
      }
    },

    addRecipient: async (request) => {
      try {
        const body = await parseJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        const label = typeof body.label === "string" ? body.label : "";
        const address = typeof body.address === "string" ? body.address : "";
        const agentId = typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim() : null;
        const recipient = await options.registryService.addRecipient(controllerWallet, label, address, agentId);

        return json(
          {
            controllerWallet,
            recipient
          },
          201
        );
      } catch (error) {
        logRouteError("/api/recipients/add", error);
        return handleKnownError(error);
      }
    },

    useRecipient: async (request) => {
      try {
        const body = await parseJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        const { activeAgent } = await loadAgentState(controllerWallet);

        if (!activeAgent) {
          throw new Error("Active agent was not found.");
        }

        const label = typeof body.label === "string" ? body.label : "";
        const agent = await options.registryService.setDefaultRecipient(controllerWallet, activeAgent.id, label);

        return json({
          controllerWallet,
          activeAgentId: agent.id,
          activeRecipientLabel: agent.defaultRecipientLabel ?? null,
          activeRecipientAddress: agent.defaultRecipientAddress ?? null,
          agent: serializeAgent(agent, true, options.ghostTabService ? await options.ghostTabService.getSnapshot(agent.id) : null)
        });
      } catch (error) {
        logRouteError("/api/recipients/use", error);
        return handleKnownError(error);
      }
    },

    listReceipts: async (request) => {
      try {
        const controllerWallet = readControllerWallet(request, undefined, demoControllerWallet);
        const { agents, warnings } = await loadAgentStateForRead("/api/receipts", controllerWallet);
        const ownedAgentIds = new Set(agents.map((agent) => agent.id));
        let paymentIntents: ServerPaymentIntent[] = [];
        const receiptWarnings = [...warnings];

        try {
          paymentIntents = await options.paylinkService.listPaymentIntents();
        } catch (error) {
          if (!isMissingSchemaError(error)) {
            throw error;
          }

          logSchemaFallback("/api/receipts", "receipt/payment intent table is not migrated", error);
          receiptWarnings.push("Receipt tables are not available. Run latest Supabase migrations.");
        }

        const receipts = paymentIntents
          .filter((paymentIntent) => {
            try {
              return receiptBelongsToController(paymentIntent, controllerWallet, ownedAgentIds);
            } catch (error) {
              console.warn(`[Command Center] skipped partial receipt row: ${errorMessage(error)}`);
              receiptWarnings.push("Some receipt rows could not be loaded.");
              return false;
            }
          })
          .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
          .flatMap((paymentIntent) => {
            try {
              return [serializeReceipt(paymentIntent)];
            } catch (error) {
              console.warn(`[Command Center] skipped partial receipt row: ${errorMessage(error)}`);
              receiptWarnings.push("Some receipt rows could not be loaded.");
              return [];
            }
          });

        logReadyOnce("receipts", "receipts ready");

        return json({
          controllerWallet,
          receipts,
          warnings: uniqueWarnings(receiptWarnings)
        });
      } catch (error) {
        logRouteError("/api/receipts", error);
        return handleKnownError(error);
      }
    },

    createSpendIntent: async (request) => {
      try {
        const body = await parseJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        const { activeAgent } = await loadAgentState(controllerWallet);

        if (!activeAgent) {
          throw new Error("Active agent was not found.");
        }

        const handlers = createAgentPlanHttpHandlers({
          budgetService: options.budgetPolicy,
          paylinkService: options.paylinkService
        });
        const recipient =
          typeof body.recipient === "string" && body.recipient.trim()
            ? body.recipient.trim()
            : activeAgent.defaultRecipientAddress ?? DEFAULT_DEMO_AGENT_RECIPIENT;
        const origin = new URL(request.url).origin;
        const response = await handlers.createPlan(
          new Request(`${origin}/api/agent-plan`, {
            method: "POST",
            headers: {
              [AGENT_BUDGET_OWNER_HEADER]: controllerWallet,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              agentId: activeAgent.id,
              goal: typeof body.goal === "string" ? body.goal : "",
              amount: normalizeAmount(body.amount),
              mint: typeof body.mint === "string" && body.mint.trim() ? body.mint.trim() : DEFAULT_DEMO_AGENT_MINT,
              recipient,
              rail: activeAgent.preferredRail
            })
          })
        );
        const payload = (await response.json()) as AgentPlanPayload;

        if (payload.allowed === false) {
          return json({
            decision: "blocked",
            reason: formatPolicyReason(payload.reason ?? "Spend rejected by policy."),
            agent: activeAgent.name,
            agentId: activeAgent.id,
            receipt: payload.receipt
          });
        }

        if (payload.allowed !== true || !payload.paylinkId) {
          return errorResponse(500, "intent_failed", "Spend intent could not be created.");
        }

        return json(
          {
            decision: "approved",
            agent: activeAgent.name,
            agentId: activeAgent.id,
            paylinkId: payload.paylinkId,
            status: "pending_execution",
            rail: payload.rail ?? activeAgent.preferredRail,
            recipient
          },
          201
        );
      } catch (error) {
        logRouteError("/api/spend-intent", error);
        return handleKnownError(error);
      }
    }
  };
};
