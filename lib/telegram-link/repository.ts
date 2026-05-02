import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { TelegramLinkCodeRecord, TelegramLinkedAccountRecord } from "./types";

export interface TelegramLinkRepository {
  createLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord>;
  getLinkCode(code: string): Promise<TelegramLinkCodeRecord | null>;
  saveLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord>;
  upsertLinkedAccount(record: TelegramLinkedAccountRecord): Promise<TelegramLinkedAccountRecord>;
  getLinkedAccount(telegramUserId: string): Promise<TelegramLinkedAccountRecord | null>;
}

interface StoredTelegramLinkFile {
  linkCodes: TelegramLinkCodeRecord[];
  linkedAccounts: TelegramLinkedAccountRecord[];
}

interface DevFileTelegramLinkRepositoryOptions {
  filePath?: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeStoredFile = (value: unknown): StoredTelegramLinkFile => {
  if (!value || typeof value !== "object") {
    return {
      linkCodes: [],
      linkedAccounts: []
    };
  }

  const candidate = value as Partial<StoredTelegramLinkFile>;

  return {
    linkCodes: Array.isArray(candidate.linkCodes) ? candidate.linkCodes.map(clone) : [],
    linkedAccounts: Array.isArray(candidate.linkedAccounts) ? candidate.linkedAccounts.map(clone) : []
  };
};

export const getDefaultTelegramLinkDevStorePath = (cwd = process.cwd()): string =>
  path.join(cwd, ".demo-data", "telegram-links.json");

export class InMemoryTelegramLinkRepository implements TelegramLinkRepository {
  private readonly linkCodes = new Map<string, TelegramLinkCodeRecord>();

  private readonly linkedAccounts = new Map<string, TelegramLinkedAccountRecord>();

  async createLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord> {
    const normalizedCode = record.code.toUpperCase();

    if (this.linkCodes.has(normalizedCode)) {
      throw new Error(`Telegram link code already exists for "${normalizedCode}".`);
    }

    const stored = clone({
      ...record,
      code: normalizedCode
    });
    this.linkCodes.set(normalizedCode, stored);
    return clone(stored);
  }

  async getLinkCode(code: string): Promise<TelegramLinkCodeRecord | null> {
    const record = this.linkCodes.get(code.toUpperCase());
    return record ? clone(record) : null;
  }

  async saveLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord> {
    const stored = clone({
      ...record,
      code: record.code.toUpperCase()
    });
    this.linkCodes.set(stored.code, stored);
    return clone(stored);
  }

  async upsertLinkedAccount(record: TelegramLinkedAccountRecord): Promise<TelegramLinkedAccountRecord> {
    const stored = clone(record);
    this.linkedAccounts.set(stored.telegramUserId, stored);
    return clone(stored);
  }

  async getLinkedAccount(telegramUserId: string): Promise<TelegramLinkedAccountRecord | null> {
    const record = this.linkedAccounts.get(telegramUserId);
    return record ? clone(record) : null;
  }
}

export class DevFileTelegramLinkRepository implements TelegramLinkRepository {
  private readonly filePath: string;

  constructor(options: DevFileTelegramLinkRepositoryOptions = {}) {
    this.filePath = options.filePath ?? getDefaultTelegramLinkDevStorePath();
  }

  async createLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord> {
    const file = await this.readFileState();
    const normalizedCode = record.code.toUpperCase();

    if (file.linkCodes.some((existing) => existing.code.toUpperCase() === normalizedCode)) {
      throw new Error(`Telegram link code already exists for "${normalizedCode}".`);
    }

    const nextRecord = clone({
      ...record,
      code: normalizedCode
    });
    file.linkCodes.push(nextRecord);
    await this.writeFileState(file);
    return clone(nextRecord);
  }

  async getLinkCode(code: string): Promise<TelegramLinkCodeRecord | null> {
    const file = await this.readFileState();
    const normalizedCode = code.toUpperCase();
    const record = file.linkCodes.find((existing) => existing.code.toUpperCase() === normalizedCode);
    return record ? clone(record) : null;
  }

  async saveLinkCode(record: TelegramLinkCodeRecord): Promise<TelegramLinkCodeRecord> {
    const file = await this.readFileState();
    const normalizedCode = record.code.toUpperCase();
    const nextRecord = clone({
      ...record,
      code: normalizedCode
    });
    const nextLinkCodes = file.linkCodes.filter((existing) => existing.code.toUpperCase() !== normalizedCode);
    nextLinkCodes.push(nextRecord);
    await this.writeFileState({
      ...file,
      linkCodes: nextLinkCodes
    });
    return clone(nextRecord);
  }

  async upsertLinkedAccount(record: TelegramLinkedAccountRecord): Promise<TelegramLinkedAccountRecord> {
    const file = await this.readFileState();
    const nextRecord = clone(record);
    const nextLinked = file.linkedAccounts.filter((existing) => existing.telegramUserId !== nextRecord.telegramUserId);
    nextLinked.push(nextRecord);
    await this.writeFileState({
      ...file,
      linkedAccounts: nextLinked
    });
    return clone(nextRecord);
  }

  async getLinkedAccount(telegramUserId: string): Promise<TelegramLinkedAccountRecord | null> {
    const file = await this.readFileState();
    const record = file.linkedAccounts.find((existing) => existing.telegramUserId === telegramUserId);
    return record ? clone(record) : null;
  }

  private async readFileState(): Promise<StoredTelegramLinkFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return normalizeStoredFile(JSON.parse(raw));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          linkCodes: [],
          linkedAccounts: []
        };
      }

      throw error;
    }
  }

  private async writeFileState(file: StoredTelegramLinkFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), {
      recursive: true
    });
    await writeFile(
      this.filePath,
      JSON.stringify(
        {
          linkCodes: file.linkCodes.map(clone),
          linkedAccounts: file.linkedAccounts.map(clone)
        },
        null,
        2
      ),
      "utf8"
    );
  }
}
