import assert from "node:assert/strict";
import {
  DEV_AGENT_ID,
  DEV_AGENT_RECIPIENT,
  createLocalAgentPlan,
  createLocalAgentPlanHarness
} from "./agent-runtime-common";

const run = async (): Promise<void> => {
  const harness = await createLocalAgentPlanHarness("smoke");

  const seededDailyAllowance = await harness.budgetService.canSpend(DEV_AGENT_ID, "1");
  assert.equal(seededDailyAllowance.allowed, true);
  assert.equal(seededDailyAllowance.remainingDailyCap, "90");

  const { response: allowedResponse, body: allowedBody } = await createLocalAgentPlan(harness, {
    agentId: DEV_AGENT_ID,
    goal: "buy coffee for 5 USDC",
    amount: "5",
    mint: "USDC",
    category: "coffee",
    recipient: DEV_AGENT_RECIPIENT
  });
  assert.equal(allowedResponse.status, 201);

  assert.equal(allowedBody.allowed, true);
  assert.equal(allowedBody.paylinkId, "pl_smoke_001");
  assert.equal(allowedBody.rail, "magicblock-private");
  assert.equal(allowedBody.privacyMode, "private");
  assert.equal(allowedBody.allowPublicFallback, false);
  assert.equal(allowedBody.memoPreview, "whisperpay:agent:coffee-agent:paylink:pl_smoke_001");
  assert.equal(allowedBody.remainingDailyCap, "85");
  assert.ok(typeof allowedBody.mirage === "object" && allowedBody.mirage !== null);
  assert.ok(typeof allowedBody.receipt === "object" && allowedBody.receipt !== null);
  const allowedReceipt = allowedBody.receipt as {
    type?: string;
    execution?: { rail?: string; fallback?: string };
    memo?: { reveal?: string };
    reservation?: { amountReserved?: string };
  };
  assert.equal(allowedReceipt.type, "agent-private-receipt");
  assert.equal(allowedReceipt.execution?.rail, "magicblock-private");
  assert.equal(allowedReceipt.execution?.fallback, "off");
  assert.equal(allowedReceipt.memo?.reveal, "permissioned");
  assert.equal(allowedReceipt.reservation?.amountReserved, "5");

  const mirage = allowedBody.mirage as {
    displayCommand?: string;
    argv?: unknown;
  };
  assert.match(mirage.displayCommand ?? "", /^mirage transfer /);
  assert.ok(Array.isArray(mirage.argv));
  assert.equal(mirage.argv?.includes("--visibility"), true);
  assert.equal(mirage.argv?.includes("private"), true);
  assert.equal(mirage.argv?.includes("--split"), true);
  assert.equal(mirage.argv?.[mirage.argv.indexOf("--split") + 1], "4");
  assert.equal(mirage.displayCommand?.includes("--visibility private"), true);
  assert.equal(mirage.displayCommand?.includes("--split 4"), true);
  assert.equal(mirage.displayCommand?.includes("whisperpay:agent:coffee-agent:paylink:pl_smoke_001"), true);

  const reservedRecord = await harness.repository.get(DEV_AGENT_ID);
  assert.ok(reservedRecord);
  assert.equal(reservedRecord.reservations.length, 1);
  assert.equal(reservedRecord.reservations[0]?.amount, "5");
  assert.equal(reservedRecord.reservations[0]?.status, "reserved");
  assert.equal(reservedRecord.reservations[0]?.paylinkId, "pl_smoke_001");

  const postReservationDecision = await harness.budgetService.canSpend(DEV_AGENT_ID, "1");
  assert.equal(postReservationDecision.remainingDailyCap, "85");
  assert.equal(postReservationDecision.reservedAmount, "5");

  const { response: rejectedResponse, body: rejectedBody } = await createLocalAgentPlan(harness, {
    agentId: DEV_AGENT_ID,
    goal: "buy coffee for 100 USDC",
    amount: "100",
    mint: "USDC",
    category: "coffee",
    recipient: DEV_AGENT_RECIPIENT
  });
  assert.equal(rejectedResponse.status, 200);

  assert.equal(rejectedBody.allowed, false);
  assert.equal(rejectedBody.reason, "Requested spend exceeds the remaining daily cap.");
  assert.equal("paylinkId" in rejectedBody, false);
  assert.equal("mirage" in rejectedBody, false);
  assert.ok(typeof rejectedBody.receipt === "object" && rejectedBody.receipt !== null);
  const rejectedReceipt = rejectedBody.receipt as {
    type?: string;
    decision?: string;
    artifacts?: { paylinkCreated?: boolean; mirageCommandGenerated?: boolean };
  };
  assert.equal(rejectedReceipt.type, "agent-policy-decision");
  assert.equal(rejectedReceipt.decision, "rejected");
  assert.equal(rejectedReceipt.artifacts?.paylinkCreated, false);
  assert.equal(rejectedReceipt.artifacts?.mirageCommandGenerated, false);

  const recordsAfterRejection = await harness.repository.get(DEV_AGENT_ID);
  assert.ok(recordsAfterRejection);
  assert.equal(recordsAfterRejection.reservations.length, 1);
  assert.equal(recordsAfterRejection.reservations[0]?.paylinkId, "pl_smoke_001");

  const paylinks = await harness.paylinkService.listPaylinks();
  const paymentIntents = await harness.paylinkService.listPaymentIntents();
  assert.equal(paylinks.length, 1);
  assert.equal(paymentIntents.length, 1);
  assert.equal(paylinks[0]?.metadata?.allowPublicFallback, false);
  assert.equal(paymentIntents[0]?.metadata?.allowPublicFallback, false);

  const plainPaylink = await harness.paylinkService.createPaylink({
    ownerWallet: DEV_AGENT_RECIPIENT,
    nickname: "plain paylink",
    defaultToken: "USDC"
  });
  const plainPaymentIntent = await harness.paylinkService.createPaymentIntent({
    paylinkId: plainPaylink.id,
    fromWallet: "sender-wallet",
    toWallet: DEV_AGENT_RECIPIENT,
    amount: "5",
    mint: "USDC",
    recipient: DEV_AGENT_RECIPIENT,
    settlementRail: "sol-public",
    tokenSymbol: "USDC"
  });

  assert.equal(plainPaylink.metadata, undefined);
  assert.equal(plainPaymentIntent.metadata, undefined);

  console.log("PASS seeded demo budget validated");
  console.log("PASS allowed 5 USDC private spend flow");
  console.log("PASS rejected 100 USDC daily-cap flow");
  console.log("PASS non-agent paylink compatibility");
  console.log(`Allowed paylinkId: ${String(allowedBody.paylinkId)}`);
  console.log(`Allowed Mirage command: ${String(mirage.displayCommand)}`);
  console.log(`Rejected reason: ${String(rejectedBody.reason)}`);
};

void run().catch((error: unknown) => {
  console.error("FAIL smoke agent vault");
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
