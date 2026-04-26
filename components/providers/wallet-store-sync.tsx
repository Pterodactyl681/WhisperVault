"use client";

import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWhisperPayStore } from "@/store/whisperpay-store";

export function WalletStoreSync() {
  const { connected, connecting, publicKey, wallet } = useWallet();
  const connectWallet = useWhisperPayStore((state) => state.connectWallet);
  const disconnectWallet = useWhisperPayStore((state) => state.disconnectWallet);
  const walletLabel = wallet?.adapter.name ?? "Solana Wallet";

  useEffect(() => {
    if (connecting) {
      return;
    }

    if (connected && publicKey) {
      connectWallet(publicKey.toBase58(), walletLabel);
      return;
    }

    disconnectWallet();
  }, [connectWallet, connected, connecting, disconnectWallet, publicKey, walletLabel]);

  return null;
}
