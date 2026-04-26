import { AgentBudgetService } from "./service";
import { asAgentBudgetPolicyAdapter, type AgentBudgetPolicyAdapter } from "./policy-adapter";
import type { AgentBudget, CreateAgentBudgetInput } from "./types";
import {
  AGENT_BUDGET_OWNER_HEADER,
  type AgentVaultAuthContext,
  assertOwnerMatches,
  defaultIsAgentVaultEnabled,
  errorResponse,
  handleKnownError,
  isRecord,
  json,
  parseJsonObject,
  requireOwner
} from "../agent-vault/http";

export { AGENT_BUDGET_OWNER_HEADER } from "../agent-vault/http";

type RouteParams = {
  params: {
    agentId: string;
  };
};

interface AgentBudgetHttpHandlers {
  createBudget: (request: Request) => Promise<Response>;
  listBudgets: (request: Request) => Promise<Response>;
  getBudget: (request: Request, context: RouteParams) => Promise<Response>;
  checkSpend: (request: Request, context: RouteParams) => Promise<Response>;
  pauseBudget: (request: Request, context: RouteParams) => Promise<Response>;
  resumeBudget: (request: Request, context: RouteParams) => Promise<Response>;
}

interface AgentBudgetHttpOptions {
  service?: AgentBudgetService;
  policyAdapter?: AgentBudgetPolicyAdapter;
  isEnabled?: () => boolean;
}

interface CheckSpendBody {
  amount?: unknown;
  mint?: unknown;
  reason?: unknown;
}

const sanitizeBudget = (budget: AgentBudget): AgentBudget => ({
  ...budget,
  metadata: budget.metadata ? (JSON.parse(JSON.stringify(budget.metadata)) as AgentBudget["metadata"]) : undefined
});

const sanitizeBudgets = (budgets: AgentBudget[]): AgentBudget[] => budgets.map((budget) => sanitizeBudget(budget));

const parseCreateInput = (body: Record<string, unknown>): CreateAgentBudgetInput => ({
  agentId: typeof body.agentId === "string" ? body.agentId : "",
  owner: typeof body.owner === "string" ? body.owner : "",
  agentWallet: typeof body.agentWallet === "string" ? body.agentWallet : undefined,
  mint: typeof body.mint === "string" ? body.mint : "",
  totalBudget:
    typeof body.totalBudget === "string" || typeof body.totalBudget === "bigint" ? body.totalBudget : "",
  currentBalance:
    typeof body.currentBalance === "string" || typeof body.currentBalance === "bigint"
      ? body.currentBalance
      : undefined,
  dailyCapPercent: typeof body.dailyCapPercent === "number" ? body.dailyCapPercent : undefined,
  spentToday:
    typeof body.spentToday === "string" || typeof body.spentToday === "bigint" ? body.spentToday : undefined,
  lastResetAt: typeof body.lastResetAt === "string" ? body.lastResetAt : undefined,
  status:
    body.status === "active" || body.status === "paused" || body.status === "exhausted" ? body.status : undefined,
  rail: body.rail === "magicblock-private" || body.rail === "public-solana" ? body.rail : ("magicblock-private" as const),
  allowPublicFallback: typeof body.allowPublicFallback === "boolean" ? body.allowPublicFallback : undefined,
  metadata: isRecord(body.metadata) ? body.metadata : undefined
});

const parseCheckSpendBody = (body: Record<string, unknown>): CheckSpendBody => ({
  amount: body.amount,
  mint: body.mint,
  reason: body.reason
});

const parseAmountString = (value: unknown): string => {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim()) || value.trim() === "0") {
    throw new Error("amount must be a non-zero integer-safe decimal string.");
  }

  return value.trim();
};

export const createAgentBudgetHttpHandlers = (options: AgentBudgetHttpOptions): AgentBudgetHttpHandlers => {
  const { isEnabled = defaultIsAgentVaultEnabled } = options;
  const policyAdapter = options.policyAdapter ?? asAgentBudgetPolicyAdapter(options.service ?? new AgentBudgetService());

  const ensureEnabled = (): Response | null => {
    if (!isEnabled()) {
      return errorResponse(503, "feature_disabled", "Agent budget API is disabled.");
    }

    return null;
  };

  const requireOwnedBudget = async (
    request: Request,
    agentId: string
  ): Promise<{ auth: AgentVaultAuthContext; budget: AgentBudget } | Response> => {
    const auth = requireOwner(request);

    if (auth instanceof Response) {
      return auth;
    }

    const budget = await policyAdapter.getBudget(agentId);

    if (!budget) {
      return errorResponse(404, "not_found", `Agent budget not found for agent "${agentId}".`);
    }

    const ownerError = assertOwnerMatches(budget, auth);

    if (ownerError) {
      return ownerError;
    }

    return {
      auth,
      budget
    };
  };

  return {
    createBudget: async (request) => {
      const disabled = ensureEnabled();

      if (disabled) {
        return disabled;
      }

      const auth = requireOwner(request);

      if (auth instanceof Response) {
        return auth;
      }

      try {
        const body = await parseJsonObject(request);
        const input = parseCreateInput(body);

        if (input.owner !== auth.owner) {
          return errorResponse(403, "owner_mismatch", "Authenticated owner does not match request body owner.");
        }

        const budget = await policyAdapter.createBudget(input);

        return json(
          {
            budget: sanitizeBudget(budget)
          },
          201
        );
      } catch (error) {
        return handleKnownError(error);
      }
    },
    listBudgets: async (request) => {
      const disabled = ensureEnabled();

      if (disabled) {
        return disabled;
      }

      const auth = requireOwner(request);

      if (auth instanceof Response) {
        return auth;
      }

      try {
        const budgets = await policyAdapter.listBudgets();
        const ownedBudgets = budgets.filter((budget) => budget.owner === auth.owner);

        return json({
          budgets: sanitizeBudgets(ownedBudgets)
        });
      } catch (error) {
        return handleKnownError(error);
      }
    },
    getBudget: async (request, context) => {
      const disabled = ensureEnabled();

      if (disabled) {
        return disabled;
      }

      try {
        const ownedBudget = await requireOwnedBudget(request, context.params.agentId);

        if (ownedBudget instanceof Response) {
          return ownedBudget;
        }

        return json({
          budget: sanitizeBudget(ownedBudget.budget)
        });
      } catch (error) {
        return handleKnownError(error);
      }
    },
    checkSpend: async (request, context) => {
      const disabled = ensureEnabled();

      if (disabled) {
        return disabled;
      }

      try {
        const ownedBudget = await requireOwnedBudget(request, context.params.agentId);

        if (ownedBudget instanceof Response) {
          return ownedBudget;
        }

        const body = parseCheckSpendBody(await parseJsonObject(request));
        const amount = parseAmountString(body.amount);

        if (typeof body.mint !== "string" || !body.mint.trim()) {
          return errorResponse(400, "invalid_request", "mint is required.");
        }

        if (body.mint.trim() !== ownedBudget.budget.mint) {
          return errorResponse(400, "invalid_request", "mint mismatch for this agent budget.");
        }

        const decision = await policyAdapter.canSpend(context.params.agentId, amount);

        return json({
          agentId: context.params.agentId,
          allowed: decision.allowed,
          rejected: !decision.allowed,
          remainingDailyCap: decision.remainingDailyCap,
          reason: decision.reason,
          request: {
            amount,
            mint: body.mint.trim(),
            reason: typeof body.reason === "string" ? body.reason.trim() || null : null
          },
          policy:
            "Daily cap is enforced as dailyCapPercent% of the smaller of currentBalance and totalBudget, using integer-safe arithmetic. Reserved spend also counts against the remaining daily cap.",
          budgetStatus: ownedBudget.budget.status
        });
      } catch (error) {
        return handleKnownError(error);
      }
    },
    pauseBudget: async (request, context) => {
      const disabled = ensureEnabled();

      if (disabled) {
        return disabled;
      }

      try {
        const ownedBudget = await requireOwnedBudget(request, context.params.agentId);

        if (ownedBudget instanceof Response) {
          return ownedBudget;
        }

        const budget = await policyAdapter.pauseBudget(context.params.agentId);

        return json({
          budget: sanitizeBudget(budget)
        });
      } catch (error) {
        return handleKnownError(error);
      }
    },
    resumeBudget: async (request, context) => {
      const disabled = ensureEnabled();

      if (disabled) {
        return disabled;
      }

      try {
        const ownedBudget = await requireOwnedBudget(request, context.params.agentId);

        if (ownedBudget instanceof Response) {
          return ownedBudget;
        }

        const budget = await policyAdapter.resumeBudget(context.params.agentId);

        return json({
          budget: sanitizeBudget(budget)
        });
      } catch (error) {
        return handleKnownError(error);
      }
    }
  };
};
