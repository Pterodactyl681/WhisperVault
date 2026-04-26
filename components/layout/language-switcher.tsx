"use client";

import { Globe } from "lucide-react";
import { localeOptions, type Locale } from "@/lib/i18n";
import { useLocale } from "@/components/providers/locale-provider";

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <label className="inline-flex items-center gap-2 rounded-xl border border-border/80 bg-card/65 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-card/78">
      <Globe className="h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        aria-label="Language"
        className="min-w-[52px] appearance-none bg-transparent text-xs font-medium text-foreground outline-none"
      >
        {localeOptions.map((item) => (
          <option key={item.value} value={item.value} className="bg-[#101A2B] text-[#EAF1FF]">
            {item.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none text-[10px] text-muted-foreground" aria-hidden="true">
        v
      </span>
    </label>
  );
}
