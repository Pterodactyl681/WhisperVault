const path = require("node:path");

const normalize = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
};

const hasValue = (value) => Boolean(normalize(value));

const getStorageMode = () => {
  const explicit = normalize(process.env.STORAGE_MODE);

  if (explicit === "local" || explicit === "database") {
    return explicit;
  }

  if (process.env.NODE_ENV === "production" && hasValue(process.env.SUPABASE_URL) && hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return "database";
  }

  return "local";
};

const storageMode = getStorageMode();
const checks = [
  {
    name: "STORAGE_MODE",
    value: storageMode,
    level: "info",
    hint: storageMode === "database" ? "Database mode expects Supabase runtime credentials." : "Local mode uses the existing demo store."
  },
  {
    name: "SUPABASE_URL",
    value: normalize(process.env.SUPABASE_URL) ? "set" : "missing",
    level: storageMode === "database" ? "required" : "optional",
    hint: "Required for STORAGE_MODE=database."
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    value: normalize(process.env.SUPABASE_SERVICE_ROLE_KEY) ? "set" : "missing",
    level: storageMode === "database" ? "required" : "optional",
    hint: "Required for STORAGE_MODE=database."
  },
  {
    name: "TELEGRAM_BOT_TOKEN",
    value: normalize(process.env.TELEGRAM_BOT_TOKEN) ? "set" : "missing",
    level: "recommended",
    hint: "Required for webhook replies, push notifications, and live bot checks."
  },
  {
    name: "TELEGRAM_WEBHOOK_SECRET",
    value: normalize(process.env.TELEGRAM_WEBHOOK_SECRET) ? "set" : "missing",
    level: "recommended",
    hint: "Recommended for Telegram webhook verification."
  },
  {
    name: "WHISPERVAULT_WORKER_SECRET",
    value: normalize(process.env.WHISPERVAULT_WORKER_SECRET) ? "set" : "missing",
    level: "recommended",
    hint: "Recommended when the worker talks to a hosted control plane."
  },
  {
    name: "WHISPERVAULT_BASE_URL",
    value: normalize(process.env.WHISPERVAULT_BASE_URL) ?? "missing",
    level: "recommended",
    hint: "Worker control-plane URL. Local default is usually http://localhost:3000."
  },
  {
    name: "AGENT_WALLET_NAME",
    value: normalize(process.env.AGENT_WALLET_NAME) ?? "agent-treasury (default)",
    level: "info",
    hint: "Mirage wallet name used by the worker."
  },
  {
    name: "MIRAGE_EXECUTION_ENABLED",
    value: normalize(process.env.MIRAGE_EXECUTION_ENABLED) ?? "false",
    level: "recommended",
    hint: "Set true only for real worker execution. Leave false for dry-run validation."
  }
];

const warnings = [];

console.log("WhisperVault Telegram demo check");
console.log(`- Workspace: ${path.basename(process.cwd())}`);

for (const check of checks) {
  console.log(`- ${check.name}: ${check.value} [${check.level}]`);

  if (check.hint) {
    console.log(`  ${check.hint}`);
  }

  if (check.level === "required" && check.value === "missing") {
    warnings.push(`${check.name} is required for ${storageMode} mode.`);
  }

  if (check.level === "recommended" && check.value === "missing") {
    warnings.push(`${check.name} is missing.`);
  }
}

console.log("- Worker dry-run ready:", normalize(process.env.WHISPERVAULT_BASE_URL) ? "yes" : "likely local default");
console.log(
  "- Live Telegram push ready:",
  hasValue(process.env.TELEGRAM_BOT_TOKEN) && hasValue(process.env.WHISPERVAULT_BASE_URL) ? "yes" : "not yet"
);
console.log(
  "- Live Mirage execution ready:",
  normalize(process.env.MIRAGE_EXECUTION_ENABLED)?.toLowerCase() === "true" ? "yes" : "not yet"
);

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
} else {
  console.log("No blocking env gaps detected for the selected mode.");
}
