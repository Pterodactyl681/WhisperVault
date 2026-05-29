import type { SectionId } from "./types";

export const GITHUB_URL = "https://github.com/Pterodactyl681/WhisperVault";
export const X_URL = "#";
export const DOCS_URL = "https://github.com/Pterodactyl681/WhisperVault#readme";
export const TELEGRAM_REFERENCE_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim() ?? "";

export const formControlClass =
  "h-12 w-full min-w-0 rounded-lg border border-[#27345C] bg-[#071024] px-3 text-[16px] text-white caret-violet-300 outline-none transition placeholder:text-slate-500 focus:border-violet-400/70 focus:bg-[#0A1430] focus:shadow-[0_0_0_3px_rgba(139,92,246,0.18),0_0_26px_rgba(110,72,255,0.18)] disabled:cursor-not-allowed disabled:border-white/[0.06] disabled:bg-[#07070D] disabled:text-zinc-600 [color-scheme:dark]";

export const sectionCopy: Record<SectionId, { title: string; subtitle: string }> = {
  overview: {
    title: "Overview",
    subtitle: "Command center for AI agents and spend control."
  },
  allowance: {
    title: "Ghost Allowance",
    subtitle: "Live private allowance state for the active spend session."
  },
  firewall: {
    title: "Firewall",
    subtitle: "Policy controls for caps, recipients, risk, and blocked spend."
  },
  executions: {
    title: "Executions",
    subtitle: "Queue and history for agent payment execution."
  },
  receipts: {
    title: "Receipts",
    subtitle: "Confirmed settlement records and devnet explorer links."
  },
  agents: {
    title: "Agents",
    subtitle: "Agent vaults, active routing, and allowance health."
  },
  simulator: {
    title: "Simulator",
    subtitle: "Dry-run unsafe agent behavior without creating transactions."
  },
  settings: {
    title: "Settings",
    subtitle: "Local app configuration for the devnet command center."
  }
};

export const dashboardSourceLabels = {
  agentList: "Agent List",
  spendIntentPanel: "Spend Intent Panel"
} as const;
