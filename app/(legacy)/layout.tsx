import { AppShellContent } from "@/components/layout/app-shell-content";
import { AnimatedBackground } from "@/components/layout/animated-background";
import { Navbar } from "@/components/layout/navbar";

export default function LegacyLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <AnimatedBackground />
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-3 pb-6 pt-6 sm:px-4 md:px-6 md:pb-8 md:pt-8">
        <AppShellContent>{children}</AppShellContent>
      </main>
    </div>
  );
}
