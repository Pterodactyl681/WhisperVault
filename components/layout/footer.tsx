"use client";

import Link from "next/link";
import { BookOpenText, Github, Sparkles, Twitter } from "lucide-react";
import Image from "next/image";
import { appConfig } from "@/lib/app-config";

export function Footer() {
  return (
    <footer className="mt-auto w-full border-t border-[rgba(94,119,166,0.2)] bg-[rgba(9,16,29,0.78)] backdrop-blur-[12px]">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 md:px-6">
        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Image
                src="/whisper-logo-mark.png"
                alt="WhisperVault logo"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
                priority
              />
              <p className="text-sm font-semibold tracking-[0.12em] text-primary/95">WhisperVault</p>
            </div>
            <p className="text-sm text-foreground/95">{appConfig.site.description}</p>
            <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Powered by Solana + MagicBlock
            </p>
          </div>

          <div className="space-y-1.5 md:text-right">
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <Link
                href={appConfig.site.links.twitterX}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border/85 bg-card/80 px-3 py-2 text-xs text-foreground/90 transition-colors hover:border-primary/45 hover:bg-card"
              >
                <Twitter className="h-3.5 w-3.5" />
                Twitter / X
              </Link>
              <Link
                href={appConfig.site.links.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border/85 bg-card/80 px-3 py-2 text-xs text-foreground/90 transition-colors hover:border-primary/45 hover:bg-card"
              >
                <Github className="h-3.5 w-3.5" />
                GitHub
              </Link>
              <Link
                href={appConfig.site.links.docs}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-border/85 bg-card/80 px-3 py-2 text-xs text-foreground/90 transition-colors hover:border-primary/45 hover:bg-card"
              >
                <BookOpenText className="h-3.5 w-3.5" />
                README / Docs
              </Link>
            </div>
            <p className="text-xs text-muted-foreground/90">Local-state prototype for devnet testing.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
