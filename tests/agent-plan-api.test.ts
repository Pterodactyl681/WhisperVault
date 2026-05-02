import assert from "node:assert/strict";
import { AgentBudgetService, DEFAULT_DEMO_AGENT_RECIPIENT } from "../lib/agent-budget";
import { createAgentPlanHttpHandlers } from "../lib/agent-plan/http";
import { AGENT_BUDGET_OWNER_HEADER } from "../lib/agent-vault/http";
import { WhisperPayServerService } from "../lib/whisperpay-server/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const fixedNow = (): Date => new Date("2026-04-25T10:00:00.000Z");
const VALID_RECIPIENT = DEFAULT_DEMO_AGENT_RECIPIENT;

const createHarness = (isEnabled = true) => {
  const budgetService = new AgentBudgetService({
    now: fixedNow
  });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow
  });
  const handlers = createAgentPlanHttpHandlers({
    budgetService,
    paylinkService,
    isEnabled: () => isEnabled
  });

  return {
    budgetService,
    paylinkService,
    handlers
  };
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

const createBudget = async (budgetService: AgentBudgetService, overrides?: Partial<Parameters<AgentBudgetService["createAgentBudget"]>[0]>) =>
  budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: "owner-alpha",
    agentWallet: "agent-wallet-alpha",
    mint: "USDC_OR_MINT_ADDRESS",
    totalBudget: "100",
    currentBalance: "100",
    rail: "magicblock-private",
    ...overrides
  });

test("successful agent plan creates a private paylink and reserves budget", async () => {
  const { budgetService, paylinkService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT,
        category: "coffee",
        rail: "magicblock-private"
      })
    }))
  );

  assert.equal(response.status, 201);
  const body = (await readJson(response)) as Record<string, unknown>;
  assert.equal(body.allowed, true);
  assert.equal(body.amount, "5");
  assert.equal(body.privacyMode, "private");
  assert.equal(body.allowPublicFallback, false);
  assert.equal(body.remainingDailyCap, "25");
  assert.match(String(body.paylinkId), /^pl_/);
  assert.equal(body.memoPreview, `whisperpay:agent:coffee-agent:paylink:${body.paylinkId}`);
  assert.equal(body.paylinkUrl, `http://localhost/pay/${body.paylinkId}`);
  assert.deepEqual(body.receipt, {
    type: "agent-private-receipt",
    agentId: "coffee-agent",
    runtime: "Claude + Mirage",
    goal: "buy coffee for 5 USDC",
    category: "coffee",
    amount: "5",
    mint: "USDC_OR_MINT_ADDRESS",
    recipient: VALID_RECIPIENT,
    paylinkId: body.paylinkId,
    paylinkUrl: body.paylinkUrl,
    policy: {
      decision: "approved",
      dailyCapPercent: 30,
      remainingDailyCapBefore: "30",
      remainingDailyCapAfter: "25"
    },
    reservation: {
      amountReserved: "5",
      totalReservedAfter: "5",
      state: "reserved"
    },
    execution: {
      rail: "magicblock-private",
      visibility: "private",
      fallback: "off",
      mirageReady: true,
      status: "Mirage command ready",
      instruction: "Execution pending — run Mirage command manually"
    },
    memo: {
      preview: body.memoPreview,
      reveal: "permissioned"
    },
    payment: {
      status: "pending",
      mode: "manual",
      label: "Payment status: Pending/manual"
    }
  });
  assert.equal(body.executionStatus, "Mirage command ready");
  assert.equal(body.executionInstruction, "Execution pending — run Mirage command manually");
  assert.equal(body.paymentStatus, "Payment status: Pending/manual");
  assert.deepEqual(body.mirage, {
    walletName: "agent-treasury",
    displayCommand: `mirage transfer --wallet agent-treasury --to ${VALID_RECIPIENT} --mint USDC_OR_MINT_ADDRESS --amount 5 --visibility private --cluster devnet --memo whisperpay:agent:coffee-agent:paylink:${body.paylinkId} --min-delay-ms 500 --max-delay-ms 5000 --split 4`,
    argv: [
      "transfer",
      "--wallet",
      "agent-treasury",
      "--to",
      VALID_RECIPIENT,
      "--mint",
      "USDC_OR_MINT_ADDRESS",
      "--amount",
      "5",
      "--visibility",
      "private",
      "--cluster",
      "devnet",
      "--memo",
      `whisperpay:agent:coffee-agent:paylink:${body.paylinkId}`,
      "--min-delay-ms",
      "500",
      "--max-delay-ms",
      "5000",
      "--split",
      "4"
    ],
    warnings: [
      "Preview only. WhisperPay does not execute Mirage commands in this step.",
      "Do not add passphrases, private keys, seed phrases, or auth tokens to this command."
    ]
  });

  const paylinks = await paylinkService.listPaylinks();
  assert.equal(paylinks.length, 1);
  assert.equal(paylinks[0]?.isActive, true);

  const paymentIntents = await paylinkService.listPaymentIntents();
  assert.equal(paymentIntents.length, 1);
  assert.equal(paymentIntents[0]?.paylinkId, body.paylinkId);

  const followupDecision = await budgetService.canSpend("coffee-agent", "26");
  assert.equal(followupDecision.allowed, false);
  assert.equal(followupDecision.remainingDailyCap, "25");
});

test("rejected agent plan does not create a paylink and does not reserve budget", async () => {
  const { budgetService, paylinkService, handlers } = createHarness();
  await createBudget(budgetService, {
    currentBalance: "10"
  });

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "11",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT
      })
    }))
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    allowed: false,
    reason: "Requested spend exceeds available balance.",
    remainingDailyCap: "3",
    policy: {
      dailyCapPercent: 30,
      spentToday: "0",
      currentBalance: "10"
    },
    receipt: {
      type: "agent-policy-decision",
      decision: "rejected",
      reason: "Requested spend exceeds available balance.",
      agentId: "coffee-agent",
      runtime: "Claude + Mirage",
      goal: "buy coffee for 5 USDC",
      amount: "11",
      mint: "USDC_OR_MINT_ADDRESS",
      policy: {
        dailyCapPercent: 30,
        remainingDailyCap: "3",
        spentToday: "0",
        currentBalance: "10"
      },
      artifacts: {
        paylinkCreated: false,
        mirageCommandGenerated: false
      }
    }
  });

  assert.equal((await paylinkService.listPaylinks()).length, 0);
  assert.equal((await paylinkService.listPaymentIntents()).length, 0);

  const decision = await budgetService.canSpend("coffee-agent", "3");
  assert.equal(decision.allowed, true);
  assert.equal(decision.remainingDailyCap, "3");
});

test("created paylink and payment intent include agent metadata", async () => {
  const { budgetService, paylinkService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT,
        category: "coffee"
      })
    }))
  );

  assert.equal(response.status, 201);
  const body = (await readJson(response)) as { paylinkId: string; memoPreview: string };

  const paylink = await paylinkService.getPaylink(body.paylinkId);
  const paymentIntent = (await paylinkService.listPaymentIntents())[0];

  assert.deepEqual(paylink?.metadata?.agentPlan, {
    agentId: "coffee-agent",
    category: "coffee",
    requestedGoal: "buy coffee for 5 USDC",
    rail: "magicblock-private",
    privacyMode: "private",
    allowPublicFallback: false,
    budgetPolicySnapshot: {
      dailyCapPercent: 30,
      spentToday: "0",
      remainingDailyCapBefore: "30",
      remainingDailyCapAfter: "25"
    },
    memo: body.memoPreview,
    privateRail: {
      settlementRail: "magicblock-private-spl",
      magicPrivateEnabled: true,
      memoSource: "agent-spend",
      reveal: {
        source: "magicblock-private-memo",
        authorization: "magicblock-permission-membership"
      },
      budgetVaultPermissionHook: "not-connected"
    },
    receipt: {
      type: "agent-private-receipt",
      memoReveal: "permissioned",
      mode: "manual"
    }
  });

  assert.deepEqual(paymentIntent?.metadata?.agentPlan, paylink?.metadata?.agentPlan);
  assert.equal(paylink?.metadata?.telegram, undefined);
  assert.equal(paymentIntent?.metadata?.telegram, undefined);
});

test("public agent plan API rejects injected telegram metadata", async () => {
  const { budgetService, paylinkService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT,
        telegram: {
          source: "telegram",
          telegramUserId: "777",
          telegramChatId: "987654321"
        }
      })
    }))
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "invalid_request",
      message: "telegram metadata is only allowed for Telegram command spends."
    }
  });
  assert.equal((await paylinkService.listPaylinks()).length, 0);
  assert.equal((await paylinkService.listPaymentIntents()).length, 0);
});

test("agent spend metadata is available to private memo reveal context", async () => {
  const { budgetService, paylinkService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT,
        category: "coffee"
      })
    }))
  );

  assert.equal(response.status, 201);
  const [paymentIntent] = await paylinkService.listPaymentIntents();
  assert.ok(paymentIntent);

  const context = await paylinkService.getAgentSpendPrivateRailContext(paymentIntent.id);

  assert.deepEqual(context, {
    paymentIntentId: paymentIntent.id,
    paylinkId: paymentIntent.paylinkId,
    agentId: "coffee-agent",
    goal: "buy coffee for 5 USDC",
    category: "coffee",
    amount: "5",
    mint: "USDC_OR_MINT_ADDRESS",
    recipient: VALID_RECIPIENT,
    settlementRail: "magicblock-private-spl",
    allowPublicFallback: false,
    memo: `whisperpay:agent:coffee-agent:paylink:${paymentIntent.paylinkId}`,
    receipt: {
      type: "agent-private-receipt",
      memoReveal: "permissioned",
      mode: "manual"
    },
    reveal: {
      source: "magicblock-private-memo",
      authorization: "magicblock-permission-membership"
    },
    budgetVaultPermissionHook: "not-connected"
  });

  const access = await paylinkService.checkAgentSpendMemoRevealAccess({
    paymentIntentId: paymentIntent.id,
    walletAddress: VALID_RECIPIENT,
    routerRpcUrl: "https://devnet-router.magicblock.app",
    permissionedAccount: null
  });

  assert.equal(access.context?.agentId, "coffee-agent");
  assert.equal(access.access?.allowed, false);
  assert.equal(access.access?.reason, "permission-account-missing");
});

test("allowPublicFallback defaults to false", async () => {
  const { budgetService, paylinkService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT
      })
    }))
  );

  assert.equal(response.status, 201);
  assert.equal((await readJson(response) as { allowPublicFallback: boolean }).allowPublicFallback, false);

  const [paylink] = await paylinkService.listPaylinks();
  const [paymentIntent] = await paylinkService.listPaymentIntents();

  assert.equal(paylink?.metadata?.allowPublicFallback, false);
  assert.equal(paymentIntent?.metadata?.allowPublicFallback, false);
});

test("invalid amount is rejected", async () => {
  const { budgetService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5.2",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT
      })
    }))
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "invalid_request",
      message: "amount must be a non-zero integer-safe decimal string."
    }
  });
});

test("missing recipient is rejected", async () => {
  const { budgetService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS"
      })
    }))
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "invalid_request",
      message: "Enter a valid recipient wallet address."
    }
  });
});

test("invalid recipient is rejected before artifacts are created", async () => {
  const { budgetService, paylinkService, handlers } = createHarness();
  await createBudget(budgetService);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: "кикикики"
      })
    }))
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "invalid_request",
      message: "Enter a valid recipient wallet address."
    }
  });
  assert.equal((await paylinkService.listPaylinks()).length, 0);
  assert.equal((await paylinkService.listPaymentIntents()).length, 0);
  const body = (await budgetService.canSpend("coffee-agent", "30"));

  assert.equal(body.allowed, true);
  assert.equal(body.reservedAmount, "0");
});

test("agent vault feature flag disabled blocks the endpoint", async () => {
  const { handlers } = createHarness(false);

  const response = await handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner("owner-alpha", {
      method: "POST",
      body: JSON.stringify({
        agentId: "coffee-agent",
        goal: "buy coffee for 5 USDC",
        amount: "5",
        mint: "USDC_OR_MINT_ADDRESS",
        recipient: VALID_RECIPIENT
      })
    }))
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "feature_disabled",
      message: "Agent Vault API is disabled."
    }
  });
});

test("existing non-agent paylink flow is unaffected", async () => {
  const paylinkService = new WhisperPayServerService({
    now: fixedNow
  });

  const paylink = await paylinkService.createPaylink({
    ownerWallet: VALID_RECIPIENT,
    nickname: "plain paylink",
    defaultToken: "USDC"
  });
  const paymentIntent = await paylinkService.createPaymentIntent({
    paylinkId: paylink.id,
    fromWallet: "sender-wallet",
    toWallet: VALID_RECIPIENT,
    amount: "5",
    mint: "USDC_OR_MINT_ADDRESS",
    recipient: VALID_RECIPIENT,
    settlementRail: "sol-public",
    tokenSymbol: "USDC"
  });

  assert.equal(paylink.isActive, true);
  assert.equal(paylink.metadata, undefined);
  assert.equal(paymentIntent.status, "pending");
  assert.equal(paymentIntent.metadata, undefined);
  assert.equal(await paylinkService.getAgentSpendPrivateRailContext(paymentIntent.id), null);
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

  console.log(`Completed ${passed} agent plan API tests.`);
};

void run();
