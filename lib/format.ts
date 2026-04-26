import { type Locale } from "@/lib/i18n";

export function shortenAddress(address?: string | null): string {
  if (!address) {
    return "No wallet";
  }

  return `${address.slice(0, 5)}...${address.slice(-5)}`;
}

export function formatPaylinkDisplayName(
  nickname?: string | null,
  ownerWallet?: string | null,
  fallback = "Payment link"
): string {
  const cleanNickname = nickname?.trim();

  if (cleanNickname) {
    const normalized = cleanNickname
      .replace(/^@+/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (normalized) {
      if (/^[a-z0-9\s.]+$/i.test(normalized) && /[a-z]/i.test(normalized)) {
        return normalized.replace(/\b([a-z])/g, (match) => match.toUpperCase());
      }

      return normalized;
    }
  }

  if (ownerWallet) {
    return shortenAddress(ownerWallet);
  }

  return fallback;
}

export function shortenSignature(signature?: string | null): string {
  if (!signature) {
    return "N/A";
  }

  return `${signature.slice(0, 5)}...${signature.slice(-5)}`;
}

export function formatAmount(amount: number, token: string): string {
  return `${amount.toFixed(2)} ${token}`;
}

const localeToDateCode: Record<Locale, string> = {
  en: "en-US",
  ru: "ru-RU",
  de: "de-DE",
  zh: "zh-CN"
};

export function formatDate(value: string, locale: Locale = "en"): string {
  return new Date(value).toLocaleString(localeToDateCode[locale], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
