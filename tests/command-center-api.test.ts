import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AgentBudgetService, DEFAULT_DEMO_AGENT_RECIPIENT, type AgentBudgetPolicyAdapter } from "../lib/agent-budget";
import { OffchainAgentBudgetPolicyAdapter } from "../lib/agent-budget/policy-adapter";
import { AGENT_BUDGET_OWNER_HEADER } from "../lib/agent-vault/http";
import { createCommandCenterHttpHandlers } from "../lib/command-center/http";
import { AgentRegistryService } from "../lib/agent-registry/service";
import { WhisperPayServerService } from "../lib/whisperpay-server/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const VALID_CONTROLLER = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const SECOND_RECIPIENT = "8Ysj8U5ZuY6JdkhZP5WHa3gwxMZ4N6k2VnYfJm6b7Qw1";
const fixedNow = (): Date => new Date("2026-05-09T10:00:00.000Z");
const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const createHarness = async () => {
  const budgetService = new AgentBudgetService({ now: fixedNow });
  const budgetPolicy = new OffchainAgentBudgetPolicyAdapter({ service: budgetService });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow,
    createId: (prefix) => `${prefix}_test_${Math.random().toString(36).slice(2, 8)}`
  });
  const agentRegistry = new AgentRegistryService({ now: fixedNow });
  const handlers = createCommandCenterHttpHandlers({
    registryService: agentRegistry,
    budgetPolicy,
    paylinkService
  });

  return {
    budgetService,
    budgetPolicy,
    paylinkService,
    agentRegistry,
    handlers
  };
};

const withOwner = (body?: Record<string, unknown>): RequestInit => ({
  method: body ? "POST" : "GET",
  headers: {
    [AGENT_BUDGET_OWNER_HEADER]: VALID_CONTROLLER,
    "Content-Type": "application/json"
  },
  ...(body ? { body: JSON.stringify(body) } : {})
});

const readJson = async <T>(response: Response): Promise<T> => (await response.json()) as T;

const createAgent = async (harness: Awaited<ReturnType<typeof createHarness>>, name = "coffee-agent") => {
  const response = await harness.handlers.createAgent(new Request("http://localhost/api/agents/create", withOwner({ name })));
  assert.equal(response.status, 201);
  return readJson<{ agent: { id: string; name: string; isActive: boolean } }>(response);
};

test("agents API lists, creates, and switches active agents", async () => {
  const harness = await createHarness();
  await createAgent(harness, "coffee-agent");
  await createAgent(harness, "travel-agent");

  const useResponse = await harness.handlers.useAgent(
    new Request("http://localhost/api/agents/use", withOwner({ agentId: "coffee-agent" }))
  );
  const listResponse = await harness.handlers.listAgents(new Request("http://localhost/api/agents", withOwner()));
  const body = await readJson<{
    activeAgentId: string;
    agents: Array<{ name: string; ghostAllowanceLive: string; ghostAllowanceMax: string; dailyLeft: string; isActive: boolean }>;
  }>(listResponse);

  assert.equal(useResponse.status, 200);
  assert.equal(body.activeAgentId, "coffee-agent");
  assert.equal(body.agents.length, 2);
  assert.equal(body.agents.find((agent) => agent.name === "coffee-agent")?.isActive, true);
  assert.equal(body.agents.find((agent) => agent.name === "travel-agent")?.ghostAllowanceMax, "20");
  assert.equal(body.agents.find((agent) => agent.name === "coffee-agent")?.dailyLeft, "30");
});

test("recipients API adds and selects default recipient for the active agent", async () => {
  const harness = await createHarness();
  await createAgent(harness);

  const addResponse = await harness.handlers.addRecipient(
    new Request("http://localhost/api/recipients/add", withOwner({ label: "office", address: SECOND_RECIPIENT }))
  );
  const useResponse = await harness.handlers.useRecipient(
    new Request("http://localhost/api/recipients/use", withOwner({ label: "office" }))
  );
  const listResponse = await harness.handlers.listRecipients(new Request("http://localhost/api/recipients", withOwner()));
  const listBody = await readJson<{
    activeRecipientLabel: string;
    activeRecipientAddress: string;
    recipients: Array<{ label: string; isDefaultForActiveAgent: boolean }>;
  }>(listResponse);

  assert.equal(addResponse.status, 201);
  assert.equal(useResponse.status, 200);
  assert.equal(listBody.activeRecipientLabel, "office");
  assert.equal(listBody.activeRecipientAddress, SECOND_RECIPIENT);
  assert.equal(listBody.recipients.find((recipient) => recipient.label === "office")?.isDefaultForActiveAgent, true);
});

test("spend intent API approves policy-valid spends and creates pending execution", async () => {
  const harness = await createHarness();
  await createAgent(harness);

  const response = await harness.handlers.createSpendIntent(
    new Request(
      "http://localhost/api/spend-intent",
      withOwner({
        amount: "1",
        mint: "USDC",
        goal: "buy coffee",
        recipient: DEFAULT_DEMO_AGENT_RECIPIENT
      })
    )
  );
  const body = await readJson<{ decision: string; paylinkId: string; status: string; rail: string }>(response);
  const paymentIntents = await harness.paylinkService.listPaymentIntents();

  assert.equal(response.status, 201);
  assert.equal(body.decision, "approved");
  assert.match(body.paylinkId, /^pl_/);
  assert.equal(body.status, "pending_execution");
  assert.equal(body.rail, "magicblock-private");
  assert.equal(paymentIntents.length, 1);
  assert.equal(paymentIntents[0]?.metadata?.agentPlan?.agentId, "coffee-agent");
  assert.equal(paymentIntents[0]?.metadata?.agentPlan?.controllerWallet, VALID_CONTROLLER);
});

test("spend intent API blocks over-allowance spends without creating receipts", async () => {
  const harness = await createHarness();
  await createAgent(harness);

  const response = await harness.handlers.createSpendIntent(
    new Request(
      "http://localhost/api/spend-intent",
      withOwner({
        amount: "30",
        mint: "USDC",
        goal: "buy gear",
        recipient: DEFAULT_DEMO_AGENT_RECIPIENT
      })
    )
  );
  const body = await readJson<{ decision: string; reason: string }>(response);

  assert.equal(response.status, 200);
  assert.equal(body.decision, "blocked");
  assert.equal(body.reason, "Ghost Allowance exceeded");
  assert.equal((await harness.paylinkService.listPaymentIntents()).length, 0);
});

test("receipts API returns confirmed native fallback receipts with explorer links", async () => {
  const harness = await createHarness();
  await createAgent(harness);

  const spendResponse = await harness.handlers.createSpendIntent(
    new Request(
      "http://localhost/api/spend-intent",
      withOwner({
        amount: "1",
        mint: "USDC",
        goal: "buy coffee",
        recipient: DEFAULT_DEMO_AGENT_RECIPIENT
      })
    )
  );
  const spendBody = await readJson<{ paylinkId: string }>(spendResponse);
  const txSignature = "5".repeat(88);

  await harness.paylinkService.confirmManualAgentSpend({
    paylinkId: spendBody.paylinkId,
    txSignature,
    executor: "solana-devnet-native-fallback",
    executionRail: "solana-devnet-native-fallback",
    mirageAttempted: true,
    mirageError: "Mirage unavailable in test"
  });

  const receiptsResponse = await harness.handlers.listReceipts(new Request("http://localhost/api/receipts", withOwner()));
  const body = await readJson<{ receipts: Array<{ paylinkId: string; status: string; settlementRailLabel: string; explorerUrl: string | null }> }>(
    receiptsResponse
  );

  assert.equal(receiptsResponse.status, 200);
  assert.equal(body.receipts[0]?.paylinkId, spendBody.paylinkId);
  assert.equal(body.receipts[0]?.status, "confirmed");
  assert.equal(body.receipts[0]?.settlementRailLabel, "Solana Devnet Native Fallback");
  assert.equal(body.receipts[0]?.explorerUrl, `https://explorer.solana.com/tx/${txSignature}?cluster=devnet`);
});

test("dashboard source renders agent list and Ghost Allowance surfaces", async () => {
  const source = readFileSync(path.join(process.cwd(), "app", "command-center", "page-client.tsx"), "utf8");

  assert.match(source, /Agent List/);
  assert.match(source, /Ghost Allowance/);
  assert.match(source, /Spend Intent Panel/);
  assert.match(source, /\/api\/agents/);
});

test("read-only Command Center APIs return empty arrays when schema is missing", async () => {
  const schemaError = new Error('Supabase GET whispervault_agents failed with 404 Error: relation "whispervault_agents" does not exist');
  const handlers = createCommandCenterHttpHandlers({
    budgetPolicy: {
      mode: "offchain",
      listBudgets: async () => {
        throw schemaError;
      }
    } as unknown as AgentBudgetPolicyAdapter,
    registryService: {
      listAgents: async () => {
        throw schemaError;
      },
      getActiveAgent: async () => {
        throw schemaError;
      },
      listRecipients: async () => {
        throw schemaError;
      }
    } as unknown as AgentRegistryService,
    paylinkService: {
      listPaymentIntents: async () => {
        throw schemaError;
      }
    } as unknown as WhisperPayServerService
  });

  const agents = await readJson<{ agents: unknown[] }>(
    await handlers.listAgents(new Request("http://localhost/api/agents", withOwner()))
  );
  const recipients = await readJson<{ recipients: unknown[] }>(
    await handlers.listRecipients(new Request("http://localhost/api/recipients", withOwner()))
  );
  const receipts = await readJson<{ receipts: unknown[] }>(
    await handlers.listReceipts(new Request("http://localhost/api/receipts", withOwner()))
  );

  assert.deepEqual(agents.agents, []);
  assert.deepEqual(recipients.recipients, []);
  assert.deepEqual(receipts.receipts, []);
});

test("combined Command Center schema safety migration includes required tables", async () => {
  const source = readFileSync(path.join(process.cwd(), "migrations", "0006_command_center_combined_schema.sql"), "utf8");

  assert.match(source, /create table if not exists whispervault_agents/);
  assert.match(source, /create table if not exists whispervault_agent_recipients/);
  assert.match(source, /create table if not exists whisperpay_payment_intents/);
  assert.match(source, /create table if not exists whispervault_ghost_tab_sessions/);
  assert.match(source, /add column if not exists pending_execution jsonb/);
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

  console.log(`Completed ${passed} command center API tests.`);
};

void run();
