import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AgentBudgetService } from "../lib/agent-budget/service";
import { OffchainAgentBudgetPolicyAdapter } from "../lib/agent-budget/policy-adapter";
import { TelegramCommandService } from "../lib/telegram/commands";
import { InMemoryTelegramLinkRepository } from "../lib/telegram-link/repository";
import { TelegramLinkService } from "../lib/telegram-link/service";
import { WhisperPayServerService } from "../lib/whisperpay-server/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const VALID_CONTROLLER = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";
const fixedNow = (): Date => new Date("2026-05-02T10:00:00.000Z");
const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const createHarness = async (withBudget = true) => {
  const budgetService = new AgentBudgetService({
    now: fixedNow
  });
  const budgetPolicy = new OffchainAgentBudgetPolicyAdapter({
    service: budgetService
  });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow
  });
  const telegramLinkService = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: fixedNow,
    createCode: () => "ABCD2345"
  });

  if (withBudget) {
    await budgetService.createAgentBudget({
      agentId: "coffee-agent",
      owner: VALID_CONTROLLER,
      agentWallet: "agent-wallet-alpha",
      mint: "USDC_OR_MINT_ADDRESS",
      totalBudget: "100",
      currentBalance: "100",
      rail: "magicblock-private"
    });
  }

  const service = new TelegramCommandService({
    telegramLinkService,
    budgetPolicy,
    paylinkService,
    origin: "http://localhost"
  });

  return {
    budgetService,
    budgetPolicy,
    paylinkService,
    telegramLinkService,
    service
  };
};

const linkTelegramUser = async (telegramLinkService: TelegramLinkService, telegramUserId = "777"): Promise<void> => {
  await telegramLinkService.createLinkCode(VALID_CONTROLLER);
  await telegramLinkService.consumeLinkCode(telegramUserId, "ABCD2345");
};

test("/start returns linking instructions", async () => {
  const { service } = await createHarness(false);
  const reply = await service.handleTextCommand({
    telegramUserId: "111",
    text: "/start"
  });

  assert.match(reply, /Open the WhisperVault web app/i);
  assert.match(reply, /send \/link <code>/i);
});

test("/help returns available commands", async () => {
  const { service } = await createHarness(false);
  const reply = await service.handleTextCommand({
    telegramUserId: "111",
    text: "/help"
  });

  assert.match(reply, /\/link <code>/);
  assert.match(reply, /\/vaults/);
  assert.match(reply, /\/receipt <paylinkId>/);
});

test("/link consumes code for telegram user", async () => {
  const { service, telegramLinkService } = await createHarness(false);
  await telegramLinkService.createLinkCode(VALID_CONTROLLER);

  const reply = await service.handleTextCommand({
    telegramUserId: "12345",
    text: "/link abcd2345"
  });

  assert.match(reply, /Linked to controller wallet/i);
  assert.equal(await telegramLinkService.resolveControllerWalletForTelegramUser("12345"), VALID_CONTROLLER);
});

test("/vaults for unlinked user explains linking", async () => {
  const { service } = await createHarness();
  const reply = await service.handleTextCommand({
    telegramUserId: "999",
    text: "/vaults"
  });

  assert.match(reply, /not linked yet/i);
  assert.match(reply, /\/link <code>/);
});

test("/vaults for linked user lists vaults", async () => {
  const { service, telegramLinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  const reply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/vaults"
  });

  assert.match(reply, /🧠 WhisperVault/);
  assert.match(reply, /Controller/);
  assert.match(reply, /coffee-agent/);
  assert.match(reply, /Balance\n100 \/ 100 USDC/);
  assert.match(reply, /Ghost Allowance\n█████░░░░░ 10 \/ 20 USDC/);
  assert.match(reply, /Daily Budget\n30 \/ 30 USDC remaining/);
  assert.match(reply, /Private Rail: Mirage Private/);
  assert.match(reply, /Native Fallback: Solana Native Devnet/);
  assert.match(reply, /Spend Firewall Enabled/);
});

test("/spend coffee linked uses approved path when budget allows", async () => {
  const { service, telegramLinkService, paylinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  const reply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/spend coffee"
  });

  assert.match(reply, /🛡 Spend Firewall Approved/);
  assert.match(reply, /Ghost Allowance\n10 → 5 USDC/);
  assert.match(reply, /Agent\ncoffee-agent/);
  assert.match(reply, /Request\n5 USDC/);
  assert.match(reply, /Execution Path\nMirage Private Rail/);
  assert.match(reply, /Native Fallback\nSolana Native Devnet/);
  assert.match(reply, /Receipt\npl_/);
  assert.match(reply, /Status\nPending execution/);
  assert.equal((await paylinkService.listPaymentIntents()).length, 1);
});

test("/spend blocked by allowance explains Ghost Allowance", async () => {
  const { service, telegramLinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  const reply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/spend 11 buy snacks"
  });

  assert.match(reply, /🛑 Spend Blocked/);
  assert.match(reply, /Reason\nGhost Allowance exceeded/);
  assert.match(reply, /Requested\n11 USDC/);
  assert.match(reply, /Available\n10 USDC/);
  assert.match(reply, /No execution rail generated\./);
});

test("/spend from Telegram stores chat metadata on spend artifacts", async () => {
  const { service, telegramLinkService, paylinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  await service.handleTextCommand({
    telegramUserId: "777",
    telegramChatId: "987654321",
    text: "/spend 5 buy coffee"
  });

  const [paymentIntent] = await paylinkService.listPaymentIntents();
  assert.equal(paymentIntent?.metadata?.telegram?.source, "telegram");
  assert.equal(paymentIntent?.metadata?.telegram?.telegramUserId, "777");
  assert.equal(paymentIntent?.metadata?.telegram?.telegramChatId, "987654321");
  assert.equal(paymentIntent?.metadata?.telegram?.controllerWallet, VALID_CONTROLLER);
  assert.equal(paymentIntent?.metadata?.telegram?.originalTelegramCommand, "/spend 5 buy coffee");
  assert.equal(paymentIntent?.metadata?.agentPlan?.source, "telegram");
  assert.equal(paymentIntent?.metadata?.agentPlan?.telegram?.telegramChatId, "987654321");

  const paylink = await paylinkService.getPaylink(paymentIntent?.paylinkId ?? "");
  assert.equal(paylink?.metadata?.telegram?.telegramChatId, "987654321");
});

test("/spend gear linked uses blocked path when cap is exceeded", async () => {
  const { service, telegramLinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  const reply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/spend gear"
  });

  assert.match(reply, /🛑 Spend Blocked/);
  assert.match(reply, /Reason\nDaily budget exceeded/);
});

test("/agents lists active agent vaults and /agent use switches spend context", async () => {
  const { service, telegramLinkService, budgetService } = await createHarness();
  await budgetService.createAgentBudget({
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
  await budgetService.createAgentBudget({
    agentId: "shopping-agent",
    owner: VALID_CONTROLLER,
    agentWallet: "agent-wallet-shopping",
    mint: "USDC",
    totalBudget: "50",
    currentBalance: "50",
    status: "paused",
    liveAllowance: "0",
    maxLiveAllowance: "15",
    rail: "magicblock-private"
  });
  await linkTelegramUser(telegramLinkService);

  const agentsReply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/agents"
  });

  assert.match(agentsReply, /🧠 Active Agents/);
  assert.match(agentsReply, /● coffee-agent\nGhost: 10\/20\nDaily left: 30/);
  assert.match(agentsReply, /● travel-agent\nGhost: 5\/10\nDaily left: 60/);
  assert.match(agentsReply, /● shopping-agent\nGhost: 0\/15\nPaused/);

  const switchReply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/agent use travel-agent"
  });

  assert.match(switchReply, /🧠 Agent Vault Switched/);
  assert.match(switchReply, /Active Agent\ntravel-agent/);

  const spendReply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/spend 2 buy ticket"
  });

  assert.match(spendReply, /Agent\ntravel-agent/);
});

test("/rogue renders simulator without creating execution artifacts", async () => {
  const { service, telegramLinkService, paylinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  const reply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/rogue"
  });

  assert.match(reply, /👾 Rogue Agent Simulator/);
  assert.match(reply, /Attempt 1/);
  assert.match(reply, /✅ Approved/);
  assert.match(reply, /Ghost Allowance exceeded/);
  assert.match(reply, /Private rail policy enforced/);
  assert.match(reply, /Unsafe executions prevented: 3/);
  assert.equal((await paylinkService.listPaymentIntents()).length, 0);
});

test("/receipt rejects unauthorized paylink access", async () => {
  const ownerHarness = await createHarness();
  await linkTelegramUser(ownerHarness.telegramLinkService, "owner-user");

  const spendReply = await ownerHarness.service.handleTextCommand({
    telegramUserId: "owner-user",
    text: "/spend coffee"
  });
  const paylinkId = spendReply.match(/Receipt\n(pl_\S+)/)?.[1];
  assert.ok(paylinkId);

  const otherHarness = await createHarness(false);
  await otherHarness.telegramLinkService.createLinkCode("8Ysj8U5ZuY6JdkhZP5WHa3gwxMZ4N6k2VnYfJm6b7Qw1");
  await otherHarness.telegramLinkService.consumeLinkCode("other-user", "ABCD2345");

  const reply = await ownerHarness.service.handleTextCommand({
    telegramUserId: "missing-user",
    text: `/receipt ${paylinkId}`
  });

  assert.match(reply, /not linked yet/i);
});

test("/receipt renders confirmed devnet explorer link", async () => {
  const { service, telegramLinkService, paylinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  const spendReply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/spend coffee"
  });
  const paylinkId = spendReply.match(/Receipt\n(pl_\S+)/)?.[1];
  assert.ok(paylinkId);

  const signature = "5".repeat(88);
  await paylinkService.confirmManualAgentSpend({
    paylinkId,
    txSignature: signature,
    executor: "solana-devnet-native-fallback",
    executionRail: "solana-devnet-native-fallback",
    mirageAttempted: true,
    mirageError: "Invalid param WrongSize"
  });

  const reply = await service.handleTextCommand({
    telegramUserId: "777",
    text: `/receipt ${paylinkId}`
  });

  assert.match(reply, /✅ Execution Confirmed/);
  assert.match(reply, /Execution Rail\nSolana Native Devnet Fallback/);
  assert.match(reply, /Policy Decision\nApproved by Spend Firewall/);
  assert.match(reply, /Tx Signature\n55555555\.\.\.55555555/);
  assert.match(reply, new RegExp(`Explorer\\nhttps://explorer\\.solana\\.com/tx/${signature}\\?cluster=devnet`));
  assert.match(reply, new RegExp(`Receipt ID\\n${paylinkId}`));
});

test("telegram webhook command modules do not import local execution helpers", async () => {
  const files = [
    "lib/telegram/client.ts",
    "lib/telegram/commands.ts",
    "lib/telegram/webhook.ts",
    "app/api/telegram/webhook/route.ts"
  ];

  for (const relativePath of files) {
    const fullPath = path.join(process.cwd(), relativePath);
    const source = readFileSync(fullPath, "utf8");
    assert.doesNotMatch(source, /child_process|spawn\(|exec\(/);
  }
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

  console.log(`Completed ${passed} telegram command service tests.`);
};

void run();
