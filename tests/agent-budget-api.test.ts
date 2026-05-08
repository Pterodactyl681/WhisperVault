import assert from "node:assert/strict";
import { AgentBudgetService } from "../lib/agent-budget";
import { AGENT_BUDGET_OWNER_HEADER, createAgentBudgetHttpHandlers } from "../lib/agent-budget/http";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const createHandlers = (isEnabled = true) => {
  const service = new AgentBudgetService({
    now: () => new Date("2026-04-25T10:00:00.000Z")
  });

  return createAgentBudgetHttpHandlers({
    service,
    isEnabled: () => isEnabled
  });
};

const withOwner = (owner: string, init?: RequestInit): RequestInit => ({
  ...init,
  headers: (() => {
    const headers = new Headers(init?.headers);
    headers.set(AGENT_BUDGET_OWNER_HEADER, owner);
    return headers;
  })()
});

const readJson = async (response: Response): Promise<unknown> => response.json();

const defaultGhostAllowance = {
  allowanceMode: "rolling",
  liveAllowance: "10",
  refillAmount: "5",
  refillIntervalMinutes: 10,
  maxLiveAllowance: "20",
  lastRefillAt: "2026-04-25T10:00:00.000Z",
  sessionEndsAt: null,
  clawbackOnSessionEnd: true
} as const;

test("agent budget API supports create, list, read, check-spend, pause, and resume happy paths", async () => {
  const handlers = createHandlers();

  const createResponse = await handlers.createBudget(
    new Request("http://localhost/api/agent-budgets", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "agent-alpha",
        owner: "owner-alpha",
        mint: "usdc-mint",
        totalBudget: "1000",
        currentBalance: "200",
        rail: "magicblock-private"
      })
    }))
  );

  assert.equal(createResponse.status, 201);
  assert.deepEqual(await readJson(createResponse), {
    budget: {
      agentId: "agent-alpha",
      owner: "owner-alpha",
      mint: "usdc-mint",
      totalBudget: "1000",
      currentBalance: "200",
      dailyCapPercent: 30,
      spentToday: "0",
      lastResetAt: "2026-04-25T10:00:00.000Z",
      status: "active",
      rail: "magicblock-private",
      allowPublicFallback: false,
      ...defaultGhostAllowance
    }
  });

  const listResponse = await handlers.listBudgets(
    new Request("http://localhost/api/agent-budgets", withOwner("owner-alpha"))
  );

  assert.equal(listResponse.status, 200);
  assert.deepEqual(await readJson(listResponse), {
    budgets: [
      {
        agentId: "agent-alpha",
        owner: "owner-alpha",
        mint: "usdc-mint",
        totalBudget: "1000",
        currentBalance: "200",
        dailyCapPercent: 30,
        spentToday: "0",
        lastResetAt: "2026-04-25T10:00:00.000Z",
        status: "active",
        rail: "magicblock-private",
        allowPublicFallback: false,
        ...defaultGhostAllowance
      }
    ]
  });

  const getResponse = await handlers.getBudget(
    new Request("http://localhost/api/agent-budgets/agent-alpha", withOwner("owner-alpha")),
    { params: { agentId: "agent-alpha" } }
  );

  assert.equal(getResponse.status, 200);

  const checkResponse = await handlers.checkSpend(
    new Request("http://localhost/api/agent-budgets/agent-alpha/check-spend", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        amount: "5",
        mint: "usdc-mint",
        reason: "invoice"
      })
    })),
    { params: { agentId: "agent-alpha" } }
  );

  assert.equal(checkResponse.status, 200);
  assert.deepEqual(await readJson(checkResponse), {
    agentId: "agent-alpha",
    allowed: true,
    rejected: false,
    remainingDailyCap: "60",
    reason: null,
    request: {
      amount: "5",
      mint: "usdc-mint",
      reason: "invoice"
    },
    policy:
      "Daily cap is enforced as dailyCapPercent% of the smaller of currentBalance and totalBudget, using integer-safe arithmetic. Reserved spend also counts against the remaining daily cap.",
    budgetStatus: "active"
  });

  const pauseResponse = await handlers.pauseBudget(
    new Request("http://localhost/api/agent-budgets/agent-alpha/pause", withOwner("owner-alpha", { method: "POST" })),
    { params: { agentId: "agent-alpha" } }
  );

  assert.equal(pauseResponse.status, 200);
  assert.equal((await readJson(pauseResponse) as { budget: { status: string } }).budget.status, "paused");

  const resumeResponse = await handlers.resumeBudget(
    new Request("http://localhost/api/agent-budgets/agent-alpha/resume", withOwner("owner-alpha", { method: "POST" })),
    { params: { agentId: "agent-alpha" } }
  );

  assert.equal(resumeResponse.status, 200);
  assert.equal((await readJson(resumeResponse) as { budget: { status: string } }).budget.status, "active");
});

test("check-spend returns a rejection when the budget limit is exceeded", async () => {
  const handlers = createHandlers();

  await handlers.createBudget(
    new Request("http://localhost/api/agent-budgets", withOwner("owner-beta", {
      method: "POST",
      body: JSON.stringify({
        agentId: "agent-beta",
        owner: "owner-beta",
        mint: "usdc-mint",
        totalBudget: "1000",
        currentBalance: "200",
        rail: "public-solana"
      })
    }))
  );

  const response = await handlers.checkSpend(
    new Request("http://localhost/api/agent-budgets/agent-beta/check-spend", withOwner("owner-beta", {
      method: "POST",
      body: JSON.stringify({
        amount: "61",
        mint: "usdc-mint",
        reason: "too-much"
      })
    })),
    { params: { agentId: "agent-beta" } }
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    agentId: "agent-beta",
    allowed: false,
    rejected: true,
    remainingDailyCap: "60",
    reason: "Requested spend exceeds the remaining daily cap.",
    request: {
      amount: "61",
      mint: "usdc-mint",
      reason: "too-much"
    },
    policy:
      "Daily cap is enforced as dailyCapPercent% of the smaller of currentBalance and totalBudget, using integer-safe arithmetic. Reserved spend also counts against the remaining daily cap.",
    budgetStatus: "active"
  });
});

test("feature flag disabled returns a disabled response", async () => {
  const handlers = createHandlers(false);

  const response = await handlers.listBudgets(
    new Request("http://localhost/api/agent-budgets", withOwner("owner-alpha"))
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "feature_disabled",
      message: "Agent budget API is disabled."
    }
  });
});

test("invalid amount validation returns 400", async () => {
  const handlers = createHandlers();

  await handlers.createBudget(
    new Request("http://localhost/api/agent-budgets", withOwner("owner-gamma", {
      method: "POST",
      body: JSON.stringify({
        agentId: "agent-gamma",
        owner: "owner-gamma",
        mint: "usdc-mint",
        totalBudget: "1000",
        rail: "magicblock-private"
      })
    }))
  );

  const response = await handlers.checkSpend(
    new Request("http://localhost/api/agent-budgets/agent-gamma/check-spend", withOwner("owner-gamma", {
      method: "POST",
      body: JSON.stringify({
        amount: "12.5",
        mint: "usdc-mint"
      })
    })),
    { params: { agentId: "agent-gamma" } }
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "invalid_request",
      message: "amount must be a non-zero integer-safe decimal string."
    }
  });
});

test("owner mismatch is rejected by the dev-safe owner guard", async () => {
  const handlers = createHandlers();

  await handlers.createBudget(
    new Request("http://localhost/api/agent-budgets", withOwner("owner-delta", {
      method: "POST",
      body: JSON.stringify({
        agentId: "agent-delta",
        owner: "owner-delta",
        mint: "usdc-mint",
        totalBudget: "1000",
        rail: "magicblock-private"
      })
    }))
  );

  const response = await handlers.getBudget(
    new Request("http://localhost/api/agent-budgets/agent-delta", withOwner("other-owner")),
    { params: { agentId: "agent-delta" } }
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "owner_mismatch",
      message: "Requested agent budget belongs to a different owner."
    }
  });
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

  console.log(`Completed ${passed} agent budget API tests.`);
};

void run();
