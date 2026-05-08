import assert from "node:assert/strict";
import { readdirSync, readFileSync, type Dirent } from "node:fs";
import path from "node:path";
import { AgentBudgetService, DEFAULT_DEMO_AGENT_RECIPIENT } from "../lib/agent-budget";
import { AgentPaymentLifecycleService } from "../lib/agent-payment-lifecycle";
import { createPendingExecutionHttpHandlers } from "../lib/agent-spend/pending-execution-http";
import { listPendingAgentSpendExecutions } from "../lib/agent-spend/pending-execution";
import { WORKER_SECRET_HEADER } from "../lib/agent-spend/worker-auth";
import { runAgentWorkerCliOnce, runAgentWorkerOnce, validateMirageTransferArgv } from "../lib/agent-worker";
import type { TelegramBotClient } from "../lib/telegram/client";
import { WhisperPayServerService } from "../lib/whisperpay-server/service";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

type JsonRecord = Record<string, unknown>;

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const fixedNow = (): Date => new Date("2026-05-02T10:00:00.000Z");
const VALID_SIGNATURE = "5".repeat(88);

const createHarness = () => {
  const budgetService = new AgentBudgetService({
    now: fixedNow
  });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow,
    createId: (prefix) => `${prefix}_worker_${prefix === "pl" ? "paylink" : "intent"}`
  });
  const lifecycleService = new AgentPaymentLifecycleService({
    budgetService,
    paylinkService,
    now: fixedNow
  });
  paylinkService.attachAgentPaymentLifecycle(lifecycleService);

  return {
    budgetService,
    paylinkService,
    lifecycleService
  };
};

const seedPendingAgentSpend = async (
  options: {
    telegram?: {
      telegramUserId: string;
      telegramChatId: string;
      controllerWallet: string;
      originalTelegramCommand?: string;
    };
  } = {}
) => {
  const harness = createHarness();

  await harness.budgetService.createAgentBudget({
    agentId: "coffee-agent",
    owner: "owner-alpha",
    agentWallet: "agent-wallet-alpha",
    mint: "USDC",
    totalBudget: "100",
    currentBalance: "100",
    rail: "magicblock-private"
  });

  const artifacts = await harness.paylinkService.createAgentPlanArtifacts({
    agentId: "coffee-agent",
    requestedGoal: "buy coffee",
    amount: "5",
    mint: "USDC",
    recipient: DEFAULT_DEMO_AGENT_RECIPIENT,
    rail: "magicblock-private",
    allowPublicFallback: false,
    budgetPolicySnapshot: {
      dailyCapPercent: 30,
      spentToday: "0",
      remainingDailyCapBefore: "30",
      remainingDailyCapAfter: "25"
    },
    fromWallet: "agent-wallet-alpha",
    ...(options.telegram
      ? {
          telegram: {
            source: "telegram" as const,
            ...options.telegram
          }
        }
      : {})
  });

  await harness.budgetService.reserveSpend("coffee-agent", "5", {
    reason: "buy coffee",
    paylinkId: artifacts.paylink.id
  });
  await harness.lifecycleService.recordBudgetReserved(artifacts.paymentIntent.id);

  return {
    ...harness,
    ...artifacts
  };
};

const readJson = async <T>(response: Response): Promise<T> => response.json() as Promise<T>;

const createWorkerFetch = async (paylinkService: WhisperPayServerService): Promise<typeof fetch> => {
  const pending = await listPendingAgentSpendExecutions({ paylinkService });

  return async (input, init) => {
    const url = String(input);

    if (url.endsWith("/api/agent-spend/pending-execution")) {
      return Response.json({ pending });
    }

    if (url.endsWith("/api/agent-spend/confirm-manual")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        paylinkId?: string;
        txSignature?: string;
        executor?: string;
        executionRail?: string;
        mirageAttempted?: boolean;
        mirageError?: string;
      };
      await paylinkService.confirmManualAgentSpend({
        paylinkId: body.paylinkId ?? "",
        txSignature: body.txSignature ?? "",
        executor: body.executor ?? "",
        ...(body.executionRail ? { executionRail: body.executionRail } : {}),
        ...(body.mirageAttempted !== undefined ? { mirageAttempted: body.mirageAttempted } : {}),
        ...(body.mirageError ? { mirageError: body.mirageError } : {})
      });
      return Response.json({});
    }

    throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
  };
};

test("pending-execution returns approved pending agent spends", async () => {
  const { paylinkService, paylink } = await seedPendingAgentSpend();
  const handlers = createPendingExecutionHttpHandlers({
    paylinkService
  });

  const response = await handlers.listPending(new Request("http://localhost/api/agent-spend/pending-execution"));
  const body = await readJson<{ pending: JsonRecord[] }>(response);

  assert.equal(response.status, 200);
  assert.equal(body.pending.length, 1);
  assert.equal(body.pending[0]?.paylinkId, paylink.id);
  assert.equal((body.pending[0]?.mirage as JsonRecord | undefined)?.command, "mirage");
});

test("pending-execution requires worker secret when configured", async () => {
  const { paylinkService } = await seedPendingAgentSpend();
  const handlers = createPendingExecutionHttpHandlers({
    paylinkService,
    env: {
      WHISPERVAULT_WORKER_SECRET: "worker-secret"
    } as unknown as NodeJS.ProcessEnv
  });

  const rejected = await handlers.listPending(new Request("http://localhost/api/agent-spend/pending-execution"));
  assert.equal(rejected.status, 401);

  const accepted = await handlers.listPending(
    new Request("http://localhost/api/agent-spend/pending-execution", {
      headers: {
        [WORKER_SECRET_HEADER]: "worker-secret"
      }
    })
  );
  assert.equal(accepted.status, 200);
});

test("pending-execution excludes confirmed spends", async () => {
  const { paylinkService, paylink } = await seedPendingAgentSpend();

  await paylinkService.confirmManualAgentSpend({
    paylinkId: paylink.id,
    txSignature: VALID_SIGNATURE,
    executor: "mirage-cli"
  });

  assert.deepEqual(await listPendingAgentSpendExecutions({ paylinkService }), []);
});

test("pending-execution excludes rejected or released spends", async () => {
  const { paylinkService, paymentIntent } = await seedPendingAgentSpend();
  await paylinkService.updatePaymentIntentStatus(paymentIntent.id, "failed");

  assert.deepEqual(await listPendingAgentSpendExecutions({ paylinkService }), []);
});

test("pending-execution excludes non-agent paylinks", async () => {
  const { paylinkService } = createHarness();
  const paylink = await paylinkService.createPaylink({
    ownerWallet: DEFAULT_DEMO_AGENT_RECIPIENT,
    nickname: "plain paylink",
    defaultToken: "USDC"
  });

  await paylinkService.createPaymentIntent({
    paylinkId: paylink.id,
    fromWallet: "sender-wallet",
    toWallet: DEFAULT_DEMO_AGENT_RECIPIENT,
    amount: "5",
    mint: "USDC",
    recipient: DEFAULT_DEMO_AGENT_RECIPIENT,
    settlementRail: "sol-public",
    tokenSymbol: "USDC"
  });

  assert.deepEqual(await listPendingAgentSpendExecutions({ paylinkService }), []);
});

test("worker dry-run does not confirm pending spends", async () => {
  const { paylinkService } = await seedPendingAgentSpend();
  const pending = await listPendingAgentSpendExecutions({ paylinkService });
  let confirmCalls = 0;
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);

    if (url.endsWith("/api/agent-spend/pending-execution")) {
      return Response.json({ pending });
    }

    if (url.endsWith("/api/agent-spend/confirm-manual")) {
      confirmCalls += 1;
      return Response.json({});
    }

    throw new Error(`Unexpected fetch: ${url} ${init?.method ?? "GET"}`);
  };

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: true,
      executionEnabled: false
    },
    fetch: fakeFetch,
    logger: {
      log() {},
      error() {}
    }
  });

  assert.equal(result.planned, 1);
  assert.equal(result.confirmed, 0);
  assert.equal(confirmCalls, 0);
});

test("worker safe mode plans pending spends and exits 0", async () => {
  const { paylinkService } = await seedPendingAgentSpend({
    telegram: {
      telegramUserId: "777",
      telegramChatId: "987654321",
      controllerWallet: "owner-alpha",
      originalTelegramCommand: "/spend 5 buy coffee"
    }
  });
  const pending = await listPendingAgentSpendExecutions({ paylinkService });
  let confirmCalls = 0;
  let executeCalls = 0;
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const logs: string[] = [];
  const errors: string[] = [];

  const exitCode = await runAgentWorkerCliOnce(
    {
      log(message) {
        logs.push(message);
      },
      error(message) {
        errors.push(message);
      }
    },
    {
      config: {
        baseUrl: "http://localhost",
        agentWalletName: "agent-treasury",
        dryRun: false,
        executionEnabled: false,
        telegramBotToken: "test-token"
      },
      fetch: async (input) => {
        const url = String(input);

        if (url.endsWith("/api/agent-spend/pending-execution")) {
          return Response.json({ pending });
        }

        if (url.endsWith("/api/agent-spend/confirm-manual")) {
          confirmCalls += 1;
          return Response.json({});
        }

        throw new Error(`Unexpected fetch: ${url}`);
      },
      executeMirage: async () => {
        executeCalls += 1;
        return {
          stdout: VALID_SIGNATURE,
          stderr: ""
        };
      },
      telegramClient: {
        async sendMessage(chatId, text) {
          sentMessages.push({ chatId, text });
        }
      }
    }
  );
  assert.equal(exitCode, 0);
  assert.equal(executeCalls, 0);
  assert.equal(confirmCalls, 0);
  assert.equal(sentMessages.length, 0);
  assert.equal(errors.length, 0);
  assert.ok(logs.includes("WORKER_BUILD_MARKER=fallback-mint-override-v5"));
  assert.ok(logs.some((message) => message.includes("Safe mode skip")));
  assert.ok(logs.some((message) => message.includes("Worker result: fetched=1 planned=1 executed=0 confirmed=0")));
});

test("worker supports raw pending-execution array response", async () => {
  const { paylinkService } = await seedPendingAgentSpend();
  const pending = await listPendingAgentSpendExecutions({ paylinkService });

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost/",
      agentWalletName: "agent-treasury",
      dryRun: true,
      executionEnabled: false
    },
    fetch: async (input) => {
      assert.equal(String(input), "http://localhost/api/agent-spend/pending-execution");
      return Response.json(pending);
    },
    logger: {
      log() {},
      error() {}
    }
  });

  assert.equal(result.fetched, 1);
  assert.equal(result.planned, 1);
});

test("worker pending fetch failure includes endpoint and cause", async () => {
  await assert.rejects(
    () =>
      runAgentWorkerOnce({
        config: {
          baseUrl: "https://example.com/",
          workerSecret: "worker-secret",
          agentWalletName: "agent-treasury",
          dryRun: true,
          executionEnabled: false
        },
        fetch: async () => {
          const error = new TypeError("fetch failed") as TypeError & { cause?: Error };
          error.cause = new Error("connect ETIMEDOUT 203.0.113.10:443");
          throw error;
        },
        logger: {
          log() {},
          error() {}
        }
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /https:\/\/example\.com\/api\/agent-spend\/pending-execution/);
      assert.match(error.message, /fetch failed/);
      assert.match(error.message, /connect ETIMEDOUT/);
      assert.doesNotMatch(error.message, /worker-secret/);
      return true;
    }
  );
});

test("worker pending non-2xx failure includes status and body", async () => {
  await assert.rejects(
    () =>
      runAgentWorkerOnce({
        config: {
          baseUrl: "https://example.com",
          workerSecret: "worker-secret",
          agentWalletName: "agent-treasury",
          dryRun: true,
          executionEnabled: false
        },
        fetch: async () =>
          new Response(JSON.stringify({ error: "worker_unauthorized" }), {
            status: 401,
            statusText: "Unauthorized"
          }),
        logger: {
          log() {},
          error() {}
        }
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 401 Unauthorized/);
      assert.match(error.message, /worker_unauthorized/);
      assert.doesNotMatch(error.message, /worker-secret/);
      return true;
    }
  );
});

test("worker dry-run does not send Telegram notification", async () => {
  const { paylinkService } = await seedPendingAgentSpend({
    telegram: {
      telegramUserId: "777",
      telegramChatId: "987654321",
      controllerWallet: "owner-alpha",
      originalTelegramCommand: "/spend 5 buy coffee"
    }
  });
  const pending = await listPendingAgentSpendExecutions({ paylinkService });
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const telegramClient: TelegramBotClient = {
    async sendMessage(chatId, text) {
      sentMessages.push({ chatId, text });
    }
  };

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: true,
      executionEnabled: false,
      telegramBotToken: "test-token"
    },
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith("/api/agent-spend/pending-execution")) {
        return Response.json({ pending });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
    telegramClient,
    logger: {
      log() {},
      error() {}
    }
  });

  assert.equal(result.confirmed, 0);
  assert.equal(sentMessages.length, 0);
});

test("worker confirmation sends Telegram notification when metadata exists", async () => {
  const { paylinkService } = await seedPendingAgentSpend({
    telegram: {
      telegramUserId: "777",
      telegramChatId: "987654321",
      controllerWallet: "owner-alpha",
      originalTelegramCommand: "/spend 5 buy coffee"
    }
  });
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const logs: string[] = [];
  const telegramClient: TelegramBotClient = {
    async sendMessage(chatId, text) {
      sentMessages.push({ chatId, text });
    }
  };

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: false,
      executionEnabled: true,
      telegramBotToken: "test-token"
    },
    fetch: await createWorkerFetch(paylinkService),
    executeMirage: async () => ({
      stdout: `signature ${VALID_SIGNATURE}`,
      stderr: ""
    }),
    telegramClient,
    logger: {
      log(message) {
        logs.push(message);
      },
      error() {}
    }
  });

  assert.equal(result.confirmed, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0]?.chatId, "987654321");
  assert.match(sentMessages[0]?.text ?? "", /Execution confirmed/);
  assert.match(sentMessages[0]?.text ?? "", /Agent: coffee-agent/);
  assert.match(sentMessages[0]?.text ?? "", /Amount: 5 USDC/);
  assert.match(sentMessages[0]?.text ?? "", new RegExp(`Devnet tx: ${VALID_SIGNATURE}`));
  assert.match(sentMessages[0]?.text ?? "", /Receipt: confirmed/);
  assert.ok(logs.includes("Telegram notification: sent"));
});

test("worker does not send Telegram notification for UI spend without chat metadata", async () => {
  const { paylinkService } = await seedPendingAgentSpend();
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const logs: string[] = [];
  const telegramClient: TelegramBotClient = {
    async sendMessage(chatId, text) {
      sentMessages.push({ chatId, text });
    }
  };

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: false,
      executionEnabled: true,
      telegramBotToken: "test-token"
    },
    fetch: await createWorkerFetch(paylinkService),
    executeMirage: async () => ({
      stdout: VALID_SIGNATURE,
      stderr: ""
    }),
    telegramClient,
    logger: {
      log(message) {
        logs.push(message);
      },
      error() {}
    }
  });

  assert.equal(result.confirmed, 1);
  assert.equal(sentMessages.length, 0);
  assert.ok(logs.includes("Telegram notification: skipped (no telegramChatId)"));
});

test("worker skips Telegram notification safely when token is missing", async () => {
  const { paylinkService } = await seedPendingAgentSpend({
    telegram: {
      telegramUserId: "777",
      telegramChatId: "987654321",
      controllerWallet: "owner-alpha"
    }
  });
  const sentMessages: Array<{ chatId: string; text: string }> = [];
  const warnings: string[] = [];
  const telegramClient: TelegramBotClient = {
    async sendMessage(chatId, text) {
      sentMessages.push({ chatId, text });
    }
  };

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: false,
      executionEnabled: true,
      telegramBotToken: null
    },
    fetch: await createWorkerFetch(paylinkService),
    executeMirage: async () => ({
      stdout: VALID_SIGNATURE,
      stderr: ""
    }),
    telegramClient,
    logger: {
      log() {},
      error(message) {
        warnings.push(message);
      }
    }
  });

  assert.equal(result.confirmed, 1);
  assert.equal(sentMessages.length, 0);
  assert.ok(warnings.includes("Telegram notification: skipped (missing TELEGRAM_BOT_TOKEN)"));
});

test("worker Mirage failure does not confirm receipt", async () => {
  const { paylinkService, paylink } = await seedPendingAgentSpend();
  let confirmCalls = 0;
  const errors: string[] = [];

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: false,
      executionEnabled: true
    },
    fetch: async (input) => {
      const url = String(input);

      if (url.endsWith("/api/agent-spend/pending-execution")) {
        return Response.json({ pending: await listPendingAgentSpendExecutions({ paylinkService }) });
      }

      if (url.endsWith("/api/agent-spend/confirm-manual")) {
        confirmCalls += 1;
        return Response.json({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    },
    executeMirage: async () => {
      throw new Error("mirage failed");
    },
    logger: {
      log() {},
      error(message) {
        errors.push(message);
      }
    }
  });

  const paymentIntent = await paylinkService.getPaymentIntentByPaylinkId(paylink.id);
  assert.equal(result.executed, 0);
  assert.equal(result.confirmed, 0);
  assert.equal(confirmCalls, 0);
  assert.equal(paymentIntent?.metadata?.agentLifecycle?.budgetReservationState, "reserved");
  assert.match(result.errors[0] ?? "", /mirage failed/);
  assert.ok(errors.some((message) => message.includes("Skipped")));
});

test("worker uses Mirage execution mint override while UI mint remains USDC", async () => {
  const { paylinkService } = await seedPendingAgentSpend();
  const pending = await listPendingAgentSpendExecutions({ paylinkService });
  let mirageArgv: string[] = [];
  const logs: string[] = [];
  const previousMint = process.env.MIRAGE_EXECUTION_MINT;

  process.env.MIRAGE_EXECUTION_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

  try {
    const result = await runAgentWorkerOnce({
      config: {
        baseUrl: "http://localhost",
        agentWalletName: "agent-treasury",
        dryRun: false,
        executionEnabled: true
      },
      fetch: await createWorkerFetch(paylinkService),
      executeMirage: async (argv) => {
        mirageArgv = argv;
        return {
          stdout: VALID_SIGNATURE,
          stderr: ""
        };
      },
      logger: {
        log(message) {
          logs.push(message);
        },
        error() {}
      }
    });

    assert.equal(result.confirmed, 1);
    assert.equal(pending[0]?.mint, "USDC");
    assert.equal(mirageArgv[mirageArgv.indexOf("--mint") + 1], "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
    assert.ok(logs.includes("displayMint=USDC executionMint=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"));
    const commandLog = logs.find((message) => message.includes("Pending spend") && message.includes("mirage transfer"));
    assert.ok(commandLog);
    assert.match(commandLog, /--mint 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU/);
    assert.doesNotMatch(commandLog, /--mint USDC/);
  } finally {
    if (previousMint === undefined) {
      delete process.env.MIRAGE_EXECUTION_MINT;
    } else {
      process.env.MIRAGE_EXECUTION_MINT = previousMint;
    }
  }
});

test("worker Mirage failure triggers Solana devnet SPL fallback", async () => {
  const { paylinkService, paylink } = await seedPendingAgentSpend();
  const fallbackSignature = "6".repeat(88);
  let fallbackCalls = 0;
  const confirmBodies: JsonRecord[] = [];
  const sentMessages: Array<{ chatId: string; text: string }> = [];

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: false,
      executionEnabled: true,
      telegramBotToken: "test-token",
      mirageExecutionMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      executionFallbackMode: "solana-devnet-spl",
      solanaExecutorSecretKeyJson: "[1,2,3]"
    },
    fetch: async (input, init) => {
      const url = String(input);

      if (url.endsWith("/api/agent-spend/pending-execution")) {
        return Response.json({ pending: await listPendingAgentSpendExecutions({ paylinkService }) });
      }

      if (url.endsWith("/api/agent-spend/confirm-manual")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as JsonRecord;
        confirmBodies.push(body);
        await paylinkService.confirmManualAgentSpend({
          paylinkId: String(body.paylinkId ?? ""),
          txSignature: String(body.txSignature ?? ""),
          executor: String(body.executor ?? ""),
          executionRail: String(body.executionRail ?? ""),
          mirageAttempted: body.mirageAttempted === true,
          mirageError: String(body.mirageError ?? "")
        });
        return Response.json({});
      }

      throw new Error(`Unexpected fetch: ${url}`);
    },
    executeMirage: async () => {
      throw new Error("Invalid param WrongSize");
    },
    executeSolanaDevnetSpl: async (input) => {
      fallbackCalls += 1;
      assert.equal(input.mint, "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
      assert.equal(input.amount, "5");
      assert.equal(input.recipient, DEFAULT_DEMO_AGENT_RECIPIENT);
      return { txSignature: fallbackSignature };
    },
    telegramClient: {
      async sendMessage(chatId, text) {
        sentMessages.push({ chatId, text });
      }
    },
    logger: {
      log() {},
      error() {}
    }
  });

  const paymentIntent = await paylinkService.getPaymentIntentByPaylinkId(paylink.id);
  assert.equal(result.confirmed, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal(confirmBodies[0]?.executor, "solana-devnet-spl-fallback");
  assert.equal(confirmBodies[0]?.executionRail, "solana-devnet-spl-fallback");
  assert.equal(confirmBodies[0]?.mirageAttempted, true);
  assert.equal(confirmBodies[0]?.mirageError, "Invalid param WrongSize");
  assert.equal(paymentIntent?.txSignature, fallbackSignature);
  assert.equal(paymentIntent?.metadata?.manualExecution?.executionRail, "solana-devnet-spl-fallback");
  assert.equal(paymentIntent?.metadata?.manualExecution?.mirageAttempted, true);
  assert.equal(paymentIntent?.metadata?.manualExecution?.mirageError, "Invalid param WrongSize");
});

test("worker fallback receipt sends Telegram fallback confirmation text", async () => {
  const { paylinkService } = await seedPendingAgentSpend({
    telegram: {
      telegramUserId: "777",
      telegramChatId: "987654321",
      controllerWallet: "owner-alpha"
    }
  });
  const fallbackSignature = "7".repeat(88);
  const sentMessages: Array<{ chatId: string; text: string }> = [];

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: false,
      executionEnabled: true,
      telegramBotToken: "test-token",
      mirageExecutionMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
      executionFallbackMode: "solana-devnet-spl",
      solanaExecutorSecretKeyJson: "[1,2,3]"
    },
    fetch: await createWorkerFetch(paylinkService),
    executeMirage: async () => {
      throw new Error("AccountNotFound");
    },
    executeSolanaDevnetSpl: async () => ({ txSignature: fallbackSignature }),
    telegramClient: {
      async sendMessage(chatId, text) {
        sentMessages.push({ chatId, text });
      }
    },
    logger: {
      log() {},
      error() {}
    }
  });

  assert.equal(result.confirmed, 1);
  assert.equal(sentMessages.length, 1);
  assert.equal(
    sentMessages[0]?.text,
    ["Execution confirmed", "Rail: Solana devnet SPL fallback", "Mirage command: attempted", `Tx: ${fallbackSignature}`].join(
      "\n"
    )
  );
});

test("Telegram send failure does not undo receipt confirmation", async () => {
  const { paylinkService, paylink } = await seedPendingAgentSpend({
    telegram: {
      telegramUserId: "777",
      telegramChatId: "987654321",
      controllerWallet: "owner-alpha"
    }
  });
  const warnings: string[] = [];
  const telegramClient: TelegramBotClient = {
    async sendMessage() {
      throw new Error("telegram unavailable");
    }
  };

  const result = await runAgentWorkerOnce({
    config: {
      baseUrl: "http://localhost",
      agentWalletName: "agent-treasury",
      dryRun: false,
      executionEnabled: true,
      telegramBotToken: "test-token"
    },
    fetch: await createWorkerFetch(paylinkService),
    executeMirage: async () => ({
      stdout: VALID_SIGNATURE,
      stderr: ""
    }),
    telegramClient,
    logger: {
      log() {},
      error(message) {
        warnings.push(message);
      }
    }
  });

  const paymentIntent = await paylinkService.getPaymentIntentByPaylinkId(paylink.id);
  assert.equal(result.confirmed, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(paymentIntent?.metadata?.agentLifecycle?.budgetReservationState, "confirmed");
  assert.equal(paymentIntent?.metadata?.manualExecution?.txSignature, VALID_SIGNATURE);
  assert.ok(warnings.some((message) => message.includes("Telegram notification: failed (telegram unavailable)")));
});

test("worker command validation rejects unsafe argv", async () => {
  assert.throws(
    () =>
      validateMirageTransferArgv([
        "transfer",
        "--wallet",
        "agent-treasury",
        "--to",
        DEFAULT_DEMO_AGENT_RECIPIENT,
        "--mint",
        "USDC",
        "--amount",
        "5",
        "--visibility",
        "public",
        "--cluster",
        "devnet",
        "--memo",
        "whisperpay:agent:coffee-agent:paylink:pl_1",
        "--min-delay-ms",
        "500",
        "--max-delay-ms",
        "5000",
        "--split",
        "4"
      ]),
    /visibility must be private/
  );
});

test("worker confirmation path is idempotent", async () => {
  const { paylinkService, budgetService, paylink } = await seedPendingAgentSpend();

  await paylinkService.confirmManualAgentSpend({
    paylinkId: paylink.id,
    txSignature: VALID_SIGNATURE,
    executor: "mirage-cli"
  });
  await paylinkService.confirmManualAgentSpend({
    paylinkId: paylink.id,
    txSignature: VALID_SIGNATURE,
    executor: "mirage-cli"
  });

  const budget = await budgetService.getAgentBudget("coffee-agent");
  const paymentIntent = await paylinkService.getPaymentIntentByPaylinkId(paylink.id);

  assert.equal(budget?.currentBalance, "95");
  assert.equal(budget?.spentToday, "5");
  assert.equal(paymentIntent?.metadata?.manualExecution?.executor, "mirage-cli");
});

test("confirm-manual still works for UI", async () => {
  const { paylinkService, paylink } = await seedPendingAgentSpend();
  const updated = await paylinkService.confirmManualAgentSpend({
    paylinkId: paylink.id,
    txSignature: VALID_SIGNATURE,
    executor: "mirage-cli"
  });

  assert.equal(updated.txSignature, VALID_SIGNATURE);
  assert.equal(updated.metadata?.agentLifecycle?.budgetReservationState, "confirmed");
});

test("browser API and webhook paths do not import execution helpers", async () => {
  const roots = [
    path.join(process.cwd(), "app", "api"),
    path.join(process.cwd(), "lib", "telegram")
  ];
  const files: string[] = [];
  const collect = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }) as Dirent[]) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        collect(fullPath);
      } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  };

  roots.forEach(collect);
  const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

  assert.equal(/node:child_process|child_process/.test(combined), false);
  assert.equal(/\bspawn\s*\(/.test(combined), false);
  assert.equal(/\bexec\s*\(/.test(combined), false);
  assert.equal(/@solana\/spl-token|createSolanaDevnetSplExecutor|agent-worker\/solana-devnet-spl/.test(combined), false);
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

  console.log(`Completed ${passed} agent worker tests.`);
};

void run();
