export type TokenSymbol = "SOL" | "USDC";
export type PublicPaymentStatus = "pending" | "sent" | "failed";
export type PaymentSettlementRail = "sol-public" | "magicblock-private-spl";
export type ErPermissionLifecycleStatus =
  | "disabled"
  | "delegating"
  | "delegated"
  | "committing"
  | "committed-undelegated"
  | "delegation-failed"
  | "commit-failed";

export interface PublicPaymentErLifecycle {
  enabled: boolean;
  status: ErPermissionLifecycleStatus;
  permissionedAccount: string | null;
  permissionPda: string | null;
  delegationSignature: string | null;
  commitAndUndelegateSignature: string | null;
  lastError: string | null;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  label: string | null;
}

export interface Paylink {
  id: string;
  ownerWallet: string;
  nickname: string;
  defaultToken: TokenSymbol;
  createdAt: string;
  isActive: boolean;
}

export interface PublicPayment {
  id: string;
  paylinkId: string;
  fromWallet: string;
  toWallet: string;
  settlementRail: PaymentSettlementRail;
  tokenSymbol: TokenSymbol;
  status: PublicPaymentStatus;
  createdAt: string;
  txSignature: string | null;
  erLifecycle: PublicPaymentErLifecycle | null;
  magicPrivate: {
    enabled: boolean;
    visibility: "private" | "public";
    mint: string | null;
    sendTarget: "base" | "ephemeral" | null;
    txBuilderSource: "magicblock-private-payments-api" | null;
  } | null;
}

export interface PrivatePaymentDetails {
  paymentId: string;
  amount: number;
  note: string;
  canRevealWallets: string[];
  source: "local-note" | "magicblock-private-memo";
  magicPrivateTxSignature: string | null;
}
