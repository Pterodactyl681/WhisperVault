import { Paylink, PrivatePaymentDetails, PublicPayment } from "@/types/whisperpay";

export const PRIMARY_WALLET = {
  label: "Phantom Alpha",
  address: "9f8Qa8z9wSe9YqM7hK7ivB2xE8a4u6pJmN3tYv4dR2q"
};

export const MOCK_WALLETS = [
  PRIMARY_WALLET,
  {
    label: "Backpack Dev",
    address: "C3mNo4xPzY5qT7aJwE8sL2vF9hR6dQ1bK4nU7iM5pX2"
  }
];

export const seedPaylinks: Paylink[] = [
  {
    id: "pl_seed_001",
    ownerWallet: PRIMARY_WALLET.address,
    nickname: "private-payment-lane",
    defaultToken: "USDC",
    createdAt: "2026-03-20T08:30:00.000Z",
    isActive: true
  }
];

export const seedPublicPayments: PublicPayment[] = [
  {
    id: "pub_seed_001",
    paylinkId: "pl_seed_001",
    fromWallet: "3hF8n2V4h1k0S5p6n8Q9r2M1a7X4e5T6y8W3z9L1p2R",
    toWallet: PRIMARY_WALLET.address,
    settlementRail: "sol-public",
    tokenSymbol: "SOL",
    status: "sent",
    createdAt: "2026-03-21T14:22:00.000Z",
    txSignature: "5hyG4Kf4ipz9Qv4pP8gQqTnKkqJdFqQdu6xv9hYkVkpJ2Fx7aLrTt8NjhK6x7zP2s9xRz3Cw7bM1dV8nK4uQ2Yp",
    erLifecycle: null,
    magicPrivate: null
  }
];

export const seedPrivatePaymentDetails: PrivatePaymentDetails[] = [
  {
    paymentId: "pub_seed_001",
    amount: 42,
    note: "Private note seeded for local preview mode.",
    canRevealWallets: [PRIMARY_WALLET.address],
    source: "local-note",
    magicPrivateTxSignature: null
  }
];
