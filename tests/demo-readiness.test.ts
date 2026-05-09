import assert from "node:assert/strict";
import { AgentBudgetService } from "../lib/agent-budget";
import { AGENT_BUDGET_OWNER_HEADER } from "../lib/agent-vault/http";
import { AgentRegistryService } from "../lib/agent-registry";
import { createAgentPlanHttpHandlers } from "../lib/agent-plan/http";
import { listPendingAgentSpendExecutions } from "../lib/agent-spend/pending-execution";
import { DemoReadinessService, createDemoReadinessHttpHandlers } from "../lib/demo-readiness";
import { GhostTabService } from "../lib/ghost-tab/service";
import { WhisperPayServerService } from "../lib/whisperpay-server/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const VALID_RECIPIENT = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const OWNER = "demo-controller";

const fixedNow = () => new Date("2026-05-10T09:00:00.000Z");

const withOwner = (owner: string, init?: RequestInit): RequestInit => ({
  ...init,
  headers: (() => {
    const headers = new Headers(init?.headers);
    headers.set(AGENT_BUDGET_OWNER_HEADER, owner);
    return headers;
  })()
});

const readJson = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;

const createHarness = () => {
  let ghostId = 0;
  const budgetService = new AgentBudgetService({
    now: fixedNow
  });
  const registryService = new AgentRegistryService({
    now: fixedNow
  });
  const ghostTabService = new GhostTabService({
    now: fixedNow,
    createId: (prefix) => `${prefix}_demo_${++ghostId}`
  });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow,
    createId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 8)}`
  });
  const demoService = new DemoReadinessService({
    budgetService,
    registryService,
    ghostTabService,
    paylinkService,
    now: fixedNow
  });
  const planHandlers = createAgentPlanHttpHandlers({
    budgetService,
    paylinkService
  });
  const demoHandlers = createDemoReadinessHttpHandlers({
    service: demoService,
    env: {
      DEMO_ADMIN_SECRET: "demo-secret"
    } as unknown as NodeJS.ProcessEnv
  });

  return {
    budgetService,
    registryService,
    ghostTabService,
    paylinkService,
    demoService,
    planHandlers,
    demoHandlers
  };
};

const createPendingSpend = async (
  planHandlers: ReturnType<typeof createAgentPlanHttpHandlers>,
  amount = "1"
): Promise<string> => {
  const response = await planHandlers.createPlan(
    new Request(
      "http://localhost/api/agent-plan",
      withOwner(OWNER, {
        method: "POST",
        body: JSON.stringify({
          agentId: "coffee-agent",
          goal: "buy coffee",
          amount,
          mint: "USDC",
          recipient: VALID_RECIPIENT
        })
      })
    )
  );

  assert.equal(response.status, 201);
  const body = await readJson<{ paylinkId: string }>(response);
  return body.paylinkId;
};

test("demo reset creates the missing coffee agent", async () => {
  const { demoService, budgetService, registryService } = createHarness();

  const result = await demoService.reset(OWNER);
  const budget = await budgetService.getAgentBudget("coffee-agent");
  const activeAgent = await registryService.getActiveAgent(OWNER, budget ? [budget] : []);

  assert.equal(result.activeAgent.name, "coffee-agent");
  assert.equal(budget?.owner, OWNER);
  assert.equal(budget?.dailyCapPercent, 30);
  assert.equal(budget?.spentToday, "0");
  assert.equal(budget?.liveAllowance, "20");
  assert.equal(budget?.maxLiveAllowance, "20");
  assert.equal(activeAgent?.id, "coffee-agent");
});

test("demo reset selects the demo recipient", async () => {
  const { demoService, registryService, budgetService } = createHarness();

  await demoService.reset(OWNER);
  const budget = await budgetService.getAgentBudget("coffee-agent");
  const activeAgent = await registryService.getActiveAgent(OWNER, budget ? [budget] : []);
  const recipients = await registryService.listRecipients(OWNER);

  assert.equal(activeAgent?.defaultRecipientLabel, "demo-merchant");
  assert.equal(activeAgent?.defaultRecipientAddress, VALID_RECIPIENT);
  assert.deepEqual(
    recipients.map((recipient) => ({ label: recipient.label, address: recipient.address, agentId: recipient.agentId })),
    [{ label: "demo-merchant", address: VALID_RECIPIENT, agentId: "coffee-agent" }]
  );
});

test("demo reset clears stale pending executions without hiding receipts", async () => {
  const { demoService, planHandlers, paylinkService } = createHarness();

  await demoService.reset(OWNER);
  const paylinkId = await createPendingSpend(planHandlers);
  assert.equal((await listPendingAgentSpendExecutions({ paylinkService })).length, 1);

  const result = await demoService.reset(OWNER);
  const paymentIntent = await paylinkService.getPaymentIntentByPaylinkId(paylinkId);

  assert.equal(result.archivedPendingCount, 1);
  assert.equal((await listPendingAgentSpendExecutions({ paylinkService })).length, 0);
  assert.equal(paymentIntent?.metadata?.agentLifecycle?.budgetReservationState, "released");
  assert.equal(paymentIntent?.metadata?.agentLifecycle?.releasedReason, "demo_archived");
  assert.equal(paymentIntent?.metadata?.demoArchived?.reason, "demo_archived");
});

test("demo status shows the last confirmed transaction", async () => {
  const { demoService, planHandlers, paylinkService } = createHarness();

  await demoService.reset(OWNER);
  const paylinkId = await createPendingSpend(planHandlers);
  await paylinkService.confirmManualAgentSpend({
    paylinkId,
    txSignature: "confirmed-demo-signature-123456789",
    executor: "native-fallback",
    executionRail: "solana-devnet-native-fallback",
    mirageAttempted: true
  });

  const status = await demoService.status(OWNER);

  assert.equal(status.activeAgentName, "coffee-agent");
  assert.equal(status.ghostAllowanceLive, "20");
  assert.equal(status.ghostAllowanceMax, "20");
  assert.equal(status.lastConfirmedTx, "confirmed-demo-signature-123456789");
  assert.equal(status.lastConfirmedPaylinkId, paylinkId);
});

test("demo reset HTTP endpoint requires the configured secret", async () => {
  const { demoHandlers } = createHarness();

  const rejected = await demoHandlers.resetDemoState(
    new Request("http://localhost/api/demo/reset", withOwner(OWNER, { method: "POST" }))
  );

  assert.equal(rejected.status, 401);

  const accepted = await demoHandlers.resetDemoState(
    new Request("http://localhost/api/demo/reset", {
      method: "POST",
      headers: {
        [AGENT_BUDGET_OWNER_HEADER]: OWNER,
        Authorization: "Bearer demo-secret"
      }
    })
  );

  assert.equal(accepted.status, 200);
  assert.equal((await readJson<{ ready: boolean; activeAgent: string }>(accepted)).activeAgent, "coffee-agent");
});

const run = async (): Promise<void> => {
  let passed = 0;

  for (const testCase of testCases) {
    try {
      await testCase.run();
      passed += 1;
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      console.error(`FAIL ${testCase.name}`);
      throw error;
    }
  }

  console.log(`Completed ${passed} demo readiness tests.`);
};

void run();
