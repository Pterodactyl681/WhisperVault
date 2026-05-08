import type { StoredAgentBudgetRecord } from "../lib/agent-budget";
import {
  DEFAULT_DEMO_AGENT_AMOUNT,
  DEFAULT_DEMO_AGENT_CATEGORY,
  DEFAULT_DEMO_AGENT_GOAL,
  DEFAULT_DEMO_AGENT_ID,
  DEFAULT_DEMO_AGENT_MINT,
  DEFAULT_DEMO_AGENT_OWNER,
  DEFAULT_DEMO_AGENT_RECIPIENT,
  getDefaultAgentBudgetDevStorePath
} from "../lib/agent-budget";

export const AGENT_BUDGETS_URL = "http://localhost:3000/agent-budgets";

export const createDeterministicDemoRecord = (now: Date): StoredAgentBudgetRecord => ({
  budget: {
    agentId: DEFAULT_DEMO_AGENT_ID,
    owner: DEFAULT_DEMO_AGENT_OWNER,
    mint: DEFAULT_DEMO_AGENT_MINT,
    totalBudget: "300",
    currentBalance: "300",
    dailyCapPercent: 30,
    spentToday: "0",
    lastResetAt: now.toISOString(),
    status: "active",
    rail: "magicblock-private",
    allowPublicFallback: false,
    allowanceMode: "rolling",
    liveAllowance: "10",
    refillAmount: "5",
    refillIntervalMinutes: 10,
    maxLiveAllowance: "20",
    lastRefillAt: now.toISOString(),
    sessionEndsAt: null,
    clawbackOnSessionEnd: true,
    metadata: {
      demo: true,
      category: DEFAULT_DEMO_AGENT_CATEGORY,
      description: "Hackathon demo agent budget"
    }
  },
  reservations: []
});

export const isDemoBudgetRecord = (record: StoredAgentBudgetRecord): boolean =>
  record.budget.metadata?.demo === true;

export const printDemoSummary = (headline: string, details: string[]): void => {
  console.log(headline);

  for (const detail of details) {
    console.log(`- ${detail}`);
  }

  console.log(`- Local URL: ${AGENT_BUDGETS_URL}`);
  console.log(`- Suggested goal: "${DEFAULT_DEMO_AGENT_GOAL}"`);
  console.log(`- Suggested amount: "${DEFAULT_DEMO_AGENT_AMOUNT}"`);
  console.log(`- Suggested category: "${DEFAULT_DEMO_AGENT_CATEGORY}"`);
  console.log(`- Suggested recipient: "${DEFAULT_DEMO_AGENT_RECIPIENT}"`);
  console.log("- Run the generated Mirage command from Claude Code or your terminal.");
};

export const printDemoBudgetShape = (): string =>
  `${DEFAULT_DEMO_AGENT_ID} owned by ${DEFAULT_DEMO_AGENT_OWNER} using ${DEFAULT_DEMO_AGENT_MINT} on magicblock-private`;

export const printDevStorePath = (): string => getDefaultAgentBudgetDevStorePath();
