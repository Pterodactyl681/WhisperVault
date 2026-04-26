import type { AgentBudget } from "@/lib/agent-budget";

export const AGENT_BUDGET_OWNER_HEADER = "x-agent-budget-owner";
export const AGENT_VAULTS_ENABLED_ENV = "AGENT_BUDGETS_API_ENABLED";

export interface AgentVaultAuthContext {
  owner: string;
}

export const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

export const defaultIsAgentVaultEnabled = (): boolean =>
  parseBooleanEnv(process.env[AGENT_VAULTS_ENABLED_ENV], true);

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status
  });

export const errorResponse = (status: number, code: string, message: string): Response =>
  json(
    {
      error: {
        code,
        message
      }
    },
    status
  );

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const parseJsonObject = async (request: Request): Promise<Record<string, unknown>> => {
  try {
    const body = (await request.json()) as unknown;

    if (!isRecord(body)) {
      throw new Error("Request body must be a JSON object.");
    }

    return body;
  } catch (error) {
    if (error instanceof Error && error.message === "Request body must be a JSON object.") {
      throw error;
    }

    throw new Error("Request body must be valid JSON.");
  }
};

export const readOwnerHeader = (request: Request): string | null => {
  const owner = request.headers.get(AGENT_BUDGET_OWNER_HEADER)?.trim();
  return owner || null;
};

export const requireOwner = (request: Request): AgentVaultAuthContext | Response => {
  const owner = readOwnerHeader(request);

  if (!owner) {
    // TODO: Replace this dev-only owner header with the repo's real auth/session identity once available.
    return errorResponse(401, "owner_required", `Missing ${AGENT_BUDGET_OWNER_HEADER} header.`);
  }

  return { owner };
};

export const assertOwnerMatches = (budget: AgentBudget, auth: AgentVaultAuthContext): Response | null => {
  if (budget.owner !== auth.owner) {
    // TODO: Use a session-derived owner id instead of header comparison when server auth exists.
    return errorResponse(403, "owner_mismatch", "Requested agent budget belongs to a different owner.");
  }

  return null;
};

export const handleKnownError = (error: unknown): Response => {
  if (!(error instanceof Error)) {
    return errorResponse(500, "internal_error", "Unexpected server error.");
  }

  if (
    error.message.includes("required") ||
    error.message.includes("must be") ||
    error.message.includes("Enter a valid recipient wallet address") ||
    error.message.includes("valid JSON") ||
    error.message.includes("JSON object") ||
    error.message.includes("mint mismatch") ||
    error.message.includes("unsupported rail") ||
    error.message.includes("does not belong") ||
    error.message.includes("cannot be confirmed") ||
    error.message.includes("pending or reserved")
  ) {
    return errorResponse(400, "invalid_request", error.message);
  }

  if (error.message.includes("not found")) {
    return errorResponse(404, "not_found", error.message);
  }

  if (error.message.includes("already exists")) {
    return errorResponse(409, "conflict", error.message);
  }

  return errorResponse(500, "internal_error", error.message);
};
