import assert from "node:assert/strict";
import {
  AgentBudgetService,
  DEFAULT_DEMO_AGENT_AMOUNT,
  DEFAULT_DEMO_AGENT_CATEGORY,
  DEFAULT_DEMO_AGENT_GOAL,
  DEFAULT_DEMO_AGENT_ID,
  DEFAULT_DEMO_AGENT_MINT,
  DEFAULT_DEMO_AGENT_OWNER,
  DEFAULT_DEMO_AGENT_RECIPIENT,
  DevFileAgentBudgetRepository,
  InMemoryAgentBudgetRepository,
  type StoredAgentBudgetRecord
} from "../lib/agent-budget";
import { createAgentPlanHttpHandlers } from "../lib/agent-plan/http";
import { AGENT_BUDGET_OWNER_HEADER } from "../lib/agent-vault/http";
import { WhisperPayServerService } from "../lib/whisperpay-server/service";

export interface AgentPlanRuntimeResult {
  response: Response;
  body: Record<string, unknown>;
}

export interface LocalAgentPlanHarness {
  budgetService: AgentBudgetService;
  paylinkService: WhisperPayServerService;
  seededRecord: StoredAgentBudgetRecord;
  repository: InMemoryAgentBudgetRepository;
  handlers: ReturnType<typeof createAgentPlanHttpHandlers>;
}

export interface LocalAgentPlanInput {
  agentId: string;
  goal: string;
  amount: string;
  mint: string;
  recipient: string;
  category?: string;
  rail?: "magicblock-private";
}

export const DEV_AGENT_ID = DEFAULT_DEMO_AGENT_ID;
export const DEV_AGENT_OWNER = DEFAULT_DEMO_AGENT_OWNER;
export const DEV_AGENT_RECIPIENT = DEFAULT_DEMO_AGENT_RECIPIENT;

const cloneRecord = (record: StoredAgentBudgetRecord): StoredAgentBudgetRecord =>
  JSON.parse(JSON.stringify(record)) as StoredAgentBudgetRecord;

const createDeterministicIdFactory = (scope: string) => {
  const counts = new Map<string, number>();

  return (prefix: string): string => {
    const nextCount = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, nextCount);
    return `${prefix}_${scope}_${nextCount.toString().padStart(3, "0")}`;
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

export const readJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

export const ensureSeededDemoBudget = async (): Promise<StoredAgentBudgetRecord> => {
  const repository = new DevFileAgentBudgetRepository();
  const record = await repository.get(DEV_AGENT_ID);

  assert.ok(
    record,
    `Seeded demo budget for "${DEV_AGENT_ID}" was not found. Run npm run demo:agent-vault:reset and npm run demo:agent-vault:seed first.`
  );

  assert.equal(record.budget.agentId, DEV_AGENT_ID);
  assert.equal(record.budget.owner, DEV_AGENT_OWNER);
  assert.equal(record.budget.mint, DEFAULT_DEMO_AGENT_MINT);
  assert.equal(record.budget.totalBudget, "300");
  assert.equal(record.budget.currentBalance, "300");
  assert.equal(record.budget.dailyCapPercent, 30);
  assert.equal(record.budget.rail, "magicblock-private");
  assert.equal(record.budget.allowPublicFallback, false);
  assert.equal(record.reservations.length, 0);

  return record;
};

export const createCoffeeAllowedRequest = (): LocalAgentPlanInput => ({
  agentId: DEV_AGENT_ID,
  goal: DEFAULT_DEMO_AGENT_GOAL,
  amount: DEFAULT_DEMO_AGENT_AMOUNT,
  mint: DEFAULT_DEMO_AGENT_MINT,
  category: DEFAULT_DEMO_AGENT_CATEGORY,
  recipient: DEV_AGENT_RECIPIENT,
  rail: "magicblock-private"
});

export const createCoffeeRejectedRequest = (): LocalAgentPlanInput => ({
  agentId: DEV_AGENT_ID,
  goal: "buy expensive gear for 100 USDC",
  amount: "100",
  mint: DEFAULT_DEMO_AGENT_MINT,
  category: "gear",
  recipient: DEV_AGENT_RECIPIENT,
  rail: "magicblock-private"
});

export const createLocalAgentPlanHarness = async (scope: string): Promise<LocalAgentPlanHarness> => {
  const seededRecord = await ensureSeededDemoBudget();
  const repository = new InMemoryAgentBudgetRepository();
  await repository.create(cloneRecord(seededRecord));

  const fixedNow = (): Date => new Date(seededRecord.budget.lastResetAt);
  const budgetService = new AgentBudgetService({
    repository,
    now: fixedNow
  });
  const paylinkService = new WhisperPayServerService({
    now: fixedNow,
    createId: createDeterministicIdFactory(scope)
  });
  const handlers = createAgentPlanHttpHandlers({
    budgetService,
    paylinkService,
    isEnabled: () => true
  });

  return {
    budgetService,
    paylinkService,
    seededRecord,
    repository,
    handlers
  };
};

export const createLocalAgentPlan = async (
  harness: LocalAgentPlanHarness,
  input: LocalAgentPlanInput
): Promise<AgentPlanRuntimeResult> => {
  const response = await harness.handlers.createPlan(
    new Request("http://localhost/api/agent-plan", withOwner(DEV_AGENT_OWNER, {
      method: "POST",
      body: JSON.stringify({
        ...input,
        rail: input.rail ?? "magicblock-private"
      })
    }))
  );

  return {
    response,
    body: await readJson(response)
  };
};

export const runLocalAgentPlan = async (
  input: LocalAgentPlanInput,
  scope = "runtime"
): Promise<AgentPlanRuntimeResult> => {
  const harness = await createLocalAgentPlanHarness(scope);
  return createLocalAgentPlan(harness, input);
};
