import { createDemoReadinessHttpHandlers } from "@/lib/demo-readiness/http";
import { demoReadinessService } from "@/lib/demo-readiness/server";

const handlers = createDemoReadinessHttpHandlers({
  service: demoReadinessService
});

export const dynamic = "force-dynamic";
export const POST = handlers.resetDemoState;
