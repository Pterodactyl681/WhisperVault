import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";
import { AgentBudgetService } from "./service";
import type {
  AgentBudget,
  AgentBudgetAmountInput,
  AgentBudgetConfirmationReceipt,
  AgentBudgetReleaseReceipt,
  AgentBudgetReservationReceipt,
  AgentBudgetReservationTransitionReceipt,
  AgentBudgetSpendDecision,
  CreateAgentBudgetInput,
  ReserveSpendReference
} from "./types";
import {
  type AgentBudgetPolicyConfig,
  type AgentBudgetPolicyMode,
  parseAgentBudgetPolicyConfig
} from "./policy-config";

export class AnchorPolicyConfigurationError extends Error {
  readonly code = "anchor_policy_configuration_error";

  constructor(message: string) {
    super(message);
    this.name = "AnchorPolicyConfigurationError";
  }
}

export class AnchorPolicyLiveClientNotConnectedError extends Error {
  readonly code = "anchor_live_client_not_connected";

  constructor(action: string) {
    super(
      `Anchor policy adapter cannot ${action}: live RPC/client calls are not connected yet. ` +
        "This adapter currently validates BudgetVault artifacts and configuration only."
    );
    this.name = "AnchorPolicyLiveClientNotConnectedError";
  }
}

export interface AgentBudgetPolicyAdapter {
  readonly mode: AgentBudgetPolicyMode;
  createBudget(input: CreateAgentBudgetInput): Promise<AgentBudget>;
  getBudget(agentId: string): Promise<AgentBudget | null>;
  listBudgets(): Promise<AgentBudget[]>;
  canSpend(agentId: string, amount: AgentBudgetAmountInput): Promise<AgentBudgetSpendDecision>;
  reserveSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reference?: ReserveSpendReference
  ): Promise<AgentBudgetReservationReceipt>;
  confirmSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetConfirmationReceipt>;
  releaseReservedSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReleaseReceipt>;
  resetDailyIfNeeded(agentId: string): Promise<AgentBudget>;
  pauseBudget(agentId: string): Promise<AgentBudget>;
  resumeBudget(agentId: string): Promise<AgentBudget>;
  confirmReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetReservationTransitionReceipt>;
  releaseReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReservationTransitionReceipt>;
}

export interface AnchorBudgetVaultArtifactSummary {
  idlPath: string;
  programId: string;
  name: string;
  version: string | null;
  instructions: string[];
}

interface AnchorBudgetVaultIdl {
  address?: unknown;
  metadata?: {
    name?: unknown;
    version?: unknown;
  };
  instructions?: Array<{
    name?: unknown;
  }>;
  accounts?: Array<{
    name?: unknown;
  }>;
}

interface OffchainAgentBudgetPolicyAdapterOptions {
  service?: AgentBudgetService;
}

interface AnchorAgentBudgetPolicyAdapterOptions {
  config?: AgentBudgetPolicyConfig;
  cwd?: string;
  idlPath?: string;
}

interface AgentBudgetPolicyAdapterFactoryOptions {
  config?: AgentBudgetPolicyConfig;
  service?: AgentBudgetService;
  cwd?: string;
  idlPath?: string;
}

const BUDGET_VAULT_IDL_PATH = path.join("target", "idl", "budget_vault.json");
const REQUIRED_BUDGET_VAULT_INSTRUCTIONS = ["create_vault", "check_and_spend", "reset_daily"];

const readJsonFile = (filePath: string): unknown => JSON.parse(readFileSync(filePath, "utf8"));

const assertValidSolanaAddress = (value: string, fieldName: string): string => {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new AnchorPolicyConfigurationError(`${fieldName} must be a valid Solana public key.`);
  }
};

const normalizeIdlString = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const loadBudgetVaultArtifact = (
  idlPath: string,
  configuredProgramId?: string
): AnchorBudgetVaultArtifactSummary => {
  if (!existsSync(idlPath)) {
    throw new AnchorPolicyConfigurationError(
      `Anchor policy mode requires BudgetVault IDL at ${idlPath}. Run "npm run anchor:build" or set AGENT_BUDGET_POLICY_MODE=offchain.`
    );
  }

  let idl: AnchorBudgetVaultIdl;

  try {
    idl = readJsonFile(idlPath) as AnchorBudgetVaultIdl;
  } catch (error) {
    throw new AnchorPolicyConfigurationError(
      `Anchor policy mode could not read BudgetVault IDL at ${idlPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  const name = normalizeIdlString(idl.metadata?.name);

  if (name !== "budget_vault") {
    throw new AnchorPolicyConfigurationError(
      `Anchor policy mode expected BudgetVault IDL metadata.name to be "budget_vault"; received "${name ?? "missing"}".`
    );
  }

  const instructions = (idl.instructions ?? [])
    .map((instruction) => normalizeIdlString(instruction.name))
    .filter((instruction): instruction is string => Boolean(instruction));
  const missingInstructions = REQUIRED_BUDGET_VAULT_INSTRUCTIONS.filter(
    (instruction) => !instructions.includes(instruction)
  );

  if (missingInstructions.length > 0) {
    throw new AnchorPolicyConfigurationError(
      `Anchor policy mode BudgetVault IDL is missing required instruction(s): ${missingInstructions.join(", ")}.`
    );
  }

  const hasBudgetVaultAccount = (idl.accounts ?? []).some((account) => normalizeIdlString(account.name) === "BudgetVault");

  if (!hasBudgetVaultAccount) {
    throw new AnchorPolicyConfigurationError('Anchor policy mode BudgetVault IDL is missing the "BudgetVault" account.');
  }

  const programId = assertValidSolanaAddress(
    configuredProgramId ?? normalizeIdlString(idl.address) ?? "",
    configuredProgramId ? "BUDGET_VAULT_PROGRAM_ID" : "BudgetVault IDL address"
  );

  return {
    idlPath,
    programId,
    name,
    version: normalizeIdlString(idl.metadata?.version),
    instructions
  };
};

const isAgentBudgetPolicyAdapter = (
  value: AgentBudgetService | AgentBudgetPolicyAdapter
): value is AgentBudgetPolicyAdapter => "mode" in value && typeof value.mode === "string";

const toOffchainAdapter = (value: AgentBudgetService | AgentBudgetPolicyAdapter): AgentBudgetPolicyAdapter => {
  if (isAgentBudgetPolicyAdapter(value)) {
    return value;
  }

  return new OffchainAgentBudgetPolicyAdapter({
    service: value
  });
};

export class OffchainAgentBudgetPolicyAdapter implements AgentBudgetPolicyAdapter {
  readonly mode = "offchain" as const;

  private readonly service: AgentBudgetService;

  constructor(options: OffchainAgentBudgetPolicyAdapterOptions = {}) {
    this.service = options.service ?? new AgentBudgetService();
  }

  createBudget(input: CreateAgentBudgetInput): Promise<AgentBudget> {
    return this.service.createAgentBudget(input);
  }

  getBudget(agentId: string): Promise<AgentBudget | null> {
    return this.service.getAgentBudget(agentId);
  }

  listBudgets(): Promise<AgentBudget[]> {
    return this.service.listAgentBudgets();
  }

  canSpend(agentId: string, amount: AgentBudgetAmountInput): Promise<AgentBudgetSpendDecision> {
    return this.service.canSpend(agentId, amount);
  }

  reserveSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reference?: ReserveSpendReference
  ): Promise<AgentBudgetReservationReceipt> {
    return this.service.reserveSpend(agentId, amount, reference);
  }

  confirmSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetConfirmationReceipt> {
    return this.service.confirmSpend(agentId, amount, paymentId);
  }

  releaseReservedSpend(
    agentId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReleaseReceipt> {
    return this.service.releaseReservedSpend(agentId, amount, reason);
  }

  resetDailyIfNeeded(agentId: string): Promise<AgentBudget> {
    return this.service.resetDailyIfNeeded(agentId);
  }

  pauseBudget(agentId: string): Promise<AgentBudget> {
    return this.service.pauseAgentBudget(agentId);
  }

  resumeBudget(agentId: string): Promise<AgentBudget> {
    return this.service.resumeAgentBudget(agentId);
  }

  confirmReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    paymentId: string
  ): Promise<AgentBudgetReservationTransitionReceipt> {
    return this.service.confirmReservedSpendByPaylink(agentId, paylinkId, amount, paymentId);
  }

  releaseReservedSpendByPaylink(
    agentId: string,
    paylinkId: string,
    amount: AgentBudgetAmountInput,
    reason: string
  ): Promise<AgentBudgetReservationTransitionReceipt> {
    return this.service.releaseReservedSpendByPaylink(agentId, paylinkId, amount, reason);
  }
}

export class AnchorAgentBudgetPolicyAdapter implements AgentBudgetPolicyAdapter {
  readonly mode = "anchor" as const;

  readonly artifact: AnchorBudgetVaultArtifactSummary;

  readonly providerUrl?: string;

  readonly walletPath?: string;

  constructor(options: AnchorAgentBudgetPolicyAdapterOptions = {}) {
    const config = options.config ?? parseAgentBudgetPolicyConfig();
    const cwd = options.cwd ?? process.cwd();
    const idlPath = path.resolve(cwd, options.idlPath ?? BUDGET_VAULT_IDL_PATH);

    this.artifact = loadBudgetVaultArtifact(idlPath, config.budgetVaultProgramId);
    this.providerUrl = config.anchorProviderUrl;
    this.walletPath = config.anchorWallet;
  }

  // TODO(anchor-policy): construct the live Anchor client here once on-chain budget reads/writes are enabled.
  createBudget(): Promise<AgentBudget> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("create a budget"));
  }

  getBudget(): Promise<AgentBudget | null> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("read a budget"));
  }

  listBudgets(): Promise<AgentBudget[]> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("list budgets"));
  }

  canSpend(): Promise<AgentBudgetSpendDecision> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("evaluate spend"));
  }

  reserveSpend(): Promise<AgentBudgetReservationReceipt> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("reserve spend"));
  }

  confirmSpend(): Promise<AgentBudgetConfirmationReceipt> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("confirm spend"));
  }

  releaseReservedSpend(): Promise<AgentBudgetReleaseReceipt> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("release reserved spend"));
  }

  resetDailyIfNeeded(): Promise<AgentBudget> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("reset daily spend"));
  }

  pauseBudget(): Promise<AgentBudget> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("pause a budget"));
  }

  resumeBudget(): Promise<AgentBudget> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("resume a budget"));
  }

  confirmReservedSpendByPaylink(): Promise<AgentBudgetReservationTransitionReceipt> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("confirm reserved spend by paylink"));
  }

  releaseReservedSpendByPaylink(): Promise<AgentBudgetReservationTransitionReceipt> {
    return Promise.reject(new AnchorPolicyLiveClientNotConnectedError("release reserved spend by paylink"));
  }
}

export const asAgentBudgetPolicyAdapter = (
  value: AgentBudgetService | AgentBudgetPolicyAdapter
): AgentBudgetPolicyAdapter => toOffchainAdapter(value);

export const getAgentBudgetPolicyAdapter = (
  options: AgentBudgetPolicyAdapterFactoryOptions = {}
): AgentBudgetPolicyAdapter => {
  const config = options.config ?? parseAgentBudgetPolicyConfig();

  if (config.mode === "anchor") {
    return new AnchorAgentBudgetPolicyAdapter({
      config,
      cwd: options.cwd,
      idlPath: options.idlPath
    });
  }

  return new OffchainAgentBudgetPolicyAdapter({
    service: options.service
  });
};
