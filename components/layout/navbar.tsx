"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandGlyph } from "@/components/layout/brand-glyph";
import { appConfig } from "@/lib/app-config";
import { useWhisperPayStore } from "@/store/whisperpay-store";

export function Navbar() {
  const setHomeTab = useWhisperPayStore((state) => state.setHomeTab);
  const pathname = usePathname();

  if (pathname === "/" || pathname === "/agent-budgets" || pathname === "/agent-vaults") {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[rgba(94,119,166,0.2)] bg-[rgba(9,16,29,0.78)] backdrop-blur-[12px]">
      <div className="mx-auto flex min-h-32 w-full max-w-6xl items-center justify-center px-4 py-4 md:px-6">
        <Link href="/" className="flex items-center gap-3" onClick={() => setHomeTab("overview")}>
          <BrandGlyph />
          <span className="text-base font-semibold tracking-[0.08em] text-foreground sm:text-lg">{appConfig.site.name}</span>
        </Link>
      </div>
    </header>
  );
}
