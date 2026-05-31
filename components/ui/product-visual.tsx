import Image from "next/image";
import { cn } from "@/lib/utils";

export type ProductVisualKind =
  | "overview"
  | "ghost"
  | "firewall"
  | "executions"
  | "receipts"
  | "agents"
  | "simulator"
  | "settings";

const visualConfig: Record<ProductVisualKind, { src: string; alt: string }> = {
  overview: { src: "/whisper-visuals/overview-core.png", alt: "WhisperVault core" },
  ghost: { src: "/whisper-visuals/ghost-allowance.png", alt: "Ghost allowance" },
  firewall: { src: "/whisper-visuals/firewall-shield.png", alt: "Firewall shield" },
  executions: { src: "/whisper-visuals/execution-route.png", alt: "Execution route" },
  receipts: { src: "/whisper-visuals/receipt-ledger.png", alt: "Receipt ledger" },
  agents: { src: "/whisper-visuals/agent-vault.png", alt: "Agent vault" },
  simulator: { src: "/whisper-visuals/simulator-scan.png", alt: "Simulator scan" },
  settings: { src: "/whisper-visuals/settings-core.png", alt: "Settings core" }
};

const sizeClasses = {
  sm: "h-14 w-14",
  md: "h-24 w-24 sm:h-28 sm:w-28",
  lg: "h-40 w-40 sm:h-52 sm:w-52",
  hero: "h-56 w-56 sm:h-64 sm:w-64 lg:h-72 lg:w-72"
};

const imageSizes = {
  sm: 64,
  md: 128,
  lg: 220,
  hero: 320
};

export function ProductVisual({
  kind,
  size = "md",
  className,
  priority = false
}: {
  kind: ProductVisualKind;
  size?: "sm" | "md" | "lg" | "hero";
  className?: string;
  priority?: boolean;
}) {
  const config = visualConfig[kind];
  const imageSize = imageSizes[size];

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none relative flex select-none items-center justify-center overflow-visible",
        sizeClasses[size],
        className
      )}
    >
      <div className="absolute inset-[-18%] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(124,58,237,0.24),rgba(45,212,230,0.09)_44%,transparent_72%)] blur-md" />
      <Image
        src={config.src}
        alt={config.alt}
        width={1024}
        height={1024}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        sizes={`${imageSize}px`}
        className="relative h-full w-full object-contain opacity-90 drop-shadow-[0_0_24px_rgba(124,58,237,0.34)]"
      />
    </div>
  );
}
