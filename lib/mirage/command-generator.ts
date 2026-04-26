export interface MirageTransferCommandInput {
  walletName?: string;
  recipient: string;
  amount: string;
  mint: string;
  memo: string;
  visibility?: "private";
  split?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  cluster?: string;
  json?: boolean;
}

export interface MirageTransferCommandOutput {
  command: "mirage";
  argv: string[];
  displayCommand: string;
  walletName: string;
  warnings: string[];
}

const DEFAULT_WALLET_NAME = "agent-treasury";
const DEFAULT_VISIBILITY = "private";
const DEFAULT_SPLIT = 4;
const DEFAULT_MIN_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5000;
const DEFAULT_CLUSTER = "devnet";

const assertNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const assertPositiveDecimalString = (value: string): string => {
  const normalized = value.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized) || Number(normalized) <= 0) {
    throw new Error("amount must be a positive decimal string.");
  }

  return normalized;
};

const assertNonNegativeInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }

  return value;
};

const quoteArg = (value: string): string => {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
};

export const generateMirageTransferCommand = (
  input: MirageTransferCommandInput
): MirageTransferCommandOutput => {
  const walletName = input.walletName?.trim() || DEFAULT_WALLET_NAME;
  const recipient = assertNonEmptyString(input.recipient, "recipient");
  const amount = assertPositiveDecimalString(input.amount);
  const mint = assertNonEmptyString(input.mint, "mint");
  const memo = assertNonEmptyString(input.memo, "memo");
  const visibility = input.visibility ?? DEFAULT_VISIBILITY;
  const split = input.split ?? DEFAULT_SPLIT;
  const minDelayMs = input.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  const maxDelayMs = input.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const cluster = input.cluster?.trim() || DEFAULT_CLUSTER;

  if (visibility !== "private") {
    throw new Error("visibility must be private.");
  }

  if (!Number.isInteger(split) || split < 1 || split > 15) {
    throw new Error("split must be an integer between 1 and 15.");
  }

  assertNonNegativeInteger(minDelayMs, "minDelayMs");
  assertNonNegativeInteger(maxDelayMs, "maxDelayMs");

  if (maxDelayMs < minDelayMs) {
    throw new Error("maxDelayMs must be greater than or equal to minDelayMs.");
  }

  const argv = [
    "transfer",
    "--wallet",
    walletName,
    "--to",
    recipient,
    "--mint",
    mint,
    "--amount",
    amount,
    "--visibility",
    "private",
    "--cluster",
    cluster,
    "--memo",
    memo,
    "--min-delay-ms",
    String(minDelayMs),
    "--max-delay-ms",
    String(maxDelayMs),
    "--split",
    String(split)
  ];

  if (input.json === true) {
    argv.push("--json");
  }

  return {
    command: "mirage",
    argv,
    displayCommand: ["mirage", ...argv].map(quoteArg).join(" "),
    walletName,
    warnings: [
      "Preview only. WhisperPay does not execute Mirage commands in this step.",
      "Do not add passphrases, private keys, seed phrases, or auth tokens to this command."
    ]
  };
};
