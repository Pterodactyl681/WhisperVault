import type { SectionId } from "./types";

export const GITHUB_URL = "https://github.com/Pterodactyl681/WhisperVault";
export const DOCS_URL = "https://github.com/Pterodactyl681/WhisperVault#readme";
export const TELEGRAM_REFERENCE_BOT_URL = process.env.NEXT_PUBLIC_TELEGRAM_BOT_URL?.trim() ?? "";

export const formControlClass =
  "smooth-control h-12 w-full min-w-0 rounded-xl border border-slate-700/70 bg-[#06111f]/80 px-3 text-[16px] text-slate-100 caret-violet-300 outline-none placeholder:text-slate-500 transition focus:border-violet-400/70 focus:bg-[#081426] focus:shadow-[0_0_0_2px_rgba(139,92,246,0.20)] disabled:cursor-not-allowed disabled:border-slate-800 disabled:bg-slate-900/45 disabled:text-slate-500 [color-scheme:dark]";

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
