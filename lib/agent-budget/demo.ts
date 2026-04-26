import type { CreateAgentBudgetInput } from "./types";
export {
  DEFAULT_DEMO_AGENT_AMOUNT,
  DEFAULT_DEMO_AGENT_CATEGORY,
  DEFAULT_DEMO_AGENT_GOAL,
  DEFAULT_DEMO_AGENT_ID,
  DEFAULT_DEMO_AGENT_MINT,
  DEFAULT_DEMO_AGENT_OWNER,
  DEFAULT_DEMO_AGENT_RECIPIENT
} from "./demo-constants";
import {
  DEFAULT_DEMO_AGENT_CATEGORY,
  DEFAULT_DEMO_AGENT_ID,
  DEFAULT_DEMO_AGENT_MINT,
  DEFAULT_DEMO_AGENT_OWNER
} from "./demo-constants";

export const createDemoAgentBudgetInput = (): CreateAgentBudgetInput => ({
  agentId: DEFAULT_DEMO_AGENT_ID,
  owner: DEFAULT_DEMO_AGENT_OWNER,
  mint: DEFAULT_DEMO_AGENT_MINT,
  totalBudget: "300",
  currentBalance: "300",
  dailyCapPercent: 30,
  spentToday: "0",
  status: "active",
  rail: "magicblock-private",
  allowPublicFallback: false,
  metadata: {
    demo: true,
    category: DEFAULT_DEMO_AGENT_CATEGORY,
    description: "Hackathon demo agent budget"
  }
});
