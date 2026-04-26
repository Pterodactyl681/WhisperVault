"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { seedPaylinks, seedPrivatePaymentDetails, seedPublicPayments } from "@/lib/mock-data";
import {
  type PaymentSettlementRail,
  Paylink,
  PrivatePaymentDetails,
  PublicPayment,
  PublicPaymentErLifecycle,
  PublicPaymentStatus,
  TokenSymbol,
  WalletState
} from "@/types/whisperpay";

interface CreatePublicPaymentIntentInput {
  paylinkId: string;
  fromWallet: string;
  settlementRail?: PaymentSettlementRail;
  tokenSymbol?: TokenSymbol;
  magicPrivate?: PublicPayment["magicPrivate"];
}

interface StorePrivatePaymentDetailsInput {
  paymentId: string;
  amount: number;
  note: string;
  canRevealWallets: string[];
  source?: PrivatePaymentDetails["source"];
  magicPrivateTxSignature?: string | null;
}

interface UpdatePublicPaymentErLifecycleInput {
  paymentId: string;
  erLifecycle: PublicPaymentErLifecycle | null;
}

interface UpdatePublicPaymentMagicPrivateInput {
  paymentId: string;
  magicPrivate: PublicPayment["magicPrivate"];
}

interface WhisperPayState {
  homeTab: "overview" | "create" | "inbox";
  wallet: WalletState;
  paylinks: Paylink[];
  publicPayments: PublicPayment[];
  privatePaymentDetailsByPaymentId: Record<string, PrivatePaymentDetails>;
  revealedPrivatePaymentIds: string[];
  setHomeTab: (tab: "overview" | "create" | "inbox") => void;
  connectWallet: (address?: string, label?: string) => void;
  disconnectWallet: () => void;
  createPaylink: (nickname?: string, defaultToken?: TokenSymbol) => Paylink | null;
  createPublicPaymentIntent: (input: CreatePublicPaymentIntentInput) => PublicPayment | null;
  updatePublicPaymentStatus: (paymentId: string, status: PublicPaymentStatus, txSignature?: string | null) => PublicPayment | null;
  updatePublicPaymentErLifecycle: (input: UpdatePublicPaymentErLifecycleInput) => PublicPayment | null;
  updatePublicPaymentMagicPrivate: (input: UpdatePublicPaymentMagicPrivateInput) => PublicPayment | null;
  storePrivatePaymentDetails: (input: StorePrivatePaymentDetailsInput) => PrivatePaymentDetails | null;
  revealPrivatePaymentDetails: (paymentId: string) => PrivatePaymentDetails | null;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
};

const seedPrivateMap = Object.fromEntries(seedPrivatePaymentDetails.map((details) => [details.paymentId, details]));

const uid = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }

  return Math.random().toString(36).slice(2, 10);
};

const toNickname = (value: string): string => {
  const clean = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

  return clean || "private-lane";
};

const normalizeLegacyPaylinkNickname = (nickname?: string | null): string => {
  if (!nickname) {
    return "private-lane";
  }

  return toNickname(nickname);
};

export const useWhisperPayStore = create<WhisperPayState>()(
  persist(
    (set, get) => ({
      homeTab: "overview",
      wallet: {
        connected: false,
        address: null,
        label: null
      },
      paylinks: seedPaylinks,
      publicPayments: seedPublicPayments,
      privatePaymentDetailsByPaymentId: seedPrivateMap,
      revealedPrivatePaymentIds: [],
      setHomeTab: (tab) => {
        set({ homeTab: tab });
      },
      connectWallet: (address, label) => {
        const normalizedAddress = address?.trim();

        if (!normalizedAddress) {
          return;
        }

        const normalizedLabel = label?.trim() || "Solana Wallet";

        set((state) => ({
          wallet: {
            connected: true,
            address: normalizedAddress,
            label: normalizedLabel
          },
          revealedPrivatePaymentIds:
            state.wallet.address && state.wallet.address !== normalizedAddress ? [] : state.revealedPrivatePaymentIds
        }));
      },
      disconnectWallet: () => {
        set({
          wallet: {
            connected: false,
            address: null,
            label: null
          },
          revealedPrivatePaymentIds: []
        });
      },
      createPaylink: (nickname = "private payment lane", defaultToken: TokenSymbol = "USDC") => {
        const state = get();

        if (!state.wallet.connected || !state.wallet.address) {
          return null;
        }

        const paylink: Paylink = {
          id: `pl_${uid()}`,
          ownerWallet: state.wallet.address,
          nickname: toNickname(nickname),
          defaultToken,
          createdAt: new Date().toISOString(),
          isActive: true
        };

        set((current) => ({
          paylinks: [paylink, ...current.paylinks]
        }));

        return paylink;
      },
      createPublicPaymentIntent: (input: CreatePublicPaymentIntentInput) => {
        const paylink = get().paylinks.find((entry) => entry.id === input.paylinkId && entry.isActive);

        if (!paylink) {
          return null;
        }

        const payment: PublicPayment = {
          id: `pub_${uid()}`,
          paylinkId: paylink.id,
          fromWallet: input.fromWallet.trim() || "anonymous-public-wallet",
          toWallet: paylink.ownerWallet,
          settlementRail: input.settlementRail ?? "sol-public",
          tokenSymbol: input.tokenSymbol ?? "SOL",
          status: "pending",
          createdAt: new Date().toISOString(),
          txSignature: null,
          erLifecycle: null,
          magicPrivate: input.magicPrivate ?? null
        };

        set((state) => ({
          publicPayments: [payment, ...state.publicPayments]
        }));

        return payment;
      },
      updatePublicPaymentStatus: (paymentId: string, status: PublicPaymentStatus, txSignature?: string | null) => {
        const normalizedSignature = txSignature?.trim() || null;
        let updatedPayment: PublicPayment | null = null;

        set((state) => ({
          publicPayments: state.publicPayments.map((entry) => {
            if (entry.id !== paymentId) {
              return entry;
            }

            const nextPayment: PublicPayment = {
              ...entry,
              status,
              txSignature: txSignature === undefined ? entry.txSignature : normalizedSignature
            };

            updatedPayment = nextPayment;
            return nextPayment;
          })
        }));

        return updatedPayment;
      },
      updatePublicPaymentErLifecycle: (input: UpdatePublicPaymentErLifecycleInput) => {
        let updatedPayment: PublicPayment | null = null;

        set((state) => ({
          publicPayments: state.publicPayments.map((entry) => {
            if (entry.id !== input.paymentId) {
              return entry;
            }

            const nextPayment: PublicPayment = {
              ...entry,
              erLifecycle: input.erLifecycle
            };

            updatedPayment = nextPayment;
            return nextPayment;
          })
        }));

        return updatedPayment;
      },
      updatePublicPaymentMagicPrivate: (input: UpdatePublicPaymentMagicPrivateInput) => {
        let updatedPayment: PublicPayment | null = null;

        set((state) => ({
          publicPayments: state.publicPayments.map((entry) => {
            if (entry.id !== input.paymentId) {
              return entry;
            }

            const nextPayment: PublicPayment = {
              ...entry,
              magicPrivate: input.magicPrivate
            };

            updatedPayment = nextPayment;
            return nextPayment;
          })
        }));

        return updatedPayment;
      },
      storePrivatePaymentDetails: (input: StorePrivatePaymentDetailsInput) => {
        const publicPayment = get().publicPayments.find((entry) => entry.id === input.paymentId);

        if (!publicPayment) {
          return null;
        }

        if (!Number.isFinite(input.amount) || input.amount <= 0) {
          return null;
        }

        const canRevealWallets = Array.from(
          new Set(
            [publicPayment.toWallet, ...input.canRevealWallets]
              .map((wallet) => wallet.trim())
              .filter(Boolean)
          )
        );
        // UI mirror only: reveal authority for MagicBlock private memo flow is checked against
        // MagicBlock permission membership in the inbox reveal path.

        const details: PrivatePaymentDetails = {
          paymentId: input.paymentId,
          amount: input.amount,
          note: input.note.trim() || "(empty private note)",
          canRevealWallets,
          source: input.source ?? "local-note",
          magicPrivateTxSignature: input.magicPrivateTxSignature?.trim() || null
        };

        set((state) => ({
          privatePaymentDetailsByPaymentId: {
            ...state.privatePaymentDetailsByPaymentId,
            [details.paymentId]: details
          }
        }));

        return details;
      },
      revealPrivatePaymentDetails: (paymentId: string) => {
        const state = get();
        const currentWallet = state.wallet.address;

        if (!state.wallet.connected || !currentWallet) {
          return null;
        }

        const details = state.privatePaymentDetailsByPaymentId[paymentId];
        const publicPayment = state.publicPayments.find((entry) => entry.id === paymentId);

        if (!details || !publicPayment) {
          return null;
        }

        // Local store no longer decides membership authority.
        // It only prevents revealing payments outside recipient inbox context.
        if (publicPayment.toWallet !== currentWallet) {
          return null;
        }

        set((latest) => ({
          revealedPrivatePaymentIds: latest.revealedPrivatePaymentIds.includes(paymentId)
            ? latest.revealedPrivatePaymentIds
            : [paymentId, ...latest.revealedPrivatePaymentIds]
        }));

        return details;
      }
    }),
    {
      name: "whisperpay-magicblock-store",
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : localStorage)),
      partialize: (state) => ({
        paylinks: state.paylinks,
        publicPayments: state.publicPayments
      }),
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<WhisperPayState>;
        const normalizedPaylinks = (persisted.paylinks ?? currentState.paylinks).map((entry) => ({
          ...entry,
          nickname: normalizeLegacyPaylinkNickname(entry.nickname)
        }));
        const normalizedPublicPayments = (persisted.publicPayments ?? currentState.publicPayments).map((entry) => {
          const rawStatus = String(entry.status);
          const normalizedStatus: PublicPaymentStatus =
            rawStatus === "sent" || rawStatus === "confirmed"
              ? "sent"
              : rawStatus === "failed"
                ? "failed"
                : "pending";

          return {
            ...entry,
            settlementRail: entry.settlementRail ?? "sol-public",
            tokenSymbol: entry.tokenSymbol ?? "SOL",
            status: normalizedStatus,
            txSignature: entry.txSignature ?? null,
            erLifecycle: entry.erLifecycle ?? null,
            magicPrivate: entry.magicPrivate ?? null
          };
        });

        return {
          ...currentState,
          paylinks: normalizedPaylinks,
          publicPayments: normalizedPublicPayments
        };
      }
    }
  )
);
