"use client";

import type { FormEvent } from "react";
import { BookOpenText, Bot, FlaskConical, Github, LayoutDashboard, ReceiptText, Settings, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCS_URL, GITHUB_URL } from "./constants";
import type { CommandCenterAgent, CommandCenterReceipt, CommandCenterRecipient, GeneratedAgentTokenState, Notice, SectionId, SimulatorResult, SpendResult } from "./types";
import { AgentsSection, AllowanceSection, ExecutionsSection, FirewallSection, OverviewCards, ReceiptsSection, SettingsSection, SimulatorPanel } from "./sections";
import { LoadingStrip, NoticeBanner, SidebarFooterLink, Sigil, StatusPill, TopStatusBar } from "./ui";
import { CommandCenterModals } from "./Modals";

const navItems: { id: SectionId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "allowance", label: "Ghost Allowance", icon: Sparkles },
  { id: "firewall", label: "Firewall", icon: ShieldCheck },
  { id: "executions", label: "Executions", icon: Workflow },
  { id: "receipts", label: "Receipts", icon: ReceiptText },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "simulator", label: "Simulator", icon: FlaskConical },
  { id: "settings", label: "Settings", icon: Settings }
];

export interface DashboardShellProps {
  activeSection: SectionId;
  setActiveSection: (section: SectionId) => void;
  activeAgent: CommandCenterAgent | null;
  agents: CommandCenterAgent[];
  recipients: CommandCenterRecipient[];
  receipts: CommandCenterReceipt[];
  confirmedReceipts: CommandCenterReceipt[];
  pendingCount: number;
  confirmedCount: number;
  blockedAttempts: CommandCenterReceipt[];
  notice: Notice;
  isLoading: boolean;
  isSubmitting: boolean;
  walletConnected: boolean;
  walletConnecting: boolean;
  onWalletAction: () => void;
  updateBudgetStatus: (agentId: string, action: "pause" | "resume") => void;
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
  newAgentName: string;
  setNewAgentName: (value: string) => void;
  agentNameError: string | null;
  createAgent: (event: FormEvent<HTMLFormElement>) => void;
  useAgent: (agentId: string) => void;
  clearActiveAgent: () => void;
  lastOnboardedAgentId: string | null;
  generatedAgentToken: GeneratedAgentTokenState | null;
  generateAgentToken: (agentId: string) => void;
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
  controllerWallet: string;
  resetDemoState: () => void;
  recipientLabel: string;
  setRecipientLabel: (value: string) => void;
  recipientAddress: string;
  setRecipientAddress: (value: string) => void;
  addRecipient: (event: FormEvent<HTMLFormElement>) => void;
  useRecipient: (label: string) => void;
}

export function DashboardShell(props: DashboardShellProps) {
  const runtimeLabel =
    props.activeSection === "simulator"
      ? "Operational"
      : props.activeSection === "firewall"
        ? "Firewall Active"
        : props.activeSection === "allowance"
          ? "Private Rail Ready"
          : "Runtime Ready";

  return (
    <div className="command-center-shell relative min-h-dvh overflow-x-hidden bg-[#020712] text-white">
      <div className="relative mx-auto grid min-h-dvh w-full max-w-[1440px] grid-cols-1 lg:grid-cols-[248px_minmax(0,1fr)]">
        <Sidebar activeSection={props.activeSection} setActiveSection={props.setActiveSection} />
        <div className="min-w-0">
          <MobileNav activeSection={props.activeSection} setActiveSection={props.setActiveSection} />
          <main className="mx-auto min-w-0 max-w-[1180px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6 xl:px-9">
            <div className="mb-6 flex justify-stretch sm:justify-end">
              <TopStatusBar
                connected={props.walletConnected}
                connecting={props.walletConnecting}
                onWalletAction={props.onWalletAction}
                runtimeLabel={runtimeLabel}
                networkLabel="Devnet"
              />
            </div>

            {props.notice ? <NoticeBanner notice={props.notice} /> : null}
            {props.isLoading ? <LoadingStrip /> : null}

            <div key={props.activeSection} className="command-center-section-transition min-w-0">
              {props.activeSection === "overview" ? (
                <OverviewCards
                  activeAgent={props.activeAgent}
                  receipts={props.receipts}
                  pendingCount={props.pendingCount}
                  confirmedCount={props.confirmedCount}
                  setSection={props.setActiveSection}
                />
              ) : null}
              {props.activeSection === "allowance" ? (
                <AllowanceSection activeAgent={props.activeAgent} receipts={props.receipts} isSubmitting={props.isSubmitting} updateBudgetStatus={props.updateBudgetStatus} />
              ) : null}
              {props.activeSection === "firewall" ? (
                <FirewallSection activeAgent={props.activeAgent} recipients={props.recipients} blockedAttempts={props.blockedAttempts} setSection={props.setActiveSection} />
              ) : null}
              {props.activeSection === "executions" ? (
                <ExecutionsSection
                  activeAgent={props.activeAgent}
                  recipients={props.recipients}
                  receipts={props.receipts}
                  spendAmount={props.spendAmount}
                  setSpendAmount={props.setSpendAmount}
                  spendMint={props.spendMint}
                  setSpendMint={props.setSpendMint}
                  spendGoal={props.spendGoal}
                  setSpendGoal={props.setSpendGoal}
                  spendRecipient={props.spendRecipient}
                  setSpendRecipient={props.setSpendRecipient}
                  spendResult={props.spendResult}
                  submitSpendIntent={props.submitSpendIntent}
                  isSubmitting={props.isSubmitting}
                />
              ) : null}
              {props.activeSection === "receipts" ? <ReceiptsSection receipts={props.confirmedReceipts} /> : null}
              {props.activeSection === "agents" ? (
                <AgentsSection
                  agents={props.agents}
                  isSubmitting={props.isSubmitting}
                  newAgentName={props.newAgentName}
                  setNewAgentName={props.setNewAgentName}
                  agentNameError={props.agentNameError}
                  createAgent={props.createAgent}
                  useAgent={props.useAgent}
                  clearActiveAgent={props.clearActiveAgent}
                  lastOnboardedAgentId={props.lastOnboardedAgentId}
                  generatedAgentToken={props.generatedAgentToken}
                  generateAgentToken={props.generateAgentToken}
                />
              ) : null}
              {props.activeSection === "simulator" ? (
                <SimulatorPanel
                  activeAgent={props.activeAgent}
                  recipients={props.recipients}
                  simulatorAmount={props.simulatorAmount}
                  setSimulatorAmount={props.setSimulatorAmount}
                  simulatorMint={props.simulatorMint}
                  setSimulatorMint={props.setSimulatorMint}
                  simulatorGoal={props.simulatorGoal}
                  setSimulatorGoal={props.setSimulatorGoal}
                  simulatorRecipient={props.simulatorRecipient}
                  setSimulatorRecipient={props.setSimulatorRecipient}
                  simulatorResult={props.simulatorResult}
                  runSimulator={props.runSimulator}
                />
              ) : null}
              {props.activeSection === "settings" ? (
                <SettingsSection
                  controllerWallet={props.controllerWallet}
                  resetDemoState={props.resetDemoState}
                  isSubmitting={props.isSubmitting}
                  recipientLabel={props.recipientLabel}
                  setRecipientLabel={props.setRecipientLabel}
                  recipientAddress={props.recipientAddress}
                  setRecipientAddress={props.setRecipientAddress}
                  addRecipient={props.addRecipient}
                  recipients={props.recipients}
                  useRecipient={props.useRecipient}
                />
              ) : null}
            </div>
          </main>
        </div>
      </div>
      <CommandCenterModals />
    </div>
  );
}

export function Sidebar({ activeSection, setActiveSection }: { activeSection: SectionId; setActiveSection: (section: SectionId) => void }) {
  return (
    <aside className="hidden min-w-0 border-r border-[#25345E] bg-[#040B19]/78 px-6 py-7 shadow-[inset_-1px_0_0_rgba(255,255,255,0.02)] backdrop-blur-xl lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
      <div className="flex h-full flex-col gap-7">
        <div className="flex items-center gap-3">
          <Sigil className="h-12 w-12" />
          <div>
            <div className="text-[17px] font-semibold uppercase tracking-[0.11em] text-white">WhisperVault</div>
          </div>
        </div>
        <NavList activeSection={activeSection} setActiveSection={setActiveSection} orientation="vertical" />
        <div className="mt-auto space-y-5">
          <StatusPill
            icon={<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />}
            label="Devnet Connected"
            className="w-full justify-start"
          />
          <div className="flex w-full items-center justify-center gap-2">
            <SidebarFooterLink href={GITHUB_URL} label="GitHub">
              <Github className="h-4 w-4" />
            </SidebarFooterLink>
            <SidebarFooterLink href={DOCS_URL} label="Docs / README">
              <BookOpenText className="h-4 w-4" />
            </SidebarFooterLink>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function MobileNav({ activeSection, setActiveSection }: { activeSection: SectionId; setActiveSection: (section: SectionId) => void }) {
  return (
    <div className="sticky top-0 z-30 border-b border-[#25345E] bg-[#040B19]/94 px-4 py-3 backdrop-blur-xl lg:hidden">
      <div className="mb-3 flex items-center gap-3">
        <Sigil className="h-9 w-9" />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-semibold uppercase tracking-[0.11em] text-white">WhisperVault</div>
        </div>
      </div>
      <NavList activeSection={activeSection} setActiveSection={setActiveSection} orientation="horizontal" />
    </div>
  );
}

function NavList({ activeSection, setActiveSection, orientation }: { activeSection: SectionId; setActiveSection: (section: SectionId) => void; orientation: "horizontal" | "vertical" }) {
  return (
    <nav className={cn("flex gap-2", orientation === "horizontal" ? "dashboard-nav-scroll max-w-full overflow-x-auto pb-1" : "flex-col")}>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveSection(item.id)}
            className={cn(
              "smooth-control group flex min-h-11 shrink-0 items-center gap-3 rounded-lg border px-3 text-left text-[15px]",
              isActive
                ? "border-violet-400/45 bg-[linear-gradient(135deg,rgba(91,33,182,0.52),rgba(30,41,105,0.66))] text-white shadow-[0_0_30px_rgba(124,58,237,0.28)]"
                : "border-transparent text-slate-300 hover:border-violet-400/20 hover:bg-white/[0.04] hover:text-white"
            )}
          >
            <Icon className={cn("h-4 w-4 transition-colors duration-300", isActive ? "text-violet-300" : "text-violet-200/70")} />
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
