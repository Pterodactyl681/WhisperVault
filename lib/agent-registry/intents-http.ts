import { AGENT_BUDGET_OWNER_HEADER, errorResponse, handleKnownError, json, parseJsonObject } from "../agent-vault/http";
import { createAgentPlanHttpHandlers } from "../agent-plan/http";
import type { AgentBudgetPolicyAdapter } from "../agent-budget";
import type { WhisperPayServerService } from "../whisperpay-server";
import type { AgentRegistryService } from "./service";

interface AgentIntentsHttpOptions {
  registryService: AgentRegistryService;
  budgetPolicy: AgentBudgetPolicyAdapter;
  paylinkService: WhisperPayServerService;
  origin?: string;
}

interface AgentIntentsHttpHandlers {
  createIntent: (request: Request) => Promise<Response>;
}

const readBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const normalizeAmount = (value: unknown): string => {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim()) && value.trim() !== "0") {
    return value.trim();
  }

  throw new Error("amount must be a positive integer.");
};

const formatPolicyReason = (reason: string): string => {
  if (/live Ghost Allowance/i.test(reason)) {
    return "Ghost Allowance exceeded";
  }

  if (/remaining daily cap/i.test(reason)) {
    return "Daily budget exceeded";
  }

  return reason.replace(/\.$/, "");
};

export const createAgentIntentsHttpHandlers = (options: AgentIntentsHttpOptions): AgentIntentsHttpHandlers => ({
  createIntent: async (request) => {
    const token = readBearerToken(request);

    if (!token) {
      return errorResponse(401, "agent_token_required", "Missing bearer agent token.");
    }

    const agent = await options.registryService.resolveAgentByToken(token);

    if (!agent) {
      return errorResponse(401, "agent_token_invalid", "Invalid agent token.");
    }

    try {
      const body = await parseJsonObject(request);
      const recipient = typeof body.recipient === "string" ? body.recipient : agent.defaultRecipientAddress ?? "";
      const recipients = await options.registryService.listRecipients(agent.controllerWallet);
      const agentScopedRecipients = recipients.filter((candidate) => candidate.agentId === agent.id);

      if (
        agentScopedRecipients.length > 0 &&
        !agentScopedRecipients.some((candidate) => candidate.address === recipient)
      ) {
        return json({
          decision: "blocked",
          reason: "Recipient not allowed"
        });
      }

      const handlers = createAgentPlanHttpHandlers({
        budgetService: options.budgetPolicy,
        paylinkService: options.paylinkService
      });
      const origin = options.origin ?? new URL(request.url).origin;
      const response = await handlers.createPlan(
        new Request(`${origin}/api/agent-plan`, {
          method: "POST",
          headers: {
            [AGENT_BUDGET_OWNER_HEADER]: agent.controllerWallet,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            agentId: agent.id,
            goal: typeof body.goal === "string" ? body.goal : "",
            amount: normalizeAmount(body.amount),
            mint: typeof body.mint === "string" ? body.mint : "USDC",
            recipient,
            rail: agent.preferredRail
          })
        })
      );
      const payload = (await response.json()) as {
        allowed?: boolean;
        reason?: string;
        paylinkId?: string;
        rail?: string;
        receipt?: unknown;
      };

      if (payload.allowed === false) {
        return json({
          decision: "blocked",
          reason: formatPolicyReason(payload.reason ?? "Spend rejected by policy."),
          receipt: payload.receipt
        });
      }

      if (payload.allowed !== true || !payload.paylinkId) {
        return errorResponse(500, "intent_failed", "Agent intent could not be created.");
      }

      return json(
        {
          decision: "approved",
          agent: agent.name,
          agentId: agent.id,
          paylinkId: payload.paylinkId,
          status: "pending_execution",
          rail: payload.rail ?? agent.preferredRail
        },
        201
      );
    } catch (error) {
      return handleKnownError(error);
    }
  }
});
