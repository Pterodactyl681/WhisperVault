import assert from "node:assert/strict";
import { AgentBudgetService, DEFAULT_DEMO_AGENT_RECIPIENT } from "../lib/agent-budget";
import { AgentPaymentLifecycleService } from "../lib/agent-payment-lifecycle";
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
const VALID_SIGNATURE = "5".repeat(88);

const createHarness = () => {
  const budgetService = new AgentBudgetService({
    now: fixedNow
  });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow
  });
  const lifecycleService = new AgentPaymentLifecycleService({
    budgetService,
    paylinkService,
    now: fixedNow
  });
  paylinkService.attachAgentPaymentLifecycle(lifecycleService);

  return {
    budgetService,
    lifecycleService,
    paylinkService
  };
};

const seedAgentPayment = async () => {
  const harness = createHarness();
  await harness.budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: "owner-alpha",
    agentWallet: "agent-wallet-alpha",
    mint: "USDC_OR_MINT_ADDRESS",
    totalBudget: "100",
    currentBalance: "100",
    rail: "magicblock-private"
  });

  const artifacts = await harness.paylinkService.createAgentPlanArtifacts({
    agentId: "coffee-agent",
    requestedGoal: "buy coffee for 5 USDC",
    category: "coffee",
    amount: "5",
    mint: "USDC_OR_MINT_ADDRESS",
    recipient: VALID_RECIPIENT,
    rail: "magicblock-private",
    allowPublicFallback: false,
    budgetPolicySnapshot: {
      dailyCapPercent: 30,
      spentToday: "0",
      remainingDailyCapBefore: "30",
      remainingDailyCapAfter: "25"
    },
    fromWallet: "agent-wallet-alpha"
  });

  await harness.budgetService.reserveSpend("coffee-agent", "5", {
    reason: "coffee",
    paylinkId: artifacts.paylink.id
  });
  await harness.lifecycleService.recordBudgetReserved(artifacts.paymentIntent.id);

  return {
    ...harness,
    ...artifacts
  };
};

test("agent payment success confirms reserved spend", async () => {
  const { paylinkService, budgetService, paymentIntent } = await seedAgentPayment();

  const updated = await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "sent", "sig_123");
  const budget = await budgetService.getAgentBudget("coffee-agent");
  const decision = await budgetService.canSpend("coffee-agent", "26");

  assert.equal(updated.status, "sent");
  assert.equal(updated.metadata?.agentLifecycle?.budgetReservationState, "confirmed");
  assert.deepEqual(updated.metadata?.timeline?.map((event) => event.type), [
    "budget_reserved",
    "private_transfer_sent",
    "payment_confirmed",
    "budget_spend_confirmed"
  ]);
  assert.equal(updated.metadata?.agentPlan?.privateRail?.reveal.authorization, "magicblock-permission-membership");
  assert.equal(updated.metadata?.agentPlan?.receipt?.type, "agent-private-receipt");
  assert.equal(budget?.spentToday, "5");
  assert.equal(budget?.currentBalance, "95");
  assert.equal(decision.allowed, false);
  assert.equal(decision.remainingDailyCap, "23");
});

test("duplicate success is idempotent and does not double-count spentToday", async () => {
  const { paylinkService, budgetService, paymentIntent } = await seedAgentPayment();

  await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "sent", "sig_123");
  const second = await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "sent", "sig_123");
  const budget = await budgetService.getAgentBudget("coffee-agent");

  assert.equal(second.metadata?.agentLifecycle?.budgetReservationState, "confirmed");
  assert.equal(budget?.spentToday, "5");
  assert.equal(budget?.currentBalance, "95");
  assert.deepEqual(second.metadata?.timeline?.map((event) => event.type), [
    "budget_reserved",
    "private_transfer_sent",
    "payment_confirmed",
    "budget_spend_confirmed"
  ]);
});

test("manual Mirage confirmation records tx and confirms reserved spend", async () => {
  const { paylinkService, budgetService, paymentIntent, paylink } = await seedAgentPayment();

  const updated = await paylinkService.confirmManualAgentSpend({
    paylinkId: paylink.id,
    txSignature: VALID_SIGNATURE,
    executor: "mirage-cli"
  });
  const budget = await budgetService.getAgentBudget("coffee-agent");

  assert.equal(updated.id, paymentIntent.id);
  assert.equal(updated.status, "sent");
  assert.equal(updated.txSignature, VALID_SIGNATURE);
  assert.equal(updated.metadata?.manualExecution?.executor, "mirage-cli");
  assert.equal(updated.metadata?.manualExecution?.txSignature, VALID_SIGNATURE);
  assert.equal(updated.metadata?.agentLifecycle?.budgetReservationState, "confirmed");
  assert.deepEqual(updated.metadata?.timeline?.map((event) => event.type), [
    "budget_reserved",
    "manual_mirage_execution_confirmed",
    "private_transfer_sent",
    "payment_confirmed",
    "budget_spend_confirmed"
  ]);
  assert.equal(budget?.spentToday, "5");
  assert.equal(budget?.currentBalance, "95");
});

test("duplicate manual Mirage confirmation does not double-count budget", async () => {
  const { paylinkService, budgetService, paylink } = await seedAgentPayment();

  await paylinkService.confirmManualAgentSpend({
    paylinkId: paylink.id,
    txSignature: VALID_SIGNATURE,
    executor: "mirage-cli"
  });
  const second = await paylinkService.confirmManualAgentSpend({
    paylinkId: paylink.id,
    txSignature: VALID_SIGNATURE,
    executor: "mirage-cli"
  });
  const budget = await budgetService.getAgentBudget("coffee-agent");

  assert.equal(second.metadata?.agentLifecycle?.budgetReservationState, "confirmed");
  assert.equal(budget?.spentToday, "5");
  assert.equal(budget?.currentBalance, "95");
});

test("released agent spend cannot be manually confirmed", async () => {
  const { paylinkService, paymentIntent, paylink } = await seedAgentPayment();

  await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "failed");
  await assert.rejects(
    () =>
      paylinkService.confirmManualAgentSpend({
        paylinkId: paylink.id,
        txSignature: VALID_SIGNATURE,
        executor: "mirage-cli"
      }),
    /Rejected or released spends cannot be confirmed/
  );
});

test("agent payment failure releases reserved spend", async () => {
  const { paylinkService, budgetService, paymentIntent } = await seedAgentPayment();

  const updated = await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "failed");
  const budget = await budgetService.getAgentBudget("coffee-agent");
  const decision = await budgetService.canSpend("coffee-agent", "30");

  assert.equal(updated.status, "failed");
  assert.equal(updated.metadata?.agentLifecycle?.budgetReservationState, "released");
  assert.deepEqual(updated.metadata?.timeline?.map((event) => event.type), [
    "budget_reserved",
    "private_transfer_failed",
    "payment_failed",
    "budget_reservation_released"
  ]);
  assert.equal(budget?.spentToday, "0");
  assert.equal(budget?.currentBalance, "100");
  assert.equal(decision.allowed, true);
});

test("agent payment expiration releases reserved spend", async () => {
  const { paylinkService, budgetService, paymentIntent } = await seedAgentPayment();

  const updated = await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "expired");
  const budget = await budgetService.getAgentBudget("coffee-agent");

  assert.equal(updated.status, "failed");
  assert.equal(updated.metadata?.agentLifecycle?.budgetReservationState, "released");
  assert.equal(updated.metadata?.agentLifecycle?.releasedReason, "expired");
  assert.equal(budget?.spentToday, "0");
});

test("non-agent payment status changes do not touch Agent Budget service", async () => {
  const { paylinkService, budgetService } = createHarness();
  await budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: "owner-alpha",
    mint: "USDC_OR_MINT_ADDRESS",
    totalBudget: "100",
    currentBalance: "100",
    rail: "magicblock-private"
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

  const updated = await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "sent", "sig_123");
  const budget = await budgetService.getAgentBudget("coffee-agent");

  assert.equal(updated.metadata, undefined);
  assert.equal(budget?.spentToday, "0");
  assert.equal(budget?.currentBalance, "100");
});

test("failure after success does not undo confirmed spend", async () => {
  const { paylinkService, budgetService, paymentIntent } = await seedAgentPayment();

  await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "sent", "sig_123");
  const updated = await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "failed");
  const budget = await budgetService.getAgentBudget("coffee-agent");

  assert.equal(updated.metadata?.agentLifecycle?.budgetReservationState, "confirmed");
  assert.equal(budget?.spentToday, "5");
  assert.equal(budget?.currentBalance, "95");
});

test("success without a matching reservation is handled safely", async () => {
  const { budgetService, paylinkService, lifecycleService } = createHarness();
  await budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: "owner-alpha",
    mint: "USDC_OR_MINT_ADDRESS",
    totalBudget: "100",
    currentBalance: "100",
    rail: "magicblock-private"
  });

  const artifacts = await paylinkService.createAgentPlanArtifacts({
    agentId: "coffee-agent",
    requestedGoal: "buy coffee for 5 USDC",
    amount: "5",
    mint: "USDC_OR_MINT_ADDRESS",
    recipient: VALID_RECIPIENT,
    rail: "magicblock-private",
    allowPublicFallback: false,
    budgetPolicySnapshot: {
      dailyCapPercent: 30,
      spentToday: "0",
      remainingDailyCapBefore: "30",
      remainingDailyCapAfter: "25"
    },
    fromWallet: "agent-wallet-alpha"
  });
  await lifecycleService.recordBudgetReserved(artifacts.paymentIntent.id);

  const updated = await paylinkService.updatePaymentIntentStatus(artifacts.paymentIntent.id, "sent", "sig_123");
  const budget = await budgetService.getAgentBudget("coffee-agent");

  assert.equal(updated.metadata?.agentLifecycle?.lastBudgetError, "No matching reserved spend found for this agent payment.");
  assert.equal(updated.metadata?.agentLifecycle?.budgetReservationState, "reserved");
  assert.equal(updated.metadata?.agentPlan?.memo, `whisperpay:agent:coffee-agent:paylink:${artifacts.paylink.id}`);
  assert.equal(budget?.spentToday, "0");
  assert.equal(budget?.currentBalance, "100");
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

  console.log(`Completed ${passed} agent payment lifecycle tests.`);
};

void run();
