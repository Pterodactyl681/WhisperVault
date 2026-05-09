import assert from "node:assert/strict";
import { AgentBudgetService, DEFAULT_DEMO_AGENT_RECIPIENT } from "../lib/agent-budget";
import { OffchainAgentBudgetPolicyAdapter } from "../lib/agent-budget/policy-adapter";
import { listPendingAgentSpendExecutions } from "../lib/agent-spend/pending-execution";
import { createAgentIntentsHttpHandlers } from "../lib/agent-registry/intents-http";
import { AgentRegistryService } from "../lib/agent-registry/service";
import { InMemoryTelegramLinkRepository } from "../lib/telegram-link/repository";
import { TelegramLinkService } from "../lib/telegram-link/service";
import { TelegramCommandService } from "../lib/telegram/commands";
import { WhisperPayServerService } from "../lib/whisperpay-server/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const VALID_CONTROLLER = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const SECOND_RECIPIENT = "8Ysj8U5ZuY6JdkhZP5WHa3gwxMZ4N6k2VnYfJm6b7Qw1";
const fixedNow = (): Date => new Date("2026-05-02T10:00:00.000Z");
const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const createHarness = async () => {
  const budgetService = new AgentBudgetService({ now: fixedNow });
  const budgetPolicy = new OffchainAgentBudgetPolicyAdapter({ service: budgetService });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow,
    createId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`
  });
  const agentRegistry = new AgentRegistryService({
    now: fixedNow,
    createToken: () => "wva_test_token"
  });
  const telegramLinkService = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: fixedNow,
    createCode: () => "ABCD2345"
  });

  const coffee = await budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: VALID_CONTROLLER,
    agentWallet: "agent-wallet-coffee",
    mint: "USDC",
    totalBudget: "100",
    currentBalance: "100",
    liveAllowance: "10",
    maxLiveAllowance: "20",
    rail: "magicblock-private"
  });
  const travel = await budgetService.createAgentBudget({
    agentId: "travel-agent",
    owner: VALID_CONTROLLER,
    agentWallet: "agent-wallet-travel",
    mint: "USDC",
    totalBudget: "200",
    currentBalance: "200",
    liveAllowance: "5",
    maxLiveAllowance: "10",
    rail: "magicblock-private"
  });

  await agentRegistry.upsertFromBudget(coffee);
  await agentRegistry.upsertFromBudget(travel);

  const commandService = new TelegramCommandService({
    telegramLinkService,
    budgetPolicy,
    paylinkService,
    agentRegistry,
    origin: "http://localhost"
  });

  return {
    budgetService,
    budgetPolicy,
    paylinkService,
    agentRegistry,
    telegramLinkService,
    commandService
  };
};

const linkTelegramUser = async (telegramLinkService: TelegramLinkService): Promise<void> => {
  await telegramLinkService.createLinkCode(VALID_CONTROLLER);
  await telegramLinkService.consumeLinkCode("777", "ABCD2345");
};

const createIntent = async (
  harness: Awaited<ReturnType<typeof createHarness>>,
  token: string,
  body: Record<string, unknown>
) => {
  const handlers = createAgentIntentsHttpHandlers({
    registryService: harness.agentRegistry,
    budgetPolicy: harness.budgetPolicy,
    paylinkService: harness.paylinkService,
    origin: "http://localhost"
  });

  return handlers.createIntent(
    new Request("http://localhost/api/agent/intents", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })
  );
};

test("agent registry keeps policies isolated per agent", async () => {
  const harness = await createHarness();
  const token = (await harness.agentRegistry.generateToken(VALID_CONTROLLER, "coffee-agent", await harness.budgetPolicy.listBudgets())).token;

  const response = await createIntent(harness, token, {
    goal: "buy coffee",
    amount: 4,
    mint: "USDC",
    recipient: DEFAULT_DEMO_AGENT_RECIPIENT
  });
  const body = (await response.json()) as { decision?: string };
  const coffee = await harness.budgetPolicy.getBudget("coffee-agent");
  const travel = await harness.budgetPolicy.getBudget("travel-agent");

  assert.equal(response.status, 201);
  assert.equal(body.decision, "approved");
  assert.equal(coffee?.liveAllowance, "6");
  assert.equal(travel?.liveAllowance, "5");
});

test("agent token auth rejects missing and invalid tokens", async () => {
  const harness = await createHarness();
  const handlers = createAgentIntentsHttpHandlers({
    registryService: harness.agentRegistry,
    budgetPolicy: harness.budgetPolicy,
    paylinkService: harness.paylinkService
  });

  const missing = await handlers.createIntent(new Request("http://localhost/api/agent/intents", { method: "POST" }));
  const invalid = await createIntent(harness, "bad-token", {
    goal: "buy coffee",
    amount: 1,
    mint: "USDC",
    recipient: DEFAULT_DEMO_AGENT_RECIPIENT
  });

  assert.equal(missing.status, 401);
  assert.equal(invalid.status, 401);
});

test("external intent approval creates pending execution", async () => {
  const harness = await createHarness();
  const token = (await harness.agentRegistry.generateToken(VALID_CONTROLLER, "coffee-agent", await harness.budgetPolicy.listBudgets())).token;

  const response = await createIntent(harness, token, {
    goal: "buy coffee",
    amount: 1,
    mint: "USDC",
    recipient: DEFAULT_DEMO_AGENT_RECIPIENT
  });
  const body = (await response.json()) as { decision?: string; paylinkId?: string; status?: string; rail?: string };
  const pending = await listPendingAgentSpendExecutions({ paylinkService: harness.paylinkService });

  assert.equal(response.status, 201);
  assert.equal(body.decision, "approved");
  assert.match(body.paylinkId ?? "", /^pl_/);
  assert.equal(body.status, "pending_execution");
  assert.equal(body.rail, "magicblock-private");
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.agentId, "coffee-agent");
  assert.equal(pending[0]?.controllerWallet, VALID_CONTROLLER);
  assert.equal(pending[0]?.requestedMint, "USDC");
  assert.equal(pending[0]?.displayAmount, "1");
  assert.equal(pending[0]?.executionRail, "magicblock-private");
  assert.equal(pending[0]?.executionMode, "mirage-private-first");
  assert.equal(pending[0]?.txSignature, null);
  assert.equal(pending[0]?.confirmedAt, null);
  assert.equal(pending[0]?.status, "pending_execution");
});

test("blocked rogue intent returns blocked decision without pending execution", async () => {
  const harness = await createHarness();
  const token = (await harness.agentRegistry.generateToken(VALID_CONTROLLER, "travel-agent", await harness.budgetPolicy.listBudgets())).token;

  const response = await createIntent(harness, token, {
    goal: "buy laptop",
    amount: 30,
    mint: "USDC",
    recipient: DEFAULT_DEMO_AGENT_RECIPIENT
  });
  const body = (await response.json()) as { decision?: string; reason?: string };
  const pending = await listPendingAgentSpendExecutions({ paylinkService: harness.paylinkService });

  assert.equal(response.status, 200);
  assert.equal(body.decision, "blocked");
  assert.equal(body.reason, "Ghost Allowance exceeded");
  assert.equal(pending.length, 0);
});

test("Telegram active agent and recipient switching drive spend context", async () => {
  const harness = await createHarness();
  await linkTelegramUser(harness.telegramLinkService);

  await harness.commandService.handleTextCommand({
    telegramUserId: "777",
    text: `/recipient add office ${SECOND_RECIPIENT}`
  });
  const recipientReply = await harness.commandService.handleTextCommand({
    telegramUserId: "777",
    text: "/recipient use office"
  });

  assert.match(recipientReply, /Recipient selected/);
  assert.match(recipientReply, /coffee-agent/);

  await harness.commandService.handleTextCommand({
    telegramUserId: "777",
    text: "/agent use travel-agent"
  });
  await harness.commandService.handleTextCommand({
    telegramUserId: "777",
    text: "/recipient use office"
  });
  const spendReply = await harness.commandService.handleTextCommand({
    telegramUserId: "777",
    text: "/spend 2 buy ticket"
  });
  const [paymentIntent] = await harness.paylinkService.listPaymentIntents();

  assert.match(spendReply, /Agent\ntravel-agent/);
  assert.equal(paymentIntent?.metadata?.agentPlan?.agentId, "travel-agent");
  assert.equal(paymentIntent?.recipient, SECOND_RECIPIENT);
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

  console.log(`Completed ${passed} agent registry tests.`);
};

void run();
