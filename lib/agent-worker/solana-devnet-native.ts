import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import type { SolanaDevnetNativeTransferInput, SolanaDevnetNativeTransferResult } from "./runner";

const DEFAULT_COMMITMENT = "confirmed";
const FALLBACK_LAMPORTS = 5_000;
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

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

const buildFallbackMemo = (input: SolanaDevnetNativeTransferInput): string =>
  [
    "whispervault",
    "native-fallback",
    input.paylinkId,
    input.agentId,
    input.displayAmount,
    input.displayMint
  ].join(":");

export const createSolanaDevnetNativeExecutor = (
  rpcUrl: string = process.env.SOLANA_RPC_URL?.trim() || clusterApiUrl("devnet")
) => {
  const connection = new Connection(rpcUrl, DEFAULT_COMMITMENT);

  return async (input: SolanaDevnetNativeTransferInput): Promise<SolanaDevnetNativeTransferResult> => {
    const payer = parseSolanaExecutorKeypair(input.secretKeyJson);
    const recipient = new PublicKey(input.recipient);
    const memo = buildFallbackMemo(input);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient,
        lamports: FALLBACK_LAMPORTS
      }),
      new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, "utf8")
      })
    );

    const txSignature = await sendAndConfirmTransaction(connection, transaction, [payer], {
      commitment: DEFAULT_COMMITMENT
    });

    return { txSignature };
  };
};
