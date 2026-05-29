"use client";

import type { FormEvent, ReactNode } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, KeyRound, Loader2, Plus, ShieldX, XCircle, Zap } from "lucide-react";
import { dashboardSourceLabels, TELEGRAM_REFERENCE_BOT_URL } from "./constants";
import type { CommandCenterAgent, CommandCenterReceipt, CommandCenterRecipient, GeneratedAgentTokenState, SectionId, SimulatorResult, SpendResult } from "./types";
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
  sumReceiptAmounts
} from "./utils";
import {
  ActionButton,
  AllowanceRing,
  ControlButton,
  DataTable,
  EmptyState,
  ExplorerLink,
  Field,
  LabelValue,
  LineChart,
  MetricRow,
  MiniSigil,
  Panel,
  PanelTitle,
  PolicyRule,
  ShieldSigil,
  SoftMetric,
  StatusBadge,
  SummaryMetric,
  StyledInput,
  StyledSelect,
  StyledTextarea
} from "./ui";

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
  const recentReceipts = receipts.slice(0, 5);
  const latestRailReceipt = receipts.find((receipt) => receipt.magicblockRailStatus || receipt.fallbackUsed !== undefined || receipt.executionRail);
  const railMode = latestRailReceipt?.magicblockRailMode ?? activeAgent?.executionMode ?? activeAgent?.preferredRail;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-4">
      <Panel className="min-h-[248px] min-w-0">
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

      <Panel className="min-h-[248px] min-w-0">
        <PanelTitle>Ghost Allowance</PanelTitle>
        <div className="mt-5 grid min-w-0 gap-6 sm:grid-cols-[180px_1fr] sm:items-center xl:grid-cols-[220px_1fr] 2xl:grid-cols-[176px_1fr]">
          <AllowanceRing
            current={activeAgent?.ghostAllowanceLive}
            max={activeAgent?.ghostAllowanceMax}
            sizeClassName="h-44 w-44 sm:h-40 sm:w-40 xl:h-44 xl:w-44 2xl:h-40 2xl:w-40"
          />
          <div className="min-w-0 space-y-4">
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

      <Panel className="min-h-[248px] min-w-0">
        <PanelTitle>Spend Firewall</PanelTitle>
          <div className="mt-5 grid gap-6 lg:grid-cols-[176px_1fr] lg:items-center">
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

      <Panel className="min-h-[248px] min-w-0">
        <PanelTitle>Execution Rail</PanelTitle>
        <div className="mt-5 space-y-4">
          <MetricRow label="Primary Rail" value={activeAgent?.preferredRail ? formatRail(activeAgent.preferredRail) : "MagicBlock Private Rail"} />
          <MetricRow label="Mode" value={formatMagicBlockMode(railMode)} />
          <MetricRow label="Network" value="Devnet" />
          <MetricRow label="Fallback" value="Explicit devnet proof" />
        </div>
      </Panel>

      <ActivityFeed receipts={recentReceipts} setSection={setSection} />

      <div className="grid gap-4">
        <Panel>
          <PanelTitle>Live Summary</PanelTitle>
          <LineChart />
          <div className="mt-5 grid gap-3 sm:grid-cols-3 sm:divide-x sm:divide-white/[0.08]">
            <SummaryMetric label="Allowance" value={`${activeAgent?.ghostAllowanceLive ?? "0"} / ${activeAgent?.ghostAllowanceMax ?? "0"} USDC`} />
            <SummaryMetric label="Pending" value={String(pendingCount)} sublabel="Executions" />
            <SummaryMetric label="Confirmed" value={String(confirmedCount)} sublabel="Txs" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function ActivityFeed({ receipts, setSection }: { receipts: CommandCenterReceipt[]; setSection: (section: SectionId) => void }) {
  return (
    <Panel className="lg:col-span-2 2xl:col-span-3">
      <PanelTitle>Recent Receipts</PanelTitle>
      <DataTable
        columns={["TX Signature", "Amount", "Recipient", "Time", "Explorer"]}
        emptyTitle="No receipts yet"
        emptyBody="Approved web intents will appear here after settlement."
      >
        {receipts.map((receipt) => (
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
      {receipts.length > 0 ? (
        <button type="button" onClick={() => setSection("receipts")} className="mx-auto mt-5 flex items-center gap-2 text-[15px] text-violet-300">
          View All Receipts <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </Panel>
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

  return (
    <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <Panel className="min-h-[420px] lg:min-h-[520px]">
        <div className="grid h-full gap-8 lg:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr] lg:items-center">
          <div className="flex justify-center">
            <AllowanceRing current={activeAgent?.ghostAllowanceLive} max={activeAgent?.ghostAllowanceMax} sizeClassName="h-52 w-52 sm:h-60 sm:w-60 lg:h-64 lg:w-64 xl:h-72 xl:w-72" large />
          </div>
          <div className="space-y-5">
            <PanelTitle>Allowance Session</PanelTitle>
            <div className="text-[30px] font-medium leading-tight text-white sm:text-[34px] lg:text-[39px]">
              {activeAgent?.ghostAllowanceLive ?? "0"} / {activeAgent?.ghostAllowanceMax ?? "0"} USDC
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <SoftMetric label="Refill Amount" value={`${activeAgent?.ghostRefillAmount ?? "0"} USDC`} />
              <SoftMetric label="Refill Interval" value={`${activeAgent?.ghostRefillIntervalMinutes ?? 0} minutes`} />
              <SoftMetric label="Next Refill" value={formatCountdown(runtime.nextRefillAt)} />
              <SoftMetric label="Session Status" value={formatRuntimeStatus(runtime.sessionStatus)} />
              <SoftMetric label="Clawback Status" value={runtime.clawbackCompleted ? "Completed" : runtime.clawbackPending ? "Queued" : "Standby"} />
              <SoftMetric label="Session Ends" value={formatCountdown(ghostTab?.expiresAt)} />
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
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
        <PanelTitle>ER/PER Runtime</PanelTitle>
        <div className="mt-6 grid gap-3">
          <MetricRow label="Runtime Engine" value="MagicBlock ER-ready" />
          <MetricRow label="Refill Mode" value={formatRefillEngine(runtime.refillEngine)} />
          <MetricRow label="Privacy Rail" value="Mirage Private Rail" />
          <MetricRow label="Settlement" value="Native Devnet Fallback" />
          <MetricRow label="Tick Cadence" value={formatMinutes(runtime.tickCadenceMinutes)} />
          <MetricRow label="Session Lifetime" value={formatMinutes(runtime.sessionLifetimeMinutes)} />
        </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <SoftMetric label="Remaining Allowance" value={`${ghostTab?.allowanceLive ?? activeAgent?.ghostAllowanceLive ?? "0"} USDC`} />
          <SoftMetric label="Reserved Amount" value={`${reservedAmount} USDC`} />
          <SoftMetric label="Recoverable Amount" value={`${recoverableAmount} USDC`} />
          <SoftMetric label="Refill Ticks" value={String(runtime.refillTickCount)} />
          <SoftMetric label="Queued Refill" value={`${runtime.queuedRefill} USDC`} />
          <SoftMetric label="Clawback" value={runtime.clawbackCompleted ? "completed" : runtime.clawbackPending ? "queued" : "not queued"} />
        </div>
      </Panel>

      <Panel className="xl:col-span-2">
        <PanelTitle>Ghost Timeline</PanelTitle>
        <div className="mt-6 space-y-3">
          {timeline.length ? (
            timeline.map((event) => (
              <div key={event.id} className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-medium text-white">{event.label ?? event.type.replace(/_/g, " ")}</div>
                    <div className="mt-1 text-[14px] text-zinc-500">{formatDateTime(event.at)}</div>
                  </div>
                  {event.amount ? <StatusBadge status="confirmed">{event.amount} USDC</StatusBadge> : null}
                </div>
                {event.reason ? <p className="mt-3 text-[15px] text-zinc-400">{event.reason}</p> : null}
                {event.synthetic ? <p className="mt-2 text-[13px] text-zinc-500">runtime simulation</p> : null}
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

export function ExecutionsSection({
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
              <div className="grid gap-3 lg:grid-cols-[1fr_0.7fr]">
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
                  <div className="mt-5 grid gap-3 lg:grid-cols-2">
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
          columns={["Paylink ID", "Agent", "Amount", "Recipient", "Primary Rail", "Fallback Used", "Queue State", "Time", "Action"]}
          emptyTitle="No executions"
          emptyBody="Pending, blocked, confirmed, and failed executions will appear here."
        >
          {receipts.map((receipt) => (
            <tr key={receipt.id} className="border-t border-white/[0.07]">
              <td className="px-3 py-4 font-medium text-violet-300">{receipt.paylinkId}</td>
              <td className="px-3 py-4 text-zinc-300">{receipt.agent}</td>
              <td className="px-3 py-4 text-white">{receipt.amount} {receipt.mint}</td>
              <td className="px-3 py-4 text-zinc-300">{compactAddress(receipt.recipient)}</td>
              <td className="px-3 py-4 text-zinc-300">{formatRail(receipt.executionRail)}</td>
              <td className="px-3 py-4 text-zinc-300">{formatFallbackUsage(receipt)}</td>
              <td className="px-3 py-4"><StatusBadge status={formatExecutionQueueState(receipt)} /></td>
              <td className="px-3 py-4 text-zinc-300">{formatCountdown(receipt.createdAt)}</td>
              <td className="px-3 py-4"><ExplorerLink url={receipt.explorerUrl} /></td>
            </tr>
          ))}
        </DataTable>
      </Panel>
    </div>
  );
}

export function ReceiptsSection({ receipts }: { receipts: CommandCenterReceipt[] }) {
  return (
    <Panel>
      <PanelTitle>Confirmed Receipts</PanelTitle>
      <DataTable
        columns={["Receipt ID", "MagicBlock Rail", "Mode", "Fallback", "Devnet TX Signature", "Amount", "Recipient", "Status", "Explorer"]}
        emptyTitle="No confirmed receipts"
        emptyBody="Settled devnet transactions will appear here with explorer links."
      >
        {receipts.map((receipt) => (
          <tr key={receipt.id} className="border-t border-white/[0.07]">
            <td className="px-3 py-4 font-medium text-violet-300">{receipt.id}</td>
            <td className="px-3 py-4 text-zinc-300">{formatMagicBlockStatus(receipt)}</td>
            <td className="px-3 py-4 text-zinc-300">{formatReceiptMagicBlockMode(receipt)}</td>
            <td className="px-3 py-4 text-zinc-300">{formatFallbackUsage(receipt)}</td>
            <td className="px-3 py-4 text-zinc-300">{receipt.txSignature ?? receipt.txSignatureShort ?? "not recorded"}</td>
            <td className="px-3 py-4 text-white">{receipt.amount} {receipt.mint}</td>
            <td className="px-3 py-4 text-zinc-300">{compactAddress(receipt.recipient)}</td>
            <td className="px-3 py-4"><StatusBadge status={receipt.status} /></td>
            <td className="px-3 py-4"><ExplorerLink url={receipt.explorerUrl} /></td>
          </tr>
        ))}
      </DataTable>
    </Panel>
  );
}

export function AgentsSection({
  agents,
  isSubmitting,
  newAgentName,
  setNewAgentName,
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
  createAgent: (event: FormEvent<HTMLFormElement>) => void;
  useAgent: (agentId: string) => void;
  clearActiveAgent: () => void;
  lastOnboardedAgentId: string | null;
  generatedAgentToken: GeneratedAgentTokenState | null;
  generateAgentToken: (agentId: string) => void;
}) {
  const activeAgent = agents.find((agent) => agent.isActive) ?? null;
  const onboardingAgent = agents.find((agent) => agent.id === lastOnboardedAgentId) ?? activeAgent;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <AgentTable
        agents={agents}
        activeAgent={activeAgent}
        isSubmitting={isSubmitting}
        clearActiveAgent={clearActiveAgent}
        useAgent={useAgent}
      />

      <Panel>
        <PanelTitle>Add Agent Vault</PanelTitle>
        <p className="mt-4 text-[15px] leading-6 text-zinc-400">
          Create policy and limits for a spend-capable agent vault.
        </p>
        <form className="mt-6 space-y-3" onSubmit={createAgent}>
          <StyledInput value={newAgentName} onChange={(event) => setNewAgentName(event.target.value)} placeholder="agent vault name" aria-label="New Agent Vault name" />
          <ControlButton type="submit" disabled={isSubmitting} className="w-full justify-center">
            <Plus className="h-4 w-4" />
            Add Agent Vault
          </ControlButton>
        </form>
      </Panel>
      </div>

      {agents.length > 0 ? (
        <ConnectAgentPanel
          agent={onboardingAgent}
          isSubmitting={isSubmitting}
          generatedAgentToken={generatedAgentToken}
          generateAgentToken={generateAgentToken}
        />
      ) : null}
    </div>
  );
}

export function AgentTable({
  agents,
  activeAgent,
  isSubmitting,
  clearActiveAgent,
  useAgent
}: {
  agents: CommandCenterAgent[];
  activeAgent: CommandCenterAgent | null;
  isSubmitting: boolean;
  clearActiveAgent: () => void;
  useAgent: (agentId: string) => void;
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PanelTitle>{dashboardSourceLabels.agentList}</PanelTitle>
        {activeAgent ? (
          <ControlButton onClick={clearActiveAgent} disabled={isSubmitting}>
            Disconnect / Clear active agent
          </ControlButton>
        ) : null}
      </div>
      <VaultTable agents={agents} isSubmitting={isSubmitting} useAgent={useAgent} />
    </Panel>
  );
}

export function VaultTable({
  agents,
  isSubmitting,
  useAgent
}: {
  agents: CommandCenterAgent[];
  isSubmitting: boolean;
  useAgent: (agentId: string) => void;
}) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <div key={agent.id} className="min-w-0 rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
          <div className="flex h-full min-w-0 flex-col gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 truncate text-[18px] font-medium text-white">{agent.name}</div>
                {agent.isActive ? <StatusBadge status="active">Active</StatusBadge> : null}
                {!agent.isActive ? <StatusBadge status={agent.status} /> : null}
              </div>
              <div className="mt-2 truncate text-[14px] text-zinc-500">{formatRail(agent.executionMode)}</div>
            </div>
            <div className="grid gap-2">
              <SoftMetric label="Ghost Allowance" value={`${agent.ghostAllowanceLive}/${agent.ghostAllowanceMax}`} compact />
              <SoftMetric label="Daily Remaining" value={`${agent.dailyLeft} USDC`} compact />
            </div>
            <div className="mt-auto">
              <ControlButton disabled={agent.isActive || isSubmitting} onClick={() => useAgent(agent.id)} className="w-full">
                Set Active Vault
              </ControlButton>
            </div>
          </div>
        </div>
      ))}
      {agents.length === 0 ? <EmptyState title="No Agent Vaults" body="Add an Agent Vault to create policy and limits for spend intents." /> : null}
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
    <Panel>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <PanelTitle>Connect Agent</PanelTitle>
          <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:items-center">
            <StatusBadge status="active">Agent Vault ready</StatusBadge>
            <StatusBadge status="pending">Connect your agent next</StatusBadge>
          </div>
        </div>
        <AgentFlowStepper />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ConnectionMethod
          title="Telegram Reference Agent"
          detail="Use the reference bot to select this vault and send a demo spend."
          action={
            <ControlButton asAnchor href={telegramBotAvailable ? TELEGRAM_REFERENCE_BOT_URL : "#"} disabled={!telegramBotAvailable} title={telegramBotAvailable ? "Open Telegram bot" : "Set NEXT_PUBLIC_TELEGRAM_BOT_URL to enable this link."}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open Telegram bot
            </ControlButton>
          }
          steps={[
            <>Command: <code className="text-violet-200">{`/agent use ${agentName}`}</code></>,
            <>Command: <code className="text-violet-200">/spend 1 buy coffee</code></>
          ]}
        />

        <ConnectionMethod
          title="BYO Agent API"
          detail="External agents submit spend intents through this API."
          action={
            <ControlButton disabled={!agent || isSubmitting} onClick={() => agent ? generateAgentToken(agent.id) : undefined}>
              <KeyRound className="h-3.5 w-3.5" />
              Generate Agent Token
            </ControlButton>
          }
          steps={[
            <>Endpoint: <code className="text-violet-200">/api/agent-spend</code></>,
            <>Authorization: <code className="text-violet-200">Bearer {token}</code></>,
            <>Submit goal, amount, mint, and recipient.</>
          ]}
        />
      </div>
    </Panel>
  );
}

function AgentFlowStepper() {
  const steps = ["Create Agent Vault", "Connect via Telegram/API", "Submit spend intent"];

  return (
    <div className="grid min-w-0 gap-2 text-[13px] text-zinc-300 sm:grid-cols-3 lg:min-w-[520px]">
      {steps.map((step, index) => (
        <div key={step} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-300/20 bg-violet-400/10 text-[12px] text-violet-200">
            {index + 1}
          </span>
          <span className="min-w-0 leading-5">{step}</span>
        </div>
      ))}
    </div>
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
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
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

export function SimulatorPanel({
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
            DRY RUN - no pending execution created
          </span>
        </div>
        <p className="mt-4 text-[15px] text-zinc-400">Use Create Spend Intent for real devnet execution.</p>
        <form className="mt-6 space-y-4" onSubmit={runSimulator}>
          <div className="grid gap-3 lg:grid-cols-[1fr_0.7fr]">
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
              <div className="mt-5 grid gap-3 lg:grid-cols-2">
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
        <div className="mt-6 grid gap-2 sm:flex sm:flex-wrap">
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
        <form className="mt-6 grid gap-3 lg:grid-cols-[0.7fr_1fr_auto]" onSubmit={addRecipient}>
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
