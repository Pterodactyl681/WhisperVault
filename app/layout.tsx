import type { Metadata } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import { AppShellContent } from "@/components/layout/app-shell-content";
import { AnimatedBackground } from "@/components/layout/animated-background";
import { Navbar } from "@/components/layout/navbar";
import { LocaleProvider } from "@/components/providers/locale-provider";
import { SolanaWalletProvider } from "@/components/providers/solana-wallet-provider";

export const metadata: Metadata = {
  title: "WhisperVault",
  description: "Agent Spend Firewall for private Claude/Mirage agents on Solana devnet.",
  icons: {
    icon: "/icon.png?v=4",
    shortcut: "/icon.png?v=4",
    apple: "/icon.png?v=4"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
        <AnimatedBackground />
        <LocaleProvider>
          <SolanaWalletProvider>
            <Navbar />
            <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-6 sm:px-4 md:px-6 md:pb-8 md:pt-8">
              <AppShellContent>{children}</AppShellContent>
            </main>
          </SolanaWalletProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
