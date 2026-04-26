import { PublicKey } from "@solana/web3.js";

export const isValidSolanaPublicKey = (value: string): boolean => {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  try {
    new PublicKey(normalized);
    return true;
  } catch {
    return false;
  }
};

export const isLikelySolanaSignature = (value: string): boolean =>
  /^[1-9A-HJ-NP-Za-km-z]{64,96}$/.test(value.trim());
