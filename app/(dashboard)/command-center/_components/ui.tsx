"use client";

import { Children, isValidElement, useEffect, useMemo, useRef, useState } from "react";
import type { ButtonHTMLAttributes, ChangeEvent, CSSProperties, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, CircleDot, Copy, ExternalLink, Loader2, LogOut, Network, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { formControlClass } from "./constants";
import { percentOf, statusTone } from "./utils";
import type { Notice } from "./types";

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900/70 via-slate-950/60 to-slate-950/90 p-5 shadow-[0_0_40px_rgba(124,58,237,0.08)] backdrop-blur-xl", className)}>
      {children}
    </section>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-[15px] font-semibold tracking-[0.02em] text-violet-200">{children}</h2>;
}

export function NoticeBanner({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <div
      className={cn(
        "mb-5 rounded-lg border px-4 py-3 text-[15px] shadow-[0_18px_55px_rgba(0,0,0,0.22)] backdrop-blur-xl",
        notice.tone === "success" ? "border-emerald-400/20 bg-emerald-400/8 text-emerald-100" : "",
        notice.tone === "warning" ? "border-amber-300/22 bg-amber-300/9 text-amber-100" : "",
        notice.tone === "error" ? "border-red-400/22 bg-red-500/9 text-red-100" : ""
      )}
    >
      {notice.message}
    </div>
  );
}

export function LoadingStrip() {
  return (
    <div className="mb-5 flex items-center gap-2 rounded-lg border border-violet-300/12 bg-violet-400/7 px-4 py-3 text-[15px] text-violet-100/75">
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
    <div className={cn("rounded-lg border border-white/[0.07] bg-white/[0.028]", compact ? "p-3" : "p-4")}>
      <div className="text-[13px] font-medium text-slate-500">{label}</div>
      <div className={cn("mt-2 min-w-0 break-words font-medium text-white", compact ? "text-[15px]" : "text-[17px]")}>{value}</div>
    </div>
  );
}

export function StatusBadge({ status, children }: { status?: string | null; children?: ReactNode }) {
  const tone = statusTone(status);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium tracking-normal",
        tone === "success" ? "border-emerald-400/22 bg-emerald-400/9 text-emerald-200" : "",
        tone === "warning" ? "border-amber-300/22 bg-amber-300/9 text-amber-200" : "",
        tone === "danger" ? "border-red-400/22 bg-red-400/9 text-red-200" : "",
        tone === "neutral" ? "border-white/10 bg-white/[0.035] text-slate-300" : ""
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
      className="smooth-control grid h-10 w-10 place-items-center rounded-lg border border-white/10 bg-[#071121]/72 text-violet-100/64 hover:border-violet-300/24 hover:bg-violet-400/8 hover:text-white hover:shadow-[0_0_18px_rgba(167,139,250,0.12)]"
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
    "smooth-control inline-flex min-h-11 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-slate-700/70 bg-slate-950/50 px-4 text-center text-[15px] font-medium text-slate-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-violet-300/38 hover:bg-violet-500/12 focus-visible:border-violet-400/65 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.16)] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800/70 disabled:text-slate-400 disabled:opacity-55 sm:w-auto",
    className
  );

  if (asAnchor) {
    return (
      <a href={href} className={cn(baseClassName, props.disabled ? "pointer-events-none opacity-75" : "")}>
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
      className="smooth-control inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-violet-300/35 bg-[linear-gradient(135deg,#7C3AED,#4F46E5)] px-4 text-[15px] font-semibold text-white shadow-[0_16px_42px_rgba(91,33,182,0.26)] hover:border-violet-200/55 hover:shadow-[0_18px_46px_rgba(124,58,237,0.32)] focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(139,92,246,0.20)] disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800/70 disabled:text-slate-400 disabled:opacity-55 sm:w-auto"
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
  const { children, className, value, defaultValue, onChange, disabled, name, id, "aria-label": ariaLabel } = props;
  const [open, setOpen] = useState(false);
  const [internalValue, setInternalValue] = useState(() => String(value ?? defaultValue ?? ""));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const options = useMemo(
    () =>
      Children.toArray(children)
        .filter(isValidElement)
        .map((child) => {
          const childProps = child.props as { value?: string; children?: ReactNode; disabled?: boolean };
          return {
            value: String(childProps.value ?? ""),
            label: Children.toArray(childProps.children).join(""),
            disabled: Boolean(childProps.disabled)
          };
        }),
    [children]
  );
  const selectedValue = String(value ?? internalValue);
  const selectedOption = options.find((option) => option.value === selectedValue) ?? options[0];

  useEffect(() => {
    if (value !== undefined) {
      setInternalValue(String(value));
    }
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const chooseValue = (nextValue: string) => {
    setInternalValue(nextValue);
    setOpen(false);
    onChange?.({
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name }
    } as unknown as ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {name ? <input type="hidden" name={name} value={selectedValue} /> : null}
      <button
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={cn(formControlClass, "flex items-center justify-between gap-3 text-left")}
      >
        <span className={cn("truncate", selectedOption?.value ? "text-slate-100" : "text-slate-400")}>{selectedOption?.label ?? "Select"}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-violet-200/80 transition-transform", open ? "rotate-180" : "")} />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute z-40 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-violet-300/35 bg-[#071121]/98 p-1.5 shadow-[0_18px_44px_rgba(0,0,0,0.42),0_0_0_1px_rgba(255,255,255,0.03)] backdrop-blur-xl"
        >
          {options.map((option) => {
            const active = option.value === selectedValue;
            return (
              <button
                key={option.value || option.label}
                type="button"
                role="option"
                aria-selected={active}
                disabled={option.disabled}
                onClick={() => chooseValue(option.value)}
                className={cn(
                  "flex min-h-10 w-full items-center rounded-lg px-3 text-left text-[15px] transition-colors",
                  active ? "bg-violet-500/18 text-violet-100" : "text-slate-300 hover:bg-white/[0.06] hover:text-white",
                  option.disabled ? "cursor-not-allowed opacity-45" : ""
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-medium tracking-[0.01em] text-slate-500">{label}</span>
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

export function GlowPanel({
  children,
  className,
  intensity = "normal"
}: {
  children: ReactNode;
  className?: string;
  intensity?: "normal" | "strong" | "quiet";
}) {
  return (
    <section
      className={cn(
        "relative min-w-0 overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900/70 via-slate-950/60 to-slate-950/90 shadow-[0_0_40px_rgba(124,58,237,0.08)] backdrop-blur-xl",
        "before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_18%_0%,rgba(124,58,237,0.13),transparent_34%),radial-gradient(circle_at_90%_10%,rgba(59,130,246,0.08),transparent_28%)] before:opacity-70",
        intensity === "strong" ? "border-violet-300/20 shadow-[0_0_54px_rgba(124,58,237,0.14),0_22px_72px_rgba(0,0,0,0.32)] before:opacity-100" : "",
        intensity === "quiet" ? "before:opacity-35" : "",
        className
      )}
    >
      <div className="relative">{children}</div>
    </section>
  );
}

export function StatCard({
  icon,
  label,
  value,
  detail,
  tone = "violet"
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail?: string;
  tone?: "violet" | "blue" | "emerald" | "amber" | "red";
}) {
  const toneClasses = {
    violet: "border-white/10 bg-white/[0.04] text-violet-200",
    blue: "border-blue-300/20 bg-blue-500/10 text-blue-200",
    emerald: "border-emerald-300/20 bg-emerald-500/10 text-emerald-200",
    amber: "border-amber-300/22 bg-amber-500/10 text-amber-200",
    red: "border-red-300/22 bg-red-500/10 text-red-200"
  }[tone];

  return (
    <GlowPanel className="p-4" intensity="quiet">
      <div className="flex min-w-0 items-center gap-4">
        <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", toneClasses)}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] text-slate-400">{label}</div>
          <div className="mt-1 truncate text-[28px] font-semibold leading-none text-white" title={value}>
            {value}
          </div>
          {detail ? <div className="mt-2 truncate text-[13px] text-slate-500">{detail}</div> : null}
        </div>
      </div>
    </GlowPanel>
  );
}

export function TopStatusBar({
  connected,
  connecting,
  onWalletAction,
  runtimeLabel = "Private Rail Ready",
  networkLabel = "Devnet"
}: {
  connected: boolean;
  connecting: boolean;
  onWalletAction: () => void;
  runtimeLabel?: string;
  networkLabel?: string;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <StatusPill icon={<Network className="h-4 w-4 text-blue-300" />} label={networkLabel} className="w-full border-blue-300/16 bg-blue-500/8 text-blue-100 sm:w-auto" />
      <StatusPill icon={<span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]" />} label={runtimeLabel} className="w-full border-emerald-300/16 bg-emerald-500/8 text-emerald-100 sm:w-auto" />
      <HeaderWalletButton connected={connected} connecting={connecting} onClick={onWalletAction} />
    </div>
  );
}

export function StatusPill({ icon, label, className }: { icon: ReactNode; label: string; className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-950/50 px-4 text-[14px] font-medium text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl",
        className
      )}
    >
      {icon}
      <span className="whitespace-nowrap">{label}</span>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-[31px] font-semibold leading-tight tracking-normal text-white sm:text-[38px]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-[16px] leading-7 text-slate-400">{subtitle}</p> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </header>
  );
}

export function HeroCore({
  variant = "star",
  label,
  value,
  className
}: {
  variant?: "star" | "shield" | "orb" | "cube" | "document" | "pipeline" | "radar";
  label?: string;
  value?: string;
  className?: string;
}) {
  const isCube = variant === "cube";
  const isOrb = variant === "orb";
  const isDocument = variant === "document";
  const isPipeline = variant === "pipeline";
  const isRadar = variant === "radar";
  const isShield = variant === "shield";
  return (
    <div className={cn("relative grid min-h-[260px] place-items-center overflow-hidden", className)} aria-hidden="true">
      <div className="hero-core-aura absolute inset-0" />
      <div className="absolute bottom-8 h-10 w-64 rounded-full border border-violet-300/16 bg-violet-500/8 blur-[1px] shadow-[0_0_42px_rgba(124,58,237,0.22)]" />
      <div className="hero-orbit absolute h-60 w-60 rounded-full border border-violet-200/12" />
      <div className="hero-orbit absolute h-72 w-72 rotate-12 rounded-full border border-blue-200/8 [animation-delay:-2.4s]" />
      <div className="absolute h-40 w-40 rounded-full border border-violet-200/14 shadow-[0_0_42px_rgba(124,58,237,0.12)]" />
      <div className="relative grid place-items-center">
        {isShield ? (
          <div className="hero-shield-field relative h-48 w-48">
            <span className="absolute inset-8 rounded-[34%_34%_44%_44%/26%_26%_60%_60%] border border-violet-200/28 bg-[linear-gradient(160deg,rgba(124,58,237,0.22),rgba(14,165,233,0.08)_48%,rgba(2,6,23,0.62))] shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_0_34px_rgba(124,58,237,0.22)]" />
            <span className="absolute inset-x-12 top-16 h-px bg-violet-200/50" />
            <span className="absolute inset-x-14 top-24 h-px bg-blue-200/30" />
          </div>
        ) : isCube ? (
          <div className="agent-vault-core">
            <div className="agent-vault-core__lid" />
            <div className="agent-vault-core__face">
              <span />
              <span />
            </div>
          </div>
        ) : isOrb ? (
          <div className="relative grid h-64 w-64 place-items-center rounded-full bg-[conic-gradient(from_210deg,#8B5CF6_0deg,#C4B5FD_118deg,rgba(59,130,246,0.34)_206deg,rgba(255,255,255,0.08)_360deg)] p-[2px] shadow-[0_0_54px_rgba(124,58,237,0.28)]">
            <div className="absolute inset-5 rounded-full border border-violet-200/12" />
            <div className="absolute inset-10 rounded-full border border-blue-200/10" />
            <div className="grid h-full w-full place-items-center rounded-full border border-white/[0.08] bg-[radial-gradient(circle_at_50%_36%,rgba(124,58,237,0.24),rgba(5,10,25,0.94)_64%)]">
              <div className="text-center">
                {label ? <div className="text-[12px] font-medium tracking-[0.14em] text-violet-200/75">{label}</div> : null}
                <div className="mt-3 text-[58px] font-semibold leading-none text-white">{value ?? "0"}</div>
                <div className="mt-2 text-[15px] text-slate-400">USDC live</div>
              </div>
            </div>
          </div>
        ) : isDocument ? (
          <div className="grid h-40 w-32 place-items-center rounded-2xl border border-violet-200/28 bg-[linear-gradient(145deg,rgba(124,58,237,0.18),rgba(15,23,42,0.78))] shadow-[0_22px_55px_rgba(0,0,0,0.32),0_0_34px_rgba(124,58,237,0.20)]">
            <div className="space-y-3">
              <span className="block h-2 w-14 rounded-full bg-violet-200/70" />
              <span className="block h-2 w-20 rounded-full bg-violet-200/50" />
              <span className="block h-2 w-12 rounded-full bg-violet-200/40" />
            </div>
          </div>
        ) : isPipeline ? (
          <div className="relative h-36 w-64">
            <span className="absolute left-8 right-8 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-violet-200/55 to-transparent" />
            {[0, 1, 2].map((item) => (
              <span
                key={item}
                className="absolute top-1/2 grid h-16 w-16 -translate-y-1/2 place-items-center rounded-2xl border border-violet-200/22 bg-[#071121]/80 shadow-[0_0_30px_rgba(124,58,237,0.20)]"
                style={{ left: `${item * 96}px` }}
              >
                <span className="h-3 w-3 rounded-full bg-violet-200 shadow-[0_0_20px_rgba(196,181,253,0.86)]" />
              </span>
            ))}
          </div>
        ) : isRadar ? (
          <div className="hero-radar relative grid h-56 w-56 place-items-center rounded-full border border-emerald-200/16 bg-[radial-gradient(circle,rgba(16,185,129,0.18),rgba(2,6,23,0.58)_62%,transparent_72%)]">
            <span className="absolute inset-8 rounded-full border border-emerald-200/14" />
            <span className="absolute inset-16 rounded-full border border-emerald-200/12" />
            <span className="hero-radar-sweep absolute h-1/2 w-px origin-bottom bg-gradient-to-t from-emerald-200/70 to-transparent" />
            <span className="h-3 w-3 rounded-full bg-emerald-200 shadow-[0_0_22px_rgba(110,231,183,0.8)]" />
          </div>
        ) : (
          <div className="hero-star-core relative grid h-44 w-44 place-items-center">
            <span className="absolute h-36 w-36 rounded-full border border-violet-200/14" />
            <span className="absolute h-20 w-20 rounded-full bg-[radial-gradient(circle,#f5d8ff_0%,#a78bfa_34%,rgba(124,58,237,0.22)_62%,transparent_72%)] shadow-[0_0_52px_rgba(167,139,250,0.46)]" />
            <span className="absolute h-px w-40 bg-gradient-to-r from-transparent via-violet-100/70 to-transparent" />
            <span className="absolute h-40 w-px bg-gradient-to-b from-transparent via-violet-100/60 to-transparent" />
          </div>
        )}
        {!isOrb && (label || value) ? (
          <div className="absolute text-center">
            {label ? <div className="text-[12px] uppercase tracking-[0.16em] text-violet-200/80">{label}</div> : null}
            {value ? <div className="mt-2 text-[46px] font-semibold leading-none text-white">{value}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DataTableShell({ children, minWidth = 760 }: { children: ReactNode; minWidth?: number }) {
  return (
    <div className="max-w-full rounded-xl border border-[#27365F] bg-[#071127]/70">
      <div className="w-full overflow-x-auto">
        <div style={{ minWidth }} className="w-full">
          {children}
        </div>
      </div>
    </div>
  );
}

export function Timeline({ items }: { items: { label: string; detail: string; status?: "done" | "active" | "muted" }[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      {items.map((item, index) => (
        <div key={item.label} className="relative min-w-0">
          {index < items.length - 1 ? <div className="absolute left-6 top-6 hidden h-px w-[calc(100%+1rem)] bg-violet-400/50 md:block" /> : null}
          <div className="relative z-10 flex flex-col gap-3">
            <div
              className={cn(
                "grid h-12 w-12 place-items-center rounded-full border bg-[#0A1530]",
                item.status === "muted" ? "border-dashed border-slate-500/60 text-slate-500" : "border-violet-300/70 text-violet-100 shadow-[0_0_24px_rgba(124,58,237,0.55)]"
              )}
            >
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium text-white">{item.label}</div>
              <div className="mt-1 text-[14px] leading-5 text-slate-500">{item.detail}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ValidationChecklist({
  items
}: {
  items: { label: string; detail: string; status: "passed" | "allowed" | "blocked" | "pending" }[];
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.035] px-3 py-3">
          <CheckCircle2
            className={cn(
              "h-4 w-4 shrink-0",
              item.status === "blocked" ? "text-red-400" : item.status === "pending" ? "text-amber-300" : "text-emerald-300"
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-white">{item.label}</div>
            <div className="mt-0.5 truncate text-[13px] text-slate-500">{item.detail}</div>
          </div>
          <StatusBadge status={item.status}>{item.status}</StatusBadge>
        </div>
      ))}
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
