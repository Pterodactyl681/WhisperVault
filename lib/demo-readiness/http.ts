import { DEFAULT_DEMO_AGENT_OWNER } from "../agent-budget";
import { AGENT_BUDGET_OWNER_HEADER, errorResponse, handleKnownError, json } from "../agent-vault/http";
import type { DemoReadinessService } from "./service";

interface DemoReadinessHttpOptions {
  service: DemoReadinessService;
  env?: NodeJS.ProcessEnv;
  demoControllerWallet?: string;
}

interface DemoReadinessHttpHandlers {
  resetDemoState: (request: Request) => Promise<Response>;
}

const readSecret = (env: NodeJS.ProcessEnv): string | null => {
  const demoSecret = env.DEMO_ADMIN_SECRET?.trim();
  const workerSecret = env.WHISPERVAULT_WORKER_SECRET?.trim();
  return demoSecret || workerSecret || null;
};

const readRequestSecret = (request: Request): string | null => {
  const auth = request.headers.get("authorization")?.trim() ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  return (
    bearer ||
    request.headers.get("x-demo-admin-secret")?.trim() ||
    request.headers.get("x-worker-secret")?.trim() ||
    null
  );
};

const isAuthorized = (request: Request, env: NodeJS.ProcessEnv): boolean => {
  const configuredSecret = readSecret(env);

  if (!configuredSecret) {
    console.warn("[Demo Readiness] /api/demo/reset is running without DEMO_ADMIN_SECRET or WHISPERVAULT_WORKER_SECRET.");
    return true;
  }

  return readRequestSecret(request) === configuredSecret;
};

const readOptionalJsonObject = async (request: Request): Promise<Record<string, unknown>> => {
  const body = await request.text();

  if (!body.trim()) {
    return {};
  }

  const parsed = JSON.parse(body) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
};

const readControllerWallet = (
  request: Request,
  body: Record<string, unknown>,
  fallback: string
): string => {
  const headerOwner = request.headers.get(AGENT_BUDGET_OWNER_HEADER)?.trim();
  const bodyOwner = typeof body.controllerWallet === "string" ? body.controllerWallet.trim() : "";
  return headerOwner || bodyOwner || fallback;
};

export const createDemoReadinessHttpHandlers = (options: DemoReadinessHttpOptions): DemoReadinessHttpHandlers => {
  const env = options.env ?? process.env;
  const demoControllerWallet = options.demoControllerWallet ?? DEFAULT_DEMO_AGENT_OWNER;

  return {
    resetDemoState: async (request) => {
      if (!isAuthorized(request, env)) {
        return errorResponse(401, "unauthorized", "Demo reset requires DEMO_ADMIN_SECRET or WHISPERVAULT_WORKER_SECRET.");
      }

      try {
        const body = await readOptionalJsonObject(request);
        const controllerWallet = readControllerWallet(request, body, demoControllerWallet);
        const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";

        if (mode === "clear") {
          const result = await options.service.clear(controllerWallet);

          return json({
            ready: false,
            cleared: result.cleared,
            controllerWallet: result.controllerWallet,
            activeAgent: null,
            activeAgentId: null,
            ghostAllowance: "0/0 USDC",
            pendingCount: 0
          });
        }

        const result = await options.service.reset(controllerWallet);

        return json({
          ready: true,
          controllerWallet: result.controllerWallet,
          activeAgent: result.activeAgent.name,
          activeAgentId: result.activeAgent.id,
          ghostAllowance: `${result.budget.liveAllowance}/${result.budget.maxLiveAllowance} ${result.budget.mint}`,
          recipient: result.recipient.displayLabel,
          recipientAddress: result.recipient.address,
          archivedPendingCount: result.archivedPendingCount,
          pendingCount: result.pendingCount,
          lastConfirmedTx: result.lastConfirmedTx
        });
      } catch (error) {
        console.error(`[Demo Readiness] /api/demo/reset failed: ${error instanceof Error ? error.message : String(error)}`);
        return handleKnownError(error);
      }
    }
  };
};
