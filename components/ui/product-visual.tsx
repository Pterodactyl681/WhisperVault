import Image from "next/image";
import { cn } from "@/lib/utils";

type ProductVisualKind =
  | "overview"
  | "ghost"
  | "firewall"
  | "executions"
  | "receipts"
  | "agents"
  | "simulator"
  | "settings";

const visualConfig: Record<ProductVisualKind, { src: string; alt: string; round: "full" | "soft" }> = {
  overview: { src: "/whisper-visuals/overview-core.png", alt: "WhisperVault core", round: "full" },
  ghost: { src: "/whisper-visuals/ghost-allowance.png", alt: "Ghost allowance", round: "full" },
  firewall: { src: "/whisper-visuals/firewall-shield.png", alt: "Firewall shield", round: "soft" },
  executions: { src: "/whisper-visuals/execution-route.png", alt: "Execution route", round: "soft" },
  receipts: { src: "/whisper-visuals/receipt-ledger.png", alt: "Receipt ledger", round: "soft" },
  agents: { src: "/whisper-visuals/agent-vault.png", alt: "Agent vault", round: "soft" },
  simulator: { src: "/whisper-visuals/simulator-scan.png", alt: "Simulator scan", round: "full" },
  settings: { src: "/whisper-visuals/settings-core.png", alt: "Settings core", round: "full" }
};

const sizeClasses = {
  sm: "h-28 w-28 sm:h-32 sm:w-32",
  md: "h-36 w-36 sm:h-44 sm:w-44",
  lg: "h-44 w-44 sm:h-56 sm:w-56"
};

const imageSizes = {
  sm: 144,
  md: 192,
  lg: 240
};

export function ProductVisual({
  kind,
  size = "md",
  className
}: {
  kind: ProductVisualKind;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const config = visualConfig[kind];
  const priority = kind === "overview";
  const imageSize = imageSizes[size];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative flex select-none items-center justify-center overflow-hidden",
        config.round === "full" ? "rounded-full" : "rounded-2xl",
        sizeClasses[size],
        className
      )}
    >
      <div className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_50%_48%,rgba(124,58,237,0.26),rgba(45,212,230,0.10)_42%,transparent_70%)] blur-sm" />
      <div className="absolute inset-[12%] rounded-[inherit] border border-white/[0.06] bg-slate-950/12" />
      <Image
        src={config.src}
        alt={config.alt}
        width={1024}
        height={1024}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        sizes={`${imageSize}px`}
        className="relative h-[88%] w-[88%] object-contain opacity-90 drop-shadow-[0_0_26px_rgba(124,58,237,0.36)]"
      />
    </div>
  );
}
