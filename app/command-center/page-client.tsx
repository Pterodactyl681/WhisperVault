"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  FormEvent,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  CircleDot,
  Copy,
  ExternalLink,
  Gauge,
  Github,
  Home,
  KeyRound,
  LogOut,
  Loader2,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Swords,
  Twitter,
  Wallet,
  UsersRound,
  XCircle,
  Zap
} from "lucide-react";
import { AGENT_BUDGET_OWNER_HEADER } from "@/lib/agent-vault/http";
import { cn } from "@/lib/utils";
import { useWhisperPayStore } from "@/store/whisperpay-store";

const DEMO_CONTROLLER = "demo-agent-owner";
const GITHUB_URL = "https://github.com/Pterodactyl681/WhisperVault";
const X_URL = "#";
const DOCS_URL = "https://github.com/Pterodactyl681/WhisperVault#readme";
const TELEGRAM_REFERENCE_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim() ?? "";
const formControlClass =
  "h-11 w-full rounded-lg border border-violet-200/12 bg-[#080812] px-3 text-[16px] text-white caret-violet-300 outline-none transition placeholder:text-zinc-600 focus:border-violet-400/55 focus:bg-[#0B0B17] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.14)] disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-[#07070D] disabled:text-zinc-600 [color-scheme:dark]";

interface CommandCenterAgent {
  id: string;
  name: string;
  status: "active" | "paused" | "exhausted";
  dailyCap: string;
  currentDailySpent: string;
  dailyLeft: string;
  vaultBalance: string;
  ghostAllowanceLive: string;
  ghostAllowanceMax: string;
  ghostRefillAmount: string;
  ghostRefillIntervalMinutes: number;
  preferredRail: string;
  executionMode: string;
  defaultRecipientLabel?: string | null;
  defaultRecipientAddress?: string | null;
  isActive: boolean;
  hasApiToken?: boolean;
  ghostTab: CommandCenterGhostTab | null;
}

interface CommandCenterGhostTabEvent {
  id: string;
  type: string;
  at: string;
  amount?: string;
  allowanceBefore?: string;
  allowanceAfter?: string;
  reason?: string;
}

interface CommandCenterGhostTab {
  id: string;
  status: "active" | "paused" | "expired" | "clawed_back";
  openedAt: string;
  expiresAt: string | null;
  nextRefillAt: string | null;
  allowanceLive: string;
  allowanceMax: string;
  refillAmount: string;
  refillIntervalMinutes: number;
  totalSpent: string;
  totalRefilled: string;
  totalClawedBack: string;
  events: CommandCenterGhostTabEvent[];
}

interface CommandCenterRecipient {
  label: string;
  address: string;
  agentId?: string | null;
  isDefaultForActiveAgent: boolean;
  isAllowedForActiveAgent: boolean;
}

interface CommandCenterReceipt {
  id: string;
  paylinkId: string;
  agent: string;
  amount: string;
  mint: string;
  requestedAmount: string;
  status: string;
  executionRail: string;
  settlementRailLabel: string;
  txSignatureShort: string | null;
  explorerUrl: string | null;
  createdAt: string;
  confirmedAt: string | null;
  recipient: string;
  goal: string | null;
}

type Notice =
  | {
      tone: "success" | "warning" | "error";
      message: string;
    }
  | null;

type SectionId = "overview" | "allowance" | "firewall" | "executions" | "receipts" | "agents" | "simulator" | "settings";

type SpendResult =
  | {
      decision?: string;
      reason?: string;
      paylinkId?: string;
      status?: string;
      rail?: string;
      recipient?: string;
      agent?: string;
      agentId?: string;
    }
  | null;

type SimulatorResult =
  | {
      decision: "approved" | "blocked";
      reason: string;
      amount: string;
      mint: string;
      recipient: string;
      agent: string;
    }
  | null;

const navItems: { id: SectionId; label: string; icon: typeof Home }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "allowance", label: "Ghost Allowance", icon: Sparkles },
  { id: "firewall", label: "Firewall", icon: ShieldCheck },
  { id: "executions", label: "Executions", icon: Swords },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "agents", label: "Agents", icon: UsersRound },
  { id: "simulator", label: "Simulator", icon: Gauge },
  { id: "settings", label: "Settings", icon: Settings }
];

const sectionCopy: Record<SectionId, { title: string; subtitle: string }> = {
  overview: {
    title: "Overview",
    subtitle: "Command center for AI agents and spend control."
  },
  allowance: {
    title: "Ghost Allowance",
    subtitle: "Live private allowance state for the active spend session."
  },
  firewall: {
    title: "Firewall",
    subtitle: "Policy controls for caps, recipients, risk, and blocked spend."
  },
  executions: {
    title: "Executions",
    subtitle: "Queue and history for agent payment execution."
  },
  receipts: {
    title: "Receipts",
    subtitle: "Confirmed settlement records and devnet explorer links."
  },
  agents: {
    title: "Agents",
    subtitle: "Agent vaults, active routing, and allowance health."
  },
  simulator: {
    title: "Simulator",
    subtitle: "Dry-run unsafe agent behavior without creating transactions."
  },
  settings: {
    title: "Settings",
    subtitle: "Local app configuration for the devnet command center."
  }
};

const dashboardSourceLabels = {
  agentList: "Agent List",
  spendIntentPanel: "Spend Intent Panel"
} as const;

const compactAddress = (value?: string | null): string => {
  if (!value) {
    return "Not set";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
};

const formatRail = (value?: string | null): string => {
  if (!value) {
    return "Private Rail";
  }

  if (value === "magicblock-private" || value === "magicblock-private-spl") {
    return "MagicBlock Private Rail";
  }

  if (value === "mirage-private-first") {
    return "Mirage First";
  }

  if (/native/i.test(value)) {
    return "Native Fallback";
  }

  return value;
};

const formatCountdown = (iso?: string | null): string => {
  if (!iso) {
    return "Not set";
  }

  const parsed = Date.parse(iso);

  if (Number.isNaN(parsed)) {
    return "Not set";
  }

  const delta = parsed - Date.now();
  const minutes = Math.max(1, Math.round(Math.abs(delta) / 60000));
  const value = minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
  return delta >= 0 ? `in ${value}` : `${value} ago`;
};

const formatDateTime = (iso?: string | null): string => {
  if (!iso) {
    return "Not set";
  }

  const parsed = Date.parse(iso);

  if (Number.isNaN(parsed)) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
};

const statusTone = (status?: string | null): "success" | "warning" | "danger" | "neutral" => {
  if (status === "active" || status === "confirmed" || status === "approved") {
    return "success";
  }

  if (status === "pending" || status === "pending_execution" || status === "paused") {
    return "warning";
  }

  if (status === "blocked" || status === "failed" || status === "exhausted" || status === "expired" || status === "clawed_back") {
    return "danger";
  }

  return "neutral";
};

const numericValue = (value?: string | null): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const percentOf = (current?: string | null, max?: string | null): number => {
  const maxValue = numericValue(max);

  if (maxValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (numericValue(current) / maxValue) * 100));
};

export default function CommandCenterPageClient() {
  const wallet = useWhisperPayStore((state) => state.wallet);
  const solanaWallet = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const controllerWallet = wallet.connected && wallet.address ? wallet.address : DEMO_CONTROLLER;
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [agents, setAgents] = useState<CommandCenterAgent[]>([]);
  const [recipients, setRecipients] = useState<CommandCenterRecipient[]>([]);
  const [receipts, setReceipts] = useState<CommandCenterReceipt[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [spendAmount, setSpendAmount] = useState("");
  const [spendMint, setSpendMint] = useState("USDC");
  const [spendGoal, setSpendGoal] = useState("");
  const [spendRecipient, setSpendRecipient] = useState("");
  const [spendResult, setSpendResult] = useState<SpendResult>(null);
  const [simulatorAmount, setSimulatorAmount] = useState("");
  const [simulatorMint, setSimulatorMint] = useState("");
  const [simulatorGoal, setSimulatorGoal] = useState("");
  const [simulatorRecipient, setSimulatorRecipient] = useState("");
  const [simulatorResult, setSimulatorResult] = useState<SimulatorResult>(null);

  const activeAgent = useMemo(() => agents.find((agent) => agent.isActive) ?? agents[0] ?? null, [agents]);
  const confirmedReceipts = useMemo(() => receipts.filter((receipt) => receipt.status === "confirmed"), [receipts]);
  const pendingExecutions = useMemo(
    () => receipts.filter((receipt) => receipt.status === "pending" || receipt.status === "pending_execution"),
    [receipts]
  );
  const blockedAttempts = useMemo(() => receipts.filter((receipt) => receipt.status === "blocked" || receipt.status === "failed"), [receipts]);
  const ownerHeaders = useMemo(
    () => ({
      [AGENT_BUDGET_OWNER_HEADER]: controllerWallet
    }),
    [controllerWallet]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    const readJson = async <T,>(url: string, fallback: T): Promise<{ data: T; error: string | null }> => {
      try {
        const response = await fetch(url, { headers: ownerHeaders });

        if (!response.ok) {
          return { data: fallback, error: `${url} returned ${response.status}` };
        }

        return { data: (await response.json()) as T, error: null };
      } catch (error) {
        return { data: fallback, error: error instanceof Error ? error.message : `${url} could not be loaded` };
      }
    };

    const [agentsResult, recipientsResult, receiptsResult] = await Promise.all([
      readJson<{ agents?: CommandCenterAgent[] }>("/api/agents", { agents: [] }),
      readJson<{ recipients?: CommandCenterRecipient[] }>("/api/recipients", { recipients: [] }),
      readJson<{ receipts?: CommandCenterReceipt[] }>("/api/receipts", { receipts: [] })
    ]);

    setAgents(Array.isArray(agentsResult.data.agents) ? agentsResult.data.agents : []);
    setRecipients(Array.isArray(recipientsResult.data.recipients) ? recipientsResult.data.recipients : []);
    setReceipts(Array.isArray(receiptsResult.data.receipts) ? receiptsResult.data.receipts : []);

    const errors = [agentsResult.error, recipientsResult.error, receiptsResult.error].filter(Boolean);

    if (errors.length > 0) {
      setNotice({
        tone: "warning",
        message: `Some command center data is unavailable: ${errors.join("; ")}.`
      });
    }

    setIsLoading(false);
  }, [ownerHeaders]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const submitJson = async (url: string, body: Record<string, unknown>) => {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...ownerHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = (await response.json()) as SpendResult & { error?: { message?: string } };

    if (!response.ok) {
      throw new Error(payload?.error?.message ?? "Request failed.");
    }

    return payload;
  };

  const createAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await submitJson("/api/agents/create", { name: newAgentName });
      setNewAgentName("");
      setNotice({ tone: "success", message: "Agent Vault created and selected." });
      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Agent could not be created." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const useAgent = async (agentId: string) => {
    setIsSubmitting(true);

    try {
      await submitJson("/api/agents/use", { agentId });
      setNotice({ tone: "success", message: "Active Agent Vault updated." });
      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Agent could not be selected." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateBudgetStatus = async (agentId: string, action: "pause" | "resume") => {
    setIsSubmitting(true);

    try {
      await submitJson(`/api/agent-budgets/${encodeURIComponent(agentId)}/${action}`, {});
      setNotice({ tone: "success", message: `Ghost Allowance ${action === "pause" ? "paused" : "resumed"}.` });
      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Ghost Allowance status could not be updated." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const addRecipient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await submitJson("/api/recipients/add", { label: recipientLabel, address: recipientAddress });
      setRecipientLabel("");
      setRecipientAddress("");
      setNotice({ tone: "success", message: "Recipient added." });
      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Recipient could not be added." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const useRecipient = async (label: string) => {
    setIsSubmitting(true);

    try {
      await submitJson("/api/recipients/use", { label });
      setNotice({ tone: "success", message: "Default recipient updated." });
      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Recipient could not be selected." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitSpendIntent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setSpendResult(null);

    try {
      const payload = await submitJson("/api/spend-intent", {
        amount: spendAmount,
        mint: spendMint || "USDC",
        goal: spendGoal,
        recipient: spendRecipient
      });

      setSpendResult(payload);

      if (payload?.decision === "blocked") {
        setNotice({ tone: "warning", message: payload.reason ?? "Spend Firewall blocked this intent." });
      } else {
        setNotice({ tone: "success", message: `Spend intent created: ${payload?.paylinkId ?? "pending execution"}` });
      }

      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Spend intent failed." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const runSimulator = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const amountValue = numericValue(simulatorAmount);
    const mint = simulatorMint.trim() || "USDC";
    const recipient = simulatorRecipient || activeAgent?.defaultRecipientAddress || "";
    const activeAllowance = numericValue(activeAgent?.ghostAllowanceLive);
    const dailyLeft = numericValue(activeAgent?.dailyLeft);

    if (!activeAgent) {
      setSimulatorResult({
        decision: "blocked",
        reason: "No active agent is selected.",
        amount: simulatorAmount || "0",
        mint,
        recipient,
        agent: "No active agent"
      });
      return;
    }

    if (amountValue <= 0) {
      setSimulatorResult({
        decision: "blocked",
        reason: "Enter an amount greater than zero.",
        amount: simulatorAmount || "0",
        mint,
        recipient,
        agent: activeAgent.name
      });
      return;
    }

    const blockedReason =
      amountValue > activeAllowance
        ? "Amount exceeds live Ghost Allowance."
        : amountValue > dailyLeft
          ? "Amount exceeds daily remaining firewall budget."
          : "";

    setSimulatorResult({
      decision: blockedReason ? "blocked" : "approved",
      reason: blockedReason || "Current visible policy would allow this intent.",
      amount: simulatorAmount,
      mint,
      recipient,
      agent: activeAgent.name
    });
  };

  const resetDemoState = async () => {
    setIsSubmitting(true);

    try {
      const callReset = async (secret?: string | null) =>
        fetch("/api/demo/reset", {
          method: "POST",
          headers: {
            ...ownerHeaders,
            "Content-Type": "application/json",
            ...(secret ? { Authorization: `Bearer ${secret}` } : {})
          },
          body: JSON.stringify({
            controllerWallet
          })
        });

      let response = await callReset();

      if (response.status === 401 && typeof window !== "undefined") {
        const secret = window.prompt("Demo admin secret");

        if (!secret) {
          throw new Error("Demo reset requires an admin secret.");
        }

        response = await callReset(secret);
      }

      const payload = (await response.json()) as { error?: { message?: string }; activeAgent?: string; ghostAllowance?: string };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Demo state could not be reset.");
      }

      setNotice({
        tone: "success",
        message: `Demo state ready: ${payload.activeAgent ?? "coffee-agent"} (${payload.ghostAllowance ?? "20/20 USDC"})`
      });
      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Demo state could not be reset." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWalletAction = async () => {
    if (solanaWallet.connected) {
      await solanaWallet.disconnect();
      return;
    }

    solanaWallet.select(null);
    setWalletModalVisible(true);
  };

  return (
    <div className="relative left-1/2 -mb-6 -mt-6 min-h-screen w-screen -translate-x-1/2 bg-[#03030A] text-white md:-mb-8 md:-mt-8">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_48%_18%,rgba(130,63,255,0.20),transparent_28%),radial-gradient(circle_at_82%_8%,rgba(93,45,185,0.16),transparent_22%),linear-gradient(180deg,#03030A_0%,#050510_48%,#020207_100%)]" />
      <div className="fixed inset-0 bg-[linear-gradient(rgba(155,111,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(155,111,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] opacity-30" />

      <div className="relative grid min-h-screen lg:grid-cols-[264px_1fr]">
        <aside className="border-b border-white/10 bg-[#050510]/86 px-4 py-4 backdrop-blur-xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-6 lg:py-7">
          <div className="flex h-full flex-col gap-6">
            <div className="flex items-center gap-3">
              <Sigil className="h-11 w-11" />
              <div>
                <div className="text-[17px] font-semibold uppercase tracking-[0.11em] text-white">WhisperVault</div>
                <div className="text-[13px] text-violet-200/48">Private spend control</div>
              </div>
            </div>

            <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveSection(item.id)}
                    className={cn(
                      "group flex min-h-11 shrink-0 items-center gap-3 rounded-lg border px-3 text-left text-[16px] transition",
                      isActive
                        ? "border-violet-400/25 bg-violet-600/18 text-white shadow-[0_0_32px_rgba(126,71,255,0.18)]"
                        : "border-transparent text-violet-100/70 hover:border-violet-400/18 hover:bg-white/[0.035] hover:text-white"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive ? "text-violet-300" : "text-violet-200/70")} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mt-auto hidden w-full items-center justify-center gap-2 lg:flex">
              <SidebarFooterLink href={GITHUB_URL} label="GitHub">
                <Github className="h-4 w-4" />
              </SidebarFooterLink>
              <SidebarFooterLink href={X_URL} label="X / Twitter">
                <Twitter className="h-4 w-4" />
              </SidebarFooterLink>
              <SidebarFooterLink href={DOCS_URL} label="Docs / README">
                <BookOpenText className="h-4 w-4" />
              </SidebarFooterLink>
            </div>
          </div>
        </aside>

        <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8 xl:px-9">
          <header className="mb-7 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-[32px] font-medium leading-tight tracking-normal text-white">{sectionCopy[activeSection].title}</h1>
              <p className="mt-1 text-[16px] text-zinc-400">{sectionCopy[activeSection].subtitle}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <HeaderWalletButton connected={solanaWallet.connected} connecting={solanaWallet.connecting} onClick={() => void handleWalletAction()} />
            </div>
          </header>

          {notice ? <NoticeBanner notice={notice} /> : null}
          {isLoading ? <LoadingStrip /> : null}

          <div key={activeSection} className="command-center-section-transition">
            {activeSection === "overview" ? (
              <OverviewSection
                activeAgent={activeAgent}
                receipts={receipts}
                pendingCount={pendingExecutions.length}
                confirmedCount={confirmedReceipts.length}
                setSection={setActiveSection}
              />
            ) : null}
            {activeSection === "allowance" ? (
              <AllowanceSection activeAgent={activeAgent} isSubmitting={isSubmitting} updateBudgetStatus={updateBudgetStatus} />
            ) : null}
            {activeSection === "firewall" ? (
              <FirewallSection activeAgent={activeAgent} recipients={recipients} blockedAttempts={blockedAttempts} setSection={setActiveSection} />
            ) : null}
            {activeSection === "executions" ? (
              <ExecutionsSection
                activeAgent={activeAgent}
                recipients={recipients}
                receipts={receipts}
                spendAmount={spendAmount}
                setSpendAmount={setSpendAmount}
                spendMint={spendMint}
                setSpendMint={setSpendMint}
                spendGoal={spendGoal}
                setSpendGoal={setSpendGoal}
                spendRecipient={spendRecipient}
                setSpendRecipient={setSpendRecipient}
                spendResult={spendResult}
                submitSpendIntent={submitSpendIntent}
                isSubmitting={isSubmitting}
              />
            ) : null}
            {activeSection === "receipts" ? <ReceiptsSection receipts={confirmedReceipts} /> : null}
            {activeSection === "agents" ? (
              <AgentsSection
                agents={agents}
                isSubmitting={isSubmitting}
                newAgentName={newAgentName}
                setNewAgentName={setNewAgentName}
                createAgent={createAgent}
                useAgent={useAgent}
              />
            ) : null}
            {activeSection === "simulator" ? (
              <SimulatorSection
                activeAgent={activeAgent}
                recipients={recipients}
                simulatorAmount={simulatorAmount}
                setSimulatorAmount={setSimulatorAmount}
                simulatorMint={simulatorMint}
                setSimulatorMint={setSimulatorMint}
                simulatorGoal={simulatorGoal}
                setSimulatorGoal={setSimulatorGoal}
                simulatorRecipient={simulatorRecipient}
                setSimulatorRecipient={setSimulatorRecipient}
                simulatorResult={simulatorResult}
                runSimulator={runSimulator}
              />
            ) : null}
            {activeSection === "settings" ? (
              <SettingsSection
                controllerWallet={controllerWallet}
                resetDemoState={resetDemoState}
                isSubmitting={isSubmitting}
                recipientLabel={recipientLabel}
                setRecipientLabel={setRecipientLabel}
                recipientAddress={recipientAddress}
                setRecipientAddress={setRecipientAddress}
                addRecipient={addRecipient}
                recipients={recipients}
                useRecipient={useRecipient}
              />
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}

function OverviewSection({
  activeAgent,
  receipts,
  pendingCount,
  confirmedCount,
  setSection
}: {
  activeAgent: CommandCenterAgent | null;
  receipts: CommandCenterReceipt[];
  pendingCount: number;
  confirmedCount: number;
  setSection: (section: SectionId) => void;
}) {
  const recentReceipts = receipts.slice(0, 5);

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1.3fr_1.35fr]">
      <Panel className="min-h-[248px]">
        <PanelTitle>Active Agent</PanelTitle>
        {activeAgent ? (
          <div className="mt-7 space-y-7">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-violet-400 shadow-[0_0_14px_rgba(167,111,255,0.85)]" />
                  <div className="truncate text-[23px] text-white">{activeAgent.name}</div>
                  <StatusBadge status={activeAgent.status} />
                </div>
              </div>
              <MiniSigil />
            </div>
            <div className="grid gap-4">
              <LabelValue label="Wallet" value={compactAddress(activeAgent.id)} withCopy />
              <LabelValue label="Network" value="Solana Devnet" />
            </div>
            <ActionButton onClick={() => setSection("agents")}>View Agent</ActionButton>
          </div>
        ) : (
          <EmptyState title="No active agent" body="Create an Agent Vault to start routing web spend intents." />
        )}
      </Panel>

      <Panel className="min-h-[248px]">
        <PanelTitle>Ghost Allowance</PanelTitle>
        <div className="mt-5 grid gap-6 md:grid-cols-[220px_1fr] md:items-center xl:grid-cols-[190px_1fr] 2xl:grid-cols-[220px_1fr]">
          <AllowanceRing
            current={activeAgent?.ghostAllowanceLive}
            max={activeAgent?.ghostAllowanceMax}
            sizeClassName="h-44 w-44 xl:h-40 xl:w-40 2xl:h-44 2xl:w-44"
          />
          <div className="space-y-4">
            <MetricRow label="Current" value={`${activeAgent?.ghostAllowanceLive ?? "0"} USDC`} />
            <MetricRow label="Max Allowance" value={`${activeAgent?.ghostAllowanceMax ?? "0"} USDC`} />
            <MetricRow label="Refill Rate" value={`${activeAgent?.ghostRefillAmount ?? "0"} USDC / ${activeAgent?.ghostRefillIntervalMinutes ?? 0}m`} />
            <MetricRow label="Next Refill" value={formatCountdown(activeAgent?.ghostTab?.nextRefillAt)} />
          </div>
        </div>
        <div className="mt-5">
          <ActionButton onClick={() => setSection("allowance")}>Manage Allowance</ActionButton>
        </div>
      </Panel>

      <Panel className="min-h-[248px]">
        <PanelTitle>Spend Firewall</PanelTitle>
        <div className="mt-5 grid gap-6 md:grid-cols-[176px_1fr] md:items-center">
          <ShieldSigil />
          <div className="space-y-4">
            <MetricRow label="Daily Cap" value={`${activeAgent?.dailyCap ?? "0"} USDC`} />
            <MetricRow label="Per Spend Limit" value={`${activeAgent?.ghostAllowanceMax ?? "0"} USDC`} />
            <MetricRow label="Recipient Policy" value="Allowlist" />
            <MetricRow label="Risk Filter" value="Strict" />
          </div>
        </div>
        <div className="mt-5">
          <ActionButton onClick={() => setSection("firewall")}>Configure Firewall</ActionButton>
        </div>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelTitle>Recent Receipts</PanelTitle>
        <DataTable
          columns={["TX Signature", "Amount", "Recipient", "Time", "Explorer"]}
          emptyTitle="No receipts yet"
          emptyBody="Approved web intents will appear here after settlement."
        >
          {recentReceipts.map((receipt) => (
            <tr key={receipt.id} className="border-t border-white/[0.07]">
              <td className="px-3 py-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="font-medium text-violet-300">{receipt.txSignatureShort ?? compactAddress(receipt.paylinkId)}</span>
                </div>
              </td>
              <td className="px-3 py-4 text-white">{receipt.amount} {receipt.mint}</td>
              <td className="px-3 py-4 text-zinc-300">{compactAddress(receipt.recipient)}</td>
              <td className="px-3 py-4 text-zinc-300">{formatCountdown(receipt.confirmedAt ?? receipt.createdAt)}</td>
              <td className="px-3 py-4">
                <ExplorerLink url={receipt.explorerUrl} />
              </td>
            </tr>
          ))}
        </DataTable>
        {recentReceipts.length > 0 ? (
          <button type="button" onClick={() => setSection("receipts")} className="mx-auto mt-5 flex items-center gap-2 text-[15px] text-violet-300">
            View All Receipts <ArrowRight className="h-4 w-4" />
          </button>
        ) : null}
      </Panel>

      <div className="grid gap-4">
        <Panel>
          <PanelTitle>Live Summary</PanelTitle>
          <LineChart />
          <div className="mt-5 grid grid-cols-3 divide-x divide-white/[0.08]">
            <SummaryMetric label="Allowance" value={`${activeAgent?.ghostAllowanceLive ?? "0"} / ${activeAgent?.ghostAllowanceMax ?? "0"} USDC`} />
            <SummaryMetric label="Pending" value={String(pendingCount)} sublabel="Executions" />
            <SummaryMetric label="Confirmed" value={String(confirmedCount)} sublabel="Txs" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function AllowanceSection({
  activeAgent,
  isSubmitting,
  updateBudgetStatus
}: {
  activeAgent: CommandCenterAgent | null;
  isSubmitting: boolean;
  updateBudgetStatus: (agentId: string, action: "pause" | "resume") => void;
}) {
  const ghostTab = activeAgent?.ghostTab ?? null;

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel className="min-h-[520px]">
        <div className="grid h-full gap-8 lg:grid-cols-[360px_1fr] lg:items-center">
          <div className="flex justify-center">
            <AllowanceRing current={activeAgent?.ghostAllowanceLive} max={activeAgent?.ghostAllowanceMax} sizeClassName="h-72 w-72" large />
          </div>
          <div className="space-y-5">
            <PanelTitle>Allowance Session</PanelTitle>
            <div className="text-[39px] font-medium leading-tight text-white">
              {activeAgent?.ghostAllowanceLive ?? "0"} / {activeAgent?.ghostAllowanceMax ?? "0"} USDC
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <SoftMetric label="Refill Amount" value={`${activeAgent?.ghostRefillAmount ?? "0"} USDC`} />
              <SoftMetric label="Refill Interval" value={`${activeAgent?.ghostRefillIntervalMinutes ?? 0} minutes`} />
              <SoftMetric label="Next Refill" value={formatCountdown(ghostTab?.nextRefillAt)} />
              <SoftMetric label="Session Status" value={ghostTab?.status ?? activeAgent?.status ?? "Unavailable"} />
              <SoftMetric label="Clawback Status" value={numericValue(ghostTab?.totalClawedBack) > 0 ? `${ghostTab?.totalClawedBack} USDC` : "No clawback"} />
              <SoftMetric label="Session Ends" value={formatCountdown(ghostTab?.expiresAt)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <ControlButton disabled title="No open endpoint is exposed in the web API.">
                Open
              </ControlButton>
              <ControlButton
                disabled={!activeAgent || isSubmitting || activeAgent.status === "paused"}
                onClick={() => activeAgent ? updateBudgetStatus(activeAgent.id, "pause") : undefined}
              >
                Pause
              </ControlButton>
              <ControlButton
                disabled={!activeAgent || isSubmitting || activeAgent.status !== "paused"}
                onClick={() => activeAgent ? updateBudgetStatus(activeAgent.id, "resume") : undefined}
              >
                Resume
              </ControlButton>
              <ControlButton disabled title="No close endpoint is exposed in the web API.">
                Close
              </ControlButton>
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Ghost Tab Timeline</PanelTitle>
        <div className="mt-6 space-y-3">
          {ghostTab?.events?.length ? (
            ghostTab.events.map((event) => (
              <div key={event.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-medium capitalize text-white">{event.type.replace(/_/g, " ")}</div>
                    <div className="mt-1 text-[14px] text-zinc-500">{formatDateTime(event.at)}</div>
                  </div>
                  {event.amount ? <StatusBadge status="confirmed">{event.amount} USDC</StatusBadge> : null}
                </div>
                {event.reason ? <p className="mt-3 text-[15px] text-zinc-400">{event.reason}</p> : null}
              </div>
            ))
          ) : (
            <EmptyState title="No timeline events" body="Ghost Tab events will appear here when the active session changes." />
          )}
        </div>
      </Panel>
    </div>
  );
}

function FirewallSection({
  activeAgent,
  recipients,
  blockedAttempts,
  setSection
}: {
  activeAgent: CommandCenterAgent | null;
  recipients: CommandCenterRecipient[];
  blockedAttempts: CommandCenterReceipt[];
  setSection: (section: SectionId) => void;
}) {
  const allowedRecipients = recipients.filter((recipient) => recipient.isAllowedForActiveAgent);

  return (
    <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel>
        <PanelTitle>Spend Firewall Status</PanelTitle>
        <div className="mt-6 flex justify-center">
          <ShieldSigil large />
        </div>
        <div className="mt-8 grid gap-3">
          <MetricRow label="Daily Cap" value={`${activeAgent?.dailyCap ?? "0"} USDC`} />
          <MetricRow label="Per Spend Limit" value={`${activeAgent?.ghostAllowanceMax ?? "0"} USDC`} />
          <MetricRow label="Recipient Allowlist" value={allowedRecipients.length > 0 ? `${allowedRecipients.length} allowed` : "No recipients"} />
          <MetricRow label="Risk Filter" value="Strict" />
          <MetricRow label="Blocked Attempts" value={String(blockedAttempts.length)} />
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Policy Rules</PanelTitle>
        <div className="mt-6 space-y-3">
          <PolicyRule title="Daily cap enforcement" body="Spend is bounded by the active agent daily allowance." status="active" />
          <PolicyRule title="Live Ghost Allowance" body="Each intent must fit inside the rolling private allowance." status="active" />
          <PolicyRule
            title="Recipient allowlist"
            body={activeAgent?.defaultRecipientAddress ? `Default recipient: ${compactAddress(activeAgent.defaultRecipientAddress)}` : "No default recipient selected."}
            status={activeAgent?.defaultRecipientAddress ? "active" : "pending"}
          />
          <PolicyRule title="Public fallback" body={formatRail(activeAgent?.executionMode)} status="active" />
        </div>
        <div className="mt-6">
          <ActionButton onClick={() => setSection("settings")}>Manage Recipients</ActionButton>
        </div>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelTitle>Blocked Attempts</PanelTitle>
        <DataTable columns={["Paylink ID", "Agent", "Amount", "Recipient", "Time"]} emptyTitle="No blocked attempts" emptyBody="Rejected or failed intents will appear here.">
          {blockedAttempts.map((receipt) => (
            <tr key={receipt.id} className="border-t border-white/[0.07]">
              <td className="px-3 py-4 font-medium text-violet-300">{receipt.paylinkId}</td>
              <td className="px-3 py-4 text-zinc-300">{receipt.agent}</td>
              <td className="px-3 py-4 text-white">{receipt.amount} {receipt.mint}</td>
              <td className="px-3 py-4 text-zinc-300">{compactAddress(receipt.recipient)}</td>
              <td className="px-3 py-4 text-zinc-300">{formatCountdown(receipt.createdAt)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}

function ExecutionsSection({
  activeAgent,
  recipients,
  receipts,
  spendAmount,
  setSpendAmount,
  spendMint,
  setSpendMint,
  spendGoal,
  setSpendGoal,
  spendRecipient,
  setSpendRecipient,
  spendResult,
  submitSpendIntent,
  isSubmitting
}: {
  activeAgent: CommandCenterAgent | null;
  recipients: CommandCenterRecipient[];
  receipts: CommandCenterReceipt[];
  spendAmount: string;
  setSpendAmount: (value: string) => void;
  spendMint: string;
  setSpendMint: (value: string) => void;
  spendGoal: string;
  setSpendGoal: (value: string) => void;
  spendRecipient: string;
  setSpendRecipient: (value: string) => void;
  spendResult: SpendResult;
  submitSpendIntent: (event: FormEvent<HTMLFormElement>) => void;
  isSubmitting: boolean;
}) {
  return (
    <div className="grid gap-4">
      <Panel>
        <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
          <div>
            <PanelTitle>Create Spend Intent</PanelTitle>
            <div className="mt-5 rounded-lg border border-violet-400/15 bg-violet-500/[0.04] p-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">Active Agent</div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <div className="text-[20px] font-medium text-white">{activeAgent?.name ?? "No active agent"}</div>
                {activeAgent ? <StatusBadge status="active">Active</StatusBadge> : <StatusBadge status="inactive">Unavailable</StatusBadge>}
              </div>
              <div className="mt-3 text-[14px] text-zinc-400">
                {activeAgent ? `${formatRail(activeAgent.executionMode)} - ${compactAddress(activeAgent.defaultRecipientAddress)}` : "Add or select an agent before creating a real spend intent."}
              </div>
            </div>
            <form className="mt-5 space-y-4" onSubmit={submitSpendIntent}>
              <div className="grid gap-3 sm:grid-cols-[1fr_0.7fr]">
                <Field label="Amount">
                  <StyledInput
                    value={spendAmount}
                    onChange={(event) => setSpendAmount(event.target.value)}
                    placeholder="1"
                    inputMode="numeric"
                    aria-label="Spend amount"
                  />
                </Field>
                <Field label="Mint">
                  <StyledInput value={spendMint} onChange={(event) => setSpendMint(event.target.value)} placeholder="USDC" aria-label="Spend mint" />
                </Field>
              </div>
              <Field label="Recipient">
                <StyledSelect value={spendRecipient} onChange={(event) => setSpendRecipient(event.target.value)} aria-label="Spend recipient">
                  <option value="" className="bg-[#080812] text-zinc-400">
                    Active agent default
                  </option>
                  {recipients.map((recipient) => (
                    <option key={recipient.label} value={recipient.address} className="bg-[#080812] text-white">
                      {recipient.label} - {compactAddress(recipient.address)}
                    </option>
                  ))}
                </StyledSelect>
              </Field>
              <Field label="Intent">
                <StyledTextarea value={spendGoal} onChange={(event) => setSpendGoal(event.target.value)} placeholder="buy coffee" aria-label="Spend goal" />
              </Field>
              <ControlButton type="submit" disabled={!activeAgent || isSubmitting} className="w-full justify-center">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                Create Spend Intent
              </ControlButton>
            </form>
          </div>

          <div>
            <PanelTitle>Pending Execution</PanelTitle>
            <div className="mt-5">
              {spendResult ? (
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
                  <div className="flex items-center gap-3">
                    {spendResult.decision === "blocked" ? <XCircle className="h-5 w-5 text-red-400" /> : <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                    <div className="text-[21px] font-medium text-white">
                      {spendResult.decision === "blocked" ? "Spend intent blocked" : "Pending execution created"}
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <SoftMetric label="Paylink ID" value={spendResult.paylinkId ?? "None"} />
                    <SoftMetric label="Status" value={spendResult.status === "pending_execution" ? "pending execution" : spendResult.status ?? spendResult.decision ?? "pending execution"} />
                    <SoftMetric label="Rail" value={formatRail(spendResult.rail ?? "magicblock-private")} />
                    <SoftMetric label="Recipient" value={compactAddress(spendResult.recipient)} />
                  </div>
                  {spendResult.reason ? <div className="mt-4 text-[14px] text-zinc-400">{spendResult.reason}</div> : null}
                </div>
              ) : (
                <EmptyState title="No pending intent" body="Create a spend intent here for real devnet execution. Simulator remains dry-run only." />
              )}
            </div>
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Execution Queue</PanelTitle>
        <DataTable
          columns={["Paylink ID", "Agent", "Amount", "Recipient", "Status", "Rail", "Time", "Action"]}
          emptyTitle="No executions"
          emptyBody="Pending, blocked, confirmed, and failed executions will appear here."
        >
          {receipts.map((receipt) => (
            <tr key={receipt.id} className="border-t border-white/[0.07]">
              <td className="px-3 py-4 font-medium text-violet-300">{receipt.paylinkId}</td>
              <td className="px-3 py-4 text-zinc-300">{receipt.agent}</td>
              <td className="px-3 py-4 text-white">{receipt.amount} {receipt.mint}</td>
              <td className="px-3 py-4 text-zinc-300">{compactAddress(receipt.recipient)}</td>
              <td className="px-3 py-4"><StatusBadge status={receipt.status} /></td>
              <td className="px-3 py-4 text-zinc-300">{formatRail(receipt.executionRail)}</td>
              <td className="px-3 py-4 text-zinc-300">{formatCountdown(receipt.createdAt)}</td>
              <td className="px-3 py-4"><ExplorerLink url={receipt.explorerUrl} /></td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}

function ReceiptsSection({ receipts }: { receipts: CommandCenterReceipt[] }) {
  return (
    <Panel>
      <PanelTitle>Confirmed Receipts</PanelTitle>
      <DataTable
        columns={["Receipt ID", "TX Signature", "Amount", "Recipient", "Execution Rail", "Status", "Explorer"]}
        emptyTitle="No confirmed receipts"
        emptyBody="Settled devnet transactions will appear here with explorer links."
      >
        {receipts.map((receipt) => (
          <tr key={receipt.id} className="border-t border-white/[0.07]">
            <td className="px-3 py-4 font-medium text-violet-300">{receipt.id}</td>
            <td className="px-3 py-4 text-zinc-300">{receipt.txSignatureShort ?? "Pending"}</td>
            <td className="px-3 py-4 text-white">{receipt.amount} {receipt.mint}</td>
            <td className="px-3 py-4 text-zinc-300">{compactAddress(receipt.recipient)}</td>
            <td className="px-3 py-4 text-zinc-300">{formatRail(receipt.executionRail)}</td>
            <td className="px-3 py-4"><StatusBadge status={receipt.status} /></td>
            <td className="px-3 py-4"><ExplorerLink url={receipt.explorerUrl} /></td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
}

function AgentsSection({
  agents,
  isSubmitting,
  newAgentName,
  setNewAgentName,
  createAgent,
  useAgent
}: {
  agents: CommandCenterAgent[];
  isSubmitting: boolean;
  newAgentName: string;
  setNewAgentName: (value: string) => void;
  createAgent: (event: FormEvent<HTMLFormElement>) => void;
  useAgent: (agentId: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <Panel>
        <PanelTitle>{dashboardSourceLabels.agentList}</PanelTitle>
        <div className="mt-6 grid gap-3">
          {agents.map((agent) => (
            <div key={agent.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
              <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate text-[18px] font-medium text-white">{agent.name}</div>
                    {agent.isActive ? <StatusBadge status="active">Active</StatusBadge> : null}
                    <StatusBadge status={agent.status} />
                  </div>
                  <div className="mt-2 text-[14px] text-zinc-500">{formatRail(agent.executionMode)}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  <SoftMetric label="Ghost Allowance" value={`${agent.ghostAllowanceLive}/${agent.ghostAllowanceMax}`} compact />
                  <SoftMetric label="Daily Remaining" value={`${agent.dailyLeft} USDC`} compact />
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <ControlButton disabled={agent.isActive || isSubmitting} onClick={() => useAgent(agent.id)}>
                    Set Active Vault
                  </ControlButton>
                  <ControlButton disabled title="No web token generation endpoint is exposed.">
                    <KeyRound className="h-3.5 w-3.5" />
                    API Token
                  </ControlButton>
                </div>
              </div>
            </div>
          ))}
          {agents.length === 0 ? <EmptyState title="No Agent Vaults" body="Add an Agent Vault to create policy and limits for spend intents." /> : null}
        </div>
      </Panel>

      <div className="grid gap-4">
        <Panel>
          <PanelTitle>Add Agent Vault</PanelTitle>
          <p className="mt-4 text-[15px] text-zinc-400">
            Adding an Agent Vault creates policy and limits. The agent becomes connected when it uses Telegram or the API token to submit spend intents.
          </p>
          <form className="mt-6 space-y-3" onSubmit={createAgent}>
            <StyledInput value={newAgentName} onChange={(event) => setNewAgentName(event.target.value)} placeholder="agent vault name" aria-label="New Agent Vault name" />
            <ControlButton type="submit" disabled={isSubmitting} className="w-full justify-center">
              <Plus className="h-4 w-4" />
              Add Agent Vault
            </ControlButton>
          </form>
        </Panel>

        {agents.length > 0 ? <ConnectAgentPanel agent={agents.find((agent) => agent.isActive) ?? agents[0] ?? null} /> : null}
      </div>
    </div>
  );
}

function ConnectAgentPanel({ agent }: { agent: CommandCenterAgent | null }) {
  const agentName = agent?.name ?? "agent-name";
  const telegramBotAvailable = TELEGRAM_REFERENCE_BOT_URL.length > 0;

  return (
    <Panel>
      <PanelTitle>Connect Agent</PanelTitle>
      <p className="mt-4 text-[15px] text-zinc-400">
        Web Command Center is the controller/admin surface. Telegram is the reference external agent interface. BYO Agent API is for custom AI agents.
      </p>

      <div className="mt-5 grid gap-3">
        <ConnectionMethod
          title="Telegram Reference Agent"
          detail="Use the Telegram bot to link this controller, select a vault, and submit a spend intent."
          action={
            <ControlButton asAnchor href={telegramBotAvailable ? TELEGRAM_REFERENCE_BOT_URL : "#"} disabled={!telegramBotAvailable} title={telegramBotAvailable ? "Open Telegram bot" : "Set NEXT_PUBLIC_TELEGRAM_BOT_URL to enable this link."}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open Telegram bot
            </ControlButton>
          }
          steps={[
            <>Use <code className="text-violet-200">/link &lt;code&gt;</code> if needed</>,
            <>Use <code className="text-violet-200">{`/agent use ${agentName}`}</code></>,
            <>Use <code className="text-violet-200">/spend 1 buy coffee</code></>
          ]}
        />

        <ConnectionMethod
          title="BYO Agent API"
          detail="Give a custom AI agent its own token, then submit spend intents through the controller API."
          action={
            <ControlButton disabled title="Token generation is available through the existing agent registry flow, without a web endpoint change.">
              <KeyRound className="h-3.5 w-3.5" />
              Generate Agent Token
            </ControlButton>
          }
          steps={[
            <>POST <code className="text-violet-200">/api/agent/intents</code></>,
            <>Authorization: <code className="text-violet-200">Bearer &lt;token&gt;</code></>
          ]}
        />
      </div>
    </Panel>
  );
}

function ConnectionMethod({
  title,
  detail,
  action,
  steps
}: {
  title: string;
  detail: string;
  action: ReactNode;
  steps: ReactNode[];
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[17px] font-medium text-white">{title}</div>
          <p className="mt-1 text-[14px] text-zinc-500">{detail}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      <ol className="mt-4 space-y-2 text-[14px] text-zinc-300">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-violet-300/18 bg-violet-400/8 text-[11px] text-violet-200">
              {index + 1}
            </span>
            <span className="min-w-0 break-words">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SimulatorSection({
  activeAgent,
  recipients,
  simulatorAmount,
  setSimulatorAmount,
  simulatorMint,
  setSimulatorMint,
  simulatorGoal,
  setSimulatorGoal,
  simulatorRecipient,
  setSimulatorRecipient,
  simulatorResult,
  runSimulator
}: {
  activeAgent: CommandCenterAgent | null;
  recipients: CommandCenterRecipient[];
  simulatorAmount: string;
  setSimulatorAmount: (value: string) => void;
  simulatorMint: string;
  setSimulatorMint: (value: string) => void;
  simulatorGoal: string;
  setSimulatorGoal: (value: string) => void;
  simulatorRecipient: string;
  setSimulatorRecipient: (value: string) => void;
  simulatorResult: SimulatorResult;
  runSimulator: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.82fr_1.18fr]">
      <Panel>
        <span className="sr-only">{dashboardSourceLabels.spendIntentPanel}</span>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PanelTitle>Rogue Simulator</PanelTitle>
          <span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-violet-200">
            DRY RUN — no pending execution created
          </span>
        </div>
        <p className="mt-4 text-[15px] text-zinc-400">Use Create Spend Intent for real devnet execution.</p>
        <form className="mt-6 space-y-4" onSubmit={runSimulator}>
          <div className="grid gap-3 sm:grid-cols-[1fr_0.7fr]">
            <Field label="Amount">
              <StyledInput
                value={simulatorAmount}
                onChange={(event) => setSimulatorAmount(event.target.value)}
                placeholder="1"
                inputMode="numeric"
                aria-label="Simulation amount"
              />
            </Field>
            <Field label="Mint">
              <StyledInput value={simulatorMint} onChange={(event) => setSimulatorMint(event.target.value)} placeholder="USDC" aria-label="Simulation mint" />
            </Field>
          </div>
          <Field label="Recipient">
            <StyledSelect
              value={simulatorRecipient}
              onChange={(event) => setSimulatorRecipient(event.target.value)}
              aria-label="Simulation recipient"
            >
              <option value="" className="bg-[#080812] text-zinc-400">
                Active agent default
              </option>
              {recipients.map((recipient) => (
                <option key={recipient.label} value={recipient.address} className="bg-[#080812] text-white">
                  {recipient.label} - {compactAddress(recipient.address)}
                </option>
              ))}
            </StyledSelect>
          </Field>
          <Field label="Intent">
            <StyledTextarea
              value={simulatorGoal}
              onChange={(event) => setSimulatorGoal(event.target.value)}
              placeholder="buy coffee"
              aria-label="Simulation goal"
            />
          </Field>
          <ControlButton type="submit" disabled={!activeAgent} className="w-full justify-center">
            <ShieldX className="h-4 w-4" />
            Run Simulation
          </ControlButton>
        </form>
      </Panel>

      <Panel>
        <PanelTitle>Result Panel</PanelTitle>
        <div className="mt-6">
          {simulatorResult ? (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
              <div className="flex items-center gap-3">
                {simulatorResult.decision === "blocked" ? <XCircle className="h-5 w-5 text-red-400" /> : <CheckCircle2 className="h-5 w-5 text-emerald-400" />}
                <div className="text-[21px] font-medium text-white">
                  {simulatorResult.decision === "blocked" ? "Would be blocked" : "Would be approved"}
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <SoftMetric label="Reason" value={simulatorResult.reason} />
                <SoftMetric label="Agent" value={simulatorResult.agent} />
                <SoftMetric label="Amount" value={`${simulatorResult.amount} ${simulatorResult.mint}`} />
                <SoftMetric label="Recipient" value={compactAddress(simulatorResult.recipient)} />
              </div>
            </div>
          ) : (
            <EmptyState title="Awaiting simulation" body={activeAgent ? "Run a controlled dry-run to see the firewall-style decision." : "Create or select an agent before running simulations."} />
          )}
        </div>
      </Panel>
    </div>
  );
}

function SettingsSection({
  controllerWallet,
  resetDemoState,
  isSubmitting,
  recipientLabel,
  setRecipientLabel,
  recipientAddress,
  setRecipientAddress,
  addRecipient,
  recipients,
  useRecipient
}: {
  controllerWallet: string;
  resetDemoState: () => void;
  isSubmitting: boolean;
  recipientLabel: string;
  setRecipientLabel: (value: string) => void;
  recipientAddress: string;
  setRecipientAddress: (value: string) => void;
  addRecipient: (event: FormEvent<HTMLFormElement>) => void;
  recipients: CommandCenterRecipient[];
  useRecipient: (label: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel>
        <PanelTitle>Configuration</PanelTitle>
        <div className="mt-6 space-y-4">
          <MetricRow label="Network" value="Devnet" />
          <MetricRow label="App Mode" value="Command Center" />
          <MetricRow label="API Base URL" value={typeof window === "undefined" ? "/" : window.location.origin} />
          <MetricRow label="Version" value="0.1.0" />
          <MetricRow label="Controller" value={compactAddress(controllerWallet)} />
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <ControlButton onClick={() => void resetDemoState()} disabled={isSubmitting}>
            Reset Demo State
          </ControlButton>
          <ControlButton asAnchor href="/docs" disabled>
            Docs
          </ControlButton>
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Recipients</PanelTitle>
        <form className="mt-6 grid gap-3 md:grid-cols-[0.7fr_1fr_auto]" onSubmit={addRecipient}>
          <StyledInput
            value={recipientLabel}
            onChange={(event) => setRecipientLabel(event.target.value)}
            placeholder="merchant label"
            aria-label="Recipient label"
          />
          <StyledInput
            value={recipientAddress}
            onChange={(event) => setRecipientAddress(event.target.value)}
            placeholder="Solana devnet address"
            aria-label="Recipient address"
          />
          <ControlButton type="submit" disabled={isSubmitting}>
            <Plus className="h-4 w-4" />
            Add
          </ControlButton>
        </form>
        <div className="mt-5 space-y-2">
          {recipients.map((recipient) => (
            <div key={recipient.label} className="flex flex-col gap-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-medium text-white">{recipient.label}</div>
                  {recipient.isDefaultForActiveAgent ? <StatusBadge status="active">Default</StatusBadge> : null}
                </div>
                <div className="mt-1 break-all text-[14px] text-zinc-500">{recipient.address}</div>
              </div>
              <ControlButton disabled={recipient.isDefaultForActiveAgent || isSubmitting} onClick={() => useRecipient(recipient.label)}>
                Use Recipient
              </ControlButton>
            </div>
          ))}
          {recipients.length === 0 ? <EmptyState title="No recipients" body="Add a devnet address for the active Agent Vault." /> : null}
        </div>
      </Panel>
    </div>
  );
}

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-white/[0.10] bg-[#070711]/72 p-5 shadow-[0_0_0_1px_rgba(132,90,255,0.03),0_22px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl", className)}>
      {children}
    </section>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-medium uppercase tracking-[0.08em] text-violet-300">{children}</h2>;
}

function NoticeBanner({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <div
      className={cn(
        "mb-5 rounded-lg border px-4 py-3 text-[15px]",
        notice.tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "",
        notice.tone === "warning" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "",
        notice.tone === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : ""
      )}
    >
      {notice.message}
    </div>
  );
}

function LoadingStrip() {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-violet-300/15 bg-violet-400/8 px-4 py-3 text-[15px] text-violet-100/75">
      <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
      Loading command center data
    </div>
  );
}

function Sigil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="sigil-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F5D8FF" />
          <stop offset="42%" stopColor="#9F55FF" />
          <stop offset="100%" stopColor="#6E35FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill="url(#sigil-glow)" opacity="0.18" />
      <path d="M32 3l4.8 23.7L61 32l-24.2 5.3L32 61l-4.8-23.7L3 32l24.2-5.3L32 3z" fill="#A970FF" />
      <path d="M32 15l2.1 14.9L49 32l-14.9 2.1L32 49l-2.1-14.9L15 32l14.9-2.1L32 15z" fill="#F2D7FF" />
    </svg>
  );
}

function MiniSigil() {
  return (
    <div className="hidden h-20 w-20 items-center justify-center rounded-lg border border-violet-300/14 bg-violet-500/5 md:flex">
      <Sigil className="h-14 w-14" />
    </div>
  );
}

function ShieldSigil({ large = false }: { large?: boolean }) {
  return (
    <div className={cn("relative flex items-center justify-center", large ? "h-56" : "h-36")}>
      <ShieldCheck className={cn("absolute text-violet-300/20", large ? "h-52 w-52" : "h-36 w-36")} strokeWidth={0.8} />
      <Sigil className={cn("drop-shadow-[0_0_24px_rgba(168,85,247,0.9)]", large ? "h-28 w-28" : "h-20 w-20")} />
    </div>
  );
}

function AllowanceRing({
  current,
  max,
  sizeClassName,
  large = false
}: {
  current?: string | null;
  max?: string | null;
  sizeClassName: string;
  large?: boolean;
}) {
  const pct = percentOf(current, max);

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-[conic-gradient(from_180deg,#A970FF_var(--pct),rgba(255,255,255,0.08)_0)] p-[3px] shadow-[0_0_40px_rgba(139,74,255,0.42)]",
        sizeClassName
      )}
      style={{ "--pct": `${pct}%` } as CSSProperties}
    >
      <div className="grid h-full w-full place-items-center rounded-full border border-violet-300/18 bg-[radial-gradient(circle_at_50%_35%,rgba(147,74,255,0.20),rgba(4,4,11,0.94)_62%)]">
        <div className="text-center">
          <div className={cn("font-light leading-none text-white", large ? "text-[60px]" : "text-[39px]")}>{current ?? "0"}</div>
          <div className={cn("mt-2 text-zinc-300", large ? "text-[23px]" : "text-[18px]")}>/ {max ?? "0"}</div>
          <div className="mt-3 text-[14px] uppercase tracking-[0.1em] text-zinc-400">USDC</div>
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] pb-3 last:border-b-0">
      <span className="text-[15px] text-zinc-400">{label}</span>
      <span className="text-right text-[15px] font-medium text-white">{value}</span>
    </div>
  );
}

function LabelValue({ label, value, withCopy = false }: { label: string; value: string; withCopy?: boolean }) {
  return (
    <div>
      <div className="text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-[16px] text-white">
        <span>{value}</span>
        {withCopy ? <Copy className="h-3.5 w-3.5 text-zinc-500" /> : null}
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="px-3 first:pl-0">
      <div className="text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-2 text-[21px] text-white">{value}</div>
      {sublabel ? <div className="mt-1 text-[13px] uppercase text-zinc-500">{sublabel}</div> : null}
    </div>
  );
}

function SoftMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-white/[0.08] bg-black/18", compact ? "p-3" : "p-4")}>
      <div className="text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className={cn("mt-2 break-words font-medium text-white", compact ? "text-[15px]" : "text-[17px]")}>{value}</div>
    </div>
  );
}

function StatusBadge({ status, children }: { status?: string | null; children?: ReactNode }) {
  const tone = statusTone(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.06em]",
        tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "",
        tone === "warning" ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : "",
        tone === "danger" ? "border-red-400/25 bg-red-400/10 text-red-300" : "",
        tone === "neutral" ? "border-white/12 bg-white/[0.04] text-zinc-300" : ""
      )}
    >
      {children ?? status ?? "unknown"}
    </span>
  );
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-between rounded-lg border border-white/10 bg-black/18 px-3 text-[16px] text-violet-300 transition hover:border-violet-300/30 hover:bg-violet-400/8"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

function SidebarFooterLink({ children, href, label }: { children: ReactNode; href: string; label: string }) {
  return (
    <a
      href={href}
      target={href === "#" ? undefined : "_blank"}
      rel={href === "#" ? undefined : "noreferrer"}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-black/20 text-violet-100/60 transition hover:border-violet-300/30 hover:bg-violet-400/8 hover:text-white"
    >
      {children}
    </a>
  );
}

function ControlButton({
  children,
  className,
  asAnchor = false,
  href,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { asAnchor?: boolean; href?: string }) {
  const baseClassName = cn(
    "inline-flex min-h-10 items-center gap-2 rounded-lg border border-violet-300/18 bg-violet-400/8 px-3 text-[15px] font-medium text-violet-100 transition hover:border-violet-300/35 hover:bg-violet-400/14 focus-visible:border-violet-400/55 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.14)] disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-zinc-500 disabled:opacity-60",
    className
  );

  if (asAnchor) {
    return (
      <a href={href} className={cn(baseClassName, props.disabled ? "pointer-events-none opacity-45" : "")}>
        {children}
      </a>
    );
  }

  return (
    <button className={baseClassName} {...props}>
      {children}
    </button>
  );
}

function HeaderWalletButton({
  connected,
  connecting,
  onClick
}: {
  connected: boolean;
  connecting: boolean;
  onClick: () => void;
}) {
  const Icon = connected ? LogOut : Wallet;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={connecting}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-violet-300/25 bg-[#132033]/88 px-4 text-[16px] font-medium text-violet-100 shadow-[0_0_0_1px_rgba(139,92,246,0.05),0_12px_32px_rgba(76,29,149,0.22)] transition hover:border-violet-300/45 hover:bg-[#172844] hover:text-white focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {connected ? "Disconnect wallet" : connecting ? "Connecting" : "Connect wallet"}
    </button>
  );
}

function StyledInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(formControlClass, props.className)}
    />
  );
}

function StyledTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(formControlClass, "min-h-28 resize-none py-3 leading-6", props.className)} />;
}

function StyledSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(formControlClass, "appearance-none pr-9", props.className)} />;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function PolicyRule({ title, body, status }: { title: string; body: string; status: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-medium text-white">{title}</div>
          <p className="mt-1 text-[15px] text-zinc-400">{body}</p>
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function DataTable({
  columns,
  children,
  emptyTitle,
  emptyBody
}: {
  columns: string[];
  children: ReactNode;
  emptyTitle: string;
  emptyBody: string;
}) {
  const rowCount = Array.isArray(children) ? children.length : children ? 1 : 0;

  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-white/[0.06]">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-[15px]">
          <thead className="bg-white/[0.015] text-[13px] uppercase tracking-[0.06em] text-zinc-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-3 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {rowCount === 0 ? <EmptyState title={emptyTitle} body={emptyBody} flat /> : null}
    </div>
  );
}

function ExplorerLink({ url }: { url?: string | null }) {
  if (!url) {
    return <CircleDot className="h-4 w-4 text-zinc-600" />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex text-violet-200 transition hover:text-white" aria-label="Open in explorer">
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

function EmptyState({ title, body, flat = false }: { title: string; body: string; flat?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-dashed border-white/[0.10] p-5", flat ? "m-3" : "mt-6")}>
      <div className="font-medium text-white">{title}</div>
      <div className="mt-1 text-[15px] text-zinc-500">{body}</div>
    </div>
  );
}

function LineChart() {
  return (
    <svg viewBox="0 0 320 96" className="mt-6 h-24 w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="line-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#A970FF" />
        </linearGradient>
      </defs>
      <path d="M4 70 C32 68 38 54 62 57 C84 61 94 71 120 62 C144 54 158 42 184 50 C210 58 220 62 244 44 C268 24 284 42 316 12" fill="none" stroke="url(#line-gradient)" strokeWidth="2" />
      <path d="M4 70 C32 68 38 54 62 57 C84 61 94 71 120 62 C144 54 158 42 184 50 C210 58 220 62 244 44 C268 24 284 42 316 12" fill="none" stroke="#D8B4FE" strokeOpacity="0.28" strokeWidth="7" />
    </svg>
  );
}
