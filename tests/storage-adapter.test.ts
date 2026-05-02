import assert from "node:assert/strict";
import { SupabaseAgentBudgetRepository, type StoredAgentBudgetRecord } from "../lib/agent-budget";
import { SupabaseTelegramLinkRepository } from "../lib/telegram-link/database-repository";
import { SupabaseWhisperPayServerRepository } from "../lib/whisperpay-server/database-repository";
import { getStorageMode, getSupabaseDatabaseConfig } from "../lib/storage/config";
import type { SupabaseFetch } from "../lib/storage/supabase-rest";
import type { ServerPaymentIntent, ServerPaylink, ServerPaylinkMetadata } from "../lib/whisperpay-server/types";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

type JsonRecord = Record<string, unknown>;

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const fakeConfig = {
  url: "https://example.supabase.co",
  serviceRoleKey: "service-role"
};

class FakeSupabaseRest {
  readonly tables = new Map<string, JsonRecord[]>();

  readonly fetch: SupabaseFetch = async (input, init) => {
    const url = new URL(input);
    const table = url.pathname.split("/").pop();

    if (!table) {
      return this.response(404, { message: "Missing table." });
    }

    const method = init?.method ?? "GET";
    const rows = this.getTable(table);

    if (method === "GET") {
      const selected = this.applyQuery(rows, url.searchParams).map((row) => clone(row));
      return this.response(200, selected);
    }

    if (method === "POST") {
      const body = JSON.parse(init?.body ?? "[]") as JsonRecord | JsonRecord[];
      const inserted = (Array.isArray(body) ? body : [body]).map((row) => clone(row));
      const primaryKey = this.primaryKeyFor(table);

      for (const row of inserted) {
        if (primaryKey && rows.some((existing) => existing[primaryKey] === row[primaryKey])) {
          return this.response(409, { message: "duplicate key" });
        }

        rows.push(row);
      }

      return this.response(201, inserted);
    }

    if (method === "PATCH") {
      const patch = JSON.parse(init?.body ?? "{}") as JsonRecord;
      const selected = this.applyQuery(rows, url.searchParams);

      for (const row of selected) {
        Object.assign(row, clone(patch));
      }

      return this.response(200, selected.map((row) => clone(row)));
    }

    if (method === "DELETE") {
      const selected = new Set(this.applyQuery(rows, url.searchParams));
      const kept = rows.filter((row) => !selected.has(row));
      this.tables.set(table, kept);
      return this.response(200, []);
    }

    return this.response(405, { message: "Unsupported method." });
  };

  private getTable(table: string): JsonRecord[] {
    const existing = this.tables.get(table);

    if (existing) {
      return existing;
    }

    const created: JsonRecord[] = [];
    this.tables.set(table, created);
    return created;
  }

  private applyQuery(rows: JsonRecord[], searchParams: URLSearchParams): JsonRecord[] {
    const filtered = rows.filter((row) => {
      for (const [key, value] of searchParams.entries()) {
        if (key === "select" || key === "order") {
          continue;
        }

        const expected = value.startsWith("eq.") ? value.slice(3) : value;

        if (String(row[key]) !== expected) {
          return false;
        }
      }

      return true;
    });

    const order = searchParams.get("order");

    if (!order) {
      return filtered;
    }

    const [column, direction] = order.split(".");
    return filtered
      .sort((left, right) => {
        const result = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
        return direction === "desc" ? -result : result;
      });
  }

  private primaryKeyFor(table: string): string | null {
    if (table === "whispervault_controller_wallets") {
      return "address";
    }

    if (table === "whispervault_agent_budgets") {
      return "agent_id";
    }

    if (
      table === "whispervault_agent_budget_reservations" ||
      table === "whisperpay_paylinks" ||
      table === "whisperpay_payment_intents"
    ) {
      return "id";
    }

    return null;
  }

  private response(status: number, body: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status >= 200 && status < 300 ? "OK" : "Error",
      text: async () => JSON.stringify(body)
    };
  }
}

const createBudgetRecord = (): StoredAgentBudgetRecord => ({
  budget: {
    agentId: "coffee-agent",
    owner: "controller-wallet",
    agentWallet: "agent-wallet",
    mint: "USDC_OR_MINT_ADDRESS",
    totalBudget: "300",
    currentBalance: "300",
    dailyCapPercent: 30,
    spentToday: "0",
    lastResetAt: "2026-04-25T10:00:00.000Z",
    status: "active",
    rail: "magicblock-private",
    allowPublicFallback: false,
    metadata: {
      demo: false,
      category: "coffee"
    }
  },
  reservations: []
});

test("SupabaseAgentBudgetRepository persists budgets, controller wallets, and reservation state", async () => {
  const fake = new FakeSupabaseRest();
  const repository = new SupabaseAgentBudgetRepository({ config: fakeConfig, fetch: fake.fetch });
  const created = await repository.create(createBudgetRecord());

  assert.equal(created.budget.agentId, "coffee-agent");
  assert.deepEqual(fake.tables.get("whispervault_controller_wallets")?.map((row) => row.address), [
    "controller-wallet"
  ]);

  const withReservation: StoredAgentBudgetRecord = {
    budget: {
      ...created.budget,
      currentBalance: "295",
      spentToday: "5"
    },
    reservations: [
      {
        id: "abr_1",
        amount: "5",
        reference: "coffee",
        paylinkId: "pl_1",
        createdAt: "2026-04-25T10:01:00.000Z",
        status: "confirmed",
        paymentId: "pub_1",
        settledAt: "2026-04-25T10:02:00.000Z",
        releasedAt: null,
        releasedReason: null
      }
    ]
  };

  await repository.save(withReservation);

  const fetched = await repository.get("coffee-agent");
  assert.deepEqual(fetched, withReservation);
  assert.deepEqual(await repository.list(), [withReservation]);
});

test("SupabaseWhisperPayServerRepository persists paylink and payment intent metadata", async () => {
  const fake = new FakeSupabaseRest();
  const repository = new SupabaseWhisperPayServerRepository({ config: fakeConfig, fetch: fake.fetch });
  const paylink: ServerPaylink = {
    id: "pl_1",
    ownerWallet: "recipient-wallet",
    nickname: "coffee-agent-coffee-pay",
    defaultToken: "USDC",
    createdAt: "2026-04-25T10:00:00.000Z",
    isActive: true,
    metadata: {
      mint: "USDC_OR_MINT_ADDRESS",
      amount: "5",
      recipient: "recipient-wallet",
      privacyMode: "private",
      allowPublicFallback: false
    }
  };

  await repository.createPaylink(paylink);
  await repository.updatePaylink({
    ...paylink,
    metadata: {
      ...(paylink.metadata as ServerPaylinkMetadata),
      telegram: {
        source: "telegram",
        telegramUserId: "777",
        telegramChatId: "987654321",
        controllerWallet: "controller-wallet",
        originalTelegramCommand: "/spend 5 buy coffee"
      },
      agentPlan: {
        agentId: "coffee-agent",
        requestedGoal: "buy coffee",
        category: "coffee",
        rail: "magicblock-private",
        privacyMode: "private",
        allowPublicFallback: false,
        budgetPolicySnapshot: {
          dailyCapPercent: 30,
          spentToday: "0",
          remainingDailyCapBefore: "30",
          remainingDailyCapAfter: "25"
        },
        memo: "whisperpay:agent:coffee-agent:paylink:pl_1",
        privateRail: {
          settlementRail: "magicblock-private-spl",
          magicPrivateEnabled: true,
          memoSource: "agent-spend",
          reveal: {
            source: "magicblock-private-memo",
            authorization: "magicblock-permission-membership"
          },
          budgetVaultPermissionHook: "not-connected"
        },
        receipt: {
          type: "agent-private-receipt",
          memoReveal: "permissioned",
          mode: "manual"
        },
        source: "telegram",
        telegram: {
          source: "telegram",
          telegramUserId: "777",
          telegramChatId: "987654321",
          controllerWallet: "controller-wallet",
          originalTelegramCommand: "/spend 5 buy coffee"
        }
      }
    }
  });

  const paymentIntent: ServerPaymentIntent = {
    id: "pub_1",
    paylinkId: "pl_1",
    fromWallet: "agent-wallet",
    toWallet: "recipient-wallet",
    settlementRail: "magicblock-private-spl",
    tokenSymbol: "USDC",
    status: "pending",
    createdAt: "2026-04-25T10:00:01.000Z",
    txSignature: null,
    erLifecycle: null,
    magicPrivate: {
      enabled: true,
      visibility: "private",
      mint: "USDC_OR_MINT_ADDRESS",
      sendTarget: null,
      txBuilderSource: null
    },
    amount: "5",
    mint: "USDC_OR_MINT_ADDRESS",
    recipient: "recipient-wallet",
    metadata: {
      mint: "USDC_OR_MINT_ADDRESS",
      amount: "5",
      recipient: "recipient-wallet",
      privacyMode: "private",
      allowPublicFallback: false,
      telegram: {
        source: "telegram",
        telegramUserId: "777",
        telegramChatId: "987654321",
        controllerWallet: "controller-wallet",
        originalTelegramCommand: "/spend 5 buy coffee"
      },
      memo: "whisperpay:agent:coffee-agent:paylink:pl_1",
      manualExecution: {
        executor: "mirage-cli",
        txSignature: "5".repeat(88),
        confirmedAt: "2026-04-25T10:05:00.000Z"
      }
    }
  };

  await repository.createPaymentIntent(paymentIntent);
  await repository.updatePaymentIntent({
    ...paymentIntent,
    status: "sent",
    txSignature: paymentIntent.metadata?.manualExecution?.txSignature ?? null
  });

  const fetchedPaylink = await repository.getPaylink("pl_1");
  const fetchedPaymentIntent = await repository.getPaymentIntent("pub_1");

  assert.equal(fetchedPaylink?.metadata?.agentPlan?.receipt?.type, "agent-private-receipt");
  assert.equal(fetchedPaylink?.metadata?.agentPlan?.privateRail?.reveal.authorization, "magicblock-permission-membership");
  assert.equal(fetchedPaylink?.metadata?.telegram?.telegramChatId, "987654321");
  assert.equal(fetchedPaylink?.metadata?.agentPlan?.telegram?.originalTelegramCommand, "/spend 5 buy coffee");
  assert.equal(fetchedPaymentIntent?.status, "sent");
  assert.equal(fetchedPaymentIntent?.metadata?.manualExecution?.executor, "mirage-cli");
  assert.equal(fetchedPaymentIntent?.metadata?.telegram?.telegramUserId, "777");
  assert.deepEqual(await repository.listPaymentIntents(), [fetchedPaymentIntent]);
});

test("storage mode defaults to local and validates database env clearly", async () => {
  assert.equal(getStorageMode({ NODE_ENV: "development" }), "local");
  assert.equal(
    getStorageMode({
      NODE_ENV: "production",
      DATABASE_URL: "postgres://migration-only"
    }),
    "local"
  );
  assert.equal(
    getStorageMode({
      NODE_ENV: "production",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role"
    }),
    "database"
  );
  assert.throws(
    () =>
      getSupabaseDatabaseConfig({
        STORAGE_MODE: "database"
      } as unknown as NodeJS.ProcessEnv),
    /SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing/
  );
});

test("SupabaseTelegramLinkRepository persists link codes and linked accounts", async () => {
  const fake = new FakeSupabaseRest();
  const repository = new SupabaseTelegramLinkRepository({
    config: fakeConfig,
    fetch: fake.fetch
  });

  await repository.createLinkCode({
    code: "ABCD2345",
    controllerWallet: "controller-wallet",
    expiresAt: "2026-05-01T10:10:00.000Z",
    consumedAt: null,
    createdAt: "2026-05-01T10:00:00.000Z"
  });

  await repository.saveLinkCode({
    code: "ABCD2345",
    controllerWallet: "controller-wallet",
    expiresAt: "2026-05-01T10:10:00.000Z",
    consumedAt: "2026-05-01T10:02:00.000Z",
    createdAt: "2026-05-01T10:00:00.000Z"
  });

  await repository.upsertLinkedAccount({
    telegramUserId: "12345",
    controllerWallet: "controller-wallet",
    createdAt: "2026-05-01T10:02:00.000Z",
    updatedAt: "2026-05-01T10:02:00.000Z"
  });

  const code = await repository.getLinkCode("ABCD2345");
  const linked = await repository.getLinkedAccount("12345");

  assert.equal(code?.consumedAt, "2026-05-01T10:02:00.000Z");
  assert.equal(linked?.controllerWallet, "controller-wallet");
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

  console.log(`Completed ${passed} storage adapter tests.`);
};

void run();
