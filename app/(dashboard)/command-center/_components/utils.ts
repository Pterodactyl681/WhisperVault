import type { CommandCenterAgent, CommandCenterGhostTab, CommandCenterGhostTabEvent, CommandCenterGhostRuntime, CommandCenterReceipt } from "./types";

export const compactAddress = (value?: string | null): string => {
  if (!value) {
    return "Not set";
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
};

export const formatRail = (value?: string | null): string => {
  if (!value) {
    return "MagicBlock-ready";
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

export const railLooksNativeFallback = (receipt?: CommandCenterReceipt | null): boolean =>
  Boolean(receipt && (/native/i.test(receipt.executionRail) || /native fallback/i.test(receipt.settlementRailLabel)));

export const formatMagicBlockMode = (value?: string | null): string => {
  if (!value) {
    return "MagicBlock-ready";
  }

  const normalized = value.toLowerCase();

  if (normalized.includes("payments-api") || normalized.includes("private-payments")) {
    return "Private Payments API";
  }

  if (normalized.includes("mirage")) {
    return "Mirage";
  }

  if (normalized === "off" || normalized.includes("disabled")) {
    return "Off";
  }

  return value;
};

export const formatReceiptMagicBlockMode = (receipt: CommandCenterReceipt): string => {
  const value = receipt.magicblockRailMode ?? receipt.executionRail;
  const normalized = value?.toLowerCase() ?? "";

  if (normalized.includes("payments-api") || normalized.includes("private-payments")) {
    return "payments-api";
  }

  if (normalized.includes("mirage") || normalized.includes("magicblock")) {
    return "mirage";
  }

  if (normalized === "off" || normalized.includes("disabled")) {
    return "off";
  }

  return "not configured";
};

export const formatMagicBlockStatus = (receipt?: CommandCenterReceipt | null, readyFallback = false): string => {
  const status = receipt?.magicblockRailStatus?.toLowerCase();

  if (status) {
    if (status.includes("confirm") || status.includes("success")) {
      return "confirmed";
    }

    if (status.includes("fail") || status.includes("error")) {
      return "failed";
    }

    if (status.includes("attempt") || status.includes("pending")) {
      return "attempted";
    }

    if (status.includes("not configured") || status === "off") {
      return "not configured";
    }

    return status;
  }

  if (receipt?.magicblockRailAttempted === true) {
    return "attempted";
  }

  if (receipt?.magicblockRailAttempted === false) {
    return "not configured";
  }

  return readyFallback ? "MagicBlock-ready" : "not configured";
};

export const formatOverviewMagicBlockStatus = (receipt?: CommandCenterReceipt | null): string => {
  const status = formatMagicBlockStatus(receipt, true);
  return status === "MagicBlock-ready" ? status : status.charAt(0).toUpperCase() + status.slice(1);
};

export const formatFallbackUsage = (receipt?: CommandCenterReceipt | null): string => {
  if (receipt?.fallbackUsed === true || railLooksNativeFallback(receipt)) {
    return "used";
  }

  if (receipt?.fallbackUsed === false) {
    return "not used";
  }

  return "not recorded";
};

export const formatSettlement = (receipt?: CommandCenterReceipt | null): string => {
  if (receipt?.fallbackUsed === true || railLooksNativeFallback(receipt)) {
    return "Solana Devnet Native Fallback";
  }

  return receipt?.settlementRailLabel && receipt.settlementRailLabel !== "Private Rail"
    ? receipt.settlementRailLabel
    : "MagicBlock-ready";
};

export const getGhostRuntime = (ghostTab?: CommandCenterGhostTab | null): CommandCenterGhostRuntime => ({
  sessionStatus:
    ghostTab?.runtime?.sessionStatus ??
    (ghostTab?.status === "clawed_back"
      ? "closed"
      : ghostTab?.status === "expired"
        ? "closed"
        : ghostTab?.status ?? "idle"),
  refillEngine: ghostTab?.runtime?.refillEngine ?? "er-scheduled",
  nextRefillAt: ghostTab?.runtime?.nextRefillAt ?? ghostTab?.nextRefillAt ?? null,
  refillTickCount: ghostTab?.runtime?.refillTickCount ?? ghostTab?.events?.filter((event) => event.type === "refill_tick").length ?? 0,
  queuedRefill: ghostTab?.runtime?.queuedRefill ?? ghostTab?.refillAmount ?? "0",
  clawbackPending: ghostTab?.runtime?.clawbackPending ?? false,
  clawbackCompleted: ghostTab?.runtime?.clawbackCompleted ?? (ghostTab?.status === "clawed_back" || numericValue(ghostTab?.totalClawedBack) > 0),
  tickCadenceMinutes: ghostTab?.runtime?.tickCadenceMinutes ?? ghostTab?.refillIntervalMinutes ?? null,
  sessionLifetimeMinutes:
    ghostTab?.runtime?.sessionLifetimeMinutes ??
    (ghostTab?.openedAt && ghostTab.expiresAt
      ? Math.max(1, Math.round((Date.parse(ghostTab.expiresAt) - Date.parse(ghostTab.openedAt)) / 60000))
      : null)
});

export const formatRuntimeStatus = (value?: string | null): string => {
  if (!value) {
    return "Idle";
  }

  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const formatRefillEngine = (value?: string | null): string =>
  value === "er-scheduled" ? "Scheduled Tick Simulation" : "Offchain Lazy";

export const formatMinutes = (value?: number | null): string => {
  if (!value || value <= 0) {
    return "Not set";
  }

  return value < 60 ? `${value} minutes` : `${Math.round(value / 60)} hours`;
};

export const sumReceiptAmounts = (receipts: CommandCenterReceipt[], predicate: (receipt: CommandCenterReceipt) => boolean): string => {
  const total = receipts.reduce((sum, receipt) => {
    if (!predicate(receipt)) {
      return sum;
    }

    return sum + numericValue(receipt.amount);
  }, 0);

  return Number.isInteger(total) ? String(total) : total.toFixed(2);
};

export const buildGhostTimeline = (
  ghostTab: CommandCenterGhostTab | null,
  activeAgent: CommandCenterAgent | null,
  receipts: CommandCenterReceipt[]
): CommandCenterGhostTabEvent[] => {
  const base = ghostTab?.timeline?.length ? ghostTab.timeline : ghostTab?.events ?? [];
  const items = base.map((event) => ({
    ...event,
    label: event.label ?? event.type.replace(/_/g, " ")
  }));
  const confirmedReceipts = receipts.filter((receipt) => receipt.agent === activeAgent?.id && receipt.status === "confirmed" && receipt.confirmedAt);

  for (const receipt of confirmedReceipts) {
    items.push({
      id: `${receipt.id}:spend_confirmed`,
      type: "spend_confirmed",
      label: "Spend confirmed",
      at: receipt.confirmedAt ?? receipt.createdAt,
      amount: receipt.amount,
      synthetic: true
    });
  }

  return items.sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
};

export const formatExecutionQueueState = (receipt: CommandCenterReceipt): string => {
  if (receipt.status === "failed" || receipt.status === "blocked") {
    return "failed";
  }

  if (receipt.fallbackUsed === true || railLooksNativeFallback(receipt)) {
    return "fallback-settlement";
  }

  if (receipt.status === "confirmed") {
    return "confirmed";
  }

  if (receipt.magicblockRailAttempted || receipt.magicblockRailStatus === "attempted") {
    return "awaiting-rail";
  }

  return "queued-private";
};

export const formatCountdown = (iso?: string | null): string => {
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

export const formatDateTime = (iso?: string | null): string => {
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

export const statusTone = (status?: string | null): "success" | "warning" | "danger" | "neutral" => {
  if (status === "active" || status === "confirmed" || status === "approved") {
    return "success";
  }

  if (
    status === "pending" ||
    status === "pending_execution" ||
    status === "paused" ||
    status === "queued-private" ||
    status === "awaiting-rail" ||
    status === "fallback-settlement"
  ) {
    return "warning";
  }

  if (status === "blocked" || status === "failed" || status === "exhausted" || status === "expired" || status === "clawed_back") {
    return "danger";
  }

  return "neutral";
};

export const numericValue = (value?: string | null): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const percentOf = (current?: string | null, max?: string | null): number => {
  const maxValue = numericValue(max);

  if (maxValue <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (numericValue(current) / maxValue) * 100));
};
