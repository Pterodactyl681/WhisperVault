export type AgentBudgetPolicyMode = "offchain" | "anchor";

export interface AgentBudgetPolicyConfig {
  mode: AgentBudgetPolicyMode;
  anchorProviderUrl?: string;
  anchorWallet?: string;
  budgetVaultProgramId?: string;
}

type EnvLike = Record<string, string | undefined>;

interface ParseAgentBudgetPolicyConfigOptions {
  env?: EnvLike;
  warn?: (message: string) => void;
}

const DEFAULT_POLICY_MODE: AgentBudgetPolicyMode = "offchain";
const VALID_POLICY_MODES = new Set<AgentBudgetPolicyMode>(["offchain", "anchor"]);

const normalizeOptionalEnv = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export const parseAgentBudgetPolicyMode = (
  value: string | undefined,
  warn: (message: string) => void = console.warn
): AgentBudgetPolicyMode => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return DEFAULT_POLICY_MODE;
  }

  if (VALID_POLICY_MODES.has(normalized as AgentBudgetPolicyMode)) {
    return normalized as AgentBudgetPolicyMode;
  }

  warn(
    `Invalid AGENT_BUDGET_POLICY_MODE "${value}". Expected "offchain" or "anchor"; falling back to "offchain".`
  );
  return DEFAULT_POLICY_MODE;
};

export const parseAgentBudgetPolicyConfig = (
  options: ParseAgentBudgetPolicyConfigOptions = {}
): AgentBudgetPolicyConfig => {
  const env = options.env ?? process.env;
  const warn = options.warn ?? console.warn;

  return {
    mode: parseAgentBudgetPolicyMode(env.AGENT_BUDGET_POLICY_MODE, warn),
    anchorProviderUrl: normalizeOptionalEnv(env.ANCHOR_PROVIDER_URL),
    anchorWallet: normalizeOptionalEnv(env.ANCHOR_WALLET),
    budgetVaultProgramId: normalizeOptionalEnv(env.BUDGET_VAULT_PROGRAM_ID)
  };
};
