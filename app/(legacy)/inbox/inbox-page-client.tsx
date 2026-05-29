"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight, CheckCircle2, Copy, Loader2, Lock, ShieldCheck } from "lucide-react";
import { appConfig, getExplorerTxUrl } from "@/lib/app-config";
import { checkPermissionMembershipForWallet } from "@/lib/magicblock-er-permission";
import { fetchMagicPrivateTransferMemo } from "@/lib/magicblock-private-payments";
import { BrandGlyph } from "@/components/layout/brand-glyph";
import { useLocale } from "@/components/providers/locale-provider";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAmount, formatDate, shortenAddress, shortenSignature } from "@/lib/format";
import { useWhisperPayStore } from "@/store/whisperpay-store";
import { type PublicPaymentStatus } from "@/types/whisperpay";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const runtimeCopy = {
  en: {
    txSignature: "txSignature",
    copySignature: "Copy signature",
    openExplorer: "Open explorer",
    accessDenied: "Private details are unavailable for this wallet in current session",
    privacyHint: "Public lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    publicMeta: "Public payment metadata",
    privateMeta: "Private transfer details",
    demoMode: "Sandbox preview",
    demoHint: "Preview only: no wallet connection and no live on-chain state.",
    demoStatus: "preview-simulated",
    demoReveal: "Reveal preview details",
    demoRevealed: "Preview details revealed",
    demoNoteFallback: "Private note for recipient (sandbox preview)."
  },
  ru: {
    txSignature: "txSignature",
    copySignature: "Копировать подпись",
    openExplorer: "Открыть Explorer",
    accessDenied: "Приватные детали недоступны для этого кошелька в текущей сессии",
    privacyHint: "Public lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    publicMeta: "Публичные метаданные платежа",
    privateMeta: "Приватные детали перевода",
    demoMode: "Sandbox preview",
    demoHint: "Preview only: no wallet connection and no live on-chain state.",
    demoStatus: "preview-simulated",
    demoReveal: "Reveal preview details",
    demoRevealed: "Preview details revealed",
    demoNoteFallback: "Private note for recipient (sandbox preview)."
  },
  de: {
    txSignature: "txSignature",
    copySignature: "Signatur kopieren",
    openExplorer: "Explorer oeffnen",
    accessDenied: "Private Details sind fuer dieses Wallet in der aktuellen Sitzung nicht verfuegbar",
    privacyHint: "Public lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    publicMeta: "Oeffentliche Zahlungsmetadaten",
    privateMeta: "Private Transferdetails",
    demoMode: "Sandbox preview",
    demoHint: "Preview only: no wallet connection and no live on-chain state.",
    demoStatus: "preview-simulated",
    demoReveal: "Reveal preview details",
    demoRevealed: "Preview details revealed",
    demoNoteFallback: "Private note for recipient (sandbox preview)."
  },
  zh: {
    txSignature: "txSignature",
    copySignature: "复制签名",
    openExplorer: "打开 Explorer",
    accessDenied: "当前会话中该钱包无法查看私密详情",
    privacyHint: "Public lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    publicMeta: "公共支付元数据",
    privateMeta: "私密转账详情",
    demoMode: "Sandbox preview",
    demoHint: "Preview only: no wallet connection and no live on-chain state.",
    demoStatus: "preview-simulated",
    demoReveal: "Reveal preview details",
    demoRevealed: "Preview details revealed",
    demoNoteFallback: "Private note for recipient (sandbox preview)."
  }
} as const;

const publicStatusBadgeVariant: Record<PublicPaymentStatus, "default" | "secondary" | "outline"> = {
  sent: "default",
  pending: "outline",
  failed: "secondary"
};

const getPrivateVisibilityStatus = (isPrivateVisible: boolean, hasPrivateDetails: boolean): "revealed" | "locked" | "unavailable" => {
  if (isPrivateVisible) {
    return "revealed";
  }

  if (hasPrivateDetails) {
    return "locked";
  }

  return "unavailable";
};

const formatErStatus = (status: string): string => status.replace(/-/g, " ");

type PermissionAccessState = "idle" | "checking" | "granted" | "denied" | "error";

const permissionAccessLabel: Record<PermissionAccessState, string> = {
  idle: "access not checked",
  checking: "checking permission",
  granted: "permission granted",
  denied: "permission denied",
  error: "permission check failed"
};

const toPermissionAccessMessage = (
  reason: "router-rpc-missing" | "permission-account-missing" | "permission-query-failed" | "wallet-not-authorized" | null
): string => {
  switch (reason) {
    case "router-rpc-missing":
      return "MagicBlock router RPC is missing; cannot verify reveal permission.";
    case "permission-account-missing":
      return "Permission account is missing for this payment.";
    case "permission-query-failed":
      return "Failed to fetch MagicBlock permission membership.";
    case "wallet-not-authorized":
      return "This wallet is not authorized by MagicBlock permission membership.";
    default:
      return "Reveal permission check failed.";
  }
};

export default function InboxPage() {
  const searchParams = useSearchParams();
  const isDemoMode = searchParams.get("mode") === "demo";

  const wallet = useWhisperPayStore((state) => state.wallet);
  const publicPayments = useWhisperPayStore((state) => state.publicPayments);
  const privatePaymentDetailsByPaymentId = useWhisperPayStore((state) => state.privatePaymentDetailsByPaymentId);
  const revealedPrivatePaymentIds = useWhisperPayStore((state) => state.revealedPrivatePaymentIds);
  const revealPrivatePaymentDetails = useWhisperPayStore((state) => state.revealPrivatePaymentDetails);
  const { t, locale } = useLocale();
  const copy = runtimeCopy[locale];
  const { publicKey: walletPublicKey, signMessage } = useWallet();

  const [revealErrors, setRevealErrors] = useState<Record<string, string>>({});
  const [revealingPaymentId, setRevealingPaymentId] = useState<string | null>(null);
  const [copiedPaymentId, setCopiedPaymentId] = useState<string | null>(null);
  const [copiedSignatureByPaymentId, setCopiedSignatureByPaymentId] = useState<Record<string, boolean>>({});
  const [revealedMagicMemoByPaymentId, setRevealedMagicMemoByPaymentId] = useState<Record<string, string>>({});
  const [permissionAccessStateByPaymentId, setPermissionAccessStateByPaymentId] = useState<Record<string, PermissionAccessState>>({});
  const [permissionAuthorizedUsersByPaymentId, setPermissionAuthorizedUsersByPaymentId] = useState<Record<string, string[]>>({});
  const [demoRevealed, setDemoRevealed] = useState(false);

  const demoPayment = useMemo(() => {
    if (!isDemoMode) {
      return null;
    }

    const amountRaw = Number(searchParams.get("amount"));

    return {
      paymentId: searchParams.get("paymentId")?.trim() || "demo_seed_payment",
      fromWallet: searchParams.get("fromWallet")?.trim() || "demo_sender_wallet",
      toWallet: searchParams.get("toWallet")?.trim() || "9f8Qa8z9wSe9YqM7hK7ivB2xE8a4u6pJmN3tYv4dR2q",
      createdAt: searchParams.get("createdAt")?.trim() || new Date().toISOString(),
      status: searchParams.get("status")?.trim() || copy.demoStatus,
      recipient: searchParams.get("recipient")?.trim() || "Recipient",
      note: searchParams.get("note")?.trim() || copy.demoNoteFallback,
      amount: Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : 15
    };
  }, [copy.demoNoteFallback, copy.demoStatus, isDemoMode, searchParams]);

  const copyId = async (paymentId: string) => {
    await navigator.clipboard.writeText(paymentId);
    setCopiedPaymentId(paymentId);
    setTimeout(() => setCopiedPaymentId(null), 1200);
  };

  const copySignature = async (paymentId: string, signature: string | null) => {
    if (!signature) {
      return;
    }

    await navigator.clipboard.writeText(signature);
    setCopiedSignatureByPaymentId((prev) => ({
      ...prev,
      [paymentId]: true
    }));

    setTimeout(() => {
      setCopiedSignatureByPaymentId((prev) => ({
        ...prev,
        [paymentId]: false
      }));
    }, 1200);
  };

  const inbox = useMemo(
    () =>
      [...publicPayments]
        .filter((item) => wallet.address && item.toWallet === wallet.address)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [publicPayments, wallet.address]
  );

  const revealQueueCount = inbox.filter((payment) => {
    const privateDetails = privatePaymentDetailsByPaymentId[payment.id];
    const isRevealed = revealedPrivatePaymentIds.includes(payment.id);
    return Boolean(privateDetails) && !isRevealed;
  }).length;

  const handleReveal = async (
    paymentId: string,
    source: "local-note" | "magicblock-private-memo",
    signature: string | null,
    permissionedAccount: string | null
  ) => {
    setRevealingPaymentId(paymentId);
    await wait(240);

    if (source === "magicblock-private-memo") {
      if (!wallet.address) {
        setRevealErrors((prev) => ({
          ...prev,
          [paymentId]: t("inbox_reveal_error")
        }));
        setRevealingPaymentId(null);
        return;
      }

      setPermissionAccessStateByPaymentId((prev) => ({
        ...prev,
        [paymentId]: "checking"
      }));

      const access = await checkPermissionMembershipForWallet({
        routerRpcUrl: appConfig.solana.magicRouterRpcUrl,
        permissionedAccount,
        walletAddress: wallet.address
      });

      if (!access.allowed) {
        setPermissionAccessStateByPaymentId((prev) => ({
          ...prev,
          [paymentId]: access.reason === "wallet-not-authorized" ? "denied" : "error"
        }));
        setRevealErrors((prev) => ({
          ...prev,
          [paymentId]: toPermissionAccessMessage(access.reason)
        }));
        setRevealingPaymentId(null);
        return;
      }

      setPermissionAccessStateByPaymentId((prev) => ({
        ...prev,
        [paymentId]: "granted"
      }));
      setPermissionAuthorizedUsersByPaymentId((prev) => ({
        ...prev,
        [paymentId]: access.authorizedUsers ?? []
      }));

      if (!walletPublicKey || !signMessage) {
        setRevealErrors((prev) => ({
          ...prev,
          [paymentId]: "Wallet must support signMessage to reveal MagicBlock private memo."
        }));
        setRevealingPaymentId(null);
        return;
      }

      if (!signature) {
        setRevealErrors((prev) => ({
          ...prev,
          [paymentId]: "Private transaction signature is missing for reveal."
        }));
        setRevealingPaymentId(null);
        return;
      }

      try {
        const memoResult = await fetchMagicPrivateTransferMemo({
          teeRpcUrl: appConfig.solana.magicPrivateTeeRpcUrl,
          signature,
          walletPublicKey,
          signMessage,
          verifyTeeIntegrity: appConfig.solana.magicPrivateVerifyTeeIntegrity
        });

        const revealAttempt = revealPrivatePaymentDetails(paymentId);

        if (!revealAttempt) {
          setRevealErrors((prev) => ({
            ...prev,
            [paymentId]: t("inbox_reveal_error")
          }));
          setRevealingPaymentId(null);
          return;
        }

        setRevealedMagicMemoByPaymentId((prev) => ({
          ...prev,
          [paymentId]: memoResult.memo?.trim() || "(empty private memo)"
        }));
      } catch (error) {
        setRevealErrors((prev) => ({
          ...prev,
          [paymentId]: error instanceof Error ? error.message : t("inbox_reveal_error")
        }));
        setRevealingPaymentId(null);
        return;
      }
    } else {
      const result = revealPrivatePaymentDetails(paymentId);

      if (!result) {
        setRevealErrors((prev) => ({
          ...prev,
          [paymentId]: t("inbox_reveal_error")
        }));
        setRevealingPaymentId(null);
        return;
      }
    }

    setRevealErrors((prev) => ({
      ...prev,
      [paymentId]: ""
    }));
    setRevealingPaymentId(null);
  };

  if (isDemoMode && demoPayment) {
    return (
      <section className="space-y-6">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge>{t("common_er")}</Badge>
            <Badge variant="outline">{t("common_private_er")}</Badge>
            <Badge variant="outline">{copy.demoMode}</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("inbox_title")}</h1>
          <p className="mt-2 text-muted-foreground">{copy.demoHint}</p>
        </div>

        <Card>
          <CardContent className="grid grid-cols-1 gap-4 p-4 sm:p-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{copy.publicMeta}</Badge>
                <Badge variant="outline">{copy.demoStatus}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("inbox_from_wallet")}: {demoPayment.fromWallet}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("inbox_to_wallet")}: {shortenAddress(demoPayment.toWallet)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("inbox_created_at")}: {formatDate(demoPayment.createdAt, locale)}
              </p>
              <p className="text-sm text-muted-foreground">recipient: {demoPayment.recipient}</p>
              <Button variant="outline" size="sm" onClick={() => copyId(demoPayment.paymentId)}>
                <Copy className="h-3.5 w-3.5" />
                {copiedPaymentId === demoPayment.paymentId ? t("common_copied") : t("inbox_copy_payment_id")}
              </Button>
            </div>

            <div className="rounded-2xl border border-border/75 bg-card/72 p-4 ">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{copy.privateMeta}</Badge>
                <Badge variant="outline">SOL</Badge>
                <Badge variant={demoRevealed ? "default" : "secondary"}>{demoRevealed ? "revealed" : "locked"}</Badge>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-foreground">
                  {t("inbox_amount")}: {demoRevealed ? formatAmount(demoPayment.amount, "SOL") : "****"}
                </p>
                <p className="break-words text-sm text-foreground">
                  {t("inbox_private_note")}: {demoRevealed ? demoPayment.note : "**********"}
                </p>
              </div>
              {!demoRevealed ? <p className="mt-2 text-xs text-muted-foreground">{t("inbox_reveal_hint")}</p> : null}
              {demoRevealed ? (
                <div className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {copy.demoRevealed}
                </div>
              ) : null}
              <Button
                className="mt-4 w-full sm:w-auto"
                variant={demoRevealed ? "outline" : "secondary"}
                disabled={demoRevealed}
                onClick={() => setDemoRevealed(true)}
              >
                {demoRevealed ? copy.demoRevealed : copy.demoReveal}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!wallet.connected || !wallet.address) {
    return (
      <Card className="mx-auto mt-8 max-w-2xl">
        <CardHeader>
          <CardTitle>{t("inbox_locked_title")}</CardTitle>
          <CardDescription>{t("inbox_locked_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="mb-2 flex items-center justify-center">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-brand-gradient opacity-25 blur-xl" />
              <BrandGlyph className="h-16 w-16 rounded-2xl" />
              <div className="absolute -bottom-1 -right-1 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(96,118,168,0.26)] bg-[rgba(14,23,39,0.95)]">
                <Lock className="h-4 w-4 text-[#37ACBD]" />
              </div>
            </div>
          </div>
          <ConnectWalletButton />
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href="/create">
                Create paylink
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
              <Link href="/inbox?mode=demo">
                Open sandbox inbox context
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
      <section className="space-y-6">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{inbox.length} incoming</Badge>
            <Badge variant={revealQueueCount > 0 ? "secondary" : "outline"}>{revealQueueCount} to reveal</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{t("inbox_title")}</h1>
          <p className="mt-2 text-muted-foreground">Review payments. Reveal what you are allowed to reveal.</p>
        </div>

      {inbox.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("inbox_no_incoming")}</CardTitle>
            <CardDescription>{t("inbox_no_incoming_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild className="w-full sm:w-auto">
              <Link href="/create">
                Create paylink
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link href="/inbox?mode=demo">
                Open sandbox flow
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {inbox.map((payment, index) => {
            const privateDetails = privatePaymentDetailsByPaymentId[payment.id];
            const isMagicPrivateSource = privateDetails?.source === "magicblock-private-memo";
            const revealedMagicMemo = revealedMagicMemoByPaymentId[payment.id] ?? null;
            const permissionAccessState = permissionAccessStateByPaymentId[payment.id] ?? "idle";
            const permissionAuthorizedUsers = permissionAuthorizedUsersByPaymentId[payment.id] ?? [];
            const isRevealed = revealedPrivatePaymentIds.includes(payment.id);
            const canViewPrivateForCurrentWallet = !!wallet.address && !!privateDetails && payment.toWallet === wallet.address;
            const isPrivateVisible = isMagicPrivateSource
              ? canViewPrivateForCurrentWallet && Boolean(revealedMagicMemo)
              : isRevealed && canViewPrivateForCurrentWallet;
            const privateStatus = getPrivateVisibilityStatus(isPrivateVisible, Boolean(privateDetails));
            const token = payment.tokenSymbol;
            const isLoadingReveal = revealingPaymentId === payment.id;
            const canAttemptReveal =
              Boolean(privateDetails) &&
              !isPrivateVisible &&
              (!isMagicPrivateSource || permissionAccessState !== "denied");
            const revealButtonLabel = isLoadingReveal
              ? t("inbox_revealing")
              : isPrivateVisible
                ? t("inbox_details_revealed")
                : privateStatus === "unavailable"
                  ? "Details unavailable"
                  : isMagicPrivateSource && permissionAccessState === "checking"
                    ? "Checking MagicBlock access..."
                    : isMagicPrivateSource && permissionAccessState === "denied"
                      ? "Blocked by MagicBlock permission"
                      : isMagicPrivateSource && permissionAccessState === "error"
                        ? "Retry MagicBlock reveal"
                  : isMagicPrivateSource
                    ? "Reveal via MagicBlock"
                    : t("inbox_reveal_details");

            return (
              <Card
                key={payment.id}
                className="animate-fade-up"
                style={{ animationDelay: `${index * 70}ms`, animationFillMode: "both" }}
              >
                <CardContent className="grid grid-cols-1 gap-4 p-4 sm:p-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={publicStatusBadgeVariant[payment.status]}>{payment.status}</Badge>
                      <Badge variant="outline">{payment.settlementRail}</Badge>
                      <Badge variant="outline">{payment.tokenSymbol}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatDate(payment.createdAt, locale)}</p>
                    <p className="text-sm text-muted-foreground">
                      from: {shortenAddress(payment.fromWallet)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      to: {shortenAddress(payment.toWallet)}
                    </p>
                    {payment.erLifecycle ? (
                      <p className="text-xs text-muted-foreground">ER: {formatErStatus(payment.erLifecycle.status)}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copySignature(payment.id, payment.txSignature)}
                        disabled={!payment.txSignature}
                        className="w-full sm:w-auto"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        {copiedSignatureByPaymentId[payment.id] ? t("common_copied") : copy.copySignature}
                      </Button>
                      {payment.txSignature ? (
                        <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
                          <a href={getExplorerTxUrl(payment.txSignature)} target="_blank" rel="noreferrer">
                            {shortenSignature(payment.txSignature)}
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="glass-panel min-w-0 rounded-2xl p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">private</Badge>
                      <Badge variant={privateStatus === "revealed" ? "default" : privateStatus === "locked" ? "secondary" : "outline"}>
                        {privateStatus}
                      </Badge>
                      {isMagicPrivateSource ? (
                        <Badge variant={permissionAccessState === "granted" ? "default" : permissionAccessState === "denied" ? "secondary" : "outline"}>
                          {permissionAccessLabel[permissionAccessState]}
                        </Badge>
                      ) : null}
                    </div>
                    {isMagicPrivateSource ? (
                      <p className="text-xs text-muted-foreground">
                        MagicBlock access: {permissionAccessLabel[permissionAccessState]}
                      </p>
                    ) : null}
                    <div className="space-y-2">
                      <p className="text-sm text-foreground">
                        {t("inbox_amount")}: {isPrivateVisible && privateDetails ? formatAmount(privateDetails.amount, token) : "****"}
                      </p>
                      <p className="break-words text-sm text-foreground">
                        {t("inbox_private_note")}:{" "}
                        {isPrivateVisible && privateDetails
                          ? isMagicPrivateSource
                            ? revealedMagicMemo
                            : privateDetails.note
                          : "**********"}
                      </p>
                    </div>
                    {!isPrivateVisible ? <p className="mt-2 text-xs text-muted-foreground">{t("inbox_reveal_hint")}</p> : null}
                    {isPrivateVisible ? (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs text-primary">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {t("inbox_revealed_from_private")}
                      </div>
                    ) : null}

                    <Button
                      className="mt-4 w-full sm:w-auto"
                      variant={isPrivateVisible ? "outline" : "secondary"}
                      disabled={!canAttemptReveal || isLoadingReveal}
                      onClick={() =>
                        handleReveal(
                          payment.id,
                          privateDetails?.source ?? "local-note",
                          privateDetails?.magicPrivateTxSignature ?? payment.txSignature,
                          payment.erLifecycle?.permissionedAccount ?? null
                        )
                      }
                    >
                      {isLoadingReveal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {revealButtonLabel}
                    </Button>

                    {revealErrors[payment.id] ? (
                      <div className="mt-2 rounded-xl border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                        <p>{revealErrors[payment.id]}</p>
                        {!isPrivateVisible ? (
                          <p className="mt-1 inline-flex items-center gap-1 text-muted-foreground">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            {copy.accessDenied}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}


