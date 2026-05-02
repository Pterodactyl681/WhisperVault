import { getSupabaseDatabaseConfig } from "../storage/config";
import type { SupabaseDatabaseConfig } from "../storage/config";
import { SupabaseRestClient, type SupabaseFetch } from "../storage/supabase-rest";
import type { ServerPaymentIntent, ServerPaylink } from "./types";
import type { WhisperPayServerRepository } from "./repository";

interface SupabaseWhisperPayServerRepositoryOptions {
  config?: SupabaseDatabaseConfig;
  client?: SupabaseRestClient;
  fetch?: SupabaseFetch;
}

interface PaylinkRow {
  id: string;
  owner_wallet: string;
  nickname: string;
  default_token: ServerPaylink["defaultToken"];
  created_at: string;
  is_active: boolean;
  metadata: ServerPaylink["metadata"] | null;
}

interface PaymentIntentRow {
  id: string;
  paylink_id: string;
  from_wallet: string;
  to_wallet: string;
  settlement_rail: ServerPaymentIntent["settlementRail"];
  token_symbol: ServerPaymentIntent["tokenSymbol"];
  status: ServerPaymentIntent["status"];
  created_at: string;
  tx_signature: string | null;
  er_lifecycle: ServerPaymentIntent["erLifecycle"];
  magic_private: ServerPaymentIntent["magicPrivate"];
  amount: string;
  mint: string;
  recipient: string;
  metadata: ServerPaymentIntent["metadata"] | null;
}

const PAYLINKS_TABLE = "whisperpay_paylinks";
const PAYMENT_INTENTS_TABLE = "whisperpay_payment_intents";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toPaylink = (row: PaylinkRow): ServerPaylink => ({
  id: row.id,
  ownerWallet: row.owner_wallet,
  nickname: row.nickname,
  defaultToken: row.default_token,
  createdAt: new Date(row.created_at).toISOString(),
  isActive: row.is_active,
  ...(row.metadata ? { metadata: clone(row.metadata) } : {})
});

const toPaylinkRow = (paylink: ServerPaylink): PaylinkRow => ({
  id: paylink.id,
  owner_wallet: paylink.ownerWallet,
  nickname: paylink.nickname,
  default_token: paylink.defaultToken,
  created_at: paylink.createdAt,
  is_active: paylink.isActive,
  metadata: paylink.metadata ? clone(paylink.metadata) : null
});

const toPaymentIntent = (row: PaymentIntentRow): ServerPaymentIntent => ({
  id: row.id,
  paylinkId: row.paylink_id,
  fromWallet: row.from_wallet,
  toWallet: row.to_wallet,
  settlementRail: row.settlement_rail,
  tokenSymbol: row.token_symbol,
  status: row.status,
  createdAt: new Date(row.created_at).toISOString(),
  txSignature: row.tx_signature,
  erLifecycle: row.er_lifecycle,
  magicPrivate: row.magic_private,
  amount: row.amount,
  mint: row.mint,
  recipient: row.recipient,
  ...(row.metadata ? { metadata: clone(row.metadata) } : {})
});

const toPaymentIntentRow = (paymentIntent: ServerPaymentIntent): PaymentIntentRow => ({
  id: paymentIntent.id,
  paylink_id: paymentIntent.paylinkId,
  from_wallet: paymentIntent.fromWallet,
  to_wallet: paymentIntent.toWallet,
  settlement_rail: paymentIntent.settlementRail,
  token_symbol: paymentIntent.tokenSymbol,
  status: paymentIntent.status,
  created_at: paymentIntent.createdAt,
  tx_signature: paymentIntent.txSignature,
  er_lifecycle: paymentIntent.erLifecycle,
  magic_private: paymentIntent.magicPrivate,
  amount: paymentIntent.amount,
  mint: paymentIntent.mint,
  recipient: paymentIntent.recipient,
  metadata: paymentIntent.metadata ? clone(paymentIntent.metadata) : null
});

export class SupabaseWhisperPayServerRepository implements WhisperPayServerRepository {
  private readonly client: SupabaseRestClient;

  constructor(options: SupabaseWhisperPayServerRepositoryOptions = {}) {
    this.client =
      options.client ??
      new SupabaseRestClient({
        config: options.config ?? getSupabaseDatabaseConfig(),
        fetch: options.fetch
      });
  }

  async createPaylink(paylink: ServerPaylink): Promise<ServerPaylink> {
    await this.client.insert<PaylinkRow>(PAYLINKS_TABLE, toPaylinkRow(paylink));
    return this.getPaylinkOrThrow(paylink.id);
  }

  async updatePaylink(paylink: ServerPaylink): Promise<ServerPaylink> {
    const updated = await this.client.update<PaylinkRow>(PAYLINKS_TABLE, { id: paylink.id }, toPaylinkRow(paylink));

    if (updated.length === 0) {
      await this.client.insert<PaylinkRow>(PAYLINKS_TABLE, toPaylinkRow(paylink));
    }

    return this.getPaylinkOrThrow(paylink.id);
  }

  async getPaylink(paylinkId: string): Promise<ServerPaylink | null> {
    const [row] = await this.client.select<PaylinkRow>(PAYLINKS_TABLE, { id: paylinkId });
    return row ? toPaylink(row) : null;
  }

  async listPaylinks(): Promise<ServerPaylink[]> {
    const rows = await this.client.select<PaylinkRow>(PAYLINKS_TABLE, {}, { order: "created_at.asc" });
    return rows.map(toPaylink);
  }

  async createPaymentIntent(paymentIntent: ServerPaymentIntent): Promise<ServerPaymentIntent> {
    await this.client.insert<PaymentIntentRow>(PAYMENT_INTENTS_TABLE, toPaymentIntentRow(paymentIntent));
    return this.getPaymentIntentOrThrow(paymentIntent.id);
  }

  async updatePaymentIntent(paymentIntent: ServerPaymentIntent): Promise<ServerPaymentIntent> {
    const updated = await this.client.update<PaymentIntentRow>(
      PAYMENT_INTENTS_TABLE,
      { id: paymentIntent.id },
      toPaymentIntentRow(paymentIntent)
    );

    if (updated.length === 0) {
      await this.client.insert<PaymentIntentRow>(PAYMENT_INTENTS_TABLE, toPaymentIntentRow(paymentIntent));
    }

    return this.getPaymentIntentOrThrow(paymentIntent.id);
  }

  async getPaymentIntent(paymentIntentId: string): Promise<ServerPaymentIntent | null> {
    const [row] = await this.client.select<PaymentIntentRow>(PAYMENT_INTENTS_TABLE, { id: paymentIntentId });
    return row ? toPaymentIntent(row) : null;
  }

  async listPaymentIntents(): Promise<ServerPaymentIntent[]> {
    const rows = await this.client.select<PaymentIntentRow>(PAYMENT_INTENTS_TABLE, {}, { order: "created_at.asc" });
    return rows.map(toPaymentIntent);
  }

  private async getPaylinkOrThrow(paylinkId: string): Promise<ServerPaylink> {
    const paylink = await this.getPaylink(paylinkId);

    if (!paylink) {
      throw new Error(`Paylink was not persisted for id "${paylinkId}".`);
    }

    return paylink;
  }

  private async getPaymentIntentOrThrow(paymentIntentId: string): Promise<ServerPaymentIntent> {
    const paymentIntent = await this.getPaymentIntent(paymentIntentId);

    if (!paymentIntent) {
      throw new Error(`Payment intent was not persisted for id "${paymentIntentId}".`);
    }

    return paymentIntent;
  }
}
