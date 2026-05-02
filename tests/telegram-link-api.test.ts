import assert from "node:assert/strict";
import { AGENT_BUDGET_OWNER_HEADER } from "../lib/agent-vault/http";
import { createTelegramLinkHttpHandlers } from "../lib/telegram-link/http";
import { InMemoryTelegramLinkRepository } from "../lib/telegram-link/repository";
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

const createHandlers = () => {
  const repository = new InMemoryTelegramLinkRepository();
  const service = new TelegramLinkService({
    repository,
    now: () => new Date("2026-05-01T10:00:00.000Z"),
    createCode: () => "ABCD2345"
  });

  return {
    handlers: createTelegramLinkHttpHandlers({
      service
    }),
    service
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

test("create link code requires owner header", async () => {
  const { handlers } = createHandlers();

  const response = await handlers.createLinkCode(
    new Request("http://localhost/api/telegram/link-code", {
      method: "POST",
      body: JSON.stringify({})
    })
  );

  assert.equal(response.status, 401);
  assert.deepEqual(await readJson(response), {
    error: {
      code: "owner_required",
      message: `Missing ${AGENT_BUDGET_OWNER_HEADER} header.`
    }
  });
});

test("create link code validates wallet and returns command payload", async () => {
  const { handlers } = createHandlers();

  const invalid = await handlers.createLinkCode(
    new Request("http://localhost/api/telegram/link-code", withOwner("invalid_wallet", {
      method: "POST"
    }))
  );

  assert.equal(invalid.status, 400);

  const created = await handlers.createLinkCode(
    new Request("http://localhost/api/telegram/link-code", withOwner(VALID_CONTROLLER, {
      method: "POST",
      body: JSON.stringify({
        controllerWallet: VALID_CONTROLLER
      })
    }))
  );

  assert.equal(created.status, 201);
  assert.deepEqual(await readJson(created), {
    code: "ABCD2345",
    expiresAt: "2026-05-01T10:10:00.000Z",
    command: "/link ABCD2345"
  });
});

test("consume link code links telegram user to wallet", async () => {
  const { handlers, service } = createHandlers();
  await handlers.createLinkCode(
    new Request("http://localhost/api/telegram/link-code", withOwner(VALID_CONTROLLER, {
      method: "POST"
    }))
  );

  const response = await handlers.consumeLinkCode(
    new Request("http://localhost/api/telegram/link", {
      method: "POST",
      body: JSON.stringify({
        telegramUserId: "777",
        code: "ABCD2345"
      })
    })
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await readJson(response), {
    telegramUserId: "777",
    controllerWallet: VALID_CONTROLLER,
    linkedAt: "2026-05-01T10:00:00.000Z"
  });
  assert.equal(await service.resolveControllerWalletForTelegramUser("777"), VALID_CONTROLLER);
});

test("consume link code rejects missing telegramUserId and invalid code", async () => {
  const { handlers } = createHandlers();

  const missingUser = await handlers.consumeLinkCode(
    new Request("http://localhost/api/telegram/link", {
      method: "POST",
      body: JSON.stringify({
        code: "ABCD2345"
      })
    })
  );

  assert.equal(missingUser.status, 400);
  assert.deepEqual(await readJson(missingUser), {
    error: {
      code: "invalid_request",
      message: "telegramUserId is required."
    }
  });

  const invalidCode = await handlers.consumeLinkCode(
    new Request("http://localhost/api/telegram/link", {
      method: "POST",
      body: JSON.stringify({
        telegramUserId: "888",
        code: "bad-code"
      })
    })
  );

  assert.equal(invalidCode.status, 400);
  assert.deepEqual(await readJson(invalidCode), {
    error: {
      code: "invalid_request",
      message: "code must be a valid Telegram link code."
    }
  });
});

test("consume link code rejects expired and consumed codes", async () => {
  let now = "2026-05-01T10:00:00.000Z";
  const repository = new InMemoryTelegramLinkRepository();
  const service = new TelegramLinkService({
    repository,
    now: () => new Date(now),
    createCode: () => "ZXCV6789"
  });
  const handlers = createTelegramLinkHttpHandlers({
    service
  });

  await handlers.createLinkCode(
    new Request("http://localhost/api/telegram/link-code", withOwner(VALID_CONTROLLER, {
      method: "POST"
    }))
  );

  now = "2026-05-01T10:11:00.000Z";
  const expired = await handlers.consumeLinkCode(
    new Request("http://localhost/api/telegram/link", {
      method: "POST",
      body: JSON.stringify({
        telegramUserId: "999",
        code: "ZXCV6789"
      })
    })
  );

  assert.equal(expired.status, 400);
  assert.deepEqual(await readJson(expired), {
    error: {
      code: "invalid_request",
      message: "Link code has expired."
    }
  });

  now = "2026-05-01T10:00:00.000Z";
  const activeService = new TelegramLinkService({
    repository: new InMemoryTelegramLinkRepository(),
    now: () => new Date(now),
    createCode: () => "QWER2345"
  });
  const activeHandlers = createTelegramLinkHttpHandlers({
    service: activeService
  });

  await activeHandlers.createLinkCode(
    new Request("http://localhost/api/telegram/link-code", withOwner(VALID_CONTROLLER, {
      method: "POST"
    }))
  );

  const firstConsume = await activeHandlers.consumeLinkCode(
    new Request("http://localhost/api/telegram/link", {
      method: "POST",
      body: JSON.stringify({
        telegramUserId: "111",
        code: "QWER2345"
      })
    })
  );
  assert.equal(firstConsume.status, 200);

  const secondConsume = await activeHandlers.consumeLinkCode(
    new Request("http://localhost/api/telegram/link", {
      method: "POST",
      body: JSON.stringify({
        telegramUserId: "222",
        code: "QWER2345"
      })
    })
  );

  assert.equal(secondConsume.status, 400);
  assert.deepEqual(await readJson(secondConsume), {
    error: {
      code: "invalid_request",
      message: "Link code has already been consumed."
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

  console.log(`Completed ${passed} telegram link API tests.`);
};

void run();
