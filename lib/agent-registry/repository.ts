import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ActiveAgentContext, AgentRecipient, RegisteredAgent } from "./types";

export interface AgentRegistryRepository {
  createAgent(agent: RegisteredAgent): Promise<RegisteredAgent>;
  updateAgent(agent: RegisteredAgent): Promise<RegisteredAgent>;
  getAgent(agentId: string): Promise<RegisteredAgent | null>;
  findAgentByName(controllerWallet: string, name: string): Promise<RegisteredAgent | null>;
  findAgentByTokenHash(tokenHash: string): Promise<RegisteredAgent | null>;
  listAgents(controllerWallet: string): Promise<RegisteredAgent[]>;
  getActiveAgent(controllerWallet: string): Promise<ActiveAgentContext | null>;
  setActiveAgent(context: ActiveAgentContext): Promise<ActiveAgentContext>;
  clearActiveAgent(controllerWallet: string): Promise<void>;
  clearControllerState(controllerWallet: string): Promise<void>;
  upsertRecipient(recipient: AgentRecipient): Promise<AgentRecipient>;
  getRecipient(controllerWallet: string, label: string): Promise<AgentRecipient | null>;
  listRecipients(controllerWallet: string): Promise<AgentRecipient[]>;
}

interface StoredAgentRegistryFile {
  agents: RegisteredAgent[];
  activeAgents: ActiveAgentContext[];
  recipients: AgentRecipient[];
}

interface DevFileAgentRegistryRepositoryOptions {
  filePath?: string;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeFile = (value: unknown): StoredAgentRegistryFile => {
  const record = value && typeof value === "object" ? (value as Partial<StoredAgentRegistryFile>) : {};
  return {
    agents: Array.isArray(record.agents) ? clone(record.agents) : [],
    activeAgents: Array.isArray(record.activeAgents) ? clone(record.activeAgents) : [],
    recipients: Array.isArray(record.recipients) ? clone(record.recipients) : []
  };
};

export const getDefaultAgentRegistryDevStorePath = (cwd = process.cwd()): string =>
  path.join(cwd, ".demo-data", "agent-registry.json");

export class InMemoryAgentRegistryRepository implements AgentRegistryRepository {
  private readonly agents = new Map<string, RegisteredAgent>();

  private readonly activeAgents = new Map<string, ActiveAgentContext>();

  private readonly recipients = new Map<string, AgentRecipient>();

  async createAgent(agent: RegisteredAgent): Promise<RegisteredAgent> {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent already exists for id "${agent.id}".`);
    }

    this.agents.set(agent.id, clone(agent));
    return clone(agent);
  }

  async updateAgent(agent: RegisteredAgent): Promise<RegisteredAgent> {
    this.agents.set(agent.id, clone(agent));
    return clone(agent);
  }

  async getAgent(agentId: string): Promise<RegisteredAgent | null> {
    const agent = this.agents.get(agentId);
    return agent ? clone(agent) : null;
  }

  async findAgentByName(controllerWallet: string, name: string): Promise<RegisteredAgent | null> {
    const normalized = name.trim().toLowerCase();
    const agent = Array.from(this.agents.values()).find(
      (candidate) => candidate.controllerWallet === controllerWallet && candidate.name.toLowerCase() === normalized
    );
    return agent ? clone(agent) : null;
  }

  async findAgentByTokenHash(tokenHash: string): Promise<RegisteredAgent | null> {
    const agent = Array.from(this.agents.values()).find((candidate) => candidate.apiTokenHash === tokenHash);
    return agent ? clone(agent) : null;
  }

  async listAgents(controllerWallet: string): Promise<RegisteredAgent[]> {
    return Array.from(this.agents.values())
      .filter((agent) => agent.controllerWallet === controllerWallet)
      .map(clone);
  }

  async getActiveAgent(controllerWallet: string): Promise<ActiveAgentContext | null> {
    const context = this.activeAgents.get(controllerWallet);
    return context ? clone(context) : null;
  }

  async setActiveAgent(context: ActiveAgentContext): Promise<ActiveAgentContext> {
    this.activeAgents.set(context.controllerWallet, clone(context));
    return clone(context);
  }

  async clearActiveAgent(controllerWallet: string): Promise<void> {
    this.activeAgents.delete(controllerWallet);
  }

  async clearControllerState(controllerWallet: string): Promise<void> {
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.controllerWallet === controllerWallet) {
        this.agents.delete(agentId);
      }
    }

    this.activeAgents.delete(controllerWallet);

    for (const [key, recipient] of this.recipients.entries()) {
      if (recipient.controllerWallet === controllerWallet) {
        this.recipients.delete(key);
      }
    }
  }

  async upsertRecipient(recipient: AgentRecipient): Promise<AgentRecipient> {
    this.recipients.set(`${recipient.controllerWallet}:${recipient.label.toLowerCase()}`, clone(recipient));
    return clone(recipient);
  }

  async getRecipient(controllerWallet: string, label: string): Promise<AgentRecipient | null> {
    const recipient = this.recipients.get(`${controllerWallet}:${label.toLowerCase()}`);
    return recipient ? clone(recipient) : null;
  }

  async listRecipients(controllerWallet: string): Promise<AgentRecipient[]> {
    return Array.from(this.recipients.values())
      .filter((recipient) => recipient.controllerWallet === controllerWallet)
      .map(clone);
  }
}

export class DevFileAgentRegistryRepository implements AgentRegistryRepository {
  private readonly filePath: string;

  constructor(options: DevFileAgentRegistryRepositoryOptions = {}) {
    this.filePath = options.filePath ?? getDefaultAgentRegistryDevStorePath();
  }

  async createAgent(agent: RegisteredAgent): Promise<RegisteredAgent> {
    const file = await this.readFile();

    if (file.agents.some((candidate) => candidate.id === agent.id)) {
      throw new Error(`Agent already exists for id "${agent.id}".`);
    }

    await this.writeFile({ ...file, agents: [...file.agents, clone(agent)] });
    return clone(agent);
  }

  async updateAgent(agent: RegisteredAgent): Promise<RegisteredAgent> {
    const file = await this.readFile();
    await this.writeFile({
      ...file,
      agents: [...file.agents.filter((candidate) => candidate.id !== agent.id), clone(agent)]
    });
    return clone(agent);
  }

  async getAgent(agentId: string): Promise<RegisteredAgent | null> {
    const file = await this.readFile();
    const agent = file.agents.find((candidate) => candidate.id === agentId);
    return agent ? clone(agent) : null;
  }

  async findAgentByName(controllerWallet: string, name: string): Promise<RegisteredAgent | null> {
    const normalized = name.trim().toLowerCase();
    const file = await this.readFile();
    const agent = file.agents.find(
      (candidate) => candidate.controllerWallet === controllerWallet && candidate.name.toLowerCase() === normalized
    );
    return agent ? clone(agent) : null;
  }

  async findAgentByTokenHash(tokenHash: string): Promise<RegisteredAgent | null> {
    const file = await this.readFile();
    const agent = file.agents.find((candidate) => candidate.apiTokenHash === tokenHash);
    return agent ? clone(agent) : null;
  }

  async listAgents(controllerWallet: string): Promise<RegisteredAgent[]> {
    const file = await this.readFile();
    return file.agents.filter((agent) => agent.controllerWallet === controllerWallet).map(clone);
  }

  async getActiveAgent(controllerWallet: string): Promise<ActiveAgentContext | null> {
    const file = await this.readFile();
    const context = file.activeAgents.find((candidate) => candidate.controllerWallet === controllerWallet);
    return context ? clone(context) : null;
  }

  async setActiveAgent(context: ActiveAgentContext): Promise<ActiveAgentContext> {
    const file = await this.readFile();
    await this.writeFile({
      ...file,
      activeAgents: [
        ...file.activeAgents.filter((candidate) => candidate.controllerWallet !== context.controllerWallet),
        clone(context)
      ]
    });
    return clone(context);
  }

  async clearActiveAgent(controllerWallet: string): Promise<void> {
    const file = await this.readFile();
    await this.writeFile({
      ...file,
      activeAgents: file.activeAgents.filter((candidate) => candidate.controllerWallet !== controllerWallet)
    });
  }

  async clearControllerState(controllerWallet: string): Promise<void> {
    const file = await this.readFile();
    await this.writeFile({
      agents: file.agents.filter((agent) => agent.controllerWallet !== controllerWallet),
      activeAgents: file.activeAgents.filter((candidate) => candidate.controllerWallet !== controllerWallet),
      recipients: file.recipients.filter((recipient) => recipient.controllerWallet !== controllerWallet)
    });
  }

  async upsertRecipient(recipient: AgentRecipient): Promise<AgentRecipient> {
    const file = await this.readFile();
    const key = recipient.label.toLowerCase();
    await this.writeFile({
      ...file,
      recipients: [
        ...file.recipients.filter(
          (candidate) => candidate.controllerWallet !== recipient.controllerWallet || candidate.label.toLowerCase() !== key
        ),
        clone(recipient)
      ]
    });
    return clone(recipient);
  }

  async getRecipient(controllerWallet: string, label: string): Promise<AgentRecipient | null> {
    const file = await this.readFile();
    const normalized = label.trim().toLowerCase();
    const recipient = file.recipients.find(
      (candidate) => candidate.controllerWallet === controllerWallet && candidate.label.toLowerCase() === normalized
    );
    return recipient ? clone(recipient) : null;
  }

  async listRecipients(controllerWallet: string): Promise<AgentRecipient[]> {
    const file = await this.readFile();
    return file.recipients.filter((recipient) => recipient.controllerWallet === controllerWallet).map(clone);
  }

  private async readFile(): Promise<StoredAgentRegistryFile> {
    try {
      return normalizeFile(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { agents: [], activeAgents: [], recipients: [] };
      }

      throw error;
    }
  }

  private async writeFile(file: StoredAgentRegistryFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(clone(file), null, 2), "utf8");
  }
}
