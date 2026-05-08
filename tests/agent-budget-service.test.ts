import assert from "node:assert/strict";
import { AgentBudgetService } from "../lib/agent-budget";

const fixedClock = (iso: string): (() => Date) => () => new Date(iso);

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

test("createAgentBudget stores defaults and returns the created budget", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  const budget = await service.createAgentBudget({
    agentId: "agent-alpha",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "1000",
    rail: "magicblock-private",
    metadata: {
      tier: "mvp"
    }
  });

  assert.deepEqual(budget, {
    agentId: "agent-alpha",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "1000",
    currentBalance: "1000",
    dailyCapPercent: 30,
    spentToday: "0",
    lastResetAt: "2026-04-25T10:00:00.000Z",
    status: "active",
    rail: "magicblock-private",
    allowPublicFallback: false,
    allowanceMode: "rolling",
    liveAllowance: "10",
    refillAmount: "5",
    refillIntervalMinutes: 10,
    maxLiveAllowance: "20",
    lastRefillAt: "2026-04-25T10:00:00.000Z",
    sessionEndsAt: null,
    clawbackOnSessionEnd: true,
    metadata: {
      tier: "mvp"
    }
  });

  assert.deepEqual(await service.getAgentBudget("agent-alpha"), budget);
  assert.deepEqual(await service.listAgentBudgets(), [budget]);
});

test("reserve and confirm allow spends under the safer daily cap", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-beta",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "1000",
    currentBalance: "200",
    allowanceMode: "static",
    rail: "public-solana"
  });

  const allowed = await service.canSpend("agent-beta", "50");
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.dailyCap, "60");
  assert.equal(allowed.remainingDailyCap, "60");

  const reserved = await service.reserveSpend("agent-beta", "50", {
    paylinkId: "pl_123"
  });

  assert.equal(reserved.reservedAmount, "50");
  assert.equal(reserved.reference, "pl_123");
  assert.equal(reserved.paylinkId, "pl_123");

  const afterReserve = await service.canSpend("agent-beta", "11");
  assert.equal(afterReserve.allowed, false);
  assert.equal(afterReserve.remainingDailyCap, "10");

  const confirmed = await service.confirmSpend("agent-beta", "50", "pay_123");
  assert.equal(confirmed.paymentId, "pay_123");
  assert.equal(confirmed.reservedAmount, "0");
  assert.equal(confirmed.budget.currentBalance, "150");
  assert.equal(confirmed.budget.spentToday, "50");
});

test("rejects spends that exceed the remaining daily cap", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-gamma",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "1000",
    currentBalance: "200",
    allowanceMode: "static",
    rail: "magicblock-private"
  });

  const decision = await service.canSpend("agent-gamma", "61");
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "Requested spend exceeds the remaining daily cap.");

  await assert.rejects(
    () => service.reserveSpend("agent-gamma", "61", "over-cap"),
    /remaining daily cap/
  );
});

test("resetDailyIfNeeded clears spentToday once the UTC day changes", async () => {
  let now = "2026-04-25T23:55:00.000Z";
  const service = new AgentBudgetService({
    now: () => new Date(now)
  });

  await service.createAgentBudget({
    agentId: "agent-delta",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "1000",
    spentToday: "200",
    lastResetAt: "2026-04-24T08:00:00.000Z",
    rail: "magicblock-private"
  });

  const reset = await service.resetDailyIfNeeded("agent-delta");
  assert.equal(reset.spentToday, "0");
  assert.equal(reset.lastResetAt, "2026-04-25T23:55:00.000Z");

  now = "2026-04-25T23:59:59.000Z";
  const unchanged = await service.resetDailyIfNeeded("agent-delta");
  assert.equal(unchanged.spentToday, "0");
  assert.equal(unchanged.lastResetAt, "2026-04-25T23:55:00.000Z");
});

test("paused and exhausted budgets reject spends", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-paused",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "1000",
    status: "paused",
    rail: "public-solana"
  });

  await service.createAgentBudget({
    agentId: "agent-exhausted",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "1000",
    currentBalance: "0",
    rail: "magicblock-private"
  });

  const paused = await service.canSpend("agent-paused", "1");
  const exhausted = await service.canSpend("agent-exhausted", "1");

  assert.equal(paused.allowed, false);
  assert.equal(paused.reason, "Agent budget is paused.");
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.reason, "Agent budget is exhausted.");
});

test("handles integer-safe amounts beyond Number.MAX_SAFE_INTEGER", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-whale",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "900719925474099312345",
    currentBalance: "900719925474099312345",
    allowanceMode: "static",
    rail: "magicblock-private"
  });

  const reservation = await service.reserveSpend("agent-whale", "123456789012345678", "ops");
  assert.equal(reservation.amount, "123456789012345678");

  const release = await service.releaseReservedSpend("agent-whale", "23456789012345678", "ops");
  assert.equal(release.releasedAmount, "23456789012345678");
  assert.equal(release.reservedAmount, "100000000000000000");

  const confirmation = await service.confirmSpend("agent-whale", "100000000000000000", "pay_whale");
  assert.equal(confirmation.budget.currentBalance, "900619925474099312345");
  assert.equal(confirmation.budget.spentToday, "100000000000000000");
});

test("lazy refill increases liveAllowance", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:25:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-refill",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "100",
    liveAllowance: "5",
    refillAmount: "5",
    refillIntervalMinutes: 10,
    maxLiveAllowance: "20",
    lastRefillAt: "2026-04-25T10:00:00.000Z",
    rail: "magicblock-private"
  });

  const decision = await service.canSpend("agent-refill", "1");
  assert.equal(decision.budget.liveAllowance, "15");
  assert.equal(decision.budget.lastRefillAt, "2026-04-25T10:20:00.000Z");
});

test("liveAllowance caps at maxLiveAllowance", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T11:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-cap",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "100",
    liveAllowance: "18",
    refillAmount: "5",
    refillIntervalMinutes: 10,
    maxLiveAllowance: "20",
    lastRefillAt: "2026-04-25T10:00:00.000Z",
    rail: "magicblock-private"
  });

  const decision = await service.canSpend("agent-cap", "1");
  assert.equal(decision.budget.liveAllowance, "20");
});

test("approved spend decrements liveAllowance", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-decrement",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "100",
    rail: "magicblock-private"
  });

  const reserved = await service.reserveSpend("agent-decrement", "4", "coffee");
  assert.equal(reserved.ghostAllowanceBefore, "10");
  assert.equal(reserved.ghostAllowanceAfter, "6");
  assert.equal(reserved.budget.liveAllowance, "6");
});

test("blocked spend does not decrement liveAllowance", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-blocked",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "100",
    currentBalance: "100",
    liveAllowance: "3",
    rail: "magicblock-private"
  });

  const decision = await service.canSpend("agent-blocked", "4");
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "Requested spend exceeds live Ghost Allowance.");

  await assert.rejects(() => service.reserveSpend("agent-blocked", "4", "coffee"), /Ghost Allowance/);
  assert.equal((await service.getAgentBudget("agent-blocked"))?.liveAllowance, "3");
});

test("daily cap still blocks before allowance", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-daily-cap",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "100",
    currentBalance: "100",
    dailyCapPercent: 10,
    liveAllowance: "20",
    rail: "magicblock-private"
  });

  const decision = await service.canSpend("agent-daily-cap", "11");
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "Requested spend exceeds the remaining daily cap.");
});

test("expired session blocks and claws back liveAllowance", async () => {
  const service = new AgentBudgetService({
    now: fixedClock("2026-04-25T10:00:00.000Z")
  });

  await service.createAgentBudget({
    agentId: "agent-expired",
    owner: "owner-wallet",
    mint: "usdc-mint",
    totalBudget: "100",
    liveAllowance: "10",
    sessionEndsAt: "2026-04-25T09:59:00.000Z",
    rail: "magicblock-private"
  });

  const decision = await service.canSpend("agent-expired", "1");
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "Agent session has ended; live Ghost Allowance was clawed back.");
  assert.equal(decision.budget.liveAllowance, "0");
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

  console.log(`Completed ${passed} agent budget tests.`);
};

void run();
