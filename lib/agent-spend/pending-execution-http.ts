import { errorResponse, json } from "../agent-vault/http";
import type { WhisperPayServerService } from "../whisperpay-server/service";
import { listPendingAgentSpendExecutions } from "./pending-execution";
import { isWorkerAuthorized } from "./worker-auth";

interface PendingExecutionHttpHandlers {
  listPending: (request: Request) => Promise<Response>;
}

interface PendingExecutionHttpOptions {
  paylinkService: WhisperPayServerService;
  env?: NodeJS.ProcessEnv;
}

export const createPendingExecutionHttpHandlers = (
  options: PendingExecutionHttpOptions
): PendingExecutionHttpHandlers => ({
  listPending: async (request) => {
    if (!isWorkerAuthorized(request, options.env)) {
      return errorResponse(401, "worker_unauthorized", "Worker authorization failed.");
    }

    const pending = await listPendingAgentSpendExecutions({
      paylinkService: options.paylinkService
    });

    return json({
      pending
    });
  }
});
