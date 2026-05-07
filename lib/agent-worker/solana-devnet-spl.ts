import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import type { SolanaDevnetSplTransferInput, SolanaDevnetSplTransferResult } from "./runner";

const DEVNET_USDC_DECIMALS = 6;
const DEFAULT_COMMITMENT = "confirmed";

export const parseSolanaExecutorKeypair = (secretKeyJson: string): Keypair => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(secretKeyJson);
  } catch {
    throw new Error("SOLANA_EXECUTOR_SECRET_KEY_JSON must be a JSON array.");
  }

  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every((value) => Number.isInteger(value))) {
    throw new Error("SOLANA_EXECUTOR_SECRET_KEY_JSON must be a JSON array keypair with 64 integer values.");
  }

  return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
};

const toBaseUnits = (amount: string, decimals: number): bigint => {
  const normalized = amount.trim();

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Fallback amount must be a positive decimal string.");
  }

  const [whole, fraction = ""] = normalized.split(".");

  if (fraction.length > decimals) {
    throw new Error(`Fallback amount supports at most ${decimals} decimal places.`);
  }

  const paddedFraction = fraction.padEnd(decimals, "0");
  const baseUnits = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");

  if (baseUnits <= 0n) {
    throw new Error("Fallback amount must be greater than zero.");
  }

  return baseUnits;
};

export const createSolanaDevnetSplExecutor = (
  rpcUrl: string = process.env.SOLANA_RPC_URL?.trim() || clusterApiUrl("devnet")
) => {
  const connection = new Connection(rpcUrl, DEFAULT_COMMITMENT);

  return async (input: SolanaDevnetSplTransferInput): Promise<SolanaDevnetSplTransferResult> => {
    const payer = parseSolanaExecutorKeypair(input.secretKeyJson);
    const mint = new PublicKey(input.mint);
    const recipient = new PublicKey(input.recipient);
    const sourceAta = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_PROGRAM_ID);
    const recipientAta = getAssociatedTokenAddressSync(mint, recipient, false, TOKEN_PROGRAM_ID);
    const amount = toBaseUnits(input.amount, DEVNET_USDC_DECIMALS);
    const transaction = new Transaction();

    await getAccount(connection, sourceAta, DEFAULT_COMMITMENT, TOKEN_PROGRAM_ID);

    try {
      await getAccount(connection, recipientAta, DEFAULT_COMMITMENT, TOKEN_PROGRAM_ID);
    } catch {
      transaction.add(
        createAssociatedTokenAccountInstruction(payer.publicKey, recipientAta, recipient, mint, TOKEN_PROGRAM_ID)
      );
    }

    transaction.add(
      createTransferCheckedInstruction(
        sourceAta,
        mint,
        recipientAta,
        payer.publicKey,
        amount,
        DEVNET_USDC_DECIMALS,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const txSignature = await sendAndConfirmTransaction(connection, transaction, [payer], {
      commitment: DEFAULT_COMMITMENT
    });

    return { txSignature };
  };
};
