import { isValidSolanaPublicKey } from "../solana-validation";
import { InMemoryTelegramLinkRepository, type TelegramLinkRepository } from "./repository";
import type {
  TelegramLinkCodeRecord,
  TelegramLinkCodeResult,
  TelegramLinkedAccountRecord,
  TelegramLinkedAccountResult
} from "./types";

interface TelegramLinkServiceOptions {
  repository?: TelegramLinkRepository;
  now?: () => Date;
  createCode?: (length: number) => string;
}

const LINK_CODE_LENGTH = 8;
const LINK_CODE_TTL_MS = 10 * 60 * 1000;
const MAX_CODE_GENERATION_ATTEMPTS = 8;
const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LINK_CODE_PATTERN = /^[A-Z2-9]{6,12}$/;

const assertNonEmptyString = (value: string, fieldName: string): string => {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

const defaultCreateCode = (length: number): string => {
  const chars: string[] = [];

  for (let index = 0; index < length; index += 1) {
    const nextIndex = Math.floor(Math.random() * LINK_CODE_ALPHABET.length);
    chars.push(LINK_CODE_ALPHABET[nextIndex]);
  }

  return chars.join("");
};

const asIso = (date: Date): string => date.toISOString();

export class TelegramLinkService {
  private readonly repository: TelegramLinkRepository;

  private readonly now: () => Date;

  private readonly createCode: (length: number) => string;

  constructor(options: TelegramLinkServiceOptions = {}) {
    this.repository = options.repository ?? new InMemoryTelegramLinkRepository();
    this.now = options.now ?? (() => new Date());
    this.createCode = options.createCode ?? defaultCreateCode;
  }

  async createLinkCode(controllerWallet: string): Promise<TelegramLinkCodeResult> {
    const normalizedWallet = assertNonEmptyString(controllerWallet, "controllerWallet");

    if (!isValidSolanaPublicKey(normalizedWallet)) {
      throw new Error("controllerWallet must be a valid Solana wallet address.");
    }

    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + LINK_CODE_TTL_MS);
    const code = await this.generateUniqueCode();
    const record: TelegramLinkCodeRecord = {
      code,
      controllerWallet: normalizedWallet,
      createdAt: asIso(createdAt),
      expiresAt: asIso(expiresAt),
      consumedAt: null
    };

    await this.repository.createLinkCode(record);

    return {
      code,
      expiresAt: record.expiresAt,
      command: `/link ${code}`
    };
  }

  async consumeLinkCode(telegramUserId: string, code: string): Promise<TelegramLinkedAccountResult> {
    const normalizedTelegramUserId = assertNonEmptyString(telegramUserId, "telegramUserId");
    const normalizedCode = assertNonEmptyString(code, "code").toUpperCase();

    if (!LINK_CODE_PATTERN.test(normalizedCode)) {
      throw new Error("code must be a valid Telegram link code.");
    }

    const linkCode = await this.repository.getLinkCode(normalizedCode);

    if (!linkCode) {
      throw new Error("Link code not found.");
    }

    if (linkCode.consumedAt) {
      throw new Error("Link code has already been consumed.");
    }

    const now = this.now();

    if (new Date(linkCode.expiresAt).getTime() <= now.getTime()) {
      throw new Error("Link code has expired.");
    }

    const existing = await this.repository.getLinkedAccount(normalizedTelegramUserId);
    const linkedRecord: TelegramLinkedAccountRecord = {
      telegramUserId: normalizedTelegramUserId,
      controllerWallet: linkCode.controllerWallet,
      createdAt: existing?.createdAt ?? asIso(now),
      updatedAt: asIso(now)
    };
    const savedLinkedRecord = await this.repository.upsertLinkedAccount(linkedRecord);

    await this.repository.saveLinkCode({
      ...linkCode,
      consumedAt: asIso(now)
    });

    return {
      telegramUserId: savedLinkedRecord.telegramUserId,
      controllerWallet: savedLinkedRecord.controllerWallet,
      linkedAt: savedLinkedRecord.updatedAt
    };
  }

  async resolveControllerWalletForTelegramUser(telegramUserId: string): Promise<string | null> {
    const normalizedTelegramUserId = assertNonEmptyString(telegramUserId, "telegramUserId");
    const linked = await this.repository.getLinkedAccount(normalizedTelegramUserId);
    return linked?.controllerWallet ?? null;
  }

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const candidate = this.createCode(LINK_CODE_LENGTH).trim().toUpperCase();

      if (!LINK_CODE_PATTERN.test(candidate)) {
        continue;
      }

      const existing = await this.repository.getLinkCode(candidate);

      if (!existing) {
        return candidate;
      }
    }

    throw new Error("Failed to generate a unique Telegram link code. Try again.");
  }
}
