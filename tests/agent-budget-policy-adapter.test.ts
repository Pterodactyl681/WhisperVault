import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AgentBudgetService,
  AnchorPolicyConfigurationError,
  parseAgentBudgetPolicyConfig,
  getAgentBudgetPolicyAdapter
} from "../lib/agent-budget";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const validBudgetVaultIdl = (address = "FgZ3QRTju3jCdmGaznHpH8MiKjcfPwoPrHPquyytV8QB"): Record<string, unknown> => ({
  address,
  metadata: {
    name: "budget_vault",
    version: "0.1.0"
  },
  instructions: [
    {
      name: "create_vault"
    },
    {
      name: "check_and_spend"
    },
    {
      name: "reset_daily"
    }
  ],
  accounts: [
    {
      name: "BudgetVault"
    }
  ]
});

const writeIdl = async (fileName: string, idl: unknown): Promise<string> => {
  const dir = path.join(process.cwd(), ".test-dist", "policy-adapter-tests");
  await mkdir(dir, { recursive: true });
  const idlPath = path.join(dir, fileName);
  await writeFile(idlPath, JSON.stringify(idl, null, 2), "utf8");
  return idlPath;
};

test("default policy mode is offchain", async () => {
  const config = parseAgentBudgetPolicyConfig({
    env: {},
    warn: () => undefined
  });
  const adapter = getAgentBudgetPolicyAdapter({
    config,
    service: new AgentBudgetService()
  });

  assert.equal(config.mode, "offchain");
  assert.equal(adapter.mode, "offchain");
});

test("explicit offchain policy mode uses the current service behavior", async () => {
  const adapter = getAgentBudgetPolicyAdapter({
    config: parseAgentBudgetPolicyConfig({
      env: {
        AGENT_BUDGET_POLICY_MODE: "offchain"
      }
    }),
    service: new AgentBudgetService({
      now: () => new Date("2026-04-25T10:00:00.000Z")
    })
  });

  const budget = await adapter.createBudget({
    agentId: "agent-policy-offchain",
    owner: "owner-policy",
    mint: "USDC",
    totalBudget: "100",
    rail: "magicblock-private"
  });

  assert.equal(adapter.mode, "offchain");
  assert.equal(budget.currentBalance, "100");
  assert.equal((await adapter.canSpend("agent-policy-offchain", "10")).allowed, true);
});

test("invalid policy mode falls back to offchain with a warning", async () => {
  const warnings: string[] = [];
  const config = parseAgentBudgetPolicyConfig({
    env: {
      AGENT_BUDGET_POLICY_MODE: "sideways"
    },
    warn: (message) => warnings.push(message)
  });

  assert.equal(config.mode, "offchain");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Invalid AGENT_BUDGET_POLICY_MODE/);
});

test("anchor policy mode loads valid BudgetVault IDL artifacts", async () => {
  const idlPath = await writeIdl("budget_vault.valid.json", validBudgetVaultIdl());
  const adapter = getAgentBudgetPolicyAdapter({
    config: parseAgentBudgetPolicyConfig({
      env: {
        AGENT_BUDGET_POLICY_MODE: "anchor"
      }
    }),
    idlPath
  });

  assert.equal(adapter.mode, "anchor");
  assert.equal("artifact" in adapter, true);
});

test("anchor policy mode fails clearly when the IDL is missing", async () => {
  assert.throws(
    () =>
      getAgentBudgetPolicyAdapter({
        config: parseAgentBudgetPolicyConfig({
          env: {
            AGENT_BUDGET_POLICY_MODE: "anchor"
          }
        }),
        idlPath: path.join(".test-dist", "policy-adapter-tests", "missing-budget-vault.json")
      }),
    (error: unknown) =>
      error instanceof AnchorPolicyConfigurationError &&
      /requires BudgetVault IDL/.test(error.message)
  );
});

test("anchor policy mode fails clearly when program id config is missing from env and artifacts", async () => {
  const idlPath = await writeIdl("budget_vault.missing-address.json", {
    ...validBudgetVaultIdl(),
    address: undefined
  });

  assert.throws(
    () =>
      getAgentBudgetPolicyAdapter({
        config: parseAgentBudgetPolicyConfig({
          env: {
            AGENT_BUDGET_POLICY_MODE: "anchor"
          }
        }),
        idlPath
      }),
    (error: unknown) =>
      error instanceof AnchorPolicyConfigurationError &&
      /BudgetVault IDL address must be a valid Solana public key/.test(error.message)
  );
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

  console.log(`Completed ${passed} agent budget policy adapter tests.`);
};

void run();
