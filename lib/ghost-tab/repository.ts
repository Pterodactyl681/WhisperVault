import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { GhostTabEvent, GhostTabSession } from "./types";

export interface GhostTabRepository {
  createSession(session: GhostTabSession): Promise<GhostTabSession>;
  saveSession(session: GhostTabSession): Promise<GhostTabSession>;
  getSession(sessionId: string): Promise<GhostTabSession | null>;
  getLatestSession(agentId: string): Promise<GhostTabSession | null>;
  listSessions(controllerWallet?: string): Promise<GhostTabSession[]>;
  appendEvent(event: GhostTabEvent): Promise<GhostTabEvent>;
  listEvents(sessionId: string): Promise<GhostTabEvent[]>;
}

interface StoredGhostTabFile {
  sessions: GhostTabSession[];
  events: GhostTabEvent[];
}

interface DevFileGhostTabRepositoryOptions {
  filePath?: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeStoredFile = (value: unknown): StoredGhostTabFile => {
  const record = value && typeof value === "object" ? (value as Partial<StoredGhostTabFile>) : {};

  return {
    sessions: Array.isArray(record.sessions) ? clone(record.sessions) : [],
    events: Array.isArray(record.events) ? clone(record.events) : []
  };
};

export const getDefaultGhostTabDevStorePath = (cwd = process.cwd()): string =>
  path.join(cwd, ".demo-data", "ghost-tabs.json");

export class InMemoryGhostTabRepository implements GhostTabRepository {
  private readonly sessions = new Map<string, GhostTabSession>();

  private readonly events: GhostTabEvent[] = [];

  async createSession(session: GhostTabSession): Promise<GhostTabSession> {
    if (this.sessions.has(session.id)) {
      throw new Error(`Ghost Tab session already exists for id "${session.id}".`);
    }

    this.sessions.set(session.id, clone(session));
    return clone(session);
  }

  async saveSession(session: GhostTabSession): Promise<GhostTabSession> {
    this.sessions.set(session.id, clone(session));
    return clone(session);
  }

  async getSession(sessionId: string): Promise<GhostTabSession | null> {
    const session = this.sessions.get(sessionId);
    return session ? clone(session) : null;
  }

  async getLatestSession(agentId: string): Promise<GhostTabSession | null> {
    const session = Array.from(this.sessions.values())
      .filter((candidate) => candidate.agentId === agentId)
      .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))[0];
    return session ? clone(session) : null;
  }

  async listSessions(controllerWallet?: string): Promise<GhostTabSession[]> {
    return Array.from(this.sessions.values())
      .filter((session) => !controllerWallet || session.controllerWallet === controllerWallet)
      .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))
      .map(clone);
  }

  async appendEvent(event: GhostTabEvent): Promise<GhostTabEvent> {
    this.events.push(clone(event));
    return clone(event);
  }

  async listEvents(sessionId: string): Promise<GhostTabEvent[]> {
    return this.events
      .filter((event) => event.sessionId === sessionId)
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
      .map(clone);
  }
}

export class DevFileGhostTabRepository implements GhostTabRepository {
  private readonly filePath: string;

  constructor(options: DevFileGhostTabRepositoryOptions = {}) {
    this.filePath = options.filePath ?? getDefaultGhostTabDevStorePath();
  }

  async createSession(session: GhostTabSession): Promise<GhostTabSession> {
    const file = await this.readFile();

    if (file.sessions.some((candidate) => candidate.id === session.id)) {
      throw new Error(`Ghost Tab session already exists for id "${session.id}".`);
    }

    await this.writeFile({
      ...file,
      sessions: [...file.sessions, clone(session)]
    });
    return clone(session);
  }

  async saveSession(session: GhostTabSession): Promise<GhostTabSession> {
    const file = await this.readFile();
    await this.writeFile({
      ...file,
      sessions: [...file.sessions.filter((candidate) => candidate.id !== session.id), clone(session)]
    });
    return clone(session);
  }

  async getSession(sessionId: string): Promise<GhostTabSession | null> {
    const file = await this.readFile();
    const session = file.sessions.find((candidate) => candidate.id === sessionId);
    return session ? clone(session) : null;
  }

  async getLatestSession(agentId: string): Promise<GhostTabSession | null> {
    const file = await this.readFile();
    const session = file.sessions
      .filter((candidate) => candidate.agentId === agentId)
      .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))[0];
    return session ? clone(session) : null;
  }

  async listSessions(controllerWallet?: string): Promise<GhostTabSession[]> {
    const file = await this.readFile();
    return file.sessions
      .filter((session) => !controllerWallet || session.controllerWallet === controllerWallet)
      .sort((left, right) => Date.parse(right.openedAt) - Date.parse(left.openedAt))
      .map(clone);
  }

  async appendEvent(event: GhostTabEvent): Promise<GhostTabEvent> {
    const file = await this.readFile();
    await this.writeFile({
      ...file,
      events: [...file.events, clone(event)]
    });
    return clone(event);
  }

  async listEvents(sessionId: string): Promise<GhostTabEvent[]> {
    const file = await this.readFile();
    return file.events
      .filter((event) => event.sessionId === sessionId)
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
      .map(clone);
  }

  private async readFile(): Promise<StoredGhostTabFile> {
    try {
      return normalizeStoredFile(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          sessions: [],
          events: []
        };
      }

      throw error;
    }
  }

  private async writeFile(file: StoredGhostTabFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(normalizeStoredFile(file), null, 2), "utf8");
  }
}
