import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { DevFileTelegramLinkRepository, InMemoryTelegramLinkRepository } from "../lib/telegram-link/repository";
import { TelegramLinkService } from "../lib/telegram-link/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const VALID_CONTROLLER = "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";

test("createLinkCode requires a valid controller wallet", async () => {
  const service = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: () => new Date("2026-05-01T00:00:00.000Z"),
    createCode: () => "ABCD2345"
  });

  await assert.rejects(
    () => service.createLinkCode("invalid_wallet"),
    /controllerWallet must be a valid Solana wallet address/
  );
});

test("createLinkCode returns command and 10 minute expiry", async () => {
  const service = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: () => new Date("2026-05-01T10:00:00.000Z"),
    createCode: () => "ABCD2345"
  });

  const result = await service.createLinkCode(VALID_CONTROLLER);

  assert.deepEqual(result, {
    code: "ABCD2345",
    expiresAt: "2026-05-01T10:10:00.000Z",
    command: "/link ABCD2345"
  });
});

test("valid code links telegram user and resolver returns controller wallet", async () => {
  let now = "2026-05-01T10:00:00.000Z";
  const service = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: () => new Date(now),
    createCode: () => "QWER2345"
  });

  await service.createLinkCode(VALID_CONTROLLER);
  now = "2026-05-01T10:05:00.000Z";
  const linked = await service.consumeLinkCode("123456", "QWER2345");

  assert.equal(linked.telegramUserId, "123456");
  assert.equal(linked.controllerWallet, VALID_CONTROLLER);
  assert.equal(await service.resolveControllerWalletForTelegramUser("123456"), VALID_CONTROLLER);
});

test("expired code is rejected", async () => {
  let now = "2026-05-01T10:00:00.000Z";
  const service = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: () => new Date(now),
    createCode: () => "ZXCV6789"
  });

  await service.createLinkCode(VALID_CONTROLLER);
  now = "2026-05-01T10:11:00.000Z";

  await assert.rejects(
    () => service.consumeLinkCode("987654", "ZXCV6789"),
    /Link code has expired/
  );
});

test("invalid code format is rejected", async () => {
  const service = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: () => new Date("2026-05-01T10:00:00.000Z"),
    createCode: () => "QWER2345"
  });

  await service.createLinkCode(VALID_CONTROLLER);

  await assert.rejects(
    () => service.consumeLinkCode("987654", "bad-code"),
    /code must be a valid Telegram link code/
  );
});

test("consumed code is rejected on second consume", async () => {
  const service = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: () => new Date("2026-05-01T10:00:00.000Z"),
    createCode: () => "HJKL2345"
  });

  await service.createLinkCode(VALID_CONTROLLER);
  await service.consumeLinkCode("123", "HJKL2345");

  await assert.rejects(
    () => service.consumeLinkCode("456", "HJKL2345"),
    /already been consumed/
  );
});

test("dev file repository persists local mode link data", async () => {
  const root = path.join(process.cwd(), ".test-artifacts", "telegram-link-service");
  const filePath = path.join(root, "telegram-links.json");

  await rm(root, {
    recursive: true,
    force: true
  });
  await mkdir(root, {
    recursive: true
  });

  const serviceA = new TelegramLinkService({
    repository: new DevFileTelegramLinkRepository({
      filePath
    }),
    now: () => new Date("2026-05-01T10:00:00.000Z"),
    createCode: () => "MNBV2345"
  });

  await serviceA.createLinkCode(VALID_CONTROLLER);
  await serviceA.consumeLinkCode("file-user", "MNBV2345");

  const serviceB = new TelegramLinkService({
    repository: new DevFileTelegramLinkRepository({
      filePath
    }),
    now: () => new Date("2026-05-01T10:01:00.000Z")
  });

  assert.equal(await serviceB.resolveControllerWalletForTelegramUser("file-user"), VALID_CONTROLLER);
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

  console.log(`Completed ${passed} telegram link service tests.`);
};

void run();
