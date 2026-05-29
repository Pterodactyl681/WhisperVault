import type { Metadata } from "next";
import "./globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";
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
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <LocaleProvider>
          <SolanaWalletProvider>{children}</SolanaWalletProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
