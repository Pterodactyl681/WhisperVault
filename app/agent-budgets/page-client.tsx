"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  RefreshCcw,
  Sparkles,
  Vault
} from "lucide-react";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { DEFAULT_DEMO_AGENT_ID, DEFAULT_DEMO_AGENT_MINT, DEFAULT_DEMO_AGENT_RECIPIENT } from "@/lib/agent-budget/demo-constants";
import { isValidSolanaPublicKey } from "@/lib/solana-validation";
import { useWhisperPayStore } from "@/store/whisperpay-store";

type AgentBudgetStatus = "active" | "paused" | "exhausted";
type AgentBudgetRail = "magicblock-private" | "public-solana";
type WorkspaceView = "create" | "spend" | "activity";

interface AgentBudget {
  agentId: string;
  owner: string;
  agentWallet?: string;
  mint: string;
  totalBudget: string;
  currentBalance: string;
  dailyCapPercent: number;
  spentToday: string;
  lastResetAt: string;
  status: AgentBudgetStatus;
  rail: AgentBudgetRail;
  allowPublicFallback: boolean;
}

interface CreateBudgetFormState {
  agentId: string;
  owner: string;
  agentWallet: string;
  mint: string;
  totalBudget: string;
  currentBalance: string;
  dailyCapPercent: string;
  rail: AgentBudgetRail;
  allowPublicFallback: boolean;
}

interface AgentPlanFormState {
  agentId: string;
  goal: string;
  amount: string;
  mint: string;
  recipient: string;
  category: string;
}

interface AgentPlanPolicy {
  dailyCapPercent: number;
  spentToday: string;
  currentBalance: string;
}

interface AgentPlanMiragePreview {
  walletName: string;
  displayCommand: string;
  argv: string[];
  warnings: string[];
}

interface AgentPrivateReceiptPreview {
  type: "agent-private-receipt";
  agentId: string;
  runtime: string;
  goal: string;
  category?: string;
  amount: string;
  mint: string;
  recipient: string;
  paylinkId: string;
  paylinkUrl: string;
  policy: {
    decision: "approved";
    dailyCapPercent: number;
    remainingDailyCapBefore: string;
    remainingDailyCapAfter: string;
  };
  reservation: {
    amountReserved: string;
    totalReservedAfter: string;
    state: string;
  };
  execution: {
    rail: AgentBudgetRail;
    visibility: "private";
    fallback: "off";
    mirageReady: boolean;
    status?: "Mirage command ready";
    instruction?: "Execution pending — run Mirage command manually";
    executor?: "Mirage CLI";
    txSignature?: string;
  };
  memo: {
    preview: string;
    reveal: "permissioned";
  };
  payment: {
    status: string;
    mode: "manual";
    label?: "Payment status: Pending/manual";
  };
}

interface ManualConfirmation {
  paymentStatus: "Confirmed";
  execution: "Mirage CLI";
  txSignature: string;
}

interface AgentRejectedPolicyReceipt {
  type: "agent-policy-decision";
  decision: "rejected";
  reason: string;
  agentId: string;
  runtime: string;
  goal: string;
  category?: string;
  amount: string;
  mint: string;
  policy: {
    dailyCapPercent: number;
    remainingDailyCap: string;
    spentToday: string;
    currentBalance: string;
  };
  artifacts: {
    paylinkCreated: false;
    mirageCommandGenerated: false;
  };
}

interface ApprovedAgentPlanResult {
  allowed: true;
  paylinkId: string;
  paylinkUrl?: string;
  amount: string;
  mint: string;
  recipient: string;
  rail: AgentBudgetRail;
  privacyMode: string;
  remainingDailyCap: string;
  memoPreview?: string;
  executionStatus?: "Mirage command ready";
  executionInstruction?: "Execution pending — run Mirage command manually";
  paymentStatus?: "Payment status: Pending/manual";
  mirage?: AgentPlanMiragePreview;
  receipt?: AgentPrivateReceiptPreview;
  manualConfirmation?: ManualConfirmation;
}

interface RejectedAgentPlanResult {
  allowed: false;
  reason: string;
  remainingDailyCap?: string;
  policy?: AgentPlanPolicy;
  receipt?: AgentRejectedPolicyReceipt;
}

type AgentPlanResult = ApprovedAgentPlanResult | RejectedAgentPlanResult;

interface TelegramLinkCodePayload {
  code: string;
  expiresAt: string;
  command: string;
}

const REQUEST_TIMEOUT_MS = 12000;
const WORKSPACE_VIEWS: WorkspaceView[] = ["create", "spend", "activity"];
const WORKSPACE_VIEW_LABELS: Record<WorkspaceView, string> = {
  create: "Create",
  spend: "Spend",
  activity: "Receipt"
};

const initialBudgetFormState = (owner = ""): CreateBudgetFormState => ({
  agentId: DEFAULT_DEMO_AGENT_ID,
  owner,
  agentWallet: "",
  mint: DEFAULT_DEMO_AGENT_MINT,
  totalBudget: "300",
  currentBalance: "300",
  dailyCapPercent: "30",
  rail: "magicblock-private",
  allowPublicFallback: false
});

const initialPlanFormState = (): AgentPlanFormState => ({
  agentId: DEFAULT_DEMO_AGENT_ID,
  goal: "buy coffee for 5 USDC",
  amount: "5",
  mint: DEFAULT_DEMO_AGENT_MINT,
  recipient: DEFAULT_DEMO_AGENT_RECIPIENT,
  category: "coffee"
});

const parseBigIntString = (value: string): bigint => {
  if (!/^\d+$/.test(value)) {
    return 0n;
  }

  return BigInt(value);
};

const formatBigIntDisplay = (value: string): string => {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return value;
  }

  return parseBigIntString(normalized).toLocaleString("en-US");
};

const computeRemainingDailyCap = (budget: AgentBudget): string => {
  const currentBalance = parseBigIntString(budget.currentBalance);
  const totalBudget = parseBigIntString(budget.totalBudget);
  const capBase = currentBalance < totalBudget ? currentBalance : totalBudget;
  const dailyCap = (capBase * BigInt(budget.dailyCapPercent)) / 100n;
  const spentToday = parseBigIntString(budget.spentToday);
  const remaining = dailyCap > spentToday ? dailyCap - spentToday : 0n;

  return remaining.toString();
};

const fallbackCopyText = (value: string): boolean => {
  if (typeof document === "undefined") {
    return false;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();

  let copied = false;

  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textArea);
  }

  return copied;
};

const shortenAddress = (value: string | null | undefined): string => {
  if (!value) {
    return "";
  }

  return value.length <= 12 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const formatExpiryDisplay = (iso: string): string => {
  const timestamp = Date.parse(iso);

  if (Number.isNaN(timestamp)) {
    return iso;
  }

  return new Date(timestamp).toLocaleString();
};

const parseResponseJson = async <T,>(response: Response): Promise<T | null> => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    window.clearTimeout(timer);
  }
};

export default function AgentBudgetsPageClient() {
  const wallet = useWhisperPayStore((state) => state.wallet);
  const controllerAddress = wallet.address?.trim() || null;
  const walletConnected = Boolean(wallet.connected && controllerAddress);
  const [activeView, setActiveView] = useState<WorkspaceView>("create");
  const [budgetForm, setBudgetForm] = useState<CreateBudgetFormState>(initialBudgetFormState(controllerAddress ?? ""));
  const [planForm, setPlanForm] = useState<AgentPlanFormState>(initialPlanFormState());
  const [budgets, setBudgets] = useState<AgentBudget[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingBudget, setSubmittingBudget] = useState(false);
  const [submittingPlan, setSubmittingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budgetSubmitError, setBudgetSubmitError] = useState<string | null>(null);
  const [budgetSubmitSuccess, setBudgetSubmitSuccess] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planResult, setPlanResult] = useState<AgentPlanResult | null>(null);
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null);
  const [planBudgetSelectionTouched, setPlanBudgetSelectionTouched] = useState(false);
  const [manualTxSignature, setManualTxSignature] = useState("");
  const [manualConfirming, setManualConfirming] = useState(false);
  const [manualConfirmError, setManualConfirmError] = useState<string | null>(null);
  const [telegramLinkCode, setTelegramLinkCode] = useState<TelegramLinkCodePayload | null>(null);
  const [telegramLinkError, setTelegramLinkError] = useState<string | null>(null);
  const [generatingTelegramLinkCode, setGeneratingTelegramLinkCode] = useState(false);
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const previousViewRef = useRef<WorkspaceView>("create");

  useEffect(() => {
    setBudgetForm((current) => ({
      ...current,
      owner: controllerAddress ?? ""
    }));
  }, [controllerAddress]);

  const fetchBudgets = async (mode: "initial" | "refresh" = "initial") => {
    if (!controllerAddress) {
      setBudgets([]);
      setError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (mode === "initial") {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);

    try {
      const response = await fetchWithTimeout("/api/agent-budgets", {
        headers: {
          "x-agent-budget-owner": controllerAddress
        }
      });
      const payload = (await parseResponseJson<{ budgets?: AgentBudget[]; error?: { message?: string } }>(response)) ?? {};

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to load agent vaults.");
      }

      setBudgets(payload.budgets ?? []);
    } catch (fetchError) {
      const message =
        fetchError instanceof Error && fetchError.name === "AbortError"
          ? "Loading agent vaults timed out."
          : fetchError instanceof Error
            ? fetchError.message
            : "Failed to load agent vaults.";
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void fetchBudgets();
  }, [controllerAddress]);

  useEffect(() => {
    if (!walletConnected) {
      setBudgets([]);
      setPlanResult(null);
      setPlanError(null);
      setBudgetSubmitError(null);
      setBudgetSubmitSuccess(null);
      setError(null);
      setManualConfirmError(null);
      setManualTxSignature("");
      setTelegramLinkCode(null);
      setTelegramLinkError(null);
      setGeneratingTelegramLinkCode(false);
      setPlanBudgetSelectionTouched(false);
      setPlanForm(initialPlanFormState());
      setBudgetForm(initialBudgetFormState(""));
      setActiveView("create");
    }
  }, [walletConnected]);

  useEffect(() => {
    if (!walletConnected) {
      return;
    }

    if (budgets.length === 0) {
      if (planBudgetSelectionTouched) {
        return;
      }

      setPlanForm((current) => ({
        ...current,
        agentId: DEFAULT_DEMO_AGENT_ID,
        mint: current.mint || DEFAULT_DEMO_AGENT_MINT
      }));
      return;
    }

    const selectedBudget = budgets.find((budget) => budget.agentId === planForm.agentId);

    if (!planBudgetSelectionTouched || !selectedBudget) {
      const demoBudget = budgets.find((budget) => budget.agentId === DEFAULT_DEMO_AGENT_ID);
      const nextBudget = selectedBudget ?? demoBudget ?? budgets[0];

      setPlanForm((current) => ({
        ...current,
        agentId: nextBudget.agentId,
        mint: nextBudget.mint || current.mint || DEFAULT_DEMO_AGENT_MINT
      }));
    }
  }, [budgets, planBudgetSelectionTouched, planForm.agentId, walletConnected]);

  useEffect(() => {
    if (!walletConnected) {
      return;
    }

    if (planResult) {
      return;
    }

    setActiveView(budgets.length === 0 ? "create" : "spend");
  }, [budgets.length, planResult, walletConnected]);

  useEffect(() => {
    const previousIndex = WORKSPACE_VIEWS.indexOf(previousViewRef.current);
    const currentIndex = WORKSPACE_VIEWS.indexOf(activeView);
    setTabDirection(currentIndex >= previousIndex ? "forward" : "backward");
    previousViewRef.current = activeView;
  }, [activeView]);

  const selectedVault = useMemo(
    () => budgets.find((budget) => budget.agentId === planForm.agentId) ?? null,
    [budgets, planForm.agentId]
  );

  const canSubmitBudget = useMemo(() => {
    return (
      walletConnected &&
      budgetForm.agentId.trim().length > 0 &&
      budgetForm.mint.trim().length > 0 &&
      budgetForm.totalBudget.trim().length > 0 &&
      budgetForm.currentBalance.trim().length > 0 &&
      budgetForm.dailyCapPercent.trim().length > 0 &&
      !submittingBudget
    );
  }, [budgetForm, submittingBudget]);

  const canSubmitPlan = useMemo(() => {
    return (
      walletConnected &&
      planForm.agentId.trim().length > 0 &&
      planForm.goal.trim().length > 0 &&
      planForm.amount.trim().length > 0 &&
      planForm.mint.trim().length > 0 &&
      isValidSolanaPublicKey(planForm.recipient) &&
      !submittingPlan
    );
  }, [planForm, submittingPlan, walletConnected]);

  const handleBudgetChange = (field: keyof CreateBudgetFormState, value: string | boolean) => {
    setBudgetForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  const handlePlanFieldChange = (field: keyof AgentPlanFormState, value: string) => {
    setPlanForm((current) => ({
      ...current,
      [field]: value
    }));
    setManualConfirmError(null);
  };

  const selectVault = (agentId: string, nextView?: WorkspaceView) => {
    const nextBudget = budgets.find((budget) => budget.agentId === agentId);
    setPlanBudgetSelectionTouched(true);
    setPlanResult(null);
    setManualConfirmError(null);
    setManualTxSignature("");
    setPlanForm((current) => ({
      ...current,
      agentId,
      mint: nextBudget?.mint ?? current.mint
    }));

    if (nextView) {
      setActiveView(nextView);
    }
  };

  const copyText = async (value: string, label: string) => {
    if (!value) {
      return;
    }

    let copied = false;

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch {
        copied = fallbackCopyText(value);
      }
    } else {
      copied = fallbackCopyText(value);
    }

    setClipboardMessage(copied ? `${label} copied.` : `Clipboard unavailable for ${label.toLowerCase()}.`);
    window.setTimeout(() => setClipboardMessage(null), 1600);
  };

  const handleCreateBudget = async () => {
    if (!controllerAddress || submittingBudget) {
      return;
    }

    const agentId = budgetForm.agentId.trim();
    const agentWallet = budgetForm.agentWallet.trim();
    const totalBudget = budgetForm.totalBudget.trim();
    const currentBalance = budgetForm.currentBalance.trim() || totalBudget;
    const dailyCapPercent = Number(budgetForm.dailyCapPercent);

    setBudgetSubmitError(null);
    setBudgetSubmitSuccess(null);
    setSubmittingBudget(true);

    try {
      if (!agentId) {
        throw new Error("Enter an agent vault name.");
      }

      if (!/^\d+$/.test(totalBudget) || totalBudget === "0") {
        throw new Error("Enter a valid total budget.");
      }

      if (!/^\d+$/.test(currentBalance) || currentBalance === "0") {
        throw new Error("Enter a valid current balance.");
      }

      if (!Number.isFinite(dailyCapPercent) || dailyCapPercent <= 0 || dailyCapPercent > 100) {
        throw new Error("Enter a daily cap between 1 and 100.");
      }

      if (agentWallet && !isValidSolanaPublicKey(agentWallet)) {
        throw new Error("Enter a valid agent execution wallet address.");
      }

      const response = await fetchWithTimeout("/api/agent-budgets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-agent-budget-owner": controllerAddress
        },
        body: JSON.stringify({
          agentId,
          owner: controllerAddress,
          agentWallet: agentWallet || undefined,
          mint: budgetForm.mint.trim(),
          totalBudget,
          currentBalance,
          dailyCapPercent,
          rail: budgetForm.rail,
          allowPublicFallback: budgetForm.allowPublicFallback
        })
      });
      const payload = (await parseResponseJson<{ budget?: AgentBudget; error?: { message?: string } }>(response)) ?? {};

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to create agent vault.");
      }

      const createdAgentId = payload.budget?.agentId ?? agentId;
      setBudgetSubmitSuccess(`Created vault for ${createdAgentId}.`);
      setBudgetForm(initialBudgetFormState(controllerAddress));
      await fetchBudgets("refresh");
      selectVault(createdAgentId, "spend");
    } catch (createError) {
      const message =
        createError instanceof Error && createError.name === "AbortError"
          ? "Creating the agent vault timed out."
          : createError instanceof Error
            ? createError.message
            : "Failed to create agent vault.";
      setBudgetSubmitError(message);
    } finally {
      setSubmittingBudget(false);
    }
  };

  const handleCreatePlan = async () => {
    if (!controllerAddress || submittingPlan) {
      return;
    }

    const recipient = planForm.recipient.trim();

    setPlanError(null);
    setPlanResult(null);
    setSubmittingPlan(true);

    try {
      if (!planForm.agentId.trim()) {
        throw new Error("Select an agent vault before creating a spend request.");
      }

      if (!/^\d+$/.test(planForm.amount.trim()) || planForm.amount.trim() === "0") {
        throw new Error("Enter a valid spend amount.");
      }

      if (!recipient || !isValidSolanaPublicKey(recipient)) {
        throw new Error("Enter a valid recipient wallet address.");
      }

      const response = await fetchWithTimeout("/api/agent-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-agent-budget-owner": controllerAddress
        },
        body: JSON.stringify({
          agentId: planForm.agentId.trim(),
          goal: planForm.goal.trim(),
          amount: planForm.amount.trim(),
          mint: planForm.mint.trim(),
          recipient,
          category: planForm.category.trim() || undefined,
          rail: "magicblock-private"
        })
      });
      const payload = (await parseResponseJson<AgentPlanResult | { error?: { message?: string } }>(response)) ?? {};

      if (!response.ok) {
        const message = "error" in payload ? payload.error?.message : null;
        throw new Error(message ?? "Failed to create agent spend.");
      }

      setPlanResult(payload as AgentPlanResult);
      setManualTxSignature("");
      setManualConfirmError(null);

      if ("allowed" in payload && payload.allowed) {
        await fetchBudgets("refresh");
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error && submitError.name === "AbortError"
          ? "Checking the spend firewall timed out."
          : submitError instanceof Error
            ? submitError.message
            : "Failed to create agent spend.";
      setPlanError(message);
    } finally {
      setSubmittingPlan(false);
    }
  };

  const handleConfirmManualExecution = async () => {
    const approved = planResult?.allowed ? planResult : null;

    if (!approved) {
      return;
    }

    setManualConfirmError(null);
    setManualConfirming(true);

    try {
      const response = await fetch("/api/agent-spend/confirm-manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paylinkId: approved.paylinkId,
          txSignature: manualTxSignature.trim(),
          executor: "mirage-cli"
        })
      });
      const payload = (await response.json()) as {
        txSignature?: string | null;
        receipt?: { paymentStatus?: string; execution?: string; devnetTx?: string | null };
        error?: { message?: string };
      };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Failed to confirm manual execution.");
      }

      const txSignature = payload.txSignature ?? payload.receipt?.devnetTx ?? manualTxSignature.trim();

      setPlanResult((current) => {
        if (!current?.allowed) {
          return current;
        }

        return {
          ...current,
          manualConfirmation: {
            paymentStatus: "Confirmed",
            execution: "Mirage CLI",
            txSignature
          },
          receipt: current.receipt
            ? {
                ...current.receipt,
                execution: {
                  ...current.receipt.execution,
                  executor: "Mirage CLI",
                  txSignature
                },
                payment: {
                  ...current.receipt.payment,
                  status: "confirmed"
                }
              }
            : current.receipt
        };
      });
      await fetchBudgets("refresh");
    } catch (confirmError) {
      setManualConfirmError(confirmError instanceof Error ? confirmError.message : "Failed to confirm manual execution.");
    } finally {
      setManualConfirming(false);
    }
  };

  const handleGenerateTelegramLinkCode = async () => {
    if (!controllerAddress || generatingTelegramLinkCode) {
      return;
    }

    setTelegramLinkError(null);
    setGeneratingTelegramLinkCode(true);

    try {
      const response = await fetchWithTimeout("/api/telegram/link-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-agent-budget-owner": controllerAddress
        },
        body: JSON.stringify({
          controllerWallet: controllerAddress
        })
      });
      const payload =
        (await parseResponseJson<TelegramLinkCodePayload | { error?: { message?: string } }>(response)) ?? {};

      if (!response.ok) {
        const message = "error" in payload ? payload.error?.message : null;
        throw new Error(message ?? "Failed to generate Telegram link code.");
      }

      const result = payload as TelegramLinkCodePayload;
      setTelegramLinkCode(result);
    } catch (linkError) {
      const message =
        linkError instanceof Error && linkError.name === "AbortError"
          ? "Generating link code timed out."
          : linkError instanceof Error
            ? linkError.message
            : "Failed to generate Telegram link code.";
      setTelegramLinkError(message);
    } finally {
      setGeneratingTelegramLinkCode(false);
    }
  };

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, view: WorkspaceView) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
      return;
    }

    event.preventDefault();
    const currentIndex = WORKSPACE_VIEWS.indexOf(view);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (currentIndex + direction + WORKSPACE_VIEWS.length) % WORKSPACE_VIEWS.length;
    setActiveView(WORKSPACE_VIEWS[nextIndex]);
  };

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pt-1 md:pt-2">
      <WorkspaceHeader
        activeView={activeView}
        wallet={wallet}
        clipboardMessage={clipboardMessage}
        onChangeView={setActiveView}
        onTabKeyDown={handleTabKeyDown}
      />
      <TelegramLinkPanel
        walletConnected={walletConnected}
        linkCode={telegramLinkCode}
        generating={generatingTelegramLinkCode}
        error={telegramLinkError}
        onGenerate={() => void handleGenerateTelegramLinkCode()}
        onCopy={copyText}
      />

      <div key={activeView} className="tab-content-transition" data-tab-direction={tabDirection === "backward" ? "backward" : "forward"}>
        {activeView === "create" ? (
          <CreateView
            walletConnected={walletConnected}
            controllerAddress={controllerAddress}
            budgetForm={budgetForm}
            submittingBudget={submittingBudget}
            canSubmitBudget={canSubmitBudget}
            budgetSubmitError={budgetSubmitError}
            budgetSubmitSuccess={budgetSubmitSuccess}
            onBudgetChange={handleBudgetChange}
            onCreateBudget={() => void handleCreateBudget()}
          />
        ) : null}

        {activeView === "spend" ? (
          <SpendView
            walletConnected={walletConnected}
            budgets={budgets}
            selectedVault={selectedVault}
            loading={loading}
            refreshing={refreshing}
            error={error}
            planForm={planForm}
            planError={planError}
            planResult={planResult}
            submittingPlan={submittingPlan}
            canSubmitPlan={canSubmitPlan}
            onSelectVault={(agentId) => selectVault(agentId)}
            onPlanFieldChange={handlePlanFieldChange}
            onCreatePlan={() => void handleCreatePlan()}
            onCopy={copyText}
            onViewActivity={() => setActiveView("activity")}
            onChangeView={setActiveView}
            manualTxSignature={manualTxSignature}
            manualConfirming={manualConfirming}
            manualConfirmError={manualConfirmError}
            onManualTxSignatureChange={setManualTxSignature}
            onConfirmManualExecution={() => void handleConfirmManualExecution()}
          />
        ) : null}

        {activeView === "activity" ? (
          <ActivityView
            walletConnected={walletConnected}
            selectedVault={selectedVault}
            planForm={planForm}
            planResult={planResult}
            onCopy={copyText}
            manualTxSignature={manualTxSignature}
            manualConfirming={manualConfirming}
            manualConfirmError={manualConfirmError}
            onManualTxSignatureChange={setManualTxSignature}
            onConfirmManualExecution={() => void handleConfirmManualExecution()}
          />
        ) : null}
      </div>
    </section>
  );
}

function WorkspaceHeader({
  activeView,
  wallet,
  clipboardMessage,
  onChangeView,
  onTabKeyDown
}: {
  activeView: WorkspaceView;
  wallet: { connected: boolean; address: string | null; label: string | null };
  clipboardMessage: string | null;
  onChangeView: (view: WorkspaceView) => void;
  onTabKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>, view: WorkspaceView) => void;
}) {
  const activeTabIndex = WORKSPACE_VIEWS.indexOf(activeView);
  const { disconnect, disconnecting } = useWallet();

  return (
    <div className="agent-vault-edge grid gap-4 rounded-2xl border border-[rgba(96,118,168,0.14)] bg-[rgba(7,13,25,0.84)] px-4 py-3.5 shadow-[0_18px_70px_rgba(1,6,14,0.22)] backdrop-blur-xl lg:grid-cols-[1fr_auto_1fr] lg:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <Image
          src="/whisper-logo-mark.png"
          alt="WhisperVault logo"
          width={56}
          height={36}
          className="h-9 w-11 object-contain sm:h-10 sm:w-12"
          priority
        />
        <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight text-primary sm:text-[1.75rem]">WhisperVault</h1>
      </div>

      <div
        role="tablist"
        aria-label="Agent Vault workspace views"
        className="relative mx-auto grid w-full max-w-[420px] grid-cols-3 rounded-xl border border-[rgba(96,118,168,0.22)] bg-[rgba(6,12,23,0.74)] p-1.5"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 rounded-lg bg-[rgba(78,215,255,0.16)] shadow-[inset_0_0_0_1px_rgba(78,215,255,0.3)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform"
          style={{
            width: "calc((100% - 0.75rem) / 3)",
            transform: `translateX(${activeTabIndex * 100}%)`
          }}
        />
        {WORKSPACE_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={activeView === view}
            tabIndex={activeView === view ? 0 : -1}
            onClick={() => onChangeView(view)}
            onKeyDown={(event) => onTabKeyDown(event, view)}
            className={`relative z-10 min-h-10 rounded-lg px-3 text-base font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              activeView === view ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {WORKSPACE_VIEW_LABELS[view]}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-col items-end gap-2">
        {wallet.connected && wallet.address ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="rounded-full border border-[rgba(78,215,255,0.26)] bg-[rgba(78,215,255,0.08)] px-3 py-1 text-xs font-medium text-primary">
              Controller {shortenAddress(wallet.address)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void disconnect()}
              disabled={disconnecting}
              aria-label="Disconnect wallet"
              title="Disconnect wallet"
              className="min-h-8 rounded-full px-2.5 py-1 text-xs"
            >
              <LogOut className="h-3.5 w-3.5" />
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </Button>
          </div>
        ) : (
          <ConnectWalletButton size="sm" className="min-h-9 px-3 py-2 text-xs" />
        )}
        {clipboardMessage ? <span className="text-xs text-primary">{clipboardMessage}</span> : null}
      </div>
    </div>
  );
}

function TelegramLinkPanel({
  walletConnected,
  linkCode,
  generating,
  error,
  onGenerate,
  onCopy
}: {
  walletConnected: boolean;
  linkCode: TelegramLinkCodePayload | null;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[rgba(96,118,168,0.14)] px-4 py-3">
        <SectionTitle title="Link Telegram Agent" detail="Generate one-time link command" />
        <Button size="sm" variant="outline" onClick={onGenerate} disabled={!walletConnected || generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Generating..." : "Generate link code"}
        </Button>
      </div>
      <div className="space-y-3 px-4 py-3">
        {!walletConnected ? (
          <p className="text-sm text-muted-foreground">Connect wallet to link Telegram.</p>
        ) : linkCode ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-[rgba(96,118,168,0.14)] bg-[rgba(5,10,20,0.34)] p-3">
              <p className="font-mono text-sm text-foreground">{linkCode.command}</p>
              <p className="mt-1 text-xs text-muted-foreground">Expires: {formatExpiryDisplay(linkCode.expiresAt)}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => void onCopy(linkCode.command, "Telegram link command")}>
              <Copy className="h-4 w-4" />
              Copy command
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Generate a code and send the command to Telegram bot: `/link &lt;code&gt;`.</p>
        )}
        {error ? <InlineNotice tone="error" message={error} /> : null}
      </div>
    </Panel>
  );
}

function VaultsView({
  budgets,
  loading,
  refreshing,
  error,
  selectedAgentId,
  onRefresh,
  onSelectVault,
  onPlanSpend
}: {
  budgets: AgentBudget[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  selectedAgentId: string;
  onRefresh: () => void;
  onSelectVault: (agentId: string) => void;
  onPlanSpend: (agentId: string) => void;
}) {
  const selectedVault = budgets.find((budget) => budget.agentId === selectedAgentId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]">
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[rgba(96,118,168,0.14)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <SectionTitle icon={<Vault className="h-4 w-4 text-primary" />} title="Vaults" detail={`${budgets.length} vaults`} />
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading || refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        {loading ? (
          <EmptyPanel message="Loading vaults..." />
        ) : error ? (
          <div className="p-4">
            <InlineNotice tone="error" message={error} />
            <Button variant="outline" className="mt-3" onClick={onRefresh}>
              Try again
            </Button>
          </div>
        ) : budgets.length === 0 ? (
          <EmptyPanel title="No vaults yet" message="Create the demo coffee-agent vault to start planning private spends." />
        ) : (
          <div className="divide-y divide-[rgba(96,118,168,0.12)]">
            {budgets.map((budget) => (
              <VaultRow
                key={budget.agentId}
                budget={budget}
                selected={budget.agentId === selectedAgentId}
                onSelect={() => onSelectVault(budget.agentId)}
                onPlanSpend={() => onPlanSpend(budget.agentId)}
              />
            ))}
          </div>
        )}
      </Panel>

      <VaultInspector selectedVault={selectedVault} />
    </div>
  );
}

function CreateView({
  walletConnected,
  controllerAddress,
  budgetForm,
  submittingBudget,
  canSubmitBudget,
  budgetSubmitError,
  budgetSubmitSuccess,
  onBudgetChange,
  onCreateBudget
}: {
  walletConnected: boolean;
  controllerAddress: string | null;
  budgetForm: CreateBudgetFormState;
  submittingBudget: boolean;
  canSubmitBudget: boolean;
  budgetSubmitError: string | null;
  budgetSubmitSuccess: string | null;
  onBudgetChange: (field: keyof CreateBudgetFormState, value: string | boolean) => void;
  onCreateBudget: () => void;
}) {
  return (
    <CreateVaultForm
      walletConnected={walletConnected}
      controllerAddress={controllerAddress}
      budgetForm={budgetForm}
      submittingBudget={submittingBudget}
      canSubmitBudget={canSubmitBudget}
      budgetSubmitError={budgetSubmitError}
      budgetSubmitSuccess={budgetSubmitSuccess}
      onBudgetChange={onBudgetChange}
      onCreateBudget={onCreateBudget}
    />
  );
}

function VaultRow({
  budget,
  selected,
  onSelect,
  onPlanSpend
}: {
  budget: AgentBudget;
  selected: boolean;
  onSelect: () => void;
  onPlanSpend: () => void;
}) {
  return (
    <div
      className={`grid gap-3 px-5 py-4 transition-colors md:grid-cols-[minmax(170px,1.15fr)_repeat(4,minmax(92px,0.7fr))_auto] md:items-center ${
        selected ? "bg-[rgba(78,215,255,0.08)]" : "hover:bg-[rgba(96,118,168,0.06)]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-foreground">{budget.agentId}</p>
          <StatusPill status={budget.status} />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          Private rail{" \u00B7 "}fallback {budget.allowPublicFallback ? "on" : "off"}
        </p>
      </div>
      <RowMetric label="Balance" value={`${formatBigIntDisplay(budget.currentBalance)} ${budget.mint}`} />
      <RowMetric label="Total" value={formatBigIntDisplay(budget.totalBudget)} />
      <RowMetric label="Daily left" value={formatBigIntDisplay(computeRemainingDailyCap(budget))} />
      <RowMetric label="Spent today" value={formatBigIntDisplay(budget.spentToday)} />
      <div className="flex w-full max-w-full flex-col items-end gap-1.5 md:w-auto">
        <Button
          type="button"
          size="sm"
          variant={selected ? "default" : "outline"}
          onClick={onSelect}
          className="h-7 min-h-7 w-[4.9rem] max-w-full rounded-md px-2 text-[0.72rem] font-medium leading-none whitespace-nowrap tracking-[0.01em] hover:scale-100 active:scale-100"
        >
          Select
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPlanSpend}
          className="h-7 min-h-7 w-[4.9rem] max-w-full rounded-md px-2 text-[0.72rem] font-medium leading-none whitespace-nowrap tracking-[0.01em] hover:scale-100 active:scale-100"
        >
          Plan Spend
        </Button>
      </div>
    </div>
  );
}

function VaultInspector({ selectedVault }: { selectedVault: AgentBudget | null }) {
  return (
    <Panel>
      <div className="border-b border-[rgba(96,118,168,0.14)] px-5 py-4">
        <SectionTitle title="Selected Vault" detail="Policy snapshot" />
      </div>
      <div className="space-y-4 p-5">
        {selectedVault ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{selectedVault.agentId}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{selectedVault.owner}</p>
              </div>
              <StatusPill status={selectedVault.status} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CompactMetric label="Balance" value={`${formatBigIntDisplay(selectedVault.currentBalance)} ${selectedVault.mint}`} />
              <CompactMetric label="Daily left" value={formatBigIntDisplay(computeRemainingDailyCap(selectedVault))} />
              <CompactMetric label="Total budget" value={formatBigIntDisplay(selectedVault.totalBudget)} />
              <CompactMetric label="Daily cap" value={`${selectedVault.dailyCapPercent}%`} />
            </div>
            <div className="space-y-2 rounded-xl border border-[rgba(96,118,168,0.14)] bg-[rgba(5,10,20,0.36)] p-3 text-sm">
              <DataRow label="Spent today" value={formatBigIntDisplay(selectedVault.spentToday)} />
            </div>
            <details className="rounded-xl border border-[rgba(96,118,168,0.14)] bg-[rgba(5,10,20,0.28)] p-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
                More details
              </summary>
              <div className="mt-2 space-y-2">
                <DataRow label="Owner" value={selectedVault.owner} />
                {selectedVault.agentWallet ? <DataRow label="Agent wallet" value={selectedVault.agentWallet} /> : null}
                {selectedVault.lastResetAt ? <DataRow label="Last reset" value={selectedVault.lastResetAt} /> : null}
              </div>
            </details>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Select a vault to inspect its policy state.</p>
        )}
      </div>
    </Panel>
  );
}

function CreateVaultForm({
  walletConnected,
  controllerAddress,
  budgetForm,
  submittingBudget,
  canSubmitBudget,
  budgetSubmitError,
  budgetSubmitSuccess,
  onBudgetChange,
  onCreateBudget
}: {
  walletConnected: boolean;
  controllerAddress: string | null;
  budgetForm: CreateBudgetFormState;
  submittingBudget: boolean;
  canSubmitBudget: boolean;
  budgetSubmitError: string | null;
  budgetSubmitSuccess: string | null;
  onBudgetChange: (field: keyof CreateBudgetFormState, value: string | boolean) => void;
  onCreateBudget: () => void;
}) {
  return (
    <Panel>
      <div className="border-b border-[rgba(96,118,168,0.14)] px-5 py-4">
        <SectionTitle title="Create Vault" detail="Add spending vault" />
      </div>
      <div className="space-y-3 p-5">
        {!walletConnected ? <ConnectPrompt /> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Agent ID">
            <Input
              value={budgetForm.agentId}
              onChange={(event) => onBudgetChange("agentId", event.target.value)}
              placeholder="coffee-agent"
              disabled={!walletConnected || submittingBudget}
            />
          </Field>
          <Field label="Controller">
            <Input value={controllerAddress ?? ""} readOnly placeholder="Connect wallet to control an Agent Vault" />
          </Field>
          <Field label="Asset">
            <Input value="Devnet USDC" readOnly />
          </Field>
          <Field label="Agent Wallet">
            <Input
              value={budgetForm.agentWallet}
              onChange={(event) => onBudgetChange("agentWallet", event.target.value)}
              placeholder="optional"
              disabled={!walletConnected || submittingBudget}
            />
          </Field>
          <Field label="Total Budget">
            <Input
              value={budgetForm.totalBudget}
              onChange={(event) => onBudgetChange("totalBudget", event.target.value)}
              placeholder="300"
              disabled={!walletConnected || submittingBudget}
            />
          </Field>
          <Field label="Current Balance">
            <Input
              value={budgetForm.currentBalance}
              onChange={(event) => onBudgetChange("currentBalance", event.target.value)}
              placeholder="300"
              disabled={!walletConnected || submittingBudget}
            />
          </Field>
          <Field label="Daily Cap %">
            <Input
              value={budgetForm.dailyCapPercent}
              onChange={(event) => onBudgetChange("dailyCapPercent", event.target.value)}
              placeholder="30"
              disabled={!walletConnected || submittingBudget}
            />
          </Field>
          <Field label="Fallback">
            <button
              type="button"
              onClick={() => onBudgetChange("allowPublicFallback", !budgetForm.allowPublicFallback)}
              disabled={!walletConnected || submittingBudget}
              className={`flex h-11 w-full items-center justify-center rounded-xl border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                budgetForm.allowPublicFallback
                  ? "border-destructive/60 bg-destructive/10 text-destructive"
                  : "border-[rgba(96,118,168,0.24)] bg-[rgba(14,23,39,0.84)] text-foreground"
              }`}
            >
              {budgetForm.allowPublicFallback ? "Enabled" : "Disabled"}
            </button>
          </Field>
        </div>

        <div className="rounded-xl border border-[rgba(96,118,168,0.16)] bg-[rgba(5,10,20,0.36)] px-3 py-2 text-xs text-muted-foreground">
          Rail: <span className="text-foreground">Private</span>
        </div>

        {budgetSubmitError ? <InlineNotice tone="error" message={budgetSubmitError} /> : null}
        {budgetSubmitSuccess ? <InlineNotice tone="success" message={budgetSubmitSuccess} /> : null}

        <Button onClick={onCreateBudget} disabled={!canSubmitBudget} className="w-full" size="sm">
          {submittingBudget ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {submittingBudget ? "Creating..." : "Create Vault"}
        </Button>
      </div>
    </Panel>
  );
}

function ConnectPrompt() {
  return (
    <div className="rounded-xl border border-[rgba(78,215,255,0.24)] bg-[rgba(78,215,255,0.08)] px-4 py-3">
      <p className="text-sm font-medium text-primary">Connect wallet to control an Agent Vault.</p>
      <p className="mt-1 text-xs text-muted-foreground">Create and spend actions stay locked until a controller wallet is connected.</p>
    </div>
  );
}

function SpendVaultSnapshot({
  selectedVault,
  refreshing,
  error
}: {
  selectedVault: AgentBudget | null;
  refreshing: boolean;
  error: string | null;
}) {
  if (error) {
    return <InlineNotice tone="error" message={error} />;
  }

  if (!selectedVault) {
    return (
      <div className="rounded-xl border border-[rgba(96,118,168,0.12)] bg-[rgba(5,10,20,0.34)] px-4 py-3 text-sm text-muted-foreground">
        No vault selected yet.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[rgba(96,118,168,0.16)] bg-[rgba(5,10,20,0.36)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{selectedVault.agentId}</p>
          <p className="mt-1 text-xs text-muted-foreground">Selected Agent Vault</p>
        </div>
        <StatusPill status={selectedVault.status} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <CompactMetric label="Balance" value={`${formatBigIntDisplay(selectedVault.currentBalance)} ${selectedVault.mint}`} />
        <CompactMetric label="Daily left" value={formatBigIntDisplay(computeRemainingDailyCap(selectedVault))} />
        <CompactMetric label="Daily cap" value={`${selectedVault.dailyCapPercent}%`} />
        <CompactMetric label="Asset" value="Devnet USDC" />
      </div>
      {refreshing ? <p className="mt-2 text-xs text-muted-foreground">Refreshing vault state...</p> : null}
    </div>
  );
}

function SpendView({
  walletConnected,
  budgets,
  selectedVault,
  loading,
  refreshing,
  error,
  planForm,
  planError,
  planResult,
  submittingPlan,
  canSubmitPlan,
  manualTxSignature,
  manualConfirming,
  manualConfirmError,
  onSelectVault,
  onPlanFieldChange,
  onCreatePlan,
  onCopy,
  onViewActivity,
  onChangeView,
  onManualTxSignatureChange,
  onConfirmManualExecution
}: {
  walletConnected: boolean;
  budgets: AgentBudget[];
  selectedVault: AgentBudget | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  planForm: AgentPlanFormState;
  planError: string | null;
  planResult: AgentPlanResult | null;
  submittingPlan: boolean;
  canSubmitPlan: boolean;
  manualTxSignature: string;
  manualConfirming: boolean;
  manualConfirmError: string | null;
  onSelectVault: (agentId: string) => void;
  onPlanFieldChange: (field: keyof AgentPlanFormState, value: string) => void;
  onCreatePlan: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
  onViewActivity: () => void;
  onChangeView: (view: WorkspaceView) => void;
  onManualTxSignatureChange: (value: string) => void;
  onConfirmManualExecution: () => void;
}) {
  const [isVaultMenuOpen, setIsVaultMenuOpen] = useState(false);
  const vaultMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!vaultMenuRef.current) {
        return;
      }

      if (!vaultMenuRef.current.contains(event.target as Node)) {
        setIsVaultMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedVaultOption = budgets.find((budget) => budget.agentId === planForm.agentId);
  const selectedVaultLabel = selectedVaultOption ? selectedVaultOption.agentId : "Select a vault";
  const hasVaults = budgets.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(360px,1.12fr)]">
      <Panel>
        <div className="border-b border-[rgba(96,118,168,0.14)] px-5 py-4">
          <SectionTitle title="Spend Request" />
        </div>
        <div className="space-y-4 p-5">
          {!walletConnected ? <ConnectPrompt /> : null}
          {walletConnected ? (
            <SpendVaultSnapshot selectedVault={selectedVault} refreshing={refreshing} error={error} />
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vault">
              <div className="relative" ref={vaultMenuRef}>
                <button
                  type="button"
                  disabled={!walletConnected || !hasVaults || loading}
                  onClick={() => setIsVaultMenuOpen((current) => !current)}
                  className="agent-vault-edge flex h-11 w-full items-center justify-between rounded-xl border border-[rgba(96,118,168,0.24)] bg-[rgba(14,23,39,0.84)] px-3 py-2 text-left text-sm text-foreground outline-none transition-all focus-visible:ring-2 focus-visible:ring-ring/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="truncate">{selectedVaultLabel}</span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isVaultMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {isVaultMenuOpen ? (
                  <div className="agent-vault-edge absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[rgba(96,118,168,0.26)] bg-[rgba(10,18,31,0.96)] shadow-[0_16px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    {budgets.map((budget) => {
                      const optionLabel = budget.agentId;
                      const isActive = budget.agentId === planForm.agentId;
                      return (
                        <button
                          key={budget.agentId}
                          type="button"
                          onClick={() => {
                            onSelectVault(budget.agentId);
                            setIsVaultMenuOpen(false);
                          }}
                          className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors ${isActive ? "bg-[rgba(78,215,255,0.18)] text-primary" : "text-foreground hover:bg-[rgba(96,118,168,0.16)]"}`}
                        >
                          {optionLabel}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Goal">
                <Textarea
                  value={planForm.goal}
                  onChange={(event) => onPlanFieldChange("goal", event.target.value)}
                  placeholder="buy coffee for 5 USDC"
                  className="min-h-[76px]"
                  disabled={!walletConnected || !hasVaults || submittingPlan}
                />
              </Field>
            </div>
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <Field label="Amount">
                <Input
                  value={planForm.amount}
                  onChange={(event) => onPlanFieldChange("amount", event.target.value)}
                  placeholder="5"
                  disabled={!walletConnected || !hasVaults || submittingPlan}
                />
              </Field>
              <Field label="Asset">
                <Input value="Devnet USDC" readOnly />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Recipient">
                <Input
                  value={planForm.recipient}
                  onChange={(event) => onPlanFieldChange("recipient", event.target.value)}
                  placeholder={DEFAULT_DEMO_AGENT_RECIPIENT}
                  disabled={!walletConnected || !hasVaults || submittingPlan}
                />
              </Field>
            </div>
          </div>

          <div className="rounded-xl border border-[rgba(96,118,168,0.16)] bg-[rgba(5,10,20,0.36)] px-3 py-2 text-xs text-muted-foreground">
            Controller wallet owns policy. Mirage wallet <span className="text-foreground">agent-treasury</span> executes devnet transfer.
          </div>

          {walletConnected && !hasVaults && !loading ? (
            <div className="rounded-xl border border-[rgba(96,118,168,0.16)] bg-[rgba(5,10,20,0.36)] px-3 py-2 text-xs text-muted-foreground">
              Create an Agent Vault before checking a spend request.
            </div>
          ) : null}

          {planError ? <InlineNotice tone="error" message={planError} /> : null}

          <Button onClick={onCreatePlan} disabled={!canSubmitPlan} className="w-full">
            {submittingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submittingPlan ? "Checking policy..." : "Check Policy"}
          </Button>
          {walletConnected && !hasVaults ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => onChangeView("create")}>
              Go to Create
            </Button>
          ) : null}
        </div>
      </Panel>

      <Panel>
        <div className="border-b border-[rgba(96,118,168,0.14)] px-5 py-4">
          <SectionTitle title="Policy Decision" />
        </div>
        <div className="space-y-4 p-5">
          <SpendFirewallPanel planResult={planResult} planError={planError} />
          {!planResult && !planError ? (
            <div className="rounded-xl border border-[rgba(96,118,168,0.12)] bg-[rgba(5,10,20,0.34)] px-5 py-4">
              <p className="text-sm font-medium">No decision yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Submit a spend request to continue.</p>
            </div>
          ) : null}
          {planResult?.allowed ? (
            <ApprovedSpendResult
              result={planResult}
              manualTxSignature={manualTxSignature}
              manualConfirming={manualConfirming}
              manualConfirmError={manualConfirmError}
              onManualTxSignatureChange={onManualTxSignatureChange}
              onConfirmManualExecution={onConfirmManualExecution}
              onCopy={onCopy}
              onViewActivity={onViewActivity}
            />
          ) : null}
          {planResult && !planResult.allowed ? (
            <RejectedSpendResult result={planResult} />
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function SpendFirewallPanel({
  planResult,
  planError
}: {
  planResult: AgentPlanResult | null;
  planError: string | null;
}) {
  const approved = planResult?.allowed ? planResult : null;
  const blockedReason = planError ?? (planResult && !planResult.allowed ? planResult.reason : null);

  if (approved) {
    return (
      <div className="rounded-xl border border-primary/28 bg-primary/10 p-3">
        <p className="text-sm font-semibold text-primary">Spend Firewall: Passed</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <CompactMetric label="Recipient" value="Valid" />
          <CompactMetric label="Daily cap" value="Passed" />
          <CompactMetric label="Private rail" value="Enforced" />
          <CompactMetric label="Fallback" value="Off" />
          <CompactMetric label="Receipt" value="Ready" />
          <CompactMetric label="Mirage command" value="Ready" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Execution pending — run Mirage command manually.</p>
      </div>
    );
  }

  if (blockedReason) {
    return (
      <div className="rounded-xl border border-destructive/42 bg-destructive/10 p-3">
        <p className="text-sm font-semibold text-destructive">Spend Firewall: Blocked</p>
        <p className="mt-2 text-sm text-destructive-foreground/90">Reason: {blockedReason}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <CompactMetric label="Budget reserved" value="No" />
          <CompactMetric label="Private spend created" value="No" />
          <CompactMetric label="Mirage command generated" value="No" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[rgba(96,118,168,0.12)] bg-[rgba(5,10,20,0.34)] px-5 py-4">
      <p className="text-sm font-semibold text-foreground">Spend Firewall</p>
      <p className="mt-1 text-xs text-muted-foreground">Waiting for spend request</p>
      <p className="mt-3 text-xs text-muted-foreground">Checks: recipient, daily cap, private rail, fallback off, receipt</p>
    </div>
  );
}

function ApprovedSpendResult({
  result,
  manualTxSignature,
  manualConfirming,
  manualConfirmError,
  onManualTxSignatureChange,
  onConfirmManualExecution,
  onCopy,
  onViewActivity
}: {
  result: ApprovedAgentPlanResult;
  manualTxSignature: string;
  manualConfirming: boolean;
  manualConfirmError: string | null;
  onManualTxSignatureChange: (value: string) => void;
  onConfirmManualExecution: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
  onViewActivity: () => void;
}) {
  const confirmed = result.manualConfirmation;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-primary/28 bg-primary/10 p-3">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <CheckCircle2 className="h-4 w-4" />
          Private spend approved
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <CompactMetric label="Paylink ID" value={result.paylinkId} />
          <CompactMetric label="Amount" value={`${formatBigIntDisplay(result.amount)} ${result.mint}`} />
          <CompactMetric label="Recipient" value={result.recipient} />
          <CompactMetric label="Daily left" value={formatBigIntDisplay(result.remainingDailyCap)} />
          <CompactMetric label="Payment status" value={confirmed ? "Confirmed" : "Pending/manual"} />
          <CompactMetric label="Execution" value={confirmed ? "Mirage CLI" : "Execution pending — run Mirage command manually"} />
          {confirmed ? <CompactMetric label="Tx" value={confirmed.txSignature} /> : null}
        </div>
      </div>

      {result.paylinkUrl ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void onCopy(result.paylinkUrl ?? "", "Private spend URL")}>
            <Copy className="h-4 w-4" />
            Copy private spend URL
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={result.paylinkUrl} target="_blank" rel="noreferrer">
              Open spend link
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={onViewActivity}>
            <Activity className="h-4 w-4" />
            View receipt
          </Button>
        </div>
      ) : null}

      {result.mirage ? (
        <div className="rounded-xl border border-[rgba(96,118,168,0.18)] bg-[rgba(5,10,20,0.44)] p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Mirage command ready</p>
              <p className="text-xs text-muted-foreground">Execution pending — run Mirage command manually</p>
            </div>
            <span className="w-fit rounded-full border border-primary/24 px-2.5 py-1 text-xs text-primary">Copy-ready</span>
          </div>
          <pre className="mt-3 max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[rgba(96,118,168,0.12)] bg-[rgba(2,7,16,0.72)] p-3 font-mono text-xs leading-relaxed text-foreground">
            {result.mirage.displayCommand}
          </pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void onCopy(result.mirage?.displayCommand ?? "", "Mirage command")}>
              <Copy className="h-4 w-4" />
              Copy command
            </Button>
          </div>

          <ManualConfirmationPanel
            txSignature={manualTxSignature}
            confirming={manualConfirming}
            error={manualConfirmError}
            confirmed={confirmed}
            onTxSignatureChange={onManualTxSignatureChange}
            onConfirm={onConfirmManualExecution}
          />

          <details className="mt-3 rounded-lg border border-[rgba(96,118,168,0.12)] bg-[rgba(14,23,39,0.42)] p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Mirage Console setup
            </summary>
            <p className="mt-2 text-xs text-muted-foreground">Claude Code / terminal ready. The browser only generates commands.</p>
            <div className="mt-3 space-y-2">
              {[
                "npm install -g @magicblock-labs/mirage",
                "npx skills add magicblock-labs/mirage --skill mirage-solana-wallet",
                `mirage address --wallet ${result.mirage.walletName}`,
                `mirage balance --wallet ${result.mirage.walletName}`,
                `mirage fund --wallet ${result.mirage.walletName}`
              ].map((command) => (
                <CopyCommand key={command} command={command} onCopy={onCopy} />
              ))}
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function ManualConfirmationPanel({
  txSignature,
  confirming,
  error,
  confirmed,
  onTxSignatureChange,
  onConfirm
}: {
  txSignature: string;
  confirming: boolean;
  error: string | null;
  confirmed?: ManualConfirmation;
  onTxSignatureChange: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-[rgba(96,118,168,0.12)] bg-[rgba(14,23,39,0.42)] p-3">
      {confirmed ? (
        <div className="space-y-1 text-xs">
          <p className="font-semibold text-primary">Payment status: Confirmed</p>
          <p className="text-muted-foreground">Execution: Mirage CLI</p>
          <p className="break-words font-mono text-foreground">Tx: {confirmed.txSignature}</p>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold text-foreground">Payment status: Pending/manual</p>
          <p className="text-xs text-muted-foreground">Execution pending — run Mirage command manually</p>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Input
              value={txSignature}
              onChange={(event) => onTxSignatureChange(event.target.value)}
              placeholder="Devnet tx signature"
              className="h-9"
            />
            <Button type="button" size="sm" onClick={onConfirm} disabled={confirming || txSignature.trim().length === 0}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm execution
            </Button>
          </div>
          {error ? <InlineNotice tone="error" message={error} /> : null}
        </>
      )}
    </div>
  );
}

function RejectedSpendResult({ result }: { result: RejectedAgentPlanResult }) {
  return (
    <div className="rounded-xl border border-destructive/42 bg-destructive/10 p-3 text-sm text-destructive">
      <p className="inline-flex items-center gap-2 font-semibold">
        <AlertCircle className="h-4 w-4" />
        Spend request blocked
      </p>
      <p className="mt-2 text-destructive-foreground/90">{result.reason}</p>
      {result.remainingDailyCap ? (
        <p className="mt-2">
          Remaining daily allowance: <span className="font-mono">{formatBigIntDisplay(result.remainingDailyCap)}</span>
        </p>
      ) : null}
      {result.policy ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <CompactMetric label="Daily cap" value={`${result.policy.dailyCapPercent}%`} />
          <CompactMetric label="Spent today" value={formatBigIntDisplay(result.policy.spentToday)} />
          <CompactMetric label="Balance" value={formatBigIntDisplay(result.policy.currentBalance)} />
        </div>
      ) : null}
    </div>
  );
}

function ActivityView({
  walletConnected,
  selectedVault,
  planForm,
  planResult,
  onCopy,
  manualTxSignature,
  manualConfirming,
  manualConfirmError,
  onManualTxSignatureChange,
  onConfirmManualExecution
}: {
  walletConnected: boolean;
  selectedVault: AgentBudget | null;
  planForm: AgentPlanFormState;
  planResult: AgentPlanResult | null;
  onCopy: (value: string, label: string) => Promise<void>;
  manualTxSignature: string;
  manualConfirming: boolean;
  manualConfirmError: string | null;
  onManualTxSignatureChange: (value: string) => void;
  onConfirmManualExecution: () => void;
}) {
  const approved = planResult?.allowed ? planResult : null;
  const rejected = planResult && !planResult.allowed ? planResult : null;
  const approvedReceipt = approved?.receipt;
  const rejectedReceipt = rejected?.receipt;
  const confirmed = approved?.manualConfirmation;
  const timelineItems = [
    { label: "Vault selected", detail: selectedVault?.agentId ?? planForm.agentId, done: Boolean(selectedVault || planForm.agentId) },
    { label: "Policy checked", detail: planResult ? (planResult.allowed ? "Approved" : "Rejected") : "Waiting for spend request", done: Boolean(planResult) },
    {
      label: "Budget reserved",
      detail: approvedReceipt
        ? `${formatBigIntDisplay(approvedReceipt.reservation.amountReserved)} ${approvedReceipt.mint}`
        : rejected
          ? "Not reserved (rejected)"
          : "Only after approval",
      done: Boolean(approvedReceipt)
    },
    {
      label: "Private spend created",
      detail: approvedReceipt?.paylinkId ?? (rejected ? "No private spend created" : "Only after approval"),
      done: Boolean(approvedReceipt?.paylinkId)
    },
    {
      label: "Mirage command ready",
      detail: approvedReceipt?.execution.mirageReady ? "Copy-ready" : rejected ? "No command generated" : "Only after approval",
      done: Boolean(approvedReceipt?.execution.mirageReady)
    },
    {
      label: "Payment status",
      detail: confirmed ? "Confirmed" : approvedReceipt ? "Pending/manual" : rejected ? "No payment intent for rejected decision" : "Pending/manual",
      done: Boolean(confirmed)
    },
    {
      label: "Private receipt",
      detail: approvedReceipt ? "Private receipt available" : rejectedReceipt ? "Policy receipt available" : "Available after policy decision",
      done: Boolean(approvedReceipt || rejectedReceipt)
    }
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.78fr)]">
      <Panel>
        <div className="border-b border-[rgba(96,118,168,0.14)] px-5 py-4">
          <SectionTitle icon={<Activity className="h-4 w-4 text-primary" />} title="Spend Timeline" />
        </div>
        <div className="p-5">
          <div className="space-y-1">
            {timelineItems.map((item, index) => (
              <TimelineRow key={item.label} item={item} isLast={index === timelineItems.length - 1} />
            ))}
          </div>
        </div>
      </Panel>

      <Panel>
        <div className="border-b border-[rgba(96,118,168,0.14)] px-5 py-4">
          <SectionTitle title="Private Receipt" detail="Only authorized viewers can reveal spend context." />
        </div>
        <div className="space-y-4 p-5">
          {!walletConnected ? <ConnectPrompt /> : null}
          {!planResult ? (
            <EmptyPanel message="Create a spend request to generate a private receipt." compact />
          ) : approved ? (
            <>
              <InlineNotice tone="success" message={confirmed ? "Payment status: Confirmed" : "Mirage command ready"} />
              <div className="rounded-xl border border-[rgba(96,118,168,0.16)] bg-[rgba(5,10,20,0.4)] p-3">
                <div className="space-y-2">
                  <DataRow label="Agent" value={approvedReceipt?.agentId ?? planForm.agentId} />
                  <DataRow label="Runtime" value={approvedReceipt?.runtime ?? "Claude + Mirage"} />
                  <DataRow label="Goal" value={approvedReceipt?.goal ?? planForm.goal} />
                  {approvedReceipt?.category ? <DataRow label="Category" value={approvedReceipt.category} /> : null}
                  <DataRow
                    label="Amount"
                    value={`${formatBigIntDisplay(approvedReceipt?.amount ?? approved.amount)} ${approvedReceipt?.mint ?? approved.mint}`}
                  />
                  <DataRow label="Recipient" value={approvedReceipt?.recipient ?? approved.recipient} />
                  <DataRow label="Policy" value="Approved" />
                  <DataRow label="Daily cap %" value={`${approvedReceipt?.policy.dailyCapPercent ?? selectedVault?.dailyCapPercent ?? 0}%`} />
                  <DataRow
                    label="Daily left after reservation"
                    value={formatBigIntDisplay(approvedReceipt?.policy.remainingDailyCapAfter ?? approved.remainingDailyCap)}
                  />
                  <DataRow label="Private rail" value={approvedReceipt?.execution.rail ?? approved.rail} />
                  <DataRow label="Visibility" value={approvedReceipt?.execution.visibility ?? "private"} />
                  <DataRow label="Fallback" value={approvedReceipt?.execution.fallback ?? "off"} />
                  <DataRow label="Memo preview" value={approvedReceipt?.memo.preview ?? approved.memoPreview ?? ""} />
                  <DataRow label="Memo reveal" value={approvedReceipt?.memo.reveal ?? "permissioned"} />
                  <DataRow
                    label="Mirage command ready"
                    value={approvedReceipt?.execution.mirageReady || approved.mirage ? "yes" : "no"}
                  />
                  <DataRow label="Payment status" value={confirmed ? "Confirmed" : "Pending/manual"} />
                  <DataRow label="Execution" value={confirmed ? "Mirage CLI" : "Execution pending — run Mirage command manually"} />
                  {confirmed ? <DataRow label="Devnet tx" value={confirmed.txSignature} /> : null}
                </div>
              </div>
              <CompactMetric label="Paylink" value={approvedReceipt?.paylinkId ?? approved.paylinkId} />
              {(approvedReceipt?.paylinkUrl ?? approved.paylinkUrl) ? (
                <Button asChild variant="outline" className="w-full" size="sm">
                  <a href={approvedReceipt?.paylinkUrl ?? approved.paylinkUrl} target="_blank" rel="noreferrer">
                    Open spend link
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              {approved.mirage?.displayCommand ? <CopyCommand command={approved.mirage.displayCommand} onCopy={onCopy} /> : null}
              <ManualConfirmationPanel
                txSignature={manualTxSignature}
                confirming={manualConfirming}
                error={manualConfirmError}
                confirmed={confirmed}
                onTxSignatureChange={onManualTxSignatureChange}
                onConfirm={onConfirmManualExecution}
              />
            </>
          ) : rejected ? (
            <RejectedPolicyReceiptPanel result={rejected} />
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function RejectedPolicyReceiptPanel({ result }: { result: RejectedAgentPlanResult }) {
  const receipt = result.receipt;

  return (
    <div className="rounded-xl border border-destructive/42 bg-destructive/10 p-3">
      <p className="inline-flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertCircle className="h-4 w-4" />
        Policy: Rejected
      </p>
      <div className="mt-3 space-y-2">
        <DataRow label="Reason" value={receipt?.reason ?? result.reason} />
        <DataRow label="Requested amount" value={`${formatBigIntDisplay(receipt?.amount ?? "0")} ${receipt?.mint ?? "USDC"}`} />
        <DataRow
          label="Remaining daily allowance"
          value={formatBigIntDisplay(receipt?.policy.remainingDailyCap ?? result.remainingDailyCap ?? "0")}
        />
        <DataRow label="No paylink created" value={receipt?.artifacts.paylinkCreated ? "no" : "yes"} />
        <DataRow label="No Mirage command generated" value={receipt?.artifacts.mirageCommandGenerated ? "no" : "yes"} />
      </div>
    </div>
  );
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`agent-vault-edge rounded-2xl border border-[rgba(96,118,168,0.14)] bg-[rgba(9,16,29,0.76)] shadow-[0_14px_54px_rgba(1,6,14,0.18)] backdrop-blur-xl ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ icon, title, detail }: { icon?: React.ReactNode; title: string; detail?: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div>
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function RowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-sm text-foreground">{value}</p>
    </div>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="agent-vault-edge min-w-0 rounded-lg border border-[rgba(96,118,168,0.14)] bg-[rgba(5,10,20,0.38)] px-3 py-2">
      <p className="text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-mono text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-xs text-foreground">{value}</span>
    </div>
  );
}

function StatusPill({ status }: { status: AgentBudgetStatus }) {
  const tone = status === "active" ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/45 bg-destructive/10 text-destructive";

  return <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-medium capitalize ${tone}`}>{status}</span>;
}

function InlineNotice({ tone, message }: { tone: "success" | "error"; message: string }) {
  const success = tone === "success";

  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${success ? "border-primary/30 bg-primary/10 text-primary" : "border-destructive/42 bg-destructive/10 text-destructive"}`}>
      <span className="inline-flex items-center gap-2">
        {success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        {message}
      </span>
    </div>
  );
}

function EmptyPanel({ title, message, compact = false }: { title?: string; message: string; compact?: boolean }) {
  return (
    <div className={`${compact ? "p-0" : "p-4"}`}>
      <div className="agent-vault-edge rounded-xl border border-[rgba(96,118,168,0.12)] bg-[rgba(5,10,20,0.34)] px-5 py-4 text-sm">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        <p className={title ? "mt-1 text-muted-foreground" : "text-muted-foreground"}>{message}</p>
      </div>
    </div>
  );
}

function TimelineRow({
  item,
  isLast
}: {
  item: { label: string; detail: string; done: boolean };
  isLast: boolean;
}) {
  return (
    <div className="grid grid-cols-[18px_1fr] gap-3">
      <div className="flex flex-col items-center">
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.done ? "bg-primary shadow-[0_0_16px_rgba(78,215,255,0.45)]" : "bg-[rgba(96,118,168,0.46)]"}`} />
        {!isLast ? <span className="mt-1 h-10 w-px bg-[rgba(96,118,168,0.16)]" /> : null}
      </div>
      <div className="min-w-0 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium text-foreground">{item.label}</p>
          <span className={`rounded-full px-2 py-0.5 text-[0.68rem] ${item.done ? "bg-primary/10 text-primary" : "bg-[rgba(96,118,168,0.1)] text-muted-foreground"}`}>
            {item.done ? "complete" : "pending"}
          </span>
        </div>
        <p className="mt-1 break-words text-xs text-muted-foreground">{item.detail}</p>
      </div>
    </div>
  );
}

function CopyCommand({ command, onCopy }: { command: string; onCopy: (value: string, label: string) => Promise<void> }) {
  return (
    <div className="agent-vault-edge rounded-lg border border-[rgba(96,118,168,0.12)] bg-[rgba(2,7,16,0.66)] p-2.5">
      <p className="break-words font-mono text-xs leading-relaxed text-foreground">{command}</p>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="outline" onClick={() => void onCopy(command, "Command")}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
    </div>
  );
}

