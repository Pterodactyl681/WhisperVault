import { createPendingExecutionHttpHandlers } from "@/lib/agent-spend/pending-execution-http";
import { whisperPayServerService } from "@/lib/whisperpay-server";

export const dynamic = "force-dynamic";

const handlers = createPendingExecutionHttpHandlers({
  paylinkService: whisperPayServerService
});

export const GET = handlers.listPending;
