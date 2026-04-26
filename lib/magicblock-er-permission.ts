import {
  AUTHORITY_FLAG,
  createCommitAndUndelegatePermissionInstruction,
  createCreatePermissionInstruction,
  createDelegatePermissionInstruction,
  getPermissionStatus,
  permissionPdaFromAccount
} from "@magicblock-labs/ephemeral-rollups-sdk";
import { type Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import { sendRoutedTransaction, type RoutedTransactionResolution } from "./magicblock-transaction";
import { type ErPermissionLifecycleStatus, type PublicPaymentErLifecycle } from "@/types/whisperpay";

export type ErPermissionLifecycleState = PublicPaymentErLifecycle;

interface DelegatePermissionForPaymentInput {
  authorityWallet: PublicKey;
  recipientWallet: PublicKey;
  connection: Connection;
  primaryRpcUrl: string;
  fallbackRpcUrl: string;
  routerRpcUrl: string | null;
  routerEnabled: boolean;
  routerTimeoutMs: number;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  sendFallbackTransaction: (transaction: Transaction, signer: Keypair) => Promise<string>;
}

interface DelegatePermissionForPaymentResult {
  signer: Keypair;
  state: ErPermissionLifecycleState;
  routing: RoutedTransactionResolution;
}

interface CommitAndUndelegatePermissionInput {
  authorityWallet: PublicKey;
  permissionedAccountSigner: Keypair;
  connection: Connection;
  primaryRpcUrl: string;
  fallbackRpcUrl: string;
  routerRpcUrl: string | null;
  routerEnabled: boolean;
  routerTimeoutMs: number;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  sendFallbackTransaction: (transaction: Transaction, signer: Keypair) => Promise<string>;
}

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown ER lifecycle error";

const createErPermissionLifecycleState = (
  status: ErPermissionLifecycleStatus,
  patch?: Partial<ErPermissionLifecycleState>
): ErPermissionLifecycleState => ({
  enabled: status !== "disabled",
  status,
  permissionedAccount: null,
  permissionPda: null,
  delegationSignature: null,
  commitAndUndelegateSignature: null,
  lastError: null,
  ...patch
});

export const createDisabledErPermissionState = (): ErPermissionLifecycleState =>
  createErPermissionLifecycleState("disabled");

export const createDelegatingErPermissionState = (): ErPermissionLifecycleState =>
  createErPermissionLifecycleState("delegating", {
    enabled: true
  });

export const createErPermissionFailureState = (
  status: "delegation-failed" | "commit-failed",
  message: string,
  previous?: ErPermissionLifecycleState | null
): ErPermissionLifecycleState =>
  createErPermissionLifecycleState(status, {
    enabled: true,
    permissionedAccount: previous?.permissionedAccount ?? null,
    permissionPda: previous?.permissionPda ?? null,
    delegationSignature: previous?.delegationSignature ?? null,
    commitAndUndelegateSignature: previous?.commitAndUndelegateSignature ?? null,
    lastError: message
  });

export const createCommittingErPermissionState = (
  previous: ErPermissionLifecycleState
): ErPermissionLifecycleState =>
  createErPermissionLifecycleState("committing", {
    enabled: true,
    permissionedAccount: previous.permissionedAccount,
    permissionPda: previous.permissionPda,
    delegationSignature: previous.delegationSignature,
    commitAndUndelegateSignature: previous.commitAndUndelegateSignature,
    lastError: null
  });

export const createCommittedUndelegatedErPermissionState = (
  previous: ErPermissionLifecycleState,
  signature: string
): ErPermissionLifecycleState =>
  createErPermissionLifecycleState("committed-undelegated", {
    enabled: true,
    permissionedAccount: previous.permissionedAccount,
    permissionPda: previous.permissionPda,
    delegationSignature: previous.delegationSignature,
    commitAndUndelegateSignature: signature,
    lastError: null
  });

export const delegatePermissionForPayment = async (
  input: DelegatePermissionForPaymentInput
): Promise<DelegatePermissionForPaymentResult> => {
  const {
    authorityWallet,
    recipientWallet,
    connection,
    primaryRpcUrl,
    fallbackRpcUrl,
    routerRpcUrl,
    routerEnabled,
    routerTimeoutMs,
    signTransaction,
    sendFallbackTransaction
  } = input;

  const permissionedAccountSigner = Keypair.generate();
  const permissionPda = permissionPdaFromAccount(permissionedAccountSigner.publicKey);
  const createAndDelegateTx = new Transaction().add(
    createCreatePermissionInstruction(
      {
        permissionedAccount: permissionedAccountSigner.publicKey,
        payer: authorityWallet
      },
      {
        members: [
          {
            pubkey: authorityWallet,
            flags: AUTHORITY_FLAG
          },
          {
            pubkey: recipientWallet,
            flags: 0
          }
        ]
      }
    ),
    createDelegatePermissionInstruction(
      {
        payer: authorityWallet,
        authority: [authorityWallet, true],
        permissionedAccount: [permissionedAccountSigner.publicKey, true]
      },
      {}
    )
  );

  try {
    const routed = await sendRoutedTransaction({
      transaction: createAndDelegateTx,
      primaryConnection: connection,
      primaryRpcUrl,
      fallbackRpcUrl,
      routerRpcUrl,
      routerEnabled,
      routerTimeoutMs,
      commitment: "confirmed",
      additionalSigners: [permissionedAccountSigner],
      signTransaction,
      sendFallbackTransaction: (transaction) => sendFallbackTransaction(transaction, permissionedAccountSigner)
    });

    return {
      signer: permissionedAccountSigner,
      routing: routed.routing,
      state: createErPermissionLifecycleState("delegated", {
        enabled: true,
        permissionedAccount: permissionedAccountSigner.publicKey.toBase58(),
        permissionPda: permissionPda.toBase58(),
        delegationSignature: routed.signature
      })
    };
  } catch (error) {
    throw new Error(`ER delegation failed: ${toErrorMessage(error)}`);
  }
};

export const commitAndUndelegatePermissionForPayment = async (
  input: CommitAndUndelegatePermissionInput
): Promise<{ signature: string; routing: RoutedTransactionResolution }> => {
  const {
    authorityWallet,
    permissionedAccountSigner,
    connection,
    primaryRpcUrl,
    fallbackRpcUrl,
    routerRpcUrl,
    routerEnabled,
    routerTimeoutMs,
    signTransaction,
    sendFallbackTransaction
  } = input;

  const commitTx = new Transaction().add(
    createCommitAndUndelegatePermissionInstruction({
      authority: [authorityWallet, true],
      permissionedAccount: [permissionedAccountSigner.publicKey, true]
    })
  );

  try {
    return await sendRoutedTransaction({
      transaction: commitTx,
      primaryConnection: connection,
      primaryRpcUrl,
      fallbackRpcUrl,
      routerRpcUrl,
      routerEnabled,
      routerTimeoutMs,
      commitment: "confirmed",
      additionalSigners: [permissionedAccountSigner],
      signTransaction,
      sendFallbackTransaction: (transaction) => sendFallbackTransaction(transaction, permissionedAccountSigner)
    });
  } catch (error) {
    throw new Error(`ER commit/undelegate failed: ${toErrorMessage(error)}`);
  }
};

export const fetchPermissionAuthorizedUsers = async (
  routerRpcUrl: string | null,
  permissionedAccount: string | null
): Promise<string[] | null> => {
  if (!routerRpcUrl || !permissionedAccount) {
    return null;
  }

  try {
    const status = await getPermissionStatus(routerRpcUrl, new PublicKey(permissionedAccount));
    return status.authorizedUsers ?? null;
  } catch {
    return null;
  }
};

export interface PermissionMembershipCheckResult {
  allowed: boolean;
  reason:
    | "router-rpc-missing"
    | "permission-account-missing"
    | "permission-query-failed"
    | "wallet-not-authorized"
    | null;
  authorizedUsers: string[] | null;
}

interface CheckPermissionMembershipInput {
  routerRpcUrl: string | null;
  permissionedAccount: string | null;
  walletAddress: string;
}

export const checkPermissionMembershipForWallet = async (
  input: CheckPermissionMembershipInput
): Promise<PermissionMembershipCheckResult> => {
  const { routerRpcUrl, permissionedAccount, walletAddress } = input;

  if (!routerRpcUrl) {
    return {
      allowed: false,
      reason: "router-rpc-missing",
      authorizedUsers: null
    };
  }

  if (!permissionedAccount) {
    return {
      allowed: false,
      reason: "permission-account-missing",
      authorizedUsers: null
    };
  }

  const authorizedUsers = await fetchPermissionAuthorizedUsers(routerRpcUrl, permissionedAccount);

  if (!authorizedUsers) {
    return {
      allowed: false,
      reason: "permission-query-failed",
      authorizedUsers: null
    };
  }

  if (!authorizedUsers.includes(walletAddress)) {
    return {
      allowed: false,
      reason: "wallet-not-authorized",
      authorizedUsers
    };
  }

  return {
    allowed: true,
    reason: null,
    authorizedUsers
  };
};
