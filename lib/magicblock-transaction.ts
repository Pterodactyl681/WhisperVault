import { type Commitment, Connection, type Signer, Transaction } from "@solana/web3.js";
import { confirmMagicTransaction, getWritableAccounts, prepareMagicTransaction } from "magic-router-sdk";
import {
  getMagicRouterFallbackReasonLabel,
  resolveTransactionBlockhash,
  type MagicRouterFallbackReason
} from "./magicblock-router";

export type MagicTransactionFallbackReason =
  | MagicRouterFallbackReason
  | "router-sign-unsupported"
  | "router-prepare-failed"
  | "router-sign-failed"
  | "router-send-failed"
  | "router-confirmation-failed";

export interface RoutedTransactionResolution {
  source: "magicblock-sdk-router" | "wallet-adapter-fallback";
  blockhashSource: "magicblock-router" | "solana-rpc-fallback";
  sendPath: "magicblock-sdk-router" | "wallet-adapter";
  blockhash: string;
  lastValidBlockHeight: number | null;
  writableAccounts: string[];
  routerRpcUrl: string | null;
  sendRpcUrl: string;
  confirmationRpcUrl: string;
  fallbackReason: MagicTransactionFallbackReason | null;
}

interface SendRoutedTransactionInput {
  transaction: Transaction;
  primaryConnection: Connection;
  primaryRpcUrl: string;
  fallbackRpcUrl?: string | null;
  routerRpcUrl?: string | null;
  routerEnabled?: boolean;
  routerTimeoutMs?: number;
  commitment?: Commitment;
  additionalSigners?: Signer[];
  signTransaction?: ((transaction: Transaction) => Promise<Transaction>) | null;
  sendFallbackTransaction: (transaction: Transaction) => Promise<string>;
  onStageChange?: (stage: "resolving-route" | "awaiting-wallet" | "submitting-router" | "confirming") => void;
}

interface SendRoutedTransactionResult {
  signature: string;
  routing: RoutedTransactionResolution;
}

const DEFAULT_COMMITMENT: Commitment = "confirmed";

const normalizeUrl = (value?: string | null): string | null => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

const confirmSignatureOnConnection = async (
  connection: Connection,
  signature: string,
  commitment: Commitment
): Promise<boolean> => {
  const confirmation = await connection.confirmTransaction(signature, commitment);
  return !confirmation.value.err;
};

const toMagicStageFallbackReason = (
  stage: "prepare" | "sign" | "send" | "confirm"
): MagicTransactionFallbackReason => {
  switch (stage) {
    case "prepare":
      return "router-prepare-failed";
    case "sign":
      return "router-sign-failed";
    case "send":
      return "router-send-failed";
    case "confirm":
      return "router-confirmation-failed";
    default:
      return "router-send-failed";
  }
};

const isUserRejectionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("reject") ||
    message.includes("decline") ||
    message.includes("denied") ||
    message.includes("cancel")
  );
};

export const getMagicTransactionFallbackReasonLabel = (reason: MagicTransactionFallbackReason | null): string => {
  switch (reason) {
    case "router-sign-unsupported":
      return "wallet does not expose signTransaction";
    case "router-prepare-failed":
      return "router preparation failed";
    case "router-sign-failed":
      return "wallet signing failed";
    case "router-send-failed":
      return "router send failed";
    case "router-confirmation-failed":
      return "router confirmation failed";
    default:
      return getMagicRouterFallbackReasonLabel(reason);
  }
};

export const sendRoutedTransaction = async (
  input: SendRoutedTransactionInput
): Promise<SendRoutedTransactionResult> => {
  const {
    transaction,
    primaryConnection,
    primaryRpcUrl,
    fallbackRpcUrl,
    routerRpcUrl,
    routerEnabled = true,
    routerTimeoutMs = 4500,
    commitment = DEFAULT_COMMITMENT,
    additionalSigners = [],
    signTransaction,
    sendFallbackTransaction,
    onStageChange
  } = input;

  const writableAccounts = getWritableAccounts(transaction);
  const normalizedPrimaryRpcUrl = primaryRpcUrl.trim();
  const normalizedFallbackRpcUrl = normalizeUrl(fallbackRpcUrl) ?? normalizedPrimaryRpcUrl;
  const normalizedRouterRpcUrl = normalizeUrl(routerRpcUrl);
  const canUseMagicSdkPath = routerEnabled && Boolean(normalizedRouterRpcUrl) && Boolean(signTransaction);
  let fallbackReason: MagicTransactionFallbackReason | null = null;

  if (!routerEnabled) {
    fallbackReason = "router-disabled";
  } else if (!normalizedRouterRpcUrl) {
    fallbackReason = "router-rpc-missing";
  } else if (!signTransaction) {
    fallbackReason = "router-sign-unsupported";
  }

  if (canUseMagicSdkPath && normalizedRouterRpcUrl && signTransaction) {
    const routerConnection = new Connection(normalizedRouterRpcUrl, commitment);
    let signature: string | null = null;
    let magicStage: "prepare" | "sign" | "send" | "confirm" = "prepare";

    try {
      onStageChange?.("resolving-route");
      await prepareMagicTransaction(routerConnection, transaction, { commitment });

      if (additionalSigners.length > 0) {
        transaction.partialSign(...additionalSigners);
      }

      magicStage = "sign";
      onStageChange?.("awaiting-wallet");
      const signedTransaction = await signTransaction(transaction);

      magicStage = "send";
      onStageChange?.("submitting-router");
      signature = await routerConnection.sendRawTransaction(signedTransaction.serialize(), {
        preflightCommitment: commitment
      });

      magicStage = "confirm";
      onStageChange?.("confirming");
      const magicConfirmation = await confirmMagicTransaction(routerConnection, signature, commitment);

      if (magicConfirmation.value.err) {
        throw new Error("MagicBlock confirmation returned an error");
      }

      return {
        signature,
        routing: {
          source: "magicblock-sdk-router",
          blockhashSource: "magicblock-router",
          sendPath: "magicblock-sdk-router",
          blockhash: transaction.recentBlockhash ?? "",
          lastValidBlockHeight: transaction.lastValidBlockHeight ?? null,
          writableAccounts,
          routerRpcUrl: normalizedRouterRpcUrl,
          sendRpcUrl: normalizedRouterRpcUrl,
          confirmationRpcUrl: normalizedRouterRpcUrl,
          fallbackReason: null
        }
      };
    } catch (error) {
      if (signature) {
        const fallbackConnection =
          normalizedFallbackRpcUrl === normalizedPrimaryRpcUrl
            ? primaryConnection
            : new Connection(normalizedFallbackRpcUrl, commitment);

        try {
          const confirmedOnFallback = await confirmSignatureOnConnection(fallbackConnection, signature, commitment);

          if (confirmedOnFallback) {
            return {
              signature,
              routing: {
                source: "magicblock-sdk-router",
                blockhashSource: "magicblock-router",
                sendPath: "magicblock-sdk-router",
                blockhash: transaction.recentBlockhash ?? "",
                lastValidBlockHeight: transaction.lastValidBlockHeight ?? null,
                writableAccounts,
                routerRpcUrl: normalizedRouterRpcUrl,
                sendRpcUrl: normalizedRouterRpcUrl,
                confirmationRpcUrl: normalizedFallbackRpcUrl,
                fallbackReason: "router-confirmation-failed"
              }
            };
          }
        } catch {
          // no-op, we throw below with a clear message
        }

        throw new Error("MagicBlock send succeeded but confirmation failed on router and fallback RPC.");
      }

      if (magicStage === "sign" && isUserRejectionError(error)) {
        throw error;
      }

      fallbackReason = toMagicStageFallbackReason(magicStage);
    }
  }

  onStageChange?.("resolving-route");
  const blockhashResolution = await resolveTransactionBlockhash({
    transaction,
    primaryConnection,
    primaryRpcUrl: normalizedPrimaryRpcUrl,
    fallbackRpcUrl: normalizedFallbackRpcUrl,
    routerRpcUrl: normalizedRouterRpcUrl,
    routerEnabled,
    routerTimeoutMs,
    commitment
  });

  transaction.recentBlockhash = blockhashResolution.blockhash;
  transaction.lastValidBlockHeight = blockhashResolution.lastValidBlockHeight;

  onStageChange?.("awaiting-wallet");
  const signature = await sendFallbackTransaction(transaction);
  onStageChange?.("confirming");

  const confirmationConnection =
    blockhashResolution.confirmationRpcUrl === normalizedPrimaryRpcUrl
      ? primaryConnection
      : new Connection(blockhashResolution.confirmationRpcUrl, commitment);

  const confirmation = await confirmationConnection.confirmTransaction(
    {
      signature,
      blockhash: blockhashResolution.blockhash,
      lastValidBlockHeight: blockhashResolution.lastValidBlockHeight
    },
    commitment
  );

  if (confirmation.value.err) {
    throw new Error("Transaction failed to confirm");
  }

  return {
    signature,
    routing: {
      source: "wallet-adapter-fallback",
      blockhashSource: blockhashResolution.source,
      sendPath: "wallet-adapter",
      blockhash: blockhashResolution.blockhash,
      lastValidBlockHeight: blockhashResolution.lastValidBlockHeight,
      writableAccounts: blockhashResolution.writableAccounts,
      routerRpcUrl: blockhashResolution.routerRpcUrl,
      sendRpcUrl: normalizedPrimaryRpcUrl,
      confirmationRpcUrl: blockhashResolution.confirmationRpcUrl,
      fallbackReason: fallbackReason ?? blockhashResolution.fallbackReason
    }
  };
};
