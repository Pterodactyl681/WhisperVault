"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { localeOptions, type Locale } from "@/lib/i18n";
import { useLocale } from "@/components/providers/locale-provider";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const activeLabel = localeOptions.find((item) => item.value === locale)?.label ?? locale;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label="Language"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-700/70 bg-[#06111f]/80 px-3 py-2 text-xs font-medium text-slate-100 transition-colors hover:border-violet-300/35 hover:bg-slate-900/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/25"
      >
        <Globe className="h-3.5 w-3.5 text-violet-200/80" />
        <span className="min-w-[52px] text-left">{activeLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-violet-200/70 transition-transform", open ? "rotate-180" : "")} />
      </button>
      {open ? (
        <div role="listbox" className="absolute right-0 top-full z-40 mt-2 w-32 rounded-xl border border-violet-300/35 bg-[#071121]/98 p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.42)] backdrop-blur-xl">
          {localeOptions.map((item) => (
            <button
              key={item.value}
              type="button"
              role="option"
              aria-selected={item.value === locale}
              onClick={() => {
                setLocale(item.value as Locale);
                setOpen(false);
              }}
              className={cn(
                "flex min-h-9 w-full items-center rounded-lg px-3 text-left text-xs transition-colors",
                item.value === locale ? "bg-violet-500/18 text-violet-100" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
