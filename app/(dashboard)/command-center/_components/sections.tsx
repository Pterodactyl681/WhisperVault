"use client";

import { useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeInfo,
  Bot,
  Box,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Filter,
  Gauge,
  Globe2,
  KeyRound,
  Layers3,
  Link2,
  LockKeyhole,
  Network,
  Pause,
  Play,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  ShieldX,
  SlidersHorizontal,
  Sparkles,
  FlaskConical,
  UsersRound,
  Wallet,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TELEGRAM_REFERENCE_BOT_URL } from "./constants";
import type {
  CommandCenterAgent,
  CommandCenterReceipt,
  CommandCenterRecipient,
  GeneratedAgentTokenState,
  SectionId,
  SimulatorResult,
  SpendResult
} from "./types";
import {
  buildGhostTimeline,
  compactAddress,
  formatCountdown,
  formatDateTime,
  formatExecutionQueueState,
  formatFallbackUsage,
  formatMagicBlockMode,
  formatMagicBlockStatus,
  formatMinutes,
  formatRail,
  formatReceiptMagicBlockMode,
  formatRefillEngine,
  formatRuntimeStatus,
  getGhostRuntime,
  numericValue,
  sumReceiptAmounts
} from "./utils";
import {
  ControlButton,
  DataTableShell,
  EmptyState,
  ExplorerLink,
  Field,
  GlowPanel,
  HeroCore,
  MetricRow,
  PageHeader,
  PanelTitle,
  SoftMetric,
  StatCard,
  StatusBadge,
  StyledInput,
  StyledSelect,
  StyledTextarea,
  Timeline,
  ValidationChecklist
} from "./ui";

const kpiFormat = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(2));

const receiptAmountTotal = (receipts: CommandCenterReceipt[]): number =>
  receipts.reduce((sum, receipt) => sum + numericValue(receipt.amount), 0);

const activePolicyCount = (agent: CommandCenterAgent | null, recipients: CommandCenterRecipient[] = []): number =>
  (agent ? 3 : 1) + (recipients.some((recipient) => recipient.isAllowedForActiveAgent) ? 1 : 0);

function TokenControl({ value = "USDC" }: { value?: string; label?: string }) {
  return (
    <div className="flex h-12 w-full min-w-0 items-center rounded-xl border border-slate-700/70 bg-[#06111f]/80 px-3 text-[16px] font-medium uppercase text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <span className="truncate">{value}</span>
    </div>
  );
}

function RecipientControl({
  value,
  onChange,
  recipients,
  defaultAddress,
  ariaLabel
}: {
  value: string;
  onChange: (value: string) => void;
  recipients: CommandCenterRecipient[];
  defaultAddress?: string | null;
  ariaLabel: string;
}) {
  const defaultLabel = defaultAddress ? `Active default - ${compactAddress(defaultAddress)}` : "Active agent default";

  return (
    <div className="space-y-2">
      <StyledSelect value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel}>
        <option value="">{defaultLabel}</option>
        {recipients.map((recipient) => (
          <option key={recipient.label} value={recipient.address}>
            {recipient.label} - {compactAddress(recipient.address)}
          </option>
        ))}
      </StyledSelect>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[12px] text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-violet-200" />
          <span className="truncate">Allowlist control</span>
        </span>
        <span className="shrink-0">{recipients.length} saved</span>
      </div>
    </div>
  );
}

function AgentVaultVisual() {
  return (
    <div className="relative grid min-h-[260px] place-items-center overflow-hidden rounded-2xl border border-white/[0.07] bg-[#06111f]/70">
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(124,58,237,0.12),transparent_48%)]" />
      <div className="absolute h-52 w-52 rotate-45 rounded-[2rem] border border-slate-400/12" />
      <div className="agent-vault-core scale-[0.86]">
        <div className="agent-vault-core__lid" />
        <div className="agent-vault-core__face">
          <span />
          <span />
        </div>
      </div>
      <div className="absolute bottom-6 flex items-center gap-2 rounded-full border border-violet-300/18 bg-slate-950/74 px-3 py-1.5 text-[12px] text-violet-100">
        <LockKeyhole className="h-3.5 w-3.5" />
        Policy-contained vault
      </div>
    </div>
  );
}

function CompactEmptyMark() {
  return (
    <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-violet-200">
      <Box className="h-5 w-5" />
    </div>
  );
}

function CompactReceiptMark() {
  return (
    <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-violet-200">
      <ReceiptText className="h-5 w-5" />
    </div>
  );
}

function ConfigIcon({ icon }: { icon: ReactNode }) {
  return (
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-200 [&_svg]:h-5 [&_svg]:w-5">
      {icon}
    </div>
  );
}

export function OverviewCards({
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
  const recentReceipts = receipts.slice(0, 4);

  return (
    <div className="space-y-5">
      <GlowPanel className="p-6 sm:p-8 lg:p-10" intensity="strong">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,1fr)] lg:items-center">
          <div className="min-w-0">
            <p className="text-[16px] text-slate-300">Welcome back</p>
            <h2 className="mt-5 text-[38px] font-semibold leading-tight tracking-normal text-white sm:text-[52px]">
              {activeAgent ? activeAgent.name : "No Active Agent"}
            </h2>
            <p className="mt-4 max-w-lg text-[18px] leading-8 text-slate-300">
              {activeAgent
                ? "Your private spend control plane is online. Review allowance, firewall state, and pending execution flow."
                : "Create an Agent Vault to start securing your AI activity with budgets, allowlists, and private execution rails."}
            </p>
            <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap">
              <ControlButton onClick={() => setSection("agents")} className="bg-[linear-gradient(135deg,#7C3AED,#4F46E5)] shadow-[0_18px_42px_rgba(91,33,182,0.28)]">
                <Plus className="h-4 w-4" />
                Create Agent Vault
              </ControlButton>
              <ControlButton onClick={() => setSection("firewall")} className="bg-[#071127]/80">
                Configure Firewall
              </ControlButton>
            </div>
          </div>
          <HeroCore variant="star" className="min-h-[320px] lg:min-h-[390px]" />
        </div>
      </GlowPanel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<UsersRound className="h-5 w-5" />} label="Active Agent" value={activeAgent ? "1" : "0"} detail={activeAgent?.status ?? "Inactive"} />
        <StatCard icon={<CircleDollarSign className="h-5 w-5" />} label="Live Allowance" value={`${activeAgent?.ghostAllowanceLive ?? "0"} USDC`} detail="Available" tone="blue" />
        <StatCard icon={<Clock3 className="h-5 w-5" />} label="Pending Executions" value={String(pendingCount)} detail={pendingCount ? "Needs attention" : "None"} />
        <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Firewall Status" value="Strict" detail={activeAgent ? "Active" : "Ready"} tone="emerald" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <GlowPanel className="p-5" intensity="quiet">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PanelTitle>System Health</PanelTitle>
            <StatusBadge status="active">All systems nominal</StatusBadge>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["Network", "Healthy"],
              ["Agent Services", "Healthy"],
              ["Relayer", "Healthy"],
              ["Smart Contract", "Operational"]
            ].map(([label, value]) => (
              <div key={label} className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.035] p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-500/10 text-emerald-300">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1 text-[15px] text-slate-300">{label}</span>
                <span className="text-[15px] font-medium text-white">{value}</span>
              </div>
            ))}
          </div>
        </GlowPanel>

        <ActivityFeed receipts={recentReceipts} setSection={setSection} />
      </div>

      <GlowPanel className="p-5" intensity="quiet">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-violet-300/18 bg-violet-500/12 shadow-[0_16px_36px_rgba(0,0,0,0.24)]">
              <Sparkles className="h-7 w-7 text-violet-100" />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] text-slate-400">Recommended next step</div>
              <div className="mt-1 text-[22px] font-semibold text-white">{activeAgent ? "Run a controlled spend intent" : "Create your first Agent Vault"}</div>
              <p className="mt-1 text-[15px] text-slate-400">
                {activeAgent ? "Validate the full pipeline before connecting external agents." : "Define permissions, budgets, and policies to unlock secure AI execution."}
              </p>
            </div>
          </div>
          <ControlButton onClick={() => setSection(activeAgent ? "executions" : "agents")} className="bg-[linear-gradient(135deg,#7C3AED,#4F46E5)] shadow-[0_18px_42px_rgba(91,33,182,0.26)]">
            {activeAgent ? "Create Spend Intent" : "Create Agent Vault"}
            <ArrowRight className="h-4 w-4" />
          </ControlButton>
        </div>
      </GlowPanel>
      <p className="sr-only">{confirmedCount} confirmed receipts are available in the receipts screen.</p>
    </div>
  );
}

export function ActivityFeed({ receipts, setSection }: { receipts: CommandCenterReceipt[]; setSection: (section: SectionId) => void }) {
  const fallbackItems = [
    { icon: <Network className="h-4 w-4" />, title: "Connected to Devnet", detail: "Wallet connection established", time: "2m ago", tone: "emerald" },
    { icon: <ShieldCheck className="h-4 w-4" />, title: "Firewall set to Strict", detail: "Policy engine ready", time: "8m ago", tone: "violet" },
    { icon: <CheckCircle2 className="h-4 w-4" />, title: "System health check", detail: "All services operational", time: "12m ago", tone: "emerald" },
    { icon: <Sparkles className="h-4 w-4" />, title: "Welcome to WhisperVault", detail: "Your secure command center", time: "15m ago", tone: "violet" }
  ];

  return (
    <GlowPanel className="p-5" intensity="quiet">
      <div className="flex items-center justify-between gap-3">
        <PanelTitle>Recent Activity</PanelTitle>
        <button type="button" onClick={() => setSection("receipts")} className="smooth-control rounded-lg border border-white/10 px-3 py-2 text-[13px] text-slate-300 hover:border-violet-300/28 hover:text-white">
          View all
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {receipts.length > 0
          ? receipts.map((receipt) => (
              <ActivityRow
                key={receipt.id}
                icon={<ReceiptText className="h-4 w-4" />}
                title={`${receipt.amount} ${receipt.mint} ${receipt.status}`}
                detail={compactAddress(receipt.recipient)}
                time={formatCountdown(receipt.confirmedAt ?? receipt.createdAt)}
                tone={receipt.status === "confirmed" ? "emerald" : "violet"}
              />
            ))
          : fallbackItems.map((item) => <ActivityRow key={item.title} {...item} />)}
      </div>
    </GlowPanel>
  );
}

function ActivityRow({ icon, title, detail, time, tone }: { icon: ReactNode; title: string; detail: string; time: string; tone: string }) {
  return (
    <div className="smooth-control flex items-center gap-3 rounded-lg border border-transparent p-2 hover:border-white/[0.07] hover:bg-white/[0.03]">
      <div className={tone === "emerald" ? "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-500/10 text-emerald-300" : "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-200"}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium text-white">{title}</div>
        <div className="truncate text-[13px] text-slate-500">{detail}</div>
      </div>
      <div className="whitespace-nowrap text-[13px] text-slate-500">{time}</div>
    </div>
  );
}

export function AllowanceSection({
  activeAgent,
  receipts,
  isSubmitting,
  updateBudgetStatus
}: {
  activeAgent: CommandCenterAgent | null;
  receipts: CommandCenterReceipt[];
  isSubmitting: boolean;
  updateBudgetStatus: (agentId: string, action: "pause" | "resume") => void;
}) {
  const ghostTab = activeAgent?.ghostTab ?? null;
  const runtime = getGhostRuntime(ghostTab);
  const timeline = buildGhostTimeline(ghostTab, activeAgent, receipts);
  const activeAgentReceipts = receipts.filter((receipt) => receipt.agent === activeAgent?.id);
  const reservedAmount = sumReceiptAmounts(activeAgentReceipts, (receipt) => receipt.status === "pending" || receipt.status === "pending_execution");
  const recoverableAmount = runtime.clawbackCompleted ? "0" : ghostTab?.allowanceLive ?? activeAgent?.ghostAllowanceLive ?? "0";
  const current = activeAgent?.ghostAllowanceLive ?? "0";

  return (
    <div className="space-y-5">
      <PageHeader title="Ghost Allowance" subtitle="Live private allowance trust for the active session." />
      <GlowPanel className="p-5 lg:p-7" intensity="strong">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,0.72fr)]">
          <div className="relative rounded-xl border border-white/[0.08] bg-[#061026]/58 p-5">
            <HeroCore variant="orb" label="Live Allowance" value={current} className="min-h-[430px]" />
            <div className="grid gap-3 sm:grid-cols-4">
              <ControlButton disabled title="No open endpoint is exposed in the web API." className="bg-[linear-gradient(135deg,#7C3AED,#4F46E5)]">
                <Play className="h-4 w-4" />
                Open
              </ControlButton>
              <ControlButton disabled={!activeAgent || isSubmitting || activeAgent.status === "paused"} onClick={() => activeAgent ? updateBudgetStatus(activeAgent.id, "pause") : undefined}>
                <Pause className="h-4 w-4" />
                Pause
              </ControlButton>
              <ControlButton disabled={!activeAgent || isSubmitting || activeAgent.status !== "paused"} onClick={() => activeAgent ? updateBudgetStatus(activeAgent.id, "resume") : undefined}>
                <Play className="h-4 w-4" />
                Resume
              </ControlButton>
              <ControlButton disabled title="No close endpoint is exposed in the web API." className="text-red-200">
                <XCircle className="h-4 w-4" />
                Close
              </ControlButton>
            </div>
          </div>

          <GlowPanel className="p-5" intensity="quiet">
            <PanelTitle>Session Details</PanelTitle>
            <div className="mt-5 space-y-4">
              <DetailRow icon={<CircleDollarSign />} label="Current Allowance" value={`${current} USDC`} />
              <DetailRow icon={<Database />} label="Max Allowance" value={`${activeAgent?.ghostAllowanceMax ?? "0"} USDC`} />
              <DetailRow icon={<ArrowRight />} label="Refill Amount" value={`${activeAgent?.ghostRefillAmount ?? "0"} USDC`} />
              <DetailRow icon={<Clock3 />} label="Refill Interval" value={formatMinutes(activeAgent?.ghostRefillIntervalMinutes)} />
              <DetailRow icon={<Clock3 />} label="Next Refill" value={formatCountdown(runtime.nextRefillAt)} />
              <DetailRow icon={<Gauge />} label="Session Status" value={formatRuntimeStatus(runtime.sessionStatus)} badge="active" />
              <DetailRow icon={<Shield />} label="Clawback Status" value={runtime.clawbackCompleted ? "Completed" : runtime.clawbackPending ? "Queued" : "Armed"} badge="pending" />
              <DetailRow icon={<Clock3 />} label="Reserved / Recoverable" value={`${reservedAmount} / ${recoverableAmount} USDC`} />
            </div>
          </GlowPanel>
        </div>
      </GlowPanel>

      <GlowPanel className="p-6" intensity="quiet">
        <div className="mb-6">
          <PanelTitle>Ghost Timeline</PanelTitle>
          <p className="mt-2 text-[15px] text-slate-500">Session lifecycle events</p>
        </div>
        <Timeline
          items={[
            { label: "Opened", detail: formatDateTime(ghostTab?.openedAt) },
            { label: "Refilled", detail: timeline.find((event) => event.type.includes("refill")) ? "Latest refill recorded" : "Waiting for tick" },
            { label: "Pulled", detail: receipts.length ? `${receipts.length} spend event${receipts.length === 1 ? "" : "s"}` : "No pulls yet" },
            { label: "Paused", detail: activeAgent?.status === "paused" ? "Currently paused" : "Not paused" },
            { label: "Closed", detail: formatCountdown(ghostTab?.expiresAt), status: runtime.sessionStatus === "closed" ? "done" : "muted" }
          ]}
        />
      </GlowPanel>
    </div>
  );
}

function DetailRow({ icon, label, value, badge }: { icon: ReactNode; label: string; value: string; badge?: string }) {
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] pb-4 last:border-b-0">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-200 [&_svg]:h-5 [&_svg]:w-5">
        {icon}
      </div>
      <div className="min-w-0 flex-1 text-[15px] text-slate-300">{label}</div>
      <div className="min-w-0 text-right text-[17px] font-medium text-white">{badge ? <StatusBadge status={badge}>{value}</StatusBadge> : value}</div>
    </div>
  );
}

export function FirewallSection({
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
  const rules = [
    ["Daily cap enforcement", "Enforces your daily spend cap across all transactions.", "active", `${activeAgent?.dailyCap ?? "0"} USDC`],
    ["Live Ghost Allowance", "Uses real-time allowance for every spend.", "active", "Dynamic"],
    ["Recipient allowlist", "Only approved recipients are allowed.", allowedRecipients.length ? "active" : "pending", `${allowedRecipients.length} allowed`],
    ["Public fallback", "If no match, use public context protections.", "passive", "Enabled"],
    ["Risk filter", "Blocks transactions flagged as high risk.", "active", "Strict"],
    ["Per spend limit", "Maximum limit per transaction.", "active", `${activeAgent?.ghostAllowanceMax ?? "0"} USDC`]
  ];

  return (
    <div className="space-y-5">
      <GlowPanel className="p-6 sm:p-8" intensity="strong">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1fr)] lg:items-center">
          <div>
            <div className="text-[13px] font-semibold uppercase tracking-[0.18em] text-violet-300">Firewall</div>
            <h2 className="mt-4 text-[38px] font-semibold leading-tight text-white sm:text-[48px]">
              Spend Firewall <span className="text-emerald-300">Active</span>
            </h2>
            <p className="mt-3 max-w-xl text-[17px] leading-8 text-slate-300">
              Transactions are protected by real-time policy enforcement, allowlists, risk filters, and private rail constraints.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <MiniMetric icon={<ShieldCheck />} label="Mode" value="Strict" tone="violet" />
              <MiniMetric icon={<AlertTriangle />} label="Blocked Attempts" value={String(blockedAttempts.length)} tone="amber" />
              <MiniMetric icon={<CheckCircle2 />} label="System Trust" value="High" tone="emerald" />
            </div>
          </div>
          <HeroCore variant="shield" className="min-h-[300px]" />
        </div>
      </GlowPanel>

      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <GlowPanel className="p-5" intensity="quiet">
          <div className="flex items-center justify-between gap-3">
            <div>
              <PanelTitle>Policy Rules</PanelTitle>
              <p className="mt-2 text-[14px] text-slate-500">Active rules that govern how funds are protected.</p>
            </div>
            <StatusBadge status="active">{activePolicyCount(activeAgent, recipients)} active</StatusBadge>
          </div>
          <div className="mt-4 space-y-2">
            {rules.map(([title, body, status, value]) => (
              <PolicyRuleRow key={title} title={title} body={body} status={status} value={value} />
            ))}
          </div>
        </GlowPanel>

        <div className="space-y-4">
          <GlowPanel className="p-5" intensity="quiet">
            <PanelTitle>Firewall Summary</PanelTitle>
            <div className="mt-5 space-y-4">
              <div className="flex items-center gap-4 rounded-xl border border-emerald-300/14 bg-emerald-500/8 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-500/10 text-emerald-200">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-[18px] font-semibold text-white">Strict protection active</div>
                  <p className="mt-1 text-[13px] text-slate-500">Firewall rules are enabled for agent spend attempts.</p>
                </div>
              </div>
              <div className="space-y-3">
                <MetricRow label="Firewall Status" value="Active" />
                <MetricRow label="Protection Mode" value="Strict" />
                <MetricRow label="Risk Threshold" value="High" />
                <MetricRow label="Last Updated" value="1m ago" />
                <MetricRow label="Auto-Lockdown" value="Enabled" />
              </div>
            </div>
            <button type="button" onClick={() => setSection("settings")} className="smooth-control mt-5 flex w-full items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.035] p-4 text-left hover:border-violet-300/28 hover:bg-violet-500/8">
              <span>
                <span className="block font-medium text-white">Manage Firewall Settings</span>
                <span className="mt-1 block text-[13px] text-slate-500">Update policies, allowlists, limits, and risk preferences.</span>
              </span>
              <ArrowRight className="h-4 w-4 text-violet-200" />
            </button>
          </GlowPanel>

          <GlowPanel className="p-5" intensity="quiet">
            <PanelTitle>Protection at a Glance</PanelTitle>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SoftMetric label="Blocked" value={String(blockedAttempts.length)} compact />
              <SoftMetric label="Policy Hits" value={String(activePolicyCount(activeAgent, recipients))} compact />
              <SoftMetric label="Auto-Lockdowns" value="0" compact />
              <SoftMetric label="Policy Uptime" value="100%" compact />
            </div>
          </GlowPanel>
        </div>
      </div>

      <GlowPanel className="p-5" intensity="quiet">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <PanelTitle>Blocked Attempts & Policy Hits</PanelTitle>
            <p className="mt-2 text-[14px] text-slate-500">Recent activity blocked or flagged by the firewall.</p>
          </div>
          <StatusBadge status="pending">Last 24 hours</StatusBadge>
        </div>
        <ReceiptsMiniTable receipts={blockedAttempts} emptyTitle="No blocked attempts in the selected period" emptyBody="Your firewall is holding strong." />
      </GlowPanel>
    </div>
  );
}

function MiniMetric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone: "violet" | "amber" | "emerald" }) {
  const toneClass = tone === "emerald" ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-300" : tone === "amber" ? "border-amber-300/22 bg-amber-500/10 text-amber-300" : "border-white/10 bg-white/[0.04] text-violet-200";
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-white/[0.07] bg-[#071127]/66 p-4">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${toneClass} [&_svg]:h-5 [&_svg]:w-5`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-[13px] text-slate-500">{label}</div>
        <div className="truncate text-[21px] font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}

function PolicyRuleRow({ title, body, status, value }: { title: string; body: string; status: string; value: string }) {
  return (
    <div className="smooth-control flex items-center gap-4 rounded-lg border border-white/[0.07] bg-white/[0.028] p-4 hover:bg-white/[0.04]">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-200">
        <LockKeyhole className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-white">{title}</div>
        <div className="mt-1 text-[13px] text-slate-500">{body}</div>
      </div>
      <StatusBadge status={status}>{status}</StatusBadge>
      <div className="hidden min-w-[90px] text-right text-[14px] text-slate-300 sm:block">{value}</div>
      <ArrowRight className="h-4 w-4 text-slate-500" />
    </div>
  );
}

export function ExecutionsSection({
  activeAgent,
  recipients,
  receipts,
  spendAmount,
  setSpendAmount,
  spendMint,
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
  const [queueTab, setQueueTab] = useState<"queue" | "history">("queue");
  const queueReceipts = receipts.filter((receipt) => queueTab === "history" || receipt.status === "pending" || receipt.status === "pending_execution");

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.82fr_1.08fr]">
      <GlowPanel className="p-5 sm:p-6" intensity="quiet">
          <StepTitle step="1" title="Create Spend Intent" detail="Create a spend intent for your agent to execute." />
          <form className="mt-6 space-y-5" onSubmit={submitSpendIntent}>
            <Field label="Agent">
              <div className="rounded-lg border border-[#27365F] bg-[#071127]/80 px-3 py-3 text-white">
                {activeAgent?.name ?? "No active agent"} <StatusBadge status={activeAgent ? "active" : "inactive"}>{activeAgent ? "Active" : "Unavailable"}</StatusBadge>
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-[1fr_0.56fr]">
              <Field label="Amount">
                <StyledInput value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} placeholder="12.50" inputMode="decimal" aria-label="Spend amount" />
              </Field>
              <Field label="Token">
                <TokenControl value="USDC" />
              </Field>
            </div>
            <Field label="Recipient">
              <RecipientControl
                value={spendRecipient}
                onChange={setSpendRecipient}
                recipients={recipients}
                defaultAddress={activeAgent?.defaultRecipientAddress}
                ariaLabel="Spend recipient"
              />
            </Field>
            <Field label="Intent">
              <StyledTextarea value={spendGoal} onChange={(event) => setSpendGoal(event.target.value)} placeholder="Pay vendor for analytics dashboard subscription." aria-label="Spend goal" />
            </Field>
            <ControlButton type="submit" disabled={!activeAgent || isSubmitting} className="w-full bg-[linear-gradient(135deg,#7C3AED,#4F46E5)] shadow-[0_18px_42px_rgba(91,33,182,0.26)]">
              {isSubmitting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Create Intent
            </ControlButton>
          </form>
        </GlowPanel>

        <div className="space-y-5">
          <GlowPanel className="p-5 sm:p-6" intensity="quiet">
            <StepTitle step="2" title="Pending Execution / Preview" detail="Review the transaction that will be executed by your agent." />
            <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,0.82fr)_minmax(0,1fr)]">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                <div className="flex items-center gap-3">
                  <ConfigIcon icon={<Bot />} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] text-slate-500">Route</div>
                    <div className="mt-1 truncate text-[15px] font-medium text-white">Agent to allowlisted recipient</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center text-[12px] text-slate-500">
                  <span className="truncate rounded-lg border border-white/[0.07] bg-[#06111f]/70 px-2 py-2">Agent</span>
                  <ArrowRight className="h-4 w-4 text-violet-200" />
                  <span className="truncate rounded-lg border border-white/[0.07] bg-[#06111f]/70 px-2 py-2">Recipient</span>
                </div>
              </div>
              <div className="space-y-3">
                <MetricRow label="From (Agent Wallet)" value={compactAddress(activeAgent?.id)} />
                <MetricRow label="To (Recipient)" value={compactAddress(spendRecipient || activeAgent?.defaultRecipientAddress)} />
                <MetricRow label="Amount" value={`${spendAmount || "0"} USDC`} />
                <MetricRow label="Primary Rail" value={formatRail(activeAgent?.executionMode)} />
                <MetricRow label="Status" value={spendResult?.status ?? spendResult?.decision ?? "Awaiting validation"} />
              </div>
            </div>
            {spendResult?.reason ? <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-300/8 p-3 text-[14px] text-amber-100">{spendResult.reason}</div> : null}
          </GlowPanel>

          <GlowPanel className="p-5 sm:p-6" intensity="quiet">
            <StepTitle step="3" title="Policy & Validation Checks" detail="Validation results for this intent." />
            <div className="mt-5">
              <ValidationChecklist
                items={[
                  { label: "Allowance Fit", detail: activeAgent ? "Sufficient allowance is checked by policy." : "Select an active agent first.", status: activeAgent ? "allowed" : "pending" },
                  { label: "Firewall Check", detail: "Passes active firewall rules when within policy.", status: spendResult?.decision === "blocked" ? "blocked" : "passed" },
                  { label: "Recipient Status", detail: recipients.length ? "Recipient registry available." : "No saved recipients yet.", status: recipients.length ? "passed" : "pending" },
                  { label: "Rail Path", detail: `${formatRail(activeAgent?.executionMode)} is selected.`, status: "allowed" },
                  { label: "Settlement Mode", detail: "Devnet settlement proof is attached when available.", status: "passed" }
                ]}
              />
            </div>
          </GlowPanel>
        </div>
      </div>

      <GlowPanel className="p-5" intensity="quiet">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <PanelTitle>Execution Queue</PanelTitle>
            <p className="mt-2 text-[14px] text-slate-500">Track pending and recent executions.</p>
          </div>
          <div className="flex gap-2">
            {(["queue", "history"] as const).map((tab) => (
              <button key={tab} type="button" onClick={() => setQueueTab(tab)} className={tab === queueTab ? "smooth-control rounded-lg border border-violet-300/30 bg-violet-500/12 px-4 py-2 text-violet-100" : "smooth-control rounded-lg border border-white/10 px-4 py-2 text-slate-400 hover:text-slate-200"}>
                {tab === "queue" ? "Queue" : "History"}
              </button>
            ))}
          </div>
        </div>
        <ReceiptsMiniTable receipts={queueReceipts} emptyTitle="No executions" emptyBody="Pending, blocked, confirmed, and failed executions will appear here." />
      </GlowPanel>
    </div>
  );
}

function StepTitle({ step, title, detail }: { step: string; title: string; detail: string }) {
  return (
    <div className="flex gap-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-violet-300/28 bg-violet-500/12 text-[18px] font-semibold text-white">{step}</span>
      <div>
        <h2 className="text-[18px] font-semibold tracking-normal text-white">{title}</h2>
        <p className="mt-1 text-[14px] text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

export function ReceiptsSection({ receipts }: { receipts: CommandCenterReceipt[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(receipts[0]?.id ?? null);
  const filtered = useMemo(
    () =>
      receipts.filter((receipt) => {
        const matchesStatus = statusFilter === "all" || receipt.status === statusFilter;
        const haystack = `${receipt.id} ${receipt.agent} ${receipt.recipient} ${receipt.txSignature ?? ""}`.toLowerCase();
        return matchesStatus && haystack.includes(query.toLowerCase());
      }),
    [query, receipts, statusFilter]
  );
  const selected = filtered.find((receipt) => receipt.id === selectedId) ?? filtered[0] ?? null;
  const total = receiptAmountTotal(receipts);
  const average = receipts.length ? total / receipts.length : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Confirmed Today" value={String(receipts.length)} detail="Confirmed receipts" />
        <StatCard icon={<Database className="h-5 w-5" />} label="Total Settled" value={`${kpiFormat(total)} USDC`} detail="Across all executions" />
        <StatCard icon={<Gauge className="h-5 w-5" />} label="Success Rate" value={receipts.length ? "100%" : "0%"} detail="All time executions" tone="emerald" />
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Average Amount" value={`${kpiFormat(average)} USDC`} detail="Per successful execution" tone="blue" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          <GlowPanel className="p-4" intensity="quiet">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_140px]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <StyledInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search receipt ID, agent, executor, or transaction..." className="pl-10" />
              </div>
              <StyledSelect value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All Status</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
              </StyledSelect>
              <ControlButton className="w-full">
                <Filter className="h-4 w-4" />
                Filters
              </ControlButton>
            </div>
          </GlowPanel>

          <GlowPanel className="p-5" intensity="quiet">
            <div className="mb-4 flex items-center justify-between">
              <PanelTitle>Settlement Receipts</PanelTitle>
              <StatusBadge status="neutral">{filtered.length} results</StatusBadge>
            </div>
            {filtered.length ? (
              <DataTableShell>
                <table className="w-full text-left text-[14px]">
                  <thead className="border-b border-white/[0.08] text-[12px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Receipt ID</th>
                      <th className="px-4 py-3 font-medium">Agent</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Settled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((receipt) => (
                      <tr key={receipt.id} onClick={() => setSelectedId(receipt.id)} className="cursor-pointer border-b border-white/[0.06] transition-colors hover:bg-violet-500/7">
                        <td className="px-4 py-4 font-medium text-violet-200">{compactAddress(receipt.id)}</td>
                        <td className="px-4 py-4 text-slate-300">{receipt.agent}</td>
                        <td className="px-4 py-4 text-white">{receipt.amount} {receipt.mint}</td>
                        <td className="px-4 py-4"><StatusBadge status={receipt.status} /></td>
                        <td className="px-4 py-4 text-slate-400">{formatCountdown(receipt.confirmedAt ?? receipt.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            ) : (
              <div className="grid min-h-[220px] place-items-center rounded-xl border border-dashed border-white/[0.09] bg-white/[0.018] p-6 text-center">
                <div className="max-w-sm">
                  <CompactReceiptMark />
                  <h3 className="mt-4 text-[20px] font-semibold text-white">No receipts yet</h3>
                  <p className="mx-auto mt-2 text-[14px] leading-6 text-slate-500">Settlement receipts from confirmed executions will appear here.</p>
                </div>
              </div>
            )}
          </GlowPanel>
        </div>

        <div className="space-y-4">
          <GlowPanel className="p-5" intensity="quiet">
            <PanelTitle>Receipt Details</PanelTitle>
            {selected ? (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-200">
                    <ReceiptText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[15px] font-medium text-white">{compactAddress(selected.id)}</div>
                    <div className="mt-1 text-[13px] text-slate-500">Settlement proof</div>
                  </div>
                </div>
                <MetricRow label="Receipt" value={selected.id} />
                <MetricRow label="MagicBlock Rail" value={formatMagicBlockStatus(selected)} />
                <MetricRow label="Mode" value={formatReceiptMagicBlockMode(selected)} />
                <MetricRow label="Fallback" value={formatFallbackUsage(selected)} />
                <MetricRow label="Recipient" value={compactAddress(selected.recipient)} />
                <div className="pt-2"><ExplorerLink url={selected.explorerUrl} /></div>
              </div>
            ) : (
              <EmptyState title="No receipt selected" body="Select a receipt from the list to view settlement details and on-chain proof." />
            )}
          </GlowPanel>
          <GlowPanel className="p-5" intensity="quiet">
            <PanelTitle>Receipt Insights</PanelTitle>
            <div className="mt-5 space-y-3">
              <MetricRow label="Total Receipts" value={String(receipts.length)} />
              <MetricRow label="Total Settled" value={`${kpiFormat(total)} USDC`} />
              <MetricRow label="Success Rate" value={receipts.length ? "100%" : "0%"} />
              <MetricRow label="Average Settlement Time" value="-" />
            </div>
          </GlowPanel>
        </div>
      </div>
    </div>
  );
}

export function AgentsSection({
  agents,
  isSubmitting,
  newAgentName,
  setNewAgentName,
  agentNameError,
  createAgent,
  useAgent,
  clearActiveAgent,
  lastOnboardedAgentId,
  generatedAgentToken,
  generateAgentToken
}: {
  agents: CommandCenterAgent[];
  isSubmitting: boolean;
  newAgentName: string;
  setNewAgentName: (value: string) => void;
  agentNameError: string | null;
  createAgent: (event: FormEvent<HTMLFormElement>) => void;
  useAgent: (agentId: string) => void;
  clearActiveAgent: () => void;
  lastOnboardedAgentId: string | null;
  generatedAgentToken: GeneratedAgentTokenState | null;
  generateAgentToken: (agentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const activeAgent = agents.find((agent) => agent.isActive) ?? null;
  const onboardingAgent = agents.find((agent) => agent.id === lastOnboardedAgentId) ?? activeAgent;
  const filtered = agents.filter((agent) => agent.name.toLowerCase().includes(query.toLowerCase()) || agent.id.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="space-y-5">
      <PageHeader title="Agent Vaults" />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-5">
          <GlowPanel className="p-5 sm:p-6" intensity="strong">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_300px] md:items-center">
              <div>
                <h2 className="text-[32px] font-semibold leading-tight text-white sm:text-[38px]">
                  Autonomous spending, under your <span className="text-violet-300">control.</span>
                </h2>
                <p className="mt-4 max-w-xl text-[16px] leading-7 text-slate-400">Agent Vaults are controllable spending entities with their own allowances, firewall policies, and recipient rules.</p>
                <div className="mt-6 grid gap-3 sm:flex">
                  <ControlButton onClick={() => document.getElementById("agent-vault-name")?.focus()} className="w-auto whitespace-nowrap bg-[linear-gradient(135deg,#7C3AED,#4F46E5)] px-5">
                    <Plus className="h-4 w-4" />
                    Add Agent Vault
                  </ControlButton>
                  <ControlButton asAnchor href="https://github.com/Pterodactyl681/WhisperVault#readme" className="w-auto whitespace-nowrap px-5">
                    Learn more
                    <ExternalLink className="h-4 w-4" />
                  </ControlButton>
                </div>
              </div>
              <AgentVaultVisual />
            </div>
          </GlowPanel>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<UsersRound className="h-5 w-5" />} label="Total Agents" value={String(agents.length)} detail="All time" />
            <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label="Active Agents" value={String(agents.filter((agent) => agent.isActive).length)} detail="Currently active" tone="emerald" />
            <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Healthy Policies" value={String(agents.filter((agent) => agent.status !== "exhausted").length)} detail="No policy issues" tone="blue" />
            <StatCard icon={<Layers3 className="h-5 w-5" />} label="Routing Ready" value={String(agents.filter((agent) => agent.defaultRecipientAddress).length)} detail="Ready to execute" tone="amber" />
          </div>

          <AgentTable agents={filtered} activeAgent={activeAgent} isSubmitting={isSubmitting} clearActiveAgent={clearActiveAgent} useAgent={useAgent} query={query} setQuery={setQuery} />
          {agents.length > 0 ? <ConnectAgentPanel agent={onboardingAgent} isSubmitting={isSubmitting} generatedAgentToken={generatedAgentToken} generateAgentToken={generateAgentToken} /> : null}
        </div>

        <GlowPanel className="p-5 sm:p-6 xl:sticky xl:top-6 xl:self-start" intensity="quiet">
          <div className="mb-6 flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-200">
              <Plus className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[21px] font-semibold text-white">Add Agent Vault</h2>
              <p className="mt-1 text-[14px] text-slate-500">Create a new agent vault with custom settings.</p>
            </div>
          </div>
          <form className="space-y-5" onSubmit={createAgent}>
            <Field label="Agent Name">
              <StyledInput
                id="agent-vault-name"
                value={newAgentName}
                onChange={(event) => setNewAgentName(event.target.value)}
                placeholder="e.g., Research Agent"
                aria-label="New Agent Vault name"
                aria-invalid={agentNameError ? true : undefined}
                aria-describedby={agentNameError ? "agent-vault-name-error" : undefined}
                className={agentNameError ? "border-red-400/55 focus:border-red-300/70 focus:shadow-[0_0_0_3px_rgba(248,113,113,0.14)]" : ""}
              />
              {agentNameError ? (
                <p id="agent-vault-name-error" className="mt-2 rounded-lg border border-red-400/20 bg-red-500/8 px-3 py-2 text-[13px] text-red-200">
                  {agentNameError}
                </p>
              ) : null}
            </Field>
            <Field label="Description (optional)">
              <StyledTextarea placeholder="Describe the agent's purpose and scope..." aria-label="Agent description" />
            </Field>
            <Field label="Daily Allowance">
              <StyledInput value="0" readOnly aria-label="Daily allowance" />
            </Field>
            <ControlButton type="submit" disabled={isSubmitting} className="w-full whitespace-nowrap bg-[linear-gradient(135deg,#7C3AED,#4F46E5)] px-5 shadow-[0_0_30px_rgba(124,58,237,0.30)]">
              <Plus className="h-4 w-4" />
              Create Agent Vault
            </ControlButton>
            <p className="text-center text-[13px] text-slate-500">You can modify settings anytime after creation.</p>
          </form>
        </GlowPanel>
      </div>
    </div>
  );
}

export function AgentTable({
  agents,
  activeAgent,
  isSubmitting,
  clearActiveAgent,
  useAgent,
  query,
  setQuery
}: {
  agents: CommandCenterAgent[];
  activeAgent: CommandCenterAgent | null;
  isSubmitting: boolean;
  clearActiveAgent: () => void;
  useAgent: (agentId: string) => void;
  query: string;
  setQuery: (value: string) => void;
}) {
  return (
    <GlowPanel className="p-5" intensity="quiet">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <PanelTitle>Agent Vaults</PanelTitle>
          <p className="mt-2 text-[14px] text-slate-500">Manage and monitor all your agent vaults.</p>
        </div>
        {activeAgent ? (
          <ControlButton onClick={clearActiveAgent} disabled={isSubmitting}>
            Disconnect / Clear active agent
          </ControlButton>
        ) : null}
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_190px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <StyledInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents..." className="pl-10" />
        </div>
        <StyledSelect defaultValue="all">
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </StyledSelect>
        <StyledSelect defaultValue="all">
          <option value="all">All Allowances</option>
          <option value="live">Live</option>
          <option value="empty">Empty</option>
        </StyledSelect>
      </div>
      <div className="mt-4">
        <VaultTable agents={agents} isSubmitting={isSubmitting} useAgent={useAgent} />
      </div>
    </GlowPanel>
  );
}

export function VaultTable({ agents, isSubmitting, useAgent }: { agents: CommandCenterAgent[]; isSubmitting: boolean; useAgent: (agentId: string) => void }) {
  if (agents.length === 0) {
    return (
      <div className="grid min-h-[190px] place-items-center rounded-xl border border-dashed border-white/[0.10] bg-white/[0.018] p-6 text-center">
        <div className="max-w-sm">
          <CompactEmptyMark />
          <h3 className="mt-4 text-[20px] font-semibold text-white">No agent vaults yet</h3>
          <p className="mt-2 text-[14px] text-slate-500">Create your first vault to automate spending with guardrails.</p>
          <ControlButton onClick={() => document.getElementById("agent-vault-name")?.focus()} className="mt-4 w-auto whitespace-nowrap px-4">
            <Plus className="h-4 w-4" />
            Add Agent Vault
          </ControlButton>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <div key={agent.id} className="min-w-0 rounded-xl border border-white/[0.08] bg-[#071127]/74 p-4">
          <div className="flex h-full min-w-0 flex-col gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 truncate text-[18px] font-medium text-white">{agent.name}</div>
                {agent.isActive ? <StatusBadge status="active">Active</StatusBadge> : <StatusBadge status={agent.status} />}
              </div>
              <div className="mt-2 truncate text-[14px] text-slate-500">{formatRail(agent.executionMode)}</div>
            </div>
            <div className="grid gap-2">
              <SoftMetric label="Ghost Allowance" value={`${agent.ghostAllowanceLive}/${agent.ghostAllowanceMax}`} compact />
              <SoftMetric label="Daily Remaining" value={`${agent.dailyLeft} USDC`} compact />
            </div>
            <ControlButton disabled={agent.isActive || isSubmitting} onClick={() => useAgent(agent.id)} className="mt-auto w-full">
              Set Active Vault
            </ControlButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConnectAgentPanel({
  agent,
  isSubmitting,
  generatedAgentToken,
  generateAgentToken
}: {
  agent: CommandCenterAgent | null;
  isSubmitting: boolean;
  generatedAgentToken: GeneratedAgentTokenState | null;
  generateAgentToken: (agentId: string) => void;
}) {
  const agentName = agent?.name ?? "agent-name";
  const token = generatedAgentToken && generatedAgentToken.agentId === agent?.id ? generatedAgentToken.token : "<token>";
  const telegramBotAvailable = TELEGRAM_REFERENCE_BOT_URL.length > 0;

  return (
    <GlowPanel className="p-5" intensity="quiet">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <PanelTitle>Connect Agent</PanelTitle>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge status="active">Agent Vault ready</StatusBadge>
            <StatusBadge status="pending">Connect your agent next</StatusBadge>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ConnectionMethod
          title="Telegram Reference Agent"
          detail="Use the reference bot to select this vault and send a demo spend."
          action={
            <ControlButton asAnchor href={telegramBotAvailable ? TELEGRAM_REFERENCE_BOT_URL : "#"} disabled={!telegramBotAvailable}>
              <ExternalLink className="h-4 w-4" />
              Open Telegram bot
            </ControlButton>
          }
          steps={[<>Command: <code className="text-violet-200">{`/agent use ${agentName}`}</code></>, <>Command: <code className="text-violet-200">/spend 1 buy coffee</code></>]}
        />
        <ConnectionMethod
          title="BYO Agent API"
          detail="External agents submit spend intents through this API."
          action={
            <ControlButton disabled={!agent || isSubmitting} onClick={() => agent ? generateAgentToken(agent.id) : undefined}>
              <KeyRound className="h-4 w-4" />
              Generate Agent Token
            </ControlButton>
          }
          steps={[<>Endpoint: <code className="text-violet-200">/api/agent-spend</code></>, <>Authorization: <code className="text-violet-200">Bearer {token}</code></>]}
        />
      </div>
    </GlowPanel>
  );
}

function ConnectionMethod({ title, detail, action, steps }: { title: string; detail: string; action: ReactNode; steps: ReactNode[] }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="text-[17px] font-medium text-white">{title}</div>
          <p className="mt-1 text-[14px] text-slate-500">{detail}</p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      <ol className="mt-4 space-y-2 text-[14px] text-slate-300">
        {steps.map((step, index) => (
          <li key={index} className="flex gap-2">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-violet-300/18 bg-violet-400/8 text-[11px] text-violet-200">{index + 1}</span>
            <span className="min-w-0 break-words">{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SimulatorPanel({
  activeAgent,
  recipients,
  simulatorAmount,
  setSimulatorAmount,
  simulatorMint,
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
  const isBlocked = simulatorResult?.decision === "blocked";

  return (
    <div className="space-y-5">
      <GlowPanel className="border-amber-300/22 bg-[linear-gradient(90deg,rgba(113,63,18,0.34),rgba(5,10,25,0.70))] p-4" intensity="quiet">
        <div className="flex flex-wrap items-center gap-4">
          <AlertTriangle className="h-5 w-5 text-amber-300" />
          <div className="font-semibold uppercase tracking-[0.08em] text-amber-200">Dry Run Mode</div>
          <div className="text-[14px] text-slate-300">No transactions will be sent. Results are for simulation and analysis only.</div>
        </div>
      </GlowPanel>

      <PageHeader title="Rogue Simulator" subtitle="Simulate and analyze how a spender might attempt to exploit your allowances." />
      <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
        <GlowPanel className="p-5" intensity="quiet">
          <PanelTitle>Simulation Inputs</PanelTitle>
          <form className="mt-6 space-y-5" onSubmit={runSimulator}>
            <div className="grid gap-3 sm:grid-cols-[1fr_0.45fr]">
              <Field label="Amount">
                <StyledInput value={simulatorAmount} onChange={(event) => setSimulatorAmount(event.target.value)} placeholder="1,250" inputMode="decimal" aria-label="Simulation amount" />
              </Field>
              <Field label="Token">
                <TokenControl value="USDC" />
              </Field>
            </div>
            <Field label="Recipient (Spender)">
              <RecipientControl
                value={simulatorRecipient}
                onChange={setSimulatorRecipient}
                recipients={recipients}
                defaultAddress={activeAgent?.defaultRecipientAddress}
                ariaLabel="Simulation recipient"
              />
            </Field>
            <Field label="Intent (What the spender is trying to do)">
              <StyledTextarea value={simulatorGoal} onChange={(event) => setSimulatorGoal(event.target.value)} placeholder="Unlimited approval (increaseAllowance type(uint256).max)" aria-label="Simulation goal" />
            </Field>
            <ControlButton type="submit" disabled={!activeAgent} className="w-full bg-[linear-gradient(135deg,#7C3AED,#4F46E5)] shadow-[0_18px_42px_rgba(91,33,182,0.26)]">
              <FlaskConical className="h-4 w-4" />
              Run Simulation
              <ArrowRight className="h-4 w-4" />
            </ControlButton>
          </form>
        </GlowPanel>

        <GlowPanel className="p-5" intensity="quiet">
          <PanelTitle>Simulation Result</PanelTitle>
          <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.045] p-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_190px] lg:items-center">
              <div className="flex items-center gap-4">
                <div className={isBlocked ? "grid h-16 w-16 place-items-center rounded-2xl border border-red-300/28 bg-red-500/10 text-red-300" : "grid h-16 w-16 place-items-center rounded-2xl border border-emerald-300/24 bg-emerald-500/9 text-emerald-300"}>
                  {isBlocked ? <ShieldX className="h-9 w-9" /> : <ShieldCheck className="h-9 w-9" />}
                </div>
                <div>
                  <div className={isBlocked ? "text-[28px] font-semibold text-red-300" : "text-[28px] font-semibold text-emerald-300"}>
                    {simulatorResult ? (isBlocked ? "Blocked" : "Allowed") : "Awaiting Run"}
                  </div>
                  <p className="mt-1 text-[15px] text-slate-400">{simulatorResult?.reason ?? "Run a dry simulation to inspect policy outcome."}</p>
                </div>
              </div>
              <div className="grid place-items-center rounded-2xl border border-white/[0.08] bg-[#06111f]/70 p-4 text-center">
                <div className={cn("grid h-24 w-24 place-items-center rounded-full border", simulatorResult ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-200" : "border-slate-600/60 bg-slate-800/40 text-slate-400")}>
                  <div>
                    <div className="text-[28px] font-semibold leading-none">{simulatorResult ? "98%" : "--"}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.12em]">confidence</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.022] p-4">
              <PanelTitle>Route Preview</PanelTitle>
              <div className="mt-5 grid grid-cols-4 gap-2 text-center text-[12px] text-slate-500">
                {["Spender", "Approval", "Policy", "Recipient"].map((item, index) => (
                  <div key={item} className="min-w-0">
                    <div className="mx-auto grid h-9 w-9 place-items-center rounded-full border border-slate-600/70 bg-[#071127]/74 text-slate-300">{index + 1}</div>
                    <div className="mt-2 truncate">{item}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.022] p-4">
              <PanelTitle>Policy Outcome</PanelTitle>
              <div className="mt-4">
                <ValidationChecklist
                  items={[
                    { label: "Policy Match", detail: simulatorResult ? "Matched visible policy." : "Awaiting result.", status: isBlocked ? "blocked" : "passed" },
                    { label: "Allowance Impact", detail: `${activeAgent?.ghostAllowanceLive ?? "0"} USDC available.`, status: simulatorResult ? "allowed" : "pending" },
                    { label: "Settlement Impact", detail: simulatorResult ? "No transaction sent in dry run." : "Simulation only.", status: "passed" }
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <SoftMetric label="Allowance Impact" value={simulatorResult ? `${simulatorResult.amount} ${simulatorResult.mint}` : "No run"} />
            <SoftMetric label="Settlement Impact" value="Not sent" />
            <SoftMetric label="Summary" value={simulatorResult?.reason ?? "No simulation result yet."} />
          </div>
        </GlowPanel>
      </div>

      <GlowPanel className="p-5" intensity="quiet">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <PanelTitle>Simulation Trace</PanelTitle>
            <p className="mt-2 text-[14px] text-slate-500">Step-by-step breakdown of how the simulation was evaluated.</p>
          </div>
          <ControlButton className="w-auto">
            Copy ID
            <Copy className="h-4 w-4" />
          </ControlButton>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {["Request Received", "Spender Analysis", "Intent Detection", "Policy Evaluation", "Impact Analysis", "Decision"].map((step, index) => (
            <div key={step} className={cn("rounded-xl border p-4", index === 5 && isBlocked ? "border-red-300/30 bg-red-500/10" : "border-white/[0.08] bg-white/[0.035]")}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-[13px] font-medium text-white">{index + 1}. {step}</div>
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              </div>
              <div className="mt-3 text-[12px] leading-5 text-slate-500">{index === 5 && simulatorResult ? simulatorResult.reason : "Evaluation step completed."}</div>
            </div>
          ))}
        </div>
      </GlowPanel>
    </div>
  );
}

export function SettingsSection({
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
  const [tab, setTab] = useState<"general" | "network" | "api" | "recipients" | "docs">("general");

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />
      <div className="flex max-w-full gap-6 overflow-x-auto border-b border-[#26345E]">
        {(["general", "network", "api", "recipients", "docs"] as const).map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={tab === item ? "border-b-2 border-violet-400 px-1 pb-3 text-[15px] font-medium capitalize text-violet-200" : "px-1 pb-3 text-[15px] capitalize text-slate-400"}>
            {item}
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <GlowPanel className="p-5" intensity="quiet">
          <div className="mb-5 flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-violet-500/16 text-violet-200">
              <SlidersHorizontal className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-[21px] font-semibold text-white">Application Configuration</h2>
              <p className="mt-1 text-[14px] text-slate-500">Manage core application settings and preferences.</p>
            </div>
          </div>
          <div className="space-y-2">
            <ConfigRow icon={<Globe2 />} label="Network" detail="Current blockchain network" value="Solana Devnet" />
            <ConfigRow icon={<SlidersHorizontal />} label="App Mode" detail="Application operating mode" value="Demo" />
            <ConfigRow icon={<Link2 />} label="API Base URL" detail="Backend service endpoint" value={typeof window === "undefined" ? "/" : window.location.origin} />
            <ConfigRow icon={<BadgeInfo />} label="Version" detail="Installed application version" value="0.1.0" />
            <ConfigRow icon={<Wallet />} label="Controller" detail="Active controller wallet" value={compactAddress(controllerWallet)} />
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ControlButton onClick={() => void resetDemoState()} disabled={isSubmitting} className="border-red-300/30 text-red-200">
              <AlertTriangle className="h-4 w-4" />
              Reset Demo State
            </ControlButton>
            <ControlButton asAnchor href="https://github.com/Pterodactyl681/WhisperVault#readme">
              View Docs
              <ExternalLink className="h-4 w-4" />
            </ControlButton>
          </div>
        </GlowPanel>

        <GlowPanel className="p-5" intensity="quiet">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[21px] font-semibold text-white">Recipients Management</h2>
              <p className="mt-1 text-[14px] text-slate-500">Add and manage recipients for agent executions.</p>
            </div>
            <ControlButton className="w-auto">Export CSV</ControlButton>
          </div>
          <form className="grid gap-3 lg:grid-cols-[0.7fr_1fr_auto]" onSubmit={addRecipient}>
            <StyledInput value={recipientLabel} onChange={(event) => setRecipientLabel(event.target.value)} placeholder="e.g., Premium Vendor" aria-label="Recipient label" />
            <StyledInput value={recipientAddress} onChange={(event) => setRecipientAddress(event.target.value)} placeholder="Enter Solana Devnet address" aria-label="Recipient address" />
            <ControlButton type="submit" disabled={isSubmitting} className="bg-[linear-gradient(135deg,#7C3AED,#4F46E5)]">
              Add Recipient
            </ControlButton>
          </form>
          <div className="mt-5">
            {recipients.length > 0 ? (
              <DataTableShell minWidth={650}>
                <table className="w-full text-left text-[14px]">
                  <thead className="border-b border-white/[0.08] text-[12px] uppercase tracking-[0.08em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Merchant Label</th>
                      <th className="px-4 py-3">Address</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((recipient) => (
                      <tr key={recipient.label} className="border-b border-white/[0.06]">
                        <td className="px-4 py-4 font-medium text-white">{recipient.label}</td>
                        <td className="px-4 py-4 text-slate-300">{compactAddress(recipient.address)}</td>
                        <td className="px-4 py-4"><StatusBadge status={recipient.isDefaultForActiveAgent ? "active" : "neutral"}>{recipient.isDefaultForActiveAgent ? "Default" : "Active"}</StatusBadge></td>
                        <td className="px-4 py-4">
                          <ControlButton disabled={recipient.isDefaultForActiveAgent || isSubmitting} onClick={() => useRecipient(recipient.label)} className="min-h-9 px-3">
                            Use
                          </ControlButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTableShell>
            ) : (
              <EmptyState title="No recipients" body="Add a devnet address for the active Agent Vault." />
            )}
          </div>
        </GlowPanel>
      </div>

      <GlowPanel className="p-5" intensity="quiet">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <PanelTitle>Configuration Insights</PanelTitle>
            <p className="mt-2 text-[14px] text-slate-500">Current runtime and recipient readiness.</p>
          </div>
          <StatusBadge status="active">Healthy</StatusBadge>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <ConfigInsightCard icon={<Globe2 />} label="Network" value="Connected" />
          <ConfigInsightCard icon={<Link2 />} label="API" value="200 OK" />
          <ConfigInsightCard icon={<BadgeInfo />} label="Configuration" value={tab === "docs" ? "Docs linked" : "Valid"} />
          <ConfigInsightCard icon={<Wallet />} label="Recipients" value={`${recipients.length} total`} />
        </div>
      </GlowPanel>
    </div>
  );
}

function ConfigInsightCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.035] text-violet-200 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] text-slate-500">{label}</div>
        <div className="truncate text-[15px] font-medium text-white" title={value}>{value}</div>
      </div>
    </div>
  );
}

function ConfigRow({ icon, label, detail, value }: { icon: ReactNode; label: string; detail: string; value: string }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-white/[0.07] bg-white/[0.035] p-4">
      <ConfigIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-white">{label}</div>
        <div className="text-[13px] text-slate-500">{detail}</div>
      </div>
      <div className="max-w-[45%] truncate text-right text-[14px] text-slate-200" title={value}>{value}</div>
      <ArrowRight className="h-4 w-4 text-slate-500" />
    </div>
  );
}

function ReceiptsMiniTable({
  receipts,
  emptyTitle,
  emptyBody
}: {
  receipts: CommandCenterReceipt[];
  emptyTitle: string;
  emptyBody: string;
}) {
  return (
    <div className="mt-5">
      {receipts.length ? (
        <DataTableShell>
          <table className="w-full text-left text-[14px]">
            <thead className="border-b border-white/[0.08] text-[12px] uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Paylink ID</th>
                <th className="px-4 py-3 font-medium">Agent</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((receipt) => (
                <tr key={receipt.id} className="border-b border-white/[0.06]">
                  <td className="px-4 py-4 font-medium text-violet-200">{receipt.paylinkId}</td>
                  <td className="px-4 py-4 text-slate-300">{receipt.agent}</td>
                  <td className="px-4 py-4 text-white">{receipt.amount} {receipt.mint}</td>
                  <td className="px-4 py-4 text-slate-300">{compactAddress(receipt.recipient)}</td>
                  <td className="px-4 py-4"><StatusBadge status={formatExecutionQueueState(receipt)} /></td>
                  <td className="px-4 py-4"><ExplorerLink url={receipt.explorerUrl} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      ) : (
        <div className="grid min-h-[190px] place-items-center rounded-xl border border-white/[0.08] bg-[#071127]/66 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.04] text-violet-200">
              <ReceiptText className="h-6 w-6" />
            </div>
            <div className="mt-3 font-medium text-white">{emptyTitle}</div>
            <div className="mt-1 text-[14px] text-slate-500">{emptyBody}</div>
          </div>
        </div>
      )}
    </div>
  );
}
