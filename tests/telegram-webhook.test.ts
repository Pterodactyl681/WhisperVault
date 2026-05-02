import assert from "node:assert/strict";
import { AgentBudgetService } from "../lib/agent-budget/service";
import { OffchainAgentBudgetPolicyAdapter } from "../lib/agent-budget/policy-adapter";
import type { TelegramBotClient } from "../lib/telegram/client";
import { TelegramCommandService } from "../lib/telegram/commands";
import { createTelegramWebhookHandler } from "../lib/telegram/webhook";
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

const createHarness = async () => {
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

  await budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: VALID_CONTROLLER,
    agentWallet: "agent-wallet-alpha",
    mint: "USDC_OR_MINT_ADDRESS",
    totalBudget: "100",
    currentBalance: "100",
    rail: "magicblock-private"
  });

  const commandService = new TelegramCommandService({
    telegramLinkService,
    budgetPolicy,
    paylinkService,
    origin: "http://localhost"
  });

  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const client: TelegramBotClient = {
    async sendMessage(chatId, text) {
      sentMessages.push({
        chatId,
        text
      });
    }
  };

  return {
    telegramLinkService,
    paylinkService,
    commandService,
    client,
    sentMessages
  };
};

const createUpdateRequest = (text: string, secret?: string): Request =>
  new Request("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Telegram-Bot-Api-Secret-Token": secret } : {})
    },
    body: JSON.stringify({
      update_id: 1,
      message: {
        message_id: 11,
        text,
        chat: {
          id: 987654321
        },
        from: {
          id: 777,
          username: "whisper-user"
        }
      }
    })
  });

test("webhook rejects bad secret when configured", async () => {
  const { commandService, client, sentMessages } = await createHarness();
  const handler = createTelegramWebhookHandler({
    commandService,
    client,
    webhookSecret: "expected-secret"
  });

  const response = await handler(createUpdateRequest("/help", "wrong-secret"));

  assert.equal(response.status, 401);
  assert.equal(sentMessages.length, 0);
});

test("webhook accepts good secret and sends reply", async () => {
  const { commandService, client, sentMessages } = await createHarness();
  const handler = createTelegramWebhookHandler({
    commandService,
    client,
    webhookSecret: "expected-secret"
  });

  const response = await handler(createUpdateRequest("/help", "expected-secret"));

  assert.equal(response.status, 200);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0]?.chatId, "987654321");
  assert.match(sentMessages[0]?.text ?? "", /\/vaults/);
});

test("webhook can consume link code from telegram user", async () => {
  const { commandService, client, telegramLinkService, sentMessages } = await createHarness();
  await telegramLinkService.createLinkCode(VALID_CONTROLLER);
  const handler = createTelegramWebhookHandler({
    commandService,
    client
  });

  const response = await handler(createUpdateRequest("/link ABCD2345"));

  assert.equal(response.status, 200);
  assert.equal(await telegramLinkService.resolveControllerWalletForTelegramUser("777"), VALID_CONTROLLER);
  assert.match(sentMessages[0]?.text ?? "", /Linked to controller wallet/);
});

test("webhook /spend stores telegram chat metadata", async () => {
  const { commandService, client, telegramLinkService, paylinkService } = await createHarness();
  await telegramLinkService.createLinkCode(VALID_CONTROLLER);
  await telegramLinkService.consumeLinkCode("777", "ABCD2345");
  const handler = createTelegramWebhookHandler({
    commandService,
    client
  });

  const response = await handler(createUpdateRequest("/spend 5 buy coffee"));
  const [paymentIntent] = await paylinkService.listPaymentIntents();

  assert.equal(response.status, 200);
  assert.equal(paymentIntent?.metadata?.telegram?.telegramUserId, "777");
  assert.equal(paymentIntent?.metadata?.telegram?.telegramChatId, "987654321");
  assert.equal(paymentIntent?.metadata?.telegram?.controllerWallet, VALID_CONTROLLER);
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

  console.log(`Completed ${passed} telegram webhook tests.`);
};

void run();
