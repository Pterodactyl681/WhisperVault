"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDot, Clock3, ExternalLink, Plus, RefreshCw, ShieldCheck, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { AGENT_BUDGET_OWNER_HEADER } from "@/lib/agent-vault/http";
import { cn } from "@/lib/utils";
import { useWhisperPayStore } from "@/store/whisperpay-store";

const DEMO_CONTROLLER = "demo-agent-owner";

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

const compactAddress = (value?: string | null): string => {
  if (!value) {
    return "Not set";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
};

const formatRail = (value: string): string => {
  if (value === "magicblock-private") {
    return "Mirage Private Rail";
  }

  if (value === "mirage-private-first") {
    return "Mirage first";
  }

  if (/native/i.test(value)) {
    return "Native Fallback";
  }

  return value;
};

const statusVariant = (status: string): "default" | "secondary" | "outline" => {
  if (status === "active" || status === "confirmed") {
    return "default";
  }

  if (status === "pending" || status === "pending_execution") {
    return "secondary";
  }

  return "outline";
};

const formatCountdown = (iso?: string | null): string => {
  if (!iso) {
    return "Not set";
  }

  const delta = Date.parse(iso) - Date.now();
  const minutes = Math.max(1, Math.round(Math.abs(delta) / 60000));
  const value = minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
  return delta >= 0 ? `in ${value}` : `${value} ago`;
};

export default function CommandCenterPageClient() {
  const wallet = useWhisperPayStore((state) => state.wallet);
  const controllerWallet = wallet.connected && wallet.address ? wallet.address : DEMO_CONTROLLER;
  const [agents, setAgents] = useState<CommandCenterAgent[]>([]);
  const [recipients, setRecipients] = useState<CommandCenterRecipient[]>([]);
  const [receipts, setReceipts] = useState<CommandCenterReceipt[]>([]);
  const [notice, setNotice] = useState<Notice>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [recipientLabel, setRecipientLabel] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [spendAmount, setSpendAmount] = useState("1");
  const [spendMint, setSpendMint] = useState("USDC");
  const [spendGoal, setSpendGoal] = useState("buy coffee");
  const [spendRecipient, setSpendRecipient] = useState("");

  const activeAgent = useMemo(() => agents.find((agent) => agent.isActive) ?? agents[0] ?? null, [agents]);
  const ownerHeaders = useMemo(
    () => ({
      [AGENT_BUDGET_OWNER_HEADER]: controllerWallet
    }),
    [controllerWallet]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    try {
      const [agentsResponse, recipientsResponse, receiptsResponse] = await Promise.all([
        fetch("/api/agents", { headers: ownerHeaders }),
        fetch("/api/recipients", { headers: ownerHeaders }),
        fetch("/api/receipts", { headers: ownerHeaders })
      ]);

      if (!agentsResponse.ok || !recipientsResponse.ok || !receiptsResponse.ok) {
        throw new Error("Command Center data could not be loaded.");
      }

      const agentsBody = (await agentsResponse.json()) as { agents: CommandCenterAgent[] };
      const recipientsBody = (await recipientsResponse.json()) as { recipients: CommandCenterRecipient[] };
      const receiptsBody = (await receiptsResponse.json()) as { receipts: CommandCenterReceipt[] };

      setAgents(agentsBody.agents);
      setRecipients(recipientsBody.recipients);
      setReceipts(receiptsBody.receipts);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : "Command Center data could not be loaded."
      });
    } finally {
      setIsLoading(false);
    }
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
    const payload = (await response.json()) as { error?: { message?: string }; decision?: string; reason?: string; paylinkId?: string };

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Request failed.");
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

    try {
      const payload = await submitJson("/api/spend-intent", {
        amount: spendAmount,
        mint: spendMint,
        goal: spendGoal,
        recipient: spendRecipient
      });

      if (payload.decision === "blocked") {
        setNotice({ tone: "warning", message: payload.reason ?? "Spend Firewall blocked this intent." });
      } else {
        setNotice({ tone: "success", message: `Spend intent approved: ${payload.paylinkId}` });
      }

      await loadData();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Spend intent failed." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Badge variant="outline" className="w-fit rounded-md uppercase">
            Agent Command Center
          </Badge>
          <div>
            <h1 className="text-3xl font-semibold tracking-normal text-foreground sm:text-4xl">WhisperVault</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Controller wallet: <span className="font-medium text-foreground">{compactAddress(controllerWallet)}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!wallet.connected ? <ConnectWalletButton label="Connect wallet" variant="secondary" /> : null}
          <Button type="button" variant="outline" onClick={() => void loadData()} disabled={isLoading}>
            <RefreshCw className={cn("h-4 w-4", isLoading ? "animate-spin" : "")} />
            Refresh
          </Button>
        </div>
      </header>

      {notice ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            notice.tone === "success" ? "border-[#4ED7FF]/30 bg-[#4ED7FF]/10 text-[#AEEFFF]" : "",
            notice.tone === "warning" ? "border-[#F5B95D]/35 bg-[#F5B95D]/10 text-[#FFDCA0]" : "",
            notice.tone === "error" ? "border-[#F5758B]/35 bg-[#F5758B]/10 text-[#FFC2CD]" : ""
          )}
        >
          {notice.message}
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card className="rounded-lg">
          <CardHeader className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg tracking-normal">Active Agent Panel</CardTitle>
                <p className="text-sm text-muted-foreground">Agent Vault currently used by web spend intents.</p>
              </div>
              {activeAgent ? <Badge variant={statusVariant(activeAgent.status)}>{activeAgent.status}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            {activeAgent ? (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase text-muted-foreground">Active agent</span>
                  <span className="break-words text-2xl font-semibold tracking-normal text-foreground">{activeAgent.name}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Daily left" value={`${activeAgent.dailyLeft} USDC`} />
                  <Metric label="Ghost Allowance" value={`${activeAgent.ghostAllowanceLive}/${activeAgent.ghostAllowanceMax} USDC`} />
                  <Metric label="Vault balance" value={`${activeAgent.vaultBalance} USDC`} />
                  <Metric label="Refill" value={`${activeAgent.ghostRefillAmount} / ${activeAgent.ghostRefillIntervalMinutes}m`} />
                  <Metric label="Preferred rail" value={formatRail(activeAgent.preferredRail)} />
                  <Metric label="Execution mode" value={formatRail(activeAgent.executionMode)} />
                </div>
                <div className="rounded-lg border border-[rgba(96,118,168,0.2)] bg-[rgba(8,14,25,0.48)] p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <ShieldCheck className="h-4 w-4 text-[#8BE5FF]" />
                    Spend Firewall
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Recipient: {activeAgent.defaultRecipientLabel ?? "default"} ({compactAddress(activeAgent.defaultRecipientAddress)})
                  </p>
                </div>
              </>
            ) : (
              <EmptyState title="No active agent" body="Create an Agent Vault to start routing web spend intents." />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-lg tracking-normal">Ghost Tab</CardTitle>
                <p className="text-sm text-muted-foreground">Living spend session for the active Agent Vault.</p>
              </div>
              {activeAgent?.ghostTab ? <Badge variant={statusVariant(activeAgent.ghostTab.status)}>{activeAgent.ghostTab.status}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            {activeAgent?.ghostTab ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric label="Live allowance" value={`${activeAgent.ghostTab.allowanceLive}/${activeAgent.ghostTab.allowanceMax} USDC`} />
                  <Metric label="Refill timer" value={`${formatCountdown(activeAgent.ghostTab.nextRefillAt)} | +${activeAgent.ghostTab.refillAmount}`} />
                  <Metric label="Session countdown" value={formatCountdown(activeAgent.ghostTab.expiresAt)} />
                  <Metric label="Total spent" value={`${activeAgent.ghostTab.totalSpent} USDC`} />
                </div>
                <div className="rounded-lg border border-[rgba(96,118,168,0.2)] bg-[rgba(8,14,25,0.42)] p-3">
                  <div className="mb-2 text-xs uppercase text-muted-foreground">Event timeline</div>
                  <div className="space-y-2">
                    {activeAgent.ghostTab.events.map((event) => (
                      <div key={event.id} className="flex flex-col gap-1 border-t border-[rgba(96,118,168,0.14)] pt-2 first:border-t-0 first:pt-0">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{event.type.replace(/_/g, " ")}</span>
                          <span className="text-xs text-muted-foreground">{formatCountdown(event.at)}</span>
                        </div>
                        {event.amount || event.reason ? (
                          <p className="text-xs text-muted-foreground">
                            {event.amount ? `${event.amount} USDC` : ""}
                            {event.amount && event.reason ? " | " : ""}
                            {event.reason ?? ""}
                          </p>
                        ) : null}
                      </div>
                    ))}
                    {activeAgent.ghostTab.events.length === 0 ? <p className="text-sm text-muted-foreground">No events yet.</p> : null}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState title="No Ghost Tab" body="A session will open automatically when this Agent Vault is loaded." />
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-lg">
          <CardHeader className="p-5">
            <CardTitle className="text-lg tracking-normal">Agent List</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={createAgent}>
              <Input
                value={newAgentName}
                onChange={(event) => setNewAgentName(event.target.value)}
                placeholder="coffee-agent"
                aria-label="New agent name"
              />
              <Button type="submit" disabled={isSubmitting}>
                <Plus className="h-4 w-4" />
                Create Agent
              </Button>
            </form>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.id} className="rounded-lg border border-[rgba(96,118,168,0.2)] bg-[rgba(8,14,25,0.42)] p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-semibold text-foreground">{agent.name}</span>
                        {agent.isActive ? <Badge>Active</Badge> : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Ghost {agent.ghostAllowanceLive}/{agent.ghostAllowanceMax} USDC | Daily left {agent.dailyLeft}
                      </p>
                    </div>
                    <Button type="button" variant="secondary" size="sm" disabled={agent.isActive || isSubmitting} onClick={() => void useAgent(agent.id)}>
                      Use Agent
                    </Button>
                  </div>
                </div>
              ))}
              {agents.length === 0 ? <EmptyState title="No agents" body="Create one from the form above." /> : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-lg">
          <CardHeader className="p-5">
            <CardTitle className="text-lg tracking-normal">Recipients</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <form className="grid gap-2" onSubmit={addRecipient}>
              <Input value={recipientLabel} onChange={(event) => setRecipientLabel(event.target.value)} placeholder="office" aria-label="Recipient label" />
              <Input
                value={recipientAddress}
                onChange={(event) => setRecipientAddress(event.target.value)}
                placeholder="Solana devnet address"
                aria-label="Recipient address"
              />
              <Button type="submit" disabled={isSubmitting}>
                <Plus className="h-4 w-4" />
                Add Recipient
              </Button>
            </form>
            <div className="space-y-2">
              {recipients.map((recipient) => (
                <div key={recipient.label} className="rounded-lg border border-[rgba(96,118,168,0.2)] bg-[rgba(8,14,25,0.42)] p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="break-words font-semibold text-foreground">{recipient.label}</span>
                        {recipient.isDefaultForActiveAgent ? <Badge>Default</Badge> : null}
                      </div>
                      <p className="break-all text-xs text-muted-foreground">{recipient.address}</p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={recipient.isDefaultForActiveAgent || isSubmitting}
                      onClick={() => void useRecipient(recipient.label)}
                    >
                      Use Recipient
                    </Button>
                  </div>
                </div>
              ))}
              {recipients.length === 0 ? <EmptyState title="No recipients" body="Add a devnet wallet address for the active Agent Vault." /> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg agent-vault-edge">
          <CardHeader className="p-5">
            <CardTitle className="text-lg tracking-normal">Spend Intent Panel</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <form className="grid gap-3" onSubmit={submitSpendIntent}>
              <div className="grid gap-3 sm:grid-cols-[0.7fr_0.7fr_1.6fr]">
                <Input value={spendAmount} onChange={(event) => setSpendAmount(event.target.value)} placeholder="1" aria-label="Spend amount" />
                <Input value={spendMint} onChange={(event) => setSpendMint(event.target.value)} placeholder="USDC" aria-label="Spend mint" />
                <Input
                  value={spendRecipient}
                  onChange={(event) => setSpendRecipient(event.target.value)}
                  placeholder="Recipient override optional"
                  aria-label="Spend recipient override"
                />
              </div>
              <Textarea value={spendGoal} onChange={(event) => setSpendGoal(event.target.value)} placeholder="buy coffee" aria-label="Spend goal" />
              <Button type="submit" disabled={!activeAgent || isSubmitting}>
                <WalletCards className="h-4 w-4" />
                Submit Spend Intent
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-lg">
        <CardHeader className="p-5">
          <CardTitle className="text-lg tracking-normal">Receipts / Execution Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-5 pt-0">
          {receipts.map((receipt) => (
            <div key={receipt.id} className="rounded-lg border border-[rgba(96,118,168,0.2)] bg-[rgba(8,14,25,0.42)] p-3">
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_0.8fr] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {receipt.status === "confirmed" ? <CheckCircle2 className="h-4 w-4 text-[#8BE5FF]" /> : <Clock3 className="h-4 w-4 text-[#A7B5CA]" />}
                    <span className="break-words font-semibold text-foreground">{receipt.paylinkId}</span>
                    <Badge variant={statusVariant(receipt.status)}>{receipt.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Agent {receipt.agent} | Requested amount: {receipt.requestedAmount} {receipt.mint}
                  </p>
                </div>
                <div className="min-w-0 text-sm text-muted-foreground">
                  <p>Settlement rail: {receipt.settlementRailLabel}</p>
                  <p className="break-words">Tx: {receipt.txSignatureShort ?? "Pending"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {receipt.explorerUrl ? (
                    <Button type="button" asChild variant="outline" size="sm">
                      <a href={receipt.explorerUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Devnet tx
                      </a>
                    </Button>
                  ) : (
                    <Badge variant="outline">
                      <CircleDot className="mr-1 h-3 w-3" />
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
          {receipts.length === 0 ? <EmptyState title="No receipts yet" body="Approved web intents will appear here as pending executions." /> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(96,118,168,0.2)] bg-[rgba(8,14,25,0.42)] p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[rgba(96,118,168,0.24)] p-4">
      <div className="font-medium text-foreground">{title}</div>
      <div className="text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
