"use client";

import { type ComponentType, type PropsWithChildren, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { BackpackWalletAdapter } from "@solana/wallet-adapter-backpack";
import { GlowWalletAdapter } from "@solana/wallet-adapter-glow";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import { appConfig } from "@/lib/app-config";
import { WalletStoreSync } from "@/components/providers/wallet-store-sync";

const SafeConnectionProvider = ConnectionProvider as unknown as ComponentType<PropsWithChildren<{ endpoint: string }>>;
const SafeWalletProvider = WalletProvider as unknown as ComponentType<
  PropsWithChildren<{ wallets: unknown[]; autoConnect?: boolean }>
>;
const SafeWalletModalProvider = WalletModalProvider as unknown as ComponentType<PropsWithChildren>;

export function SolanaWalletProvider({ children }: PropsWithChildren) {
  const network = appConfig.solana.network;
  const endpoint = useMemo(() => appConfig.solana.walletRpcUrl || clusterApiUrl(network), [network]);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter(), new BackpackWalletAdapter(), new GlowWalletAdapter()],
    []
  );

  return (
    <SafeConnectionProvider endpoint={endpoint}>
      <SafeWalletProvider wallets={wallets} autoConnect>
        <SafeWalletModalProvider>
          <WalletStoreSync />
          {children}
        </SafeWalletModalProvider>
      </SafeWalletProvider>
    </SafeConnectionProvider>
  );
}
