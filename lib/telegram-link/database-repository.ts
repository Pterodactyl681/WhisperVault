import { getSupabaseDatabaseConfig } from "../storage/config";
import type { SupabaseDatabaseConfig } from "../storage/config";
import { SupabaseRestClient, type SupabaseFetch } from "../storage/supabase-rest";
import type { TelegramLinkCodeRecord, TelegramLinkedAccountRecord } from "./types";
import type { TelegramLinkRepository } from "./repository";

interface SupabaseTelegramLinkRepositoryOptions {
  config?: SupabaseDatabaseConfig;
  client?: SupabaseRestClient;
  fetch?: SupabaseFetch;
}

interface TelegramLinkCodeRow {
  code: string;
  controller_wallet: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

interface TelegramLinkedAccountRow {
  telegram_user_id: string;
  controller_wallet: string;
  created_at: string;
  updated_at: string;
}

const LINK_CODES_TABLE = "whispervault_telegram_link_codes";
const LINKED_ACCOUNTS_TABLE = "whispervault_telegram_linked_accounts";

const toLinkCode = (row: TelegramLinkCodeRow): TelegramLinkCodeRecord => ({
  code: row.code,
  controllerWallet: row.controller_wallet,
  expiresAt: new Date(row.expires_at).toISOString(),
  consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : null,
  createdAt: new Date(row.created_at).toISOString()
});

const toLinkCodeRow = (record: TelegramLinkCodeRecord): TelegramLinkCodeRow => ({
  code: record.code.toUpperCase(),
  controller_wallet: record.controllerWallet,
  expires_at: record.expiresAt,
  consumed_at: record.consumedAt,
  created_at: record.createdAt
});

const toLinkedAccount = (row: TelegramLinkedAccountRow): TelegramLinkedAccountRecord => ({
  telegramUserId: row.telegram_user_id,
  controllerWallet: row.controller_wallet,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString()
});

const toLinkedAccountRow = (record: TelegramLinkedAccountRecord): TelegramLinkedAccountRow => ({
  telegram_user_id: record.telegramUserId,
  controller_wallet: record.controllerWallet,
  created_at: record.createdAt,
  updated_at: record.updatedAt
});

export class SupabaseTelegramLinkRepository implements TelegramLinkRepository {
  private readonly client: SupabaseRestClient;

  constructor(options: SupabaseTelegramLinkRepositoryOptions = {}) {
    this.client =
      options.client ??
      new SupabaseRestClient({
        config: options.config ?? getSupabaseDatabaseConfig(),
        fetch: options.fetch
      });
  }

  async createLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord> {
    await this.client.insert<TelegramLinkCodeRow>(LINK_CODES_TABLE, toLinkCodeRow(record));
    return this.getLinkCodeOrThrow(record.code);
  }

  async getLinkCode(code: string): Promise<TelegramLinkCodeRecord | null> {
    const [row] = await this.client.select<TelegramLinkCodeRow>(LINK_CODES_TABLE, {
      code: code.toUpperCase()
    });

    return row ? toLinkCode(row) : null;
  }

  async saveLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord> {
    const normalizedCode = record.code.toUpperCase();
    const updated = await this.client.update<TelegramLinkCodeRow>(
      LINK_CODES_TABLE,
      {
        code: normalizedCode
      },
      toLinkCodeRow({
        ...record,
        code: normalizedCode
      })
    );

    if (updated.length === 0) {
      await this.client.insert<TelegramLinkCodeRow>(
        LINK_CODES_TABLE,
        toLinkCodeRow({
          ...record,
          code: normalizedCode
        })
      );
    }

    return this.getLinkCodeOrThrow(normalizedCode);
  }

  async upsertLinkedAccount(record: TelegramLinkedAccountRecord): Promise<TelegramLinkedAccountRecord> {
    const updated = await this.client.update<TelegramLinkedAccountRow>(
      LINKED_ACCOUNTS_TABLE,
      {
        telegram_user_id: record.telegramUserId
      },
      toLinkedAccountRow(record)
    );

    if (updated.length === 0) {
      await this.client.insert<TelegramLinkedAccountRow>(LINKED_ACCOUNTS_TABLE, toLinkedAccountRow(record));
    }

    return this.getLinkedAccountOrThrow(record.telegramUserId);
  }

  async getLinkedAccount(telegramUserId: string): Promise<TelegramLinkedAccountRecord | null> {
    const [row] = await this.client.select<TelegramLinkedAccountRow>(LINKED_ACCOUNTS_TABLE, {
      telegram_user_id: telegramUserId
    });

    return row ? toLinkedAccount(row) : null;
  }

  private async getLinkCodeOrThrow(code: string): Promise<TelegramLinkCodeRecord> {
    const record = await this.getLinkCode(code);

    if (!record) {
      throw new Error(`Telegram link code was not persisted for "${code}".`);
    }

    return record;
  }

  private async getLinkedAccountOrThrow(telegramUserId: string): Promise<TelegramLinkedAccountRecord> {
    const record = await this.getLinkedAccount(telegramUserId);

    if (!record) {
      throw new Error(`Telegram account link was not persisted for user "${telegramUserId}".`);
    }

    return record;
  }
}
