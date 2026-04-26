"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { AlertTriangle, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { appConfig, getExplorerTxUrl } from "@/lib/app-config";
import { useLocale } from "@/components/providers/locale-provider";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatAmount, formatDate, formatPaylinkDisplayName, shortenAddress, shortenSignature } from "@/lib/format";
import {
  getMagicTransactionFallbackReasonLabel,
  sendRoutedTransaction,
  type RoutedTransactionResolution
} from "@/lib/magicblock-transaction";
import {
  buildMagicPrivateTransferTransaction,
  resolvePrivateApiCluster,
  sendMagicPrivateTransferTransaction,
  toTokenBaseUnits
} from "@/lib/magicblock-private-payments";
import {
  commitAndUndelegatePermissionForPayment,
  createCommittedUndelegatedErPermissionState,
  createCommittingErPermissionState,
  createDelegatingErPermissionState,
  createDisabledErPermissionState,
  createErPermissionFailureState,
  delegatePermissionForPayment,
  fetchPermissionAuthorizedUsers,
  type ErPermissionLifecycleState
} from "@/lib/magicblock-er-permission";
import { useWhisperPayStore } from "@/store/whisperpay-store";
import { type PaymentSettlementRail, type Paylink, type PublicPaymentStatus, type TokenSymbol } from "@/types/whisperpay";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const DEMO_FALLBACK_RECIPIENT_WALLET = "9f8Qa8z9wSe9YqM7hK7ivB2xE8a4u6pJmN3tYv4dR2q";

const runtimeCopy = {
  en: {
    providerMissing: "Wallet provider is unavailable. Install Phantom or choose a wallet.",
    sameWallet: "Sender and receiver wallet cannot be the same.",
    rejected: "Transaction was rejected in wallet.",
    network: "Network or wallet is not responding. Please retry.",
    unknown: "Transaction failed. Please try again.",
    realSolHint: "Real transfer currently supports SOL only. Private note stays in app-level confidential layer.",
    erDesc: "Public payment intent, tx status, sender/receiver, and tx signature are tracked here.",
    privacyHint: "Public SOL lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    txSignature: "txSignature",
    copySignature: "Copy signature",
    openExplorer: "Open explorer",
    paymentLinkFallback: "Payment link",
    receiptTitle: "Payment receipt",
    receiptHint: "Real SOL transfer sent. Public metadata is visible on-chain, private note stays in app-level confidential layer.",
    recipient: "recipient",
    sentAt: "sentAt",
    demoMode: "Sandbox preview",
    liveMode: "Live transfer",
    demoModeHint: "Preview only: no wallet connection required and no on-chain transfer is sent.",
    demoSender: "Demo sender",
    demoTransferHint: "This preview simulates the paylink flow and reveal behavior.",
    demoSending: "Processing preview...",
    demoSubmit: "Run sandbox send",
    demoReceiptTitle: "Sandbox receipt",
    demoReceiptHint: "Preview result only. No live SOL transfer was sent.",
    demoStatus: "preview-simulated",
    demoPublicCreated: "Preview payment intent saved in local state.",
    demoPrivateSaved: "Preview private note saved as reveal-gated local data."
  },
  ru: {
    providerMissing: "Провайдер кошелька недоступен. Установите Phantom или выберите другой кошелек.",
    sameWallet: "Кошелек отправителя и получателя не может совпадать.",
    rejected: "Транзакция была отклонена в кошельке.",
    network: "Сеть или кошелек не отвечают. Повторите попытку.",
    unknown: "Транзакция не выполнена. Попробуйте еще раз.",
    realSolHint: "Сейчас поддерживаются только реальные переводы SOL. Приватная заметка хранится отдельно в конфиденциальном слое приложения.",
    erDesc: "Здесь фиксируются публичный intent-платеж, статус транзакции, кошельки отправителя и получателя, а также подпись tx.",
    privacyHint: "Public SOL lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    txSignature: "txSignature",
    copySignature: "Копировать подпись",
    openExplorer: "Открыть Explorer",
    paymentLinkFallback: "Платежная ссылка",
    receiptTitle: "Квитанция платежа",
    receiptHint: "Реальный SOL-перевод отправлен. Публичные метаданные видны on-chain, приватная заметка остается в конфиденциальном слое приложения.",
    recipient: "получатель",
    sentAt: "время отправки",
    demoMode: "Sandbox preview",
    liveMode: "Live transfer",
    demoModeHint: "Preview only: no wallet connection required and no on-chain transfer is sent.",
    demoSender: "Демо-отправитель",
    demoTransferHint: "This preview simulates the paylink flow and reveal behavior.",
    demoSending: "Processing preview...",
    demoSubmit: "Run sandbox send",
    demoReceiptTitle: "Sandbox receipt",
    demoReceiptHint: "Preview result only. No live SOL transfer was sent.",
    demoStatus: "preview-simulated",
    demoPublicCreated: "Preview payment intent saved in local state.",
    demoPrivateSaved: "Preview private note saved as reveal-gated local data."
  },
  de: {
    providerMissing: "Wallet-Provider ist nicht verfuegbar. Installiere Phantom oder waehle ein Wallet.",
    sameWallet: "Sender- und Empfaenger-Wallet duerfen nicht identisch sein.",
    rejected: "Transaktion wurde im Wallet abgelehnt.",
    network: "Netzwerk oder Wallet antwortet nicht. Bitte erneut versuchen.",
    unknown: "Transaktion fehlgeschlagen. Bitte erneut versuchen.",
    realSolHint: "Echte Transfers unterstuetzen aktuell nur SOL. Die private Notiz bleibt in einem vertraulichen App-Layer.",
    erDesc: "Hier werden der oeffentliche Payment-Intent, tx-Status, Sender/Empfaenger und die tx-Signatur verfolgt.",
    privacyHint: "Public SOL lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    txSignature: "txSignature",
    copySignature: "Signatur kopieren",
    openExplorer: "Explorer oeffnen",
    paymentLinkFallback: "Payment-Link",
    receiptTitle: "Zahlungsbeleg",
    receiptHint: "Echter SOL-Transfer wurde gesendet. Oeffentliche Metadaten sind on-chain sichtbar, die private Notiz bleibt im vertraulichen App-Layer.",
    recipient: "Empfaenger",
    sentAt: "gesendet um",
    demoMode: "Sandbox preview",
    liveMode: "Live transfer",
    demoModeHint: "Preview only: no wallet connection required and no on-chain transfer is sent.",
    demoSender: "Demo-Sender",
    demoTransferHint: "This preview simulates the paylink flow and reveal behavior.",
    demoSending: "Processing preview...",
    demoSubmit: "Run sandbox send",
    demoReceiptTitle: "Sandbox receipt",
    demoReceiptHint: "Preview result only. No live SOL transfer was sent.",
    demoStatus: "preview-simulated",
    demoPublicCreated: "Preview payment intent saved in local state.",
    demoPrivateSaved: "Preview private note saved as reveal-gated local data."
  },
  zh: {
    providerMissing: "钱包提供器不可用。请安装 Phantom 或选择其他钱包。",
    sameWallet: "发送方和接收方钱包不能相同。",
    rejected: "交易已在钱包中被拒绝。",
    network: "网络或钱包无响应，请重试。",
    unknown: "交易失败，请重试。",
    realSolHint: "当前仅支持真实 SOL 转账。私密备注会单独保存在应用层机密层。",
    erDesc: "这里会记录公共支付 intent、交易状态、发送方/接收方钱包和 tx 签名。",
    privacyHint: "Public SOL lane metadata is on-chain; MagicBlock private lane reveal uses authenticated private access.",
    txSignature: "txSignature",
    copySignature: "复制签名",
    openExplorer: "打开 Explorer",
    paymentLinkFallback: "支付链接",
    receiptTitle: "支付回执",
    receiptHint: "真实 SOL 转账已发送。公共元数据会在链上可见，私密备注仍保留在应用层机密层。",
    recipient: "收款人",
    sentAt: "发送时间",
    demoMode: "Sandbox preview",
    liveMode: "Live transfer",
    demoModeHint: "Preview only: no wallet connection required and no on-chain transfer is sent.",
    demoSender: "演示发送方",
    demoTransferHint: "This preview simulates the paylink flow and reveal behavior.",
    demoSending: "Processing preview...",
    demoSubmit: "Run sandbox send",
    demoReceiptTitle: "Sandbox receipt",
    demoReceiptHint: "Preview result only. No live SOL transfer was sent.",
    demoStatus: "preview-simulated",
    demoPublicCreated: "Preview payment intent saved in local state.",
    demoPrivateSaved: "Preview private note saved as reveal-gated local data."
  }
} as const;

type RuntimeCopy = (typeof runtimeCopy)[keyof typeof runtimeCopy];
type PaymentRail = PaymentSettlementRail;
type LiveSendPhase =
  | "idle"
  | "delegating-er"
  | "building-private"
  | "resolving-route"
  | "awaiting-wallet"
  | "submitting-router"
  | "confirming"
  | "committing-er";

const liveSendPhaseText: Record<LiveSendPhase, string> = {
  idle: "Preparing transaction...",
  "delegating-er": "Delegating payment permission state into MagicBlock ER...",
  "building-private": "Building private transfer transaction via MagicBlock...",
  "resolving-route": "Resolving MagicBlock route...",
  "awaiting-wallet": "Awaiting wallet approval...",
  "submitting-router": "Submitting via MagicBlock router...",
  confirming: "Confirming transaction...",
  "committing-er": "Committing and undelegating ER payment state..."
};

const statusBadgeVariantByPublicStatus: Record<PublicPaymentStatus, "default" | "secondary" | "outline"> = {
  sent: "default",
  pending: "outline",
  failed: "secondary"
};

const erLifecycleBadgeVariant: Record<
  NonNullable<ErPermissionLifecycleState["status"]>,
  "default" | "secondary" | "outline"
> = {
  disabled: "outline",
  delegating: "outline",
  delegated: "secondary",
  committing: "outline",
  "committed-undelegated": "default",
  "delegation-failed": "secondary",
  "commit-failed": "secondary"
};

const railLabel: Record<PaymentRail, string> = {
  "sol-public": "Public SOL",
  "magicblock-private-spl": "MagicBlock Private SPL"
};

const describeRouting = (
  routing: RoutedTransactionResolution | null,
  routerEnabled: boolean
): string => {
  if (!routing) {
    return routerEnabled
      ? "MagicBlock router SDK path is enabled. Wallet-adapter fallback is ready."
      : "MagicBlock route is disabled. Solana RPC path is active.";
  }

  if (routing.source === "magicblock-sdk-router") {
    if (routing.fallbackReason === "router-confirmation-failed") {
      return "MagicBlock router send path active. Confirmation finalized via fallback RPC.";
    }

    return `MagicBlock router send path active (${routing.writableAccounts.length} writable accounts routed).`;
  }

  return `Wallet-adapter fallback path used (${getMagicTransactionFallbackReasonLabel(routing.fallbackReason)}).`;
};

const formatErLifecycleStatus = (status: ErPermissionLifecycleState["status"]): string =>
  status.replace(/-/g, " ");

const resolveTxError = (error: unknown, copy: RuntimeCopy): string => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("insufficient")) {
    return "Insufficient SOL balance for transfer and fees.";
  }

  if (message.includes("blockheight") || message.includes("expired")) {
    return "Transaction expired before confirmation. Please retry.";
  }

  if (
    message.includes("reject") ||
    message.includes("decline") ||
    message.includes("denied") ||
    message.includes("cancel")
  ) {
    return copy.rejected;
  }

  if (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("blockhash") ||
    message.includes("rpc")
  ) {
    return copy.network;
  }

  return copy.unknown;
};

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const paylinkId = Array.isArray(params.id) ? params.id[0] : params.id;
  const isDemoMode = searchParams.get("mode") === "demo";
  const { connection } = useConnection();
  const {
    connected: walletConnected,
    publicKey: walletPublicKey,
    signTransaction,
    sendTransaction,
    wallet: walletProvider
  } = useWallet();

  const wallet = useWhisperPayStore((state) => state.wallet);
  const paylinks = useWhisperPayStore((state) => state.paylinks);
  const publicPayments = useWhisperPayStore((state) => state.publicPayments);
  const createPublicPaymentIntent = useWhisperPayStore((state) => state.createPublicPaymentIntent);
  const updatePublicPaymentStatus = useWhisperPayStore((state) => state.updatePublicPaymentStatus);
  const updatePublicPaymentErLifecycle = useWhisperPayStore((state) => state.updatePublicPaymentErLifecycle);
  const updatePublicPaymentMagicPrivate = useWhisperPayStore((state) => state.updatePublicPaymentMagicPrivate);
  const storePrivatePaymentDetails = useWhisperPayStore((state) => state.storePrivatePaymentDetails);
  const { t, locale } = useLocale();
  const copy = runtimeCopy[locale];

  const paylink = useMemo(
    () => paylinks.find((item) => item.id === paylinkId && item.isActive),
    [paylinks, paylinkId]
  );
  const demoFallbackPaylink = useMemo<Paylink | null>(() => {
    if (!isDemoMode) {
      return null;
    }

    return {
      id: paylinkId || "demo_paylink_preview",
      ownerWallet: DEMO_FALLBACK_RECIPIENT_WALLET,
      nickname: "sandbox preview",
      defaultToken: "SOL",
      createdAt: new Date(0).toISOString(),
      isActive: true
    };
  }, [isDemoMode, paylinkId]);
  const activePaylink = paylink ?? demoFallbackPaylink;

  const [amount, setAmount] = useState("15");
  const [note, setNote] = useState("Private note for recipient only");
  const [paymentRail, setPaymentRail] = useState<PaymentRail>("sol-public");
  const [result, setResult] = useState<{
    paymentId: string;
    createdAt: string;
    txSignature: string | null;
    amount: number;
    tokenSymbol: TokenSymbol;
    settlementRail: PaymentRail;
    recipientName: string;
    recipientWallet: string;
    routing: RoutedTransactionResolution | null;
    erLifecycle: ErPermissionLifecycleState | null;
    erAuthorizedUsers: string[] | null;
    isDemo: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [liveSendPhase, setLiveSendPhase] = useState<LiveSendPhase>("idle");
  const [latestRouting, setLatestRouting] = useState<RoutedTransactionResolution | null>(null);
  const [copiedPaymentId, setCopiedPaymentId] = useState(false);
  const [copiedSignature, setCopiedSignature] = useState(false);

  const senderWallet = walletPublicKey?.toBase58() ?? wallet.address ?? "";
  const connectionEndpoint = (connection as { rpcEndpoint?: string }).rpcEndpoint ?? appConfig.solana.walletRpcUrl;

  const latestPublicStatus = useMemo(() => {
    if (!result || result.isDemo) {
      return null;
    }

    return publicPayments.find((item) => item.id === result.paymentId)?.status ?? null;
  }, [publicPayments, result]);

  const recipientDisplayName = activePaylink
    ? formatPaylinkDisplayName(activePaylink.nickname, activePaylink.ownerWallet, copy.paymentLinkFallback)
    : copy.paymentLinkFallback;

  const demoInboxHref = useMemo(() => {
    if (!result?.isDemo) {
      return "/inbox";
    }

    const params = new URLSearchParams({
      mode: "demo",
      paymentId: result.paymentId,
      createdAt: result.createdAt,
      amount: String(result.amount),
      note: note.trim() || "Private note for recipient (sandbox preview).",
      fromWallet: "demo_sender_wallet",
      toWallet: result.recipientWallet,
      recipient: result.recipientName,
      status: copy.demoStatus
    });

    return `/inbox?${params.toString()}`;
  }, [copy.demoStatus, note, result]);

  const activeRouting = result && !result.isDemo ? result.routing : latestRouting;
  const routingSummary = isDemoMode ? null : describeRouting(activeRouting, appConfig.solana.magicRouterEnabled);
  const selectedTokenSymbol: TokenSymbol = paymentRail === "magicblock-private-spl" ? "USDC" : "SOL";
  const activeInputTokenSymbol: TokenSymbol = isDemoMode ? "SOL" : selectedTokenSymbol;
  const privateRailAvailable = appConfig.solana.magicPrivateEnabled;
  const parsedAmount = Number(amount);
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isSubmitDisabled = submitting || (!isDemoMode && !walletConnected) || !hasValidAmount;

  useEffect(() => {
    if (!activePaylink) {
      return;
    }

    if (activePaylink.defaultToken === "USDC" && privateRailAvailable) {
      setPaymentRail("magicblock-private-spl");
      return;
    }

    setPaymentRail("sol-public");
  }, [activePaylink, privateRailAvailable]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!activePaylink || submitting) {
      return;
    }

    const parsedAmountValue = Number(amount);
    if (!Number.isFinite(parsedAmountValue) || parsedAmountValue <= 0) {
      setError(t("pay_error_amount"));
      return;
    }

    const lamports = Math.round(parsedAmountValue * LAMPORTS_PER_SOL);
    if (lamports <= 0) {
      setError(t("pay_error_amount"));
      return;
    }

    setLatestRouting(null);

    if (isDemoMode) {
      setSubmitting(true);
      setLiveSendPhase("idle");
      setError(null);
      await wait(240);
      setResult({
        paymentId: `demo_${Date.now().toString(36)}`,
        createdAt: new Date().toISOString(),
        txSignature: null,
        amount: parsedAmountValue,
        tokenSymbol: "SOL",
        settlementRail: "sol-public",
        recipientName: recipientDisplayName,
        recipientWallet: activePaylink.ownerWallet,
        routing: null,
        erLifecycle: createDisabledErPermissionState(),
        erAuthorizedUsers: null,
        isDemo: true
      });
      setSubmitting(false);
      setLiveSendPhase("idle");
      return;
    }

    if (!walletConnected || !walletPublicKey) {
      setError(t("pay_error_connect_wallet"));
      return;
    }

    if (!walletProvider) {
      setError(copy.providerMissing);
      return;
    }

    if (walletPublicKey.toBase58() === activePaylink.ownerWallet) {
      setError(copy.sameWallet);
      return;
    }

    setSubmitting(true);
    setError(null);
    setLiveSendPhase(appConfig.solana.erPermissionLifecycleEnabled ? "delegating-er" : "resolving-route");

    const publicIntent = createPublicPaymentIntent({
      paylinkId: activePaylink.id,
      fromWallet: senderWallet,
      settlementRail: paymentRail,
      tokenSymbol: selectedTokenSymbol,
      magicPrivate:
        paymentRail === "magicblock-private-spl"
          ? {
              enabled: true,
              visibility: "private",
              mint: appConfig.solana.magicPrivateMint,
              sendTarget: null,
              txBuilderSource: null
            }
          : null
    });

    if (!publicIntent) {
      setError(t("pay_error_public"));
      setSubmitting(false);
      setLiveSendPhase("idle");
      return;
    }

    try {
      let erLifecycleState: ErPermissionLifecycleState | null = appConfig.solana.erPermissionLifecycleEnabled
        ? createDelegatingErPermissionState()
        : createDisabledErPermissionState();
      let erAuthorizedUsers: string[] | null = null;
      let delegatedPermissionSigner: Awaited<ReturnType<typeof delegatePermissionForPayment>>["signer"] | null = null;

      if (appConfig.solana.erPermissionLifecycleEnabled) {
        updatePublicPaymentErLifecycle({
          paymentId: publicIntent.id,
          erLifecycle: erLifecycleState
        });

        if (!signTransaction) {
          const unsupportedWalletError = "Wallet does not expose signTransaction required for ER lifecycle.";
          erLifecycleState = createErPermissionFailureState("delegation-failed", unsupportedWalletError, erLifecycleState);

          updatePublicPaymentErLifecycle({
            paymentId: publicIntent.id,
            erLifecycle: erLifecycleState
          });

          if (appConfig.solana.erPermissionLifecycleRequired) {
            throw new Error(`ER lifecycle is required: ${unsupportedWalletError}`);
          }
        } else {
          try {
            const delegationResult = await delegatePermissionForPayment({
              authorityWallet: walletPublicKey,
              recipientWallet: new PublicKey(activePaylink.ownerWallet),
              connection,
              primaryRpcUrl: connectionEndpoint,
              fallbackRpcUrl: appConfig.solana.fallbackRpcUrl,
              routerRpcUrl: appConfig.solana.magicRouterRpcUrl,
              routerEnabled: appConfig.solana.magicRouterEnabled,
              routerTimeoutMs: appConfig.solana.magicRouterTimeoutMs,
              signTransaction,
              sendFallbackTransaction: async (transactionForFallback, signer) => {
                transactionForFallback.partialSign(signer);
                const signedByWallet = await signTransaction(transactionForFallback);
                return connection.sendRawTransaction(signedByWallet.serialize(), {
                  preflightCommitment: "confirmed"
                });
              }
            });

            delegatedPermissionSigner = delegationResult.signer;
            erLifecycleState = delegationResult.state;
            setLatestRouting(delegationResult.routing);

            updatePublicPaymentErLifecycle({
              paymentId: publicIntent.id,
              erLifecycle: erLifecycleState
            });
          } catch (delegationError) {
            const delegationMessage = resolveTxError(delegationError, copy);
            erLifecycleState = createErPermissionFailureState("delegation-failed", delegationMessage, erLifecycleState);

            updatePublicPaymentErLifecycle({
              paymentId: publicIntent.id,
              erLifecycle: erLifecycleState
            });

            if (appConfig.solana.erPermissionLifecycleRequired) {
              throw new Error(`ER delegation required but failed: ${delegationMessage}`);
            }
          }
        }
      }

      let signature: string;
      let routedSendResult: { routing: RoutedTransactionResolution };

      if (paymentRail === "magicblock-private-spl") {
        if (!privateRailAvailable) {
          throw new Error("MagicBlock private rail is disabled by config.");
        }

        if (!signTransaction) {
          throw new Error("Wallet does not support signTransaction required for private rail.");
        }

        setLiveSendPhase("building-private");
        const preparedPrivateTransfer = await buildMagicPrivateTransferTransaction({
          apiBaseUrl: appConfig.solana.magicPrivateApiUrl,
          cluster: resolvePrivateApiCluster(appConfig.solana.network),
          senderWallet: walletPublicKey,
          recipientWallet: new PublicKey(activePaylink.ownerWallet),
          mint: new PublicKey(appConfig.solana.magicPrivateMint),
          amountBaseUnits: toTokenBaseUnits(parsedAmountValue, appConfig.solana.magicPrivateTokenDecimals),
          memo: note.trim() || null
        });

        updatePublicPaymentMagicPrivate({
          paymentId: publicIntent.id,
          magicPrivate: {
            enabled: true,
            visibility: preparedPrivateTransfer.visibility,
            mint: preparedPrivateTransfer.mint,
            sendTarget: preparedPrivateTransfer.sendTarget,
            txBuilderSource: preparedPrivateTransfer.txBuilderSource
          }
        });

        const privateSendResult = await sendMagicPrivateTransferTransaction({
          prepared: preparedPrivateTransfer,
          primaryConnection: connection,
          primaryRpcUrl: connectionEndpoint,
          fallbackRpcUrl: appConfig.solana.fallbackRpcUrl,
          routerRpcUrl: appConfig.solana.magicRouterRpcUrl,
          routerEnabled: appConfig.solana.magicRouterEnabled,
          routerTimeoutMs: appConfig.solana.magicRouterTimeoutMs,
          signTransaction,
          sendFallbackTransaction: async (transactionForFallback) =>
            sendTransaction(transactionForFallback, connection, {
              preflightCommitment: "confirmed"
            }),
          onStageChange: (stage) => setLiveSendPhase(stage)
        });

        signature = privateSendResult.signature;
        routedSendResult = { routing: privateSendResult.routing };
      } else {
        const transferTransaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: walletPublicKey,
            toPubkey: new PublicKey(activePaylink.ownerWallet),
            lamports
          })
        );

        transferTransaction.feePayer = walletPublicKey;
        const publicSendResult = await sendRoutedTransaction({
          transaction: transferTransaction,
          primaryConnection: connection,
          primaryRpcUrl: connectionEndpoint,
          fallbackRpcUrl: appConfig.solana.fallbackRpcUrl,
          routerRpcUrl: appConfig.solana.magicRouterRpcUrl,
          routerEnabled: appConfig.solana.magicRouterEnabled,
          routerTimeoutMs: appConfig.solana.magicRouterTimeoutMs,
          commitment: "confirmed",
          signTransaction,
          sendFallbackTransaction: async (transactionForFallback) =>
            sendTransaction(transactionForFallback, connection, {
              preflightCommitment: "confirmed"
            }),
          onStageChange: (stage) => setLiveSendPhase(stage)
        });

        signature = publicSendResult.signature;
        routedSendResult = { routing: publicSendResult.routing };
      }

      setLatestRouting(routedSendResult.routing);
      updatePublicPaymentStatus(publicIntent.id, "sent", signature);

      if (
        erLifecycleState?.enabled &&
        erLifecycleState.status === "delegated" &&
        erLifecycleState.permissionedAccount
      ) {
        erAuthorizedUsers = await fetchPermissionAuthorizedUsers(
          appConfig.solana.magicRouterRpcUrl,
          erLifecycleState.permissionedAccount
        );

        if (appConfig.solana.erPermissionAutoCommitEnabled && delegatedPermissionSigner && signTransaction) {
          setLiveSendPhase("committing-er");
          erLifecycleState = createCommittingErPermissionState(erLifecycleState);

          updatePublicPaymentErLifecycle({
            paymentId: publicIntent.id,
            erLifecycle: erLifecycleState
          });

          try {
            const commitResult = await commitAndUndelegatePermissionForPayment({
              authorityWallet: walletPublicKey,
              permissionedAccountSigner: delegatedPermissionSigner,
              connection,
              primaryRpcUrl: connectionEndpoint,
              fallbackRpcUrl: appConfig.solana.fallbackRpcUrl,
              routerRpcUrl: appConfig.solana.magicRouterRpcUrl,
              routerEnabled: appConfig.solana.magicRouterEnabled,
              routerTimeoutMs: appConfig.solana.magicRouterTimeoutMs,
              signTransaction,
              sendFallbackTransaction: async (transactionForFallback, signer) => {
                transactionForFallback.partialSign(signer);
                const signedByWallet = await signTransaction(transactionForFallback);
                return connection.sendRawTransaction(signedByWallet.serialize(), {
                  preflightCommitment: "confirmed"
                });
              }
            });

            erLifecycleState = createCommittedUndelegatedErPermissionState(erLifecycleState, commitResult.signature);

            updatePublicPaymentErLifecycle({
              paymentId: publicIntent.id,
              erLifecycle: erLifecycleState
            });
          } catch (commitError) {
            const commitMessage = resolveTxError(commitError, copy);
            erLifecycleState = createErPermissionFailureState("commit-failed", commitMessage, erLifecycleState);

            updatePublicPaymentErLifecycle({
              paymentId: publicIntent.id,
              erLifecycle: erLifecycleState
            });

            if (appConfig.solana.erPermissionLifecycleRequired) {
              setError(
                `Payment sent but ER commit/undelegate failed: ${commitMessage}. Use this payment ID for recovery: ${publicIntent.id}`
              );
            }
          }
        }
      }

      const privateDetails = storePrivatePaymentDetails({
        paymentId: publicIntent.id,
        amount: parsedAmountValue,
        note: paymentRail === "magicblock-private-spl" ? "(MagicBlock private memo)" : note,
        canRevealWallets: [activePaylink.ownerWallet],
        source: paymentRail === "magicblock-private-spl" ? "magicblock-private-memo" : "local-note",
        magicPrivateTxSignature: paymentRail === "magicblock-private-spl" ? signature : null
      });

      if (!privateDetails) {
        setError(t("pay_error_private"));
        setSubmitting(false);
        return;
      }

      setResult({
        paymentId: publicIntent.id,
        createdAt: publicIntent.createdAt,
        txSignature: signature,
        amount: parsedAmountValue,
        tokenSymbol: selectedTokenSymbol,
        settlementRail: paymentRail,
        recipientName: recipientDisplayName,
        recipientWallet: activePaylink.ownerWallet,
        routing: routedSendResult.routing,
        erLifecycle: erLifecycleState,
        erAuthorizedUsers,
        isDemo: false
      });
    } catch (txError) {
      updatePublicPaymentStatus(publicIntent.id, "failed", null);
      setError(resolveTxError(txError, copy));
    } finally {
      setSubmitting(false);
      setLiveSendPhase("idle");
    }
  };

  const copyPaymentId = async () => {
    if (!result) {
      return;
    }

    await navigator.clipboard.writeText(result.paymentId);
    setCopiedPaymentId(true);
    setTimeout(() => setCopiedPaymentId(false), 1200);
  };

  const copyTxSignature = async () => {
    if (!result?.txSignature) {
      return;
    }

    await navigator.clipboard.writeText(result.txSignature);
    setCopiedSignature(true);
    setTimeout(() => setCopiedSignature(false), 1200);
  };

  if (!activePaylink) {
    return (
      <Card className="mx-auto mt-6 max-w-3xl">
        <CardHeader>
          <Badge variant="outline" className="mb-3 w-fit">
            {t("pay_invalid_link")}
          </Badge>
          <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl">
            <AlertTriangle className="h-6 w-6 text-accent" />
            {t("pay_not_found_title")}
          </CardTitle>
          <CardDescription>{t("pay_not_found_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button asChild variant="secondary" className="w-full sm:w-auto">
            <Link href="/">{t("pay_go_home")}</Link>
          </Button>
          <Button asChild className="w-full sm:w-auto">
            <Link href="/create">{t("pay_create_paylink")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="break-words text-2xl sm:text-3xl">
            {t("pay_title_prefix")} {recipientDisplayName}
          </CardTitle>
          <CardDescription>Choose a lane, confirm amount, send.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          {isDemoMode ? (
            <p className="text-sm text-muted-foreground">{copy.demoModeHint}</p>
          ) : !walletConnected ? (
            <div className="rounded-xl border border-border/70 bg-card/72 p-3">
              <p className="mb-3 text-sm text-muted-foreground">{t("pay_connect_prompt")}</p>
              <ConnectWalletButton size="sm" />
            </div>
          ) : null}

          <p className="break-words text-sm text-muted-foreground">
            {t("pay_from_wallet")}:{" "}
            {isDemoMode
              ? copy.demoSender
              : senderWallet
                ? shortenAddress(senderWallet)
                : t("pay_connect_required")}{" "}
            | {t("pay_to_wallet")}: {shortenAddress(activePaylink.ownerWallet)}
          </p>

          {!isDemoMode ? (
            <p className="text-xs text-muted-foreground">
              Lane: {railLabel[paymentRail]} | Network: {appConfig.solana.network}
            </p>
          ) : null}

          <form onSubmit={submit} className="space-y-4">
            {!isDemoMode ? (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Settlement rail</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant={paymentRail === "sol-public" ? "default" : "outline"}
                    onClick={() => setPaymentRail("sol-public")}
                  >
                    Public SOL
                  </Button>
                  <Button
                    type="button"
                    variant={paymentRail === "magicblock-private-spl" ? "default" : "outline"}
                    onClick={() => setPaymentRail("magicblock-private-spl")}
                    disabled={!privateRailAvailable}
                  >
                    MagicBlock Private SPL
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">
                {t("pay_amount")} ({activeInputTokenSymbol})
              </label>
              <Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0.01" step="0.01" />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">{t("pay_private_note")}</label>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
              <p className="text-xs text-muted-foreground">
                {paymentRail === "magicblock-private-spl"
                  ? "Private lane: memo reveal is permission-checked in inbox."
                  : "Public lane: note stays app-side and reveal-gated in inbox."}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-card/72 p-3 text-sm text-muted-foreground">
              {t("pay_amount")}: {hasValidAmount ? formatAmount(parsedAmount, activeInputTokenSymbol) : "--"}
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={isSubmitDisabled}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {submitting
                ? isDemoMode
                  ? copy.demoSending
                  : liveSendPhaseText[liveSendPhase]
                : isDemoMode
                  ? copy.demoSubmit
                  : t("pay_send_privately")}
            </Button>
            {!hasValidAmount ? <p className="text-xs text-muted-foreground">{t("pay_error_amount")}</p> : null}
            {submitting && !isDemoMode ? (
              <p className="text-xs text-muted-foreground">Status: {liveSendPhaseText[liveSendPhase]}</p>
            ) : null}
          </form>

          {result ? (
            <div className="space-y-3 rounded-xl border border-primary/35 bg-primary/10 p-4">
              <div className="flex flex-wrap items-center gap-2 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <p className="text-sm font-medium">{result.isDemo ? copy.demoReceiptTitle : copy.receiptTitle}</p>
                {!result.isDemo ? <Badge variant="outline">{railLabel[result.settlementRail]}</Badge> : null}
                {!result.isDemo ? (
                  <Badge variant={statusBadgeVariantByPublicStatus[latestPublicStatus ?? "pending"]}>
                    {latestPublicStatus ?? "pending"}
                  </Badge>
                ) : null}
                {!result.isDemo && result.erLifecycle ? (
                  <Badge variant={erLifecycleBadgeVariant[result.erLifecycle.status]}>
                    ER {formatErLifecycleStatus(result.erLifecycle.status)}
                  </Badge>
                ) : null}
              </div>

              <p className="text-sm text-muted-foreground">
                {t("pay_amount")}: {formatAmount(result.amount, result.tokenSymbol)}
              </p>
              <p className="text-sm text-muted-foreground">
                {copy.sentAt}: {formatDate(result.createdAt, locale)}
              </p>
              {result.txSignature ? (
                <p className="text-sm text-muted-foreground">
                  {copy.txSignature}: {shortenSignature(result.txSignature)}
                </p>
              ) : null}
              {routingSummary ? <p className="text-xs text-muted-foreground">Routing: {routingSummary}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={copyPaymentId} className="w-full sm:w-auto">
                  <Copy className="h-4 w-4" />
                  {copiedPaymentId ? t("common_copied") : t("pay_copy_payment_id")}
                </Button>
                <Button variant="secondary" onClick={copyTxSignature} disabled={!result.txSignature} className="w-full sm:w-auto">
                  <Copy className="h-4 w-4" />
                  {copiedSignature ? t("common_copied") : copy.copySignature}
                </Button>
                {result.txSignature ? (
                  <Button asChild variant="outline" className="w-full sm:w-auto">
                    <Link href={getExplorerTxUrl(result.txSignature)} target="_blank" rel="noreferrer">
                      {copy.openExplorer}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={result.isDemo ? demoInboxHref : "/inbox"}>{t("pay_open_inbox")}</Link>
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}


