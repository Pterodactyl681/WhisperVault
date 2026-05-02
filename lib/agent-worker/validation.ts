import { isValidSolanaPublicKey } from "../solana-validation";

export interface MirageArgvValidationOptions {
  agentWalletName?: string;
}

const REQUIRED_FLAGS = new Set([
  "--wallet",
  "--to",
  "--mint",
  "--amount",
  "--visibility",
  "--cluster",
  "--memo",
  "--min-delay-ms",
  "--max-delay-ms",
  "--split"
]);

const assertPositiveDecimal = (value: string, fieldName: string): void => {
  if (!/^\d+(\.\d+)?$/.test(value) || Number(value) <= 0) {
    throw new Error(`${fieldName} must be a positive decimal string.`);
  }
};

const assertNonNegativeInteger = (value: string, fieldName: string): void => {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${fieldName} must be a non-negative integer.`);
  }
};

const readFlagMap = (argv: string[]): Map<string, string> => {
  if (argv[0] !== "transfer") {
    throw new Error("Mirage argv must start with transfer.");
  }

  const flags = new Map<string, string>();

  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!flag || !flag.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new Error("Mirage argv must be flag/value pairs.");
    }

    if (!REQUIRED_FLAGS.has(flag)) {
      throw new Error(`Unsupported Mirage argv flag: ${flag}.`);
    }

    if (flags.has(flag)) {
      throw new Error(`Duplicate Mirage argv flag: ${flag}.`);
    }

    flags.set(flag, value);
  }

  for (const flag of REQUIRED_FLAGS) {
    if (!flags.has(flag)) {
      throw new Error(`Missing Mirage argv flag: ${flag}.`);
    }
  }

  return flags;
};

export const validateMirageTransferArgv = (
  argv: string[],
  options: MirageArgvValidationOptions = {}
): string[] => {
  const flags = readFlagMap(argv);
  const walletName = flags.get("--wallet") ?? "";
  const allowedWallets = new Set(["agent-treasury", options.agentWalletName?.trim()].filter(Boolean));

  if (!allowedWallets.has(walletName)) {
    throw new Error("Mirage wallet name is not allowed for this worker.");
  }

  const recipient = flags.get("--to") ?? "";

  if (!isValidSolanaPublicKey(recipient)) {
    throw new Error("Mirage recipient must be a valid Solana public key.");
  }

  if ((flags.get("--mint") ?? "").trim().toUpperCase() !== "USDC") {
    throw new Error("Mirage mint must be USDC for this worker.");
  }

  assertPositiveDecimal(flags.get("--amount") ?? "", "Mirage amount");

  if (flags.get("--visibility") !== "private") {
    throw new Error("Mirage visibility must be private.");
  }

  if (flags.get("--cluster") !== "devnet") {
    throw new Error("Mirage cluster must be devnet.");
  }

  const memo = flags.get("--memo") ?? "";

  if (!/^whisperpay:agent:[A-Za-z0-9_.:-]+:paylink:[A-Za-z0-9_.:-]+$/.test(memo)) {
    throw new Error("Mirage memo must be a WhisperVault agent paylink memo.");
  }

  assertNonNegativeInteger(flags.get("--min-delay-ms") ?? "", "Mirage min delay");
  assertNonNegativeInteger(flags.get("--max-delay-ms") ?? "", "Mirage max delay");

  const minDelayMs = Number(flags.get("--min-delay-ms"));
  const maxDelayMs = Number(flags.get("--max-delay-ms"));

  if (maxDelayMs < minDelayMs) {
    throw new Error("Mirage max delay must be greater than or equal to min delay.");
  }

  const split = Number(flags.get("--split"));

  if (!Number.isInteger(split) || split < 1 || split > 15) {
    throw new Error("Mirage split must be an integer between 1 and 15.");
  }

  return [...argv];
};
