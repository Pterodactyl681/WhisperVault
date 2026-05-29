"use client";

import type { ButtonHTMLAttributes, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ArrowRight, CircleDot, Copy, ExternalLink, Loader2, LogOut, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formControlClass } from "./constants";
import { percentOf, statusTone } from "./utils";
import type { Notice } from "./types";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-lg border border-white/[0.10] bg-[#070711]/72 p-5 shadow-[0_0_0_1px_rgba(132,90,255,0.03),0_22px_70px_rgba(0,0,0,0.32)] backdrop-blur-xl", className)}>
      {children}
    </section>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-medium uppercase tracking-[0.08em] text-violet-300">{children}</h2>;
}

export function NoticeBanner({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <div
      className={cn(
        "mb-5 rounded-lg border px-4 py-3 text-[15px]",
        notice.tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "",
        notice.tone === "warning" ? "border-amber-300/25 bg-amber-300/10 text-amber-100" : "",
        notice.tone === "error" ? "border-red-400/25 bg-red-400/10 text-red-100" : ""
      )}
    >
      {notice.message}
    </div>
  );
}

export function LoadingStrip() {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-violet-300/15 bg-violet-400/8 px-4 py-3 text-[15px] text-violet-100/75">
      <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
      Loading command center data
    </div>
  );
}

export function Sigil({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="sigil-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F5D8FF" />
          <stop offset="42%" stopColor="#9F55FF" />
          <stop offset="100%" stopColor="#6E35FF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="24" fill="url(#sigil-glow)" opacity="0.18" />
      <path d="M32 3l4.8 23.7L61 32l-24.2 5.3L32 61l-4.8-23.7L3 32l24.2-5.3L32 3z" fill="#A970FF" />
      <path d="M32 15l2.1 14.9L49 32l-14.9 2.1L32 49l-2.1-14.9L15 32l14.9-2.1L32 15z" fill="#F2D7FF" />
    </svg>
  );
}

export function MiniSigil() {
  return (
    <div className="hidden h-20 w-20 items-center justify-center rounded-lg border border-violet-300/14 bg-violet-500/5 md:flex">
      <Sigil className="h-14 w-14" />
    </div>
  );
}

export function ShieldSigil({ large = false }: { large?: boolean }) {
  return (
    <div className={cn("relative flex items-center justify-center", large ? "h-56" : "h-36")}>
      <ShieldCheck className={cn("absolute text-violet-300/20", large ? "h-52 w-52" : "h-36 w-36")} strokeWidth={0.8} />
      <Sigil className={cn("drop-shadow-[0_0_24px_rgba(168,85,247,0.9)]", large ? "h-28 w-28" : "h-20 w-20")} />
    </div>
  );
}

export function AllowanceRing({
  current,
  max,
  sizeClassName,
  large = false
}: {
  current?: string | null;
  max?: string | null;
  sizeClassName: string;
  large?: boolean;
}) {
  const pct = percentOf(current, max);

  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-[conic-gradient(from_180deg,#A970FF_var(--pct),rgba(255,255,255,0.08)_0)] p-[3px] shadow-[0_0_40px_rgba(139,74,255,0.42)]",
        sizeClassName
      )}
      style={{ "--pct": `${pct}%` } as CSSProperties}
    >
      <div className="grid h-full w-full place-items-center rounded-full border border-violet-300/18 bg-[radial-gradient(circle_at_50%_35%,rgba(147,74,255,0.20),rgba(4,4,11,0.94)_62%)]">
        <div className="text-center">
          <div className={cn("font-light leading-none text-white", large ? "text-[46px] sm:text-[54px] xl:text-[60px]" : "text-[34px] sm:text-[39px]")}>{current ?? "0"}</div>
          <div className={cn("mt-2 text-zinc-300", large ? "text-[19px] sm:text-[21px] xl:text-[23px]" : "text-[16px] sm:text-[18px]")}>/ {max ?? "0"}</div>
          <div className="mt-3 text-[14px] uppercase tracking-[0.1em] text-zinc-400">USDC</div>
        </div>
      </div>
    </div>
  );
}

export function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 border-b border-white/[0.07] pb-3 last:border-b-0">
      <span className="min-w-0 text-[15px] text-zinc-400">{label}</span>
      <span className="max-w-[62%] shrink-0 truncate whitespace-nowrap text-right text-[15px] font-medium text-white" title={value}>{value}</span>
    </div>
  );
}

export function LabelValue({ label, value, withCopy = false }: { label: string; value: string; withCopy?: boolean }) {
  return (
    <div>
      <div className="text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-2 flex items-center gap-2 text-[16px] text-white">
        <span>{value}</span>
        {withCopy ? <Copy className="h-3.5 w-3.5 text-zinc-500" /> : null}
      </div>
    </div>
  );
}

export function SummaryMetric({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="min-w-0 px-0 sm:px-3 sm:first:pl-0">
      <div className="text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className="mt-2 truncate whitespace-nowrap text-[21px] text-white" title={value}>{value}</div>
      {sublabel ? <div className="mt-1 text-[13px] uppercase text-zinc-500">{sublabel}</div> : null}
    </div>
  );
}

export function SoftMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-white/[0.08] bg-black/18", compact ? "p-3" : "p-4")}>
      <div className="text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</div>
      <div className={cn("mt-2 min-w-0 break-words font-medium text-white", compact ? "text-[15px]" : "text-[17px]")}>{value}</div>
    </div>
  );
}

export function StatusBadge({ status, children }: { status?: string | null; children?: ReactNode }) {
  const tone = statusTone(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[12px] font-medium uppercase tracking-[0.06em]",
        tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "",
        tone === "warning" ? "border-amber-300/25 bg-amber-300/10 text-amber-200" : "",
        tone === "danger" ? "border-red-400/25 bg-red-400/10 text-red-300" : "",
        tone === "neutral" ? "border-white/12 bg-white/[0.04] text-zinc-300" : ""
      )}
    >
      {children ?? status ?? "unknown"}
    </span>
  );
}

export function ActionButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-11 w-full items-center justify-between rounded-lg border border-white/10 bg-black/18 px-3 text-[16px] text-violet-300 transition hover:border-violet-300/30 hover:bg-violet-400/8"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </button>
  );
}

export function SidebarFooterLink({ children, href, label }: { children: ReactNode; href: string; label: string }) {
  return (
    <a
      href={href}
      target={href === "#" ? undefined : "_blank"}
      rel={href === "#" ? undefined : "noreferrer"}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-black/20 text-violet-100/60 transition hover:border-violet-300/30 hover:bg-violet-400/8 hover:text-white"
    >
      {children}
    </a>
  );
}

export function ControlButton({
  children,
  className,
  asAnchor = false,
  href,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { asAnchor?: boolean; href?: string }) {
  const baseClassName = cn(
    "inline-flex min-h-10 w-full min-w-0 items-center justify-center gap-2 rounded-lg border border-violet-300/18 bg-violet-400/8 px-3 text-center text-[15px] font-medium text-violet-100 transition hover:border-violet-300/35 hover:bg-violet-400/14 focus-visible:border-violet-400/55 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.14)] disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-white/[0.03] disabled:text-zinc-500 disabled:opacity-60 sm:w-auto",
    className
  );

  if (asAnchor) {
    return (
      <a href={href} className={cn(baseClassName, props.disabled ? "pointer-events-none opacity-45" : "")}>
        {children}
      </a>
    );
  }

  return (
    <button className={baseClassName} {...props}>
      {children}
    </button>
  );
}

export function HeaderWalletButton({
  connected,
  connecting,
  onClick
}: {
  connected: boolean;
  connecting: boolean;
  onClick: () => void;
}) {
  const Icon = connected ? LogOut : Wallet;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={connecting}
      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-violet-300/25 bg-[#132033]/88 px-4 text-[16px] font-medium text-violet-100 shadow-[0_0_0_1px_rgba(139,92,246,0.05),0_12px_32px_rgba(76,29,149,0.22)] transition hover:border-violet-300/45 hover:bg-[#172844] hover:text-white focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.18)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
    >
      {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {connected ? "Disconnect wallet" : connecting ? "Connecting" : "Connect wallet"}
    </button>
  );
}

export function StyledInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(formControlClass, props.className)}
    />
  );
}

export function StyledTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(formControlClass, "min-h-28 resize-none py-3 leading-6", props.className)} />;
}

export function StyledSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(formControlClass, "appearance-none pr-9", props.className)} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] uppercase tracking-[0.08em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

export function PolicyRule({ title, body, status }: { title: string; body: string; status: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-medium text-white">{title}</div>
          <p className="mt-1 text-[15px] text-zinc-400">{body}</p>
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  children,
  emptyTitle,
  emptyBody
}: {
  columns: string[];
  children: ReactNode;
  emptyTitle: string;
  emptyBody: string;
}) {
  const rowCount = Array.isArray(children) ? children.length : children ? 1 : 0;

  return (
    <div className="mt-5 max-w-full rounded-lg border border-white/[0.06]">
      <div className="w-full overflow-x-auto">
        <table className="min-w-[720px] text-left text-[15px] [&_td]:whitespace-nowrap [&_th]:whitespace-nowrap">
          <thead className="bg-white/[0.015] text-[13px] uppercase tracking-[0.06em] text-zinc-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap px-3 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
      {rowCount === 0 ? <EmptyState title={emptyTitle} body={emptyBody} flat /> : null}
    </div>
  );
}

export function ExplorerLink({ url }: { url?: string | null }) {
  if (!url) {
    return <CircleDot className="h-4 w-4 text-zinc-600" />;
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex text-violet-200 transition hover:text-white" aria-label="Open in explorer">
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

export function EmptyState({ title, body, flat = false }: { title: string; body: string; flat?: boolean }) {
  return (
    <div className={cn("rounded-lg border border-dashed border-white/[0.10] p-5", flat ? "m-3" : "mt-6")}>
      <div className="font-medium text-white">{title}</div>
      <div className="mt-1 text-[15px] text-zinc-500">{body}</div>
    </div>
  );
}

export function LineChart() {
  return (
    <svg viewBox="0 0 320 96" className="mt-6 h-24 w-full overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="line-gradient" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#A970FF" />
        </linearGradient>
      </defs>
      <path d="M4 70 C32 68 38 54 62 57 C84 61 94 71 120 62 C144 54 158 42 184 50 C210 58 220 62 244 44 C268 24 284 42 316 12" fill="none" stroke="url(#line-gradient)" strokeWidth="2" />
      <path d="M4 70 C32 68 38 54 62 57 C84 61 94 71 120 62 C144 54 158 42 184 50 C210 58 220 62 244 44 C268 24 284 42 316 12" fill="none" stroke="#D8B4FE" strokeOpacity="0.28" strokeWidth="7" />
    </svg>
  );
}
