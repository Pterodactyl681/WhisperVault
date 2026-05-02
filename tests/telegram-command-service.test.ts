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

  assert.match(reply, /Agent Vaults for/);
  assert.match(reply, /coffee-agent/);
  assert.match(reply, /Balance: 100\/100 USDC/);
  assert.match(reply, /Rail: magicblock-private \(fallback off\)/);
});

test("/spend coffee linked uses approved path when budget allows", async () => {
  const { service, telegramLinkService, paylinkService } = await createHarness();
  await linkTelegramUser(telegramLinkService);

  const reply = await service.handleTextCommand({
    telegramUserId: "777",
    text: "/spend coffee"
  });

  assert.match(reply, /Spend Firewall: Passed/);
  assert.match(reply, /Private spend: created/);
  assert.match(reply, /Execution: pending\/manual/);
  assert.match(reply, /Paylink\/Receipt id: pl_/);
  assert.equal((await paylinkService.listPaymentIntents()).length, 1);
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

  assert.match(reply, /Spend Firewall: Blocked/);
  assert.match(reply, /remaining daily cap/i);
});

test("/receipt rejects unauthorized paylink access", async () => {
  const ownerHarness = await createHarness();
  await linkTelegramUser(ownerHarness.telegramLinkService, "owner-user");

  const spendReply = await ownerHarness.service.handleTextCommand({
    telegramUserId: "owner-user",
    text: "/spend coffee"
  });
  const paylinkId = spendReply.match(/Paylink\/Receipt id: (\S+)/)?.[1];
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
