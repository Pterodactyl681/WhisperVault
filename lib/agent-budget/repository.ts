import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentBudget } from "./types";

export type StoredAgentBudgetReservationStatus = "reserved" | "confirmed" | "released";

export interface StoredAgentBudgetReservation {
  id: string;
  amount: string;
  reference: string;
  paylinkId: string | null;
  createdAt: string;
  status?: StoredAgentBudgetReservationStatus;
  paymentId?: string | null;
  settledAt?: string | null;
  releasedAt?: string | null;
  releasedReason?: string | null;
}

export interface StoredAgentBudgetRecord {
  budget: AgentBudget;
  reservations: StoredAgentBudgetReservation[];
}

export interface AgentBudgetRepository {
  create(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord>;
  get(agentId: string): Promise<StoredAgentBudgetRecord | null>;
  list(): Promise<StoredAgentBudgetRecord[]>;
  save(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord>;
}

interface StoredAgentBudgetFile {
  records: StoredAgentBudgetRecord[];
}

interface DevFileAgentBudgetRepositoryOptions {
  filePath?: string;
}

const cloneMetadata = (metadata: AgentBudget["metadata"]): AgentBudget["metadata"] => {
  if (!metadata) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(metadata)) as AgentBudget["metadata"];
};

const cloneBudget = (budget: AgentBudget): AgentBudget => ({
  ...budget,
  metadata: cloneMetadata(budget.metadata)
});

const cloneRecord = (record: StoredAgentBudgetRecord): StoredAgentBudgetRecord => ({
  budget: cloneBudget(record.budget),
  reservations: record.reservations.map((reservation) => ({
    ...reservation
  }))
});

const cloneRecords = (records: StoredAgentBudgetRecord[]): StoredAgentBudgetRecord[] =>
  records.map((record) => cloneRecord(record));

const normalizeStoredFile = (value: unknown): StoredAgentBudgetFile => {
  if (!value || typeof value !== "object" || !Array.isArray((value as StoredAgentBudgetFile).records)) {
    return { records: [] };
  }

  return {
    records: cloneRecords((value as StoredAgentBudgetFile).records)
  };
};

export const getDefaultAgentBudgetDevStorePath = (cwd = process.cwd()): string =>
  path.join(cwd, ".demo-data", "agent-budgets.json");

export class InMemoryAgentBudgetRepository implements AgentBudgetRepository {
  private readonly records = new Map<string, StoredAgentBudgetRecord>();

  async create(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord> {
    if (this.records.has(record.budget.agentId)) {
      throw new Error(`Agent budget already exists for agent "${record.budget.agentId}".`);
    }

    const stored = cloneRecord(record);
    this.records.set(record.budget.agentId, stored);
    return cloneRecord(stored);
  }

  async get(agentId: string): Promise<StoredAgentBudgetRecord | null> {
    const record = this.records.get(agentId);
    return record ? cloneRecord(record) : null;
  }

  async list(): Promise<StoredAgentBudgetRecord[]> {
    return Array.from(this.records.values(), (record) => cloneRecord(record));
  }

  async save(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord> {
    const stored = cloneRecord(record);
    this.records.set(record.budget.agentId, stored);
    return cloneRecord(stored);
  }
}

export class DevFileAgentBudgetRepository implements AgentBudgetRepository {
  private readonly filePath: string;

  constructor(options: DevFileAgentBudgetRepositoryOptions = {}) {
    this.filePath = options.filePath ?? getDefaultAgentBudgetDevStorePath();
  }

  async create(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord> {
    const records = await this.readRecords();

    if (records.some((existing) => existing.budget.agentId === record.budget.agentId)) {
      throw new Error(`Agent budget already exists for agent "${record.budget.agentId}".`);
    }

    const nextRecords = [...records, cloneRecord(record)];
    await this.writeRecords(nextRecords);

    return cloneRecord(record);
  }

  async get(agentId: string): Promise<StoredAgentBudgetRecord | null> {
    const records = await this.readRecords();
    const record = records.find((existing) => existing.budget.agentId === agentId);
    return record ? cloneRecord(record) : null;
  }

  async list(): Promise<StoredAgentBudgetRecord[]> {
    return this.readRecords();
  }

  async save(record: StoredAgentBudgetRecord): Promise<StoredAgentBudgetRecord> {
    const records = await this.readRecords();
    const nextRecord = cloneRecord(record);
    const nextRecords = records.filter((existing) => existing.budget.agentId !== record.budget.agentId);
    nextRecords.push(nextRecord);
    await this.writeRecords(nextRecords);
    return cloneRecord(nextRecord);
  }

  async removeDemoRecords(): Promise<StoredAgentBudgetRecord[]> {
    const records = await this.readRecords();
    const removed = records.filter((record) => record.budget.metadata?.demo === true);
    const kept = records.filter((record) => record.budget.metadata?.demo !== true);
    await this.writeRecords(kept);
    return cloneRecords(removed);
  }

  private async readRecords(): Promise<StoredAgentBudgetRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = normalizeStoredFile(JSON.parse(raw));
      return cloneRecords(parsed.records);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  private async writeRecords(records: StoredAgentBudgetRecord[]): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(
      this.filePath,
      JSON.stringify(
        {
          records: cloneRecords(records)
        },
        null,
        2
      ),
      "utf8"
    );
  }
}
