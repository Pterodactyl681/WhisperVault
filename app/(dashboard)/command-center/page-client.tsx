"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import type { FormEvent } from "react";
import { AGENT_BUDGET_OWNER_HEADER } from "@/lib/agent-vault/http";
import { useWhisperPayStore } from "@/store/whisperpay-store";
import { DashboardShell } from "./_components/DashboardShell";
import type { CommandCenterAgent, CommandCenterReceipt, CommandCenterRecipient, GeneratedAgentTokenState, Notice, SectionId, SimulatorResult, SpendResult } from "./_components/types";
import { numericValue } from "./_components/utils";

const DEMO_CONTROLLER = "demo-agent-owner";

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
  const [agentNameError, setAgentNameError] = useState<string | null>(null);
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
  const [lastOnboardedAgentId, setLastOnboardedAgentId] = useState<string | null>(null);
  const [generatedAgentToken, setGeneratedAgentToken] = useState<GeneratedAgentTokenState | null>(null);

  const activeAgent = useMemo(() => agents.find((agent) => agent.isActive) ?? null, [agents]);
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

    const readJson = async <T extends { warnings?: string[] },>(
      url: string,
      fallback: T
    ): Promise<{ data: T; error: string | null }> => {
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
      readJson<{ agents?: CommandCenterAgent[]; warnings?: string[] }>("/api/agents", { agents: [] }),
      readJson<{ recipients?: CommandCenterRecipient[]; warnings?: string[] }>("/api/recipients", { recipients: [] }),
      readJson<{ receipts?: CommandCenterReceipt[]; warnings?: string[] }>("/api/receipts", { receipts: [] })
    ]);

    setAgents(Array.isArray(agentsResult.data.agents) ? agentsResult.data.agents : []);
    setRecipients(Array.isArray(recipientsResult.data.recipients) ? recipientsResult.data.recipients : []);
    setReceipts(Array.isArray(receiptsResult.data.receipts) ? receiptsResult.data.receipts : []);

    const errors = [
      agentsResult.error,
      recipientsResult.error,
      receiptsResult.error,
      ...(agentsResult.data.warnings ?? []),
      ...(recipientsResult.data.warnings ?? []),
      ...(receiptsResult.data.warnings ?? [])
    ].filter(Boolean);

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
    const trimmedName = newAgentName.trim();

    if (!trimmedName) {
      setAgentNameError("Enter an Agent Vault name.");
      return;
    }

    setAgentNameError(null);
    setIsSubmitting(true);

    try {
      const payload = await submitJson("/api/agents/create", { name: trimmedName }) as {
        agent?: CommandCenterAgent;
        warning?: string;
        message?: string;
        nextAction?: string;
      };
      setNewAgentName("");
      setLastOnboardedAgentId(payload.agent?.id ?? null);
      setGeneratedAgentToken(null);
      await loadData();
      setNotice({
        tone: payload.warning ? "warning" : "success",
        message: payload.warning
          ? `${payload.message ?? "Agent Vault ready"}. ${payload.nextAction ?? "Connect your agent next"}. ${payload.warning}`
          : `${payload.message ?? "Agent Vault ready"}. ${payload.nextAction ?? "Connect your agent next"}.`
      });
    } catch (error) {
      setAgentNameError(error instanceof Error ? error.message : "Agent could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateNewAgentName = (value: string) => {
    setNewAgentName(value);
    if (agentNameError) {
      setAgentNameError(null);
    }
  };

  const changeSection = (section: SectionId) => {
    setActiveSection(section);
    setNotice(null);
  };

  const useAgent = async (agentId: string) => {
    setIsSubmitting(true);

    try {
      await submitJson("/api/agents/use", { agentId });
      setLastOnboardedAgentId(agentId);
      setGeneratedAgentToken(null);
      await loadData();
      setNotice({ tone: "success", message: "Active Agent Vault updated." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Agent could not be selected." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const clearActiveAgent = async () => {
    setIsSubmitting(true);

    try {
      await submitJson("/api/agents/clear-active", {});
      setLastOnboardedAgentId(null);
      setGeneratedAgentToken(null);
      await loadData();
      setNotice({ tone: "success", message: "Active Agent Vault cleared. Demo is ready for a fresh selection." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Active Agent Vault could not be cleared." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateAgentToken = async (agentId: string) => {
    setIsSubmitting(true);

    try {
      const payload = await submitJson("/api/agents/token", { agentId }) as {
        agent?: CommandCenterAgent;
        token?: string;
      };
      const token = payload.token ?? "";

      if (!token) {
        throw new Error("Agent token was not returned.");
      }

      setGeneratedAgentToken({
        agentId: payload.agent?.id ?? agentId,
        agentName: payload.agent?.name ?? agentId,
        token
      });
      await loadData();
      setNotice({ tone: "success", message: "Agent token generated. Connect your agent next." });
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : "Agent token could not be generated." });
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
            controllerWallet,
            mode: "clear"
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

      const payload = (await response.json()) as { error?: { message?: string }; cleared?: boolean };

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "Demo state could not be reset.");
      }

      setNotice({
        tone: "success",
        message: payload.cleared ? "Demo state cleared. Create or select an Agent Vault to begin." : "Demo state reset."
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
    <DashboardShell
      activeSection={activeSection}
      setActiveSection={changeSection}
      activeAgent={activeAgent}
      agents={agents}
      recipients={recipients}
      receipts={receipts}
      confirmedReceipts={confirmedReceipts}
      pendingCount={pendingExecutions.length}
      confirmedCount={confirmedReceipts.length}
      blockedAttempts={blockedAttempts}
      notice={notice}
      isLoading={isLoading}
      isSubmitting={isSubmitting}
      walletConnected={solanaWallet.connected}
      walletConnecting={solanaWallet.connecting}
      onWalletAction={() => void handleWalletAction()}
      updateBudgetStatus={updateBudgetStatus}
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
      newAgentName={newAgentName}
      setNewAgentName={updateNewAgentName}
      agentNameError={agentNameError}
      createAgent={createAgent}
      useAgent={useAgent}
      clearActiveAgent={clearActiveAgent}
      lastOnboardedAgentId={lastOnboardedAgentId}
      generatedAgentToken={generatedAgentToken}
      generateAgentToken={generateAgentToken}
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
      controllerWallet={controllerWallet}
      resetDemoState={resetDemoState}
      recipientLabel={recipientLabel}
      setRecipientLabel={setRecipientLabel}
      recipientAddress={recipientAddress}
      setRecipientAddress={setRecipientAddress}
      addRecipient={addRecipient}
      useRecipient={useRecipient}
    />
  );
}
