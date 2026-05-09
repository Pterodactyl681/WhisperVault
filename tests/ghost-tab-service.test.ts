import assert from "node:assert/strict";
import { AgentBudgetService } from "../lib/agent-budget";
import { OffchainAgentBudgetPolicyAdapter } from "../lib/agent-budget/policy-adapter";
import { GhostTabPolicyAdapter } from "../lib/ghost-tab/policy-adapter";
import { InMemoryGhostTabRepository } from "../lib/ghost-tab/repository";
import { GhostTabService } from "../lib/ghost-tab/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const createClock = (iso: string) => {
  let current = new Date(iso);

  return {
    now: () => new Date(current),
    set: (nextIso: string) => {
      current = new Date(nextIso);
    }
  };
};

const createBudget = async (budgetService: AgentBudgetService, overrides: Partial<Parameters<AgentBudgetService["createAgentBudget"]>[0]> = {}) =>
  budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: "controller-wallet",
    agentWallet: "agent-wallet",
    mint: "USDC",
    totalBudget: "100",
    currentBalance: "100",
    liveAllowance: "10",
    maxLiveAllowance: "20",
    refillAmount: "5",
    refillIntervalMinutes: 10,
    rail: "magicblock-private",
    ...overrides
  });

test("Ghost Tab lazy refill ticks cap live allowance and persist timeline", async () => {
  const clock = createClock("2026-05-10T10:00:00.000Z");
  const service = new GhostTabService({
    repository: new InMemoryGhostTabRepository(),
    now: clock.now
  });
  const budgetService = new AgentBudgetService({ now: clock.now });
  const budget = await createBudget(budgetService);

  await service.openFromBudget(budget);
  clock.set("2026-05-10T10:30:00.000Z");

  const session = await service.getSession("coffee-agent");
  const snapshot = await service.getSnapshot("coffee-agent");

  assert.equal(session?.allowanceLive, "20");
  assert.equal(session?.totalRefilled, "10");
  assert.equal(snapshot.events.some((event) => event.type === "refill_tick" && event.amount === "10"), true);
});

test("Ghost Tab pause and resume stop refill backfill while paused", async () => {
  const clock = createClock("2026-05-10T10:00:00.000Z");
  const service = new GhostTabService({
    repository: new InMemoryGhostTabRepository(),
    now: clock.now
  });
  const budgetService = new AgentBudgetService({ now: clock.now });
  const budget = await createBudget(budgetService, { liveAllowance: "0" });

  await service.openFromBudget(budget);
  await service.pause("coffee-agent");
  clock.set("2026-05-10T10:40:00.000Z");
  assert.equal((await service.getSession("coffee-agent"))?.allowanceLive, "0");

  await service.resume("coffee-agent");
  clock.set("2026-05-10T10:50:00.000Z");
  const session = await service.getSession("coffee-agent");
  const snapshot = await service.getSnapshot("coffee-agent");

  assert.equal(session?.status, "active");
  assert.equal(session?.allowanceLive, "5");
  assert.deepEqual(
    snapshot.events.filter((event) => event.type === "paused" || event.type === "resumed").map((event) => event.type),
    ["paused", "resumed"]
  );
});

test("Ghost Tab expiry rejects spends and executes clawback bookkeeping", async () => {
  const clock = createClock("2026-05-10T10:00:00.000Z");
  const service = new GhostTabService({
    repository: new InMemoryGhostTabRepository(),
    now: clock.now
  });
  const budgetService = new AgentBudgetService({ now: clock.now });
  const budget = await createBudget(budgetService, {
    sessionEndsAt: "2026-05-10T10:10:00.000Z"
  });

  await service.openFromBudget(budget);
  clock.set("2026-05-10T10:11:00.000Z");
  const decision = await service.evaluateSpend("coffee-agent", "1");
  const snapshot = await service.getSnapshot("coffee-agent");

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "Ghost Tab expired.");
  assert.equal(decision.session.status, "expired");
  assert.equal(decision.session.allowanceLive, "0");
  assert.equal(decision.session.clawbackExecuted, true);
  assert.equal(decision.session.totalClawedBack, "10");
  assert.equal(snapshot.events.some((event) => event.type === "expired"), true);
  assert.equal(snapshot.events.some((event) => event.type === "clawback" && event.amount === "10"), true);
});

test("Ghost Tab close claws back remaining allowance", async () => {
  const clock = createClock("2026-05-10T10:00:00.000Z");
  const service = new GhostTabService({
    repository: new InMemoryGhostTabRepository(),
    now: clock.now
  });
  const budgetService = new AgentBudgetService({ now: clock.now });
  const budget = await createBudget(budgetService);

  await service.openFromBudget(budget);
  const session = await service.close("coffee-agent");

  assert.equal(session.status, "clawed_back");
  assert.equal(session.allowanceLive, "0");
  assert.equal(session.totalClawedBack, "10");
});

test("Ghost Tab policy adapter decrements session allowance on approved spend", async () => {
  const clock = createClock("2026-05-10T10:00:00.000Z");
  const budgetService = new AgentBudgetService({ now: clock.now });
  const basePolicy = new OffchainAgentBudgetPolicyAdapter({ service: budgetService });
  const ghostTabService = new GhostTabService({
    repository: new InMemoryGhostTabRepository(),
    now: clock.now
  });
  const policy = new GhostTabPolicyAdapter({ basePolicy, ghostTabService });

  await policy.createBudget({
    agentId: "coffee-agent",
    owner: "controller-wallet",
    agentWallet: "agent-wallet",
    mint: "USDC",
    totalBudget: "100",
    currentBalance: "100",
    liveAllowance: "10",
    maxLiveAllowance: "20",
    refillAmount: "5",
    refillIntervalMinutes: 10,
    rail: "magicblock-private"
  });
  const receipt = await policy.reserveSpend("coffee-agent", "3", { reason: "coffee", paylinkId: "pl_1" });
  const snapshot = await ghostTabService.getSnapshot("coffee-agent");

  assert.equal(receipt.ghostAllowanceBefore, "10");
  assert.equal(receipt.ghostAllowanceAfter, "7");
  assert.equal(snapshot.session?.allowanceLive, "7");
  assert.equal(snapshot.session?.totalSpent, "3");
  assert.equal(snapshot.events.some((event) => event.type === "spend_approved" && event.amount === "3"), true);
});

test("Ghost Tab policy adapter blocks expired sessions before reservation", async () => {
  const clock = createClock("2026-05-10T10:00:00.000Z");
  const budgetService = new AgentBudgetService({ now: clock.now });
  const basePolicy = new OffchainAgentBudgetPolicyAdapter({ service: budgetService });
  const ghostTabService = new GhostTabService({
    repository: new InMemoryGhostTabRepository(),
    now: clock.now
  });
  const policy = new GhostTabPolicyAdapter({ basePolicy, ghostTabService });

  await policy.createBudget({
    agentId: "coffee-agent",
    owner: "controller-wallet",
    agentWallet: "agent-wallet",
    mint: "USDC",
    totalBudget: "100",
    currentBalance: "100",
    liveAllowance: "10",
    maxLiveAllowance: "20",
    refillAmount: "5",
    refillIntervalMinutes: 10,
    sessionEndsAt: "2026-05-10T10:05:00.000Z",
    rail: "magicblock-private"
  });

  clock.set("2026-05-10T10:06:00.000Z");
  const decision = await policy.canSpend("coffee-agent", "1");
  const snapshot = await ghostTabService.getSnapshot("coffee-agent");

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "Ghost Tab expired.");
  assert.equal(snapshot.events.some((event) => event.type === "spend_blocked"), true);
  assert.equal((await basePolicy.canSpend("coffee-agent", "1")).reservedAmount, "0");
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

  console.log(`Completed ${passed} Ghost Tab lifecycle tests.`);
};

void run();
