"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Copy, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useLocale } from "@/components/providers/locale-provider";
import { ConnectWalletButton } from "@/components/wallet/connect-wallet-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatPaylinkDisplayName, shortenAddress } from "@/lib/format";
import { useWhisperPayStore } from "@/store/whisperpay-store";
import { type TokenSymbol } from "@/types/whisperpay";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sortByNewest = <T extends { createdAt: string }>(items: T[]): T[] =>
  [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

const TOKEN_OPTIONS: TokenSymbol[] = ["USDC", "SOL"];

export default function CreatePage() {
  const wallet = useWhisperPayStore((state) => state.wallet);
  const paylinks = useWhisperPayStore((state) => state.paylinks);
  const createPaylink = useWhisperPayStore((state) => state.createPaylink);
  const { t, locale } = useLocale();

  const [nickname, setNickname] = useState("");
  const [defaultToken, setDefaultToken] = useState<TokenSymbol>("USDC");
  const [origin, setOrigin] = useState("");
  const [createdPaylinkId, setCreatedPaylinkId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedPaylinkId, setCopiedPaylinkId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const walletConnected = wallet.connected && Boolean(wallet.address);
  const canSubmit = walletConnected && nickname.trim().length > 0 && !creating;
  const fullLink = createdPaylinkId ? `${origin}/pay/${createdPaylinkId}` : "";

  const myPaylinks = useMemo(() => {
    if (!wallet.address) {
      return [];
    }

    return sortByNewest(paylinks.filter((item) => item.ownerWallet === wallet.address));
  }, [paylinks, wallet.address]);

  const handleCreate = async () => {
    setSubmitError(null);
    setCreating(true);
    await wait(220);

    const created = createPaylink(nickname, defaultToken);

    if (!created) {
      setSubmitError(t("create_submit_error_wallet"));
      setCreating(false);
      return;
    }

    setCreatedPaylinkId(created.id);
    setCreating(false);
  };

  const copyLink = async () => {
    if (!fullLink) {
      return;
    }

    await navigator.clipboard.writeText(fullLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const copyPaylinkRoute = async (paylinkId: string) => {
    if (!origin) {
      return;
    }

    await navigator.clipboard.writeText(`${origin}/pay/${paylinkId}`);
    setCopiedPaylinkId(paylinkId);
    setTimeout(() => setCopiedPaylinkId(null), 1200);
  };

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl">{t("create_title")}</CardTitle>
          <CardDescription>Create one paylink and share it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
          <div className="brand-accent-line h-[2px] w-32 rounded-full" />
          {!walletConnected ? (
            <div className="glass-panel rounded-xl p-3">
              <p className="mb-3 text-sm text-muted-foreground">{t("create_connect_prompt")}</p>
              <ConnectWalletButton />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("create_connected_wallet")}: {shortenAddress(wallet.address)}
            </p>
          )}

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Paylink name</label>
            <Input value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="paylink-name" />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">{t("create_default_token")}</label>
            <div
              role="radiogroup"
              aria-label={t("create_default_token")}
              className="inline-flex w-full rounded-2xl border border-[rgba(96,118,168,0.24)] bg-[rgba(14,23,39,0.84)] p-1"
            >
              {TOKEN_OPTIONS.map((token) => {
                const active = defaultToken === token;

                return (
                  <button
                    key={token}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setDefaultToken(token)}
                    className={`h-10 flex-1 rounded-xl text-sm font-medium transition-all sm:h-11 ${
                      active
                        ? "bg-brand-gradient text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {token}
                  </button>
                );
              })}
            </div>
          </div>

          {submitError ? (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="inline-flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {submitError}
              </span>
            </div>
          ) : null}

          <Button onClick={handleCreate} className="min-h-12 w-full text-sm sm:text-base" disabled={!canSubmit}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {creating ? t("create_generating") : t("create_generate_paylink")}
          </Button>

          {createdPaylinkId ? (
            <div className="glass-panel rounded-xl p-3 sm:p-4">
              <p className="mb-2 inline-flex items-center gap-2 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" />
                {t("create_paylink_created")}
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="space-y-3">
                  <Input readOnly value={fullLink} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={copyLink} className="w-full sm:w-auto">
                      <Copy className="h-4 w-4" />
                      {copied ? t("common_copied") : t("create_copy_link")}
                    </Button>
                    <Button asChild variant="outline" className="w-full sm:w-auto">
                      <Link href={`/pay/${createdPaylinkId}`}>{t("create_open_pay_page")}</Link>
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-center rounded-xl border border-[rgba(96,118,168,0.24)] bg-[rgba(14,23,39,0.9)] p-1.5 sm:p-2">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&data=${encodeURIComponent(fullLink)}`}
                    alt="Paylink QR code"
                    width={168}
                    height={168}
                    className="h-[136px] w-[136px] rounded-lg sm:h-[168px] sm:w-[168px]"
                    loading="lazy"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Your Active Paylinks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="brand-accent-line h-[2px] w-32 rounded-full" />
          {myPaylinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("create_no_paylinks")}</p>
          ) : (
            myPaylinks.map((item) => (
            <div key={item.id} className="glass-panel rounded-xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium">{formatPaylinkDisplayName(item.nickname, item.ownerWallet)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(item.createdAt, locale)}</p>
                </div>
                <Badge variant="outline">{item.defaultToken}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                  <Link href={`/pay/${item.id}`}>
                    Open
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={() => void copyPaylinkRoute(item.id)} className="w-full sm:w-auto">
                  <Copy className="h-3.5 w-3.5" />
                  {copiedPaylinkId === item.id ? t("common_copied") : t("create_copy_link")}
                </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}
