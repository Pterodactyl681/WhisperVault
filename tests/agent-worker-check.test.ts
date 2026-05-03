import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

type CheckResult = {
  status: number;
  stdout: string;
  stderr: string;
};

type WorkerCheckModule = {
  runAgentWorkerCheck: (options: {
    env: Partial<NodeJS.ProcessEnv>;
    stdout: (message: string) => void;
    stderr: (message: string) => void;
    fetch?: typeof fetch;
  }) => Promise<number>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const requireFromHere = createRequire(__filename);
const { runAgentWorkerCheck } = requireFromHere(
  path.join(process.cwd(), "scripts", "agent-worker-check.js")
) as WorkerCheckModule;

const emptyPath = (): string => mkdtempSync(path.join(tmpdir(), "whispervault-empty-path-"));

const runCheck = async (env: Partial<NodeJS.ProcessEnv>): Promise<CheckResult> => {
  let stdout = "";
  let stderr = "";
  const status = await runAgentWorkerCheck({
    env: {
      ...process.env,
      ...env
    },
    stdout(message) {
      stdout += `${message}\n`;
    },
    stderr(message) {
      stderr += `${message}\n`;
    }
  });
  return { status, stdout, stderr };
};

const withWorkerEndpoint = async (
  run: (baseUrl: string, requests: IncomingMessage[]) => Promise<void>
): Promise<void> => {
  const requests: IncomingMessage[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    requests.push(request);

    if (request.url === "/api/agent-spend/pending-execution") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ pending: [] }));
      return;
    }

    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await run(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
};

test("worker check does not print secret values", async () => {
  await withWorkerEndpoint(async (baseUrl) => {
    const result = await runCheck({
      WHISPERVAULT_BASE_URL: baseUrl,
      WHISPERVAULT_WORKER_SECRET: "super-secret-worker-value",
      TELEGRAM_BOT_TOKEN: "secret-telegram-token",
      AGENT_WALLET_NAME: "agent-treasury",
      MIRAGE_EXECUTION_ENABLED: "false",
      PATH: emptyPath()
    });
    const combined = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.doesNotMatch(combined, /super-secret-worker-value/);
    assert.doesNotMatch(combined, /secret-telegram-token/);
    assert.match(combined, /WHISPERVAULT_WORKER_SECRET: set/);
    assert.match(combined, /TELEGRAM_BOT_TOKEN: set/);
  });
});

test("worker check fails on missing required envs", async () => {
  const result = await runCheck({
    WHISPERVAULT_BASE_URL: "",
    WHISPERVAULT_WORKER_SECRET: "",
    TELEGRAM_BOT_TOKEN: "",
    MIRAGE_EXECUTION_ENABLED: "false",
    PATH: emptyPath()
  });
  const combined = `${result.stdout}\n${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(combined, /WHISPERVAULT_BASE_URL is required/);
  assert.match(combined, /WHISPERVAULT_WORKER_SECRET is required/);
});

test("worker check warns on missing Telegram token", async () => {
  await withWorkerEndpoint(async (baseUrl) => {
    const result = await runCheck({
      WHISPERVAULT_BASE_URL: baseUrl,
      WHISPERVAULT_WORKER_SECRET: "worker-secret",
      TELEGRAM_BOT_TOKEN: "",
      MIRAGE_EXECUTION_ENABLED: "false",
      PATH: emptyPath()
    });
    const combined = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.match(combined, /TELEGRAM_BOT_TOKEN is missing; Telegram push will be skipped/);
  });
});

test("worker check warns on missing Mirage when execution is disabled", async () => {
  await withWorkerEndpoint(async (baseUrl) => {
    const result = await runCheck({
      WHISPERVAULT_BASE_URL: baseUrl,
      WHISPERVAULT_WORKER_SECRET: "worker-secret",
      TELEGRAM_BOT_TOKEN: "token",
      MIRAGE_EXECUTION_ENABLED: "false",
      PATH: emptyPath()
    });
    const combined = `${result.stdout}\n${result.stderr}`;

    assert.equal(result.status, 0);
    assert.match(combined, /Mirage CLI is missing from PATH; real execution is unavailable/);
  });
});

test("worker check fails when execution is enabled and Mirage is missing", async () => {
  await withWorkerEndpoint(async (baseUrl) => {
    const result = await runCheck({
      WHISPERVAULT_BASE_URL: baseUrl,
      WHISPERVAULT_WORKER_SECRET: "worker-secret",
      TELEGRAM_BOT_TOKEN: "token",
      MIRAGE_EXECUTION_ENABLED: "true",
      PATH: emptyPath()
    });
    const combined = `${result.stdout}\n${result.stderr}`;

    assert.notEqual(result.status, 0);
    assert.match(combined, /Mirage CLI is missing from PATH while MIRAGE_EXECUTION_ENABLED=true/);
  });
});

const run = async (): Promise<void> => {
  let passed = 0;

  for (const testCase of testCases) {
    try {
      await testCase.run();
      passed += 1;
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      console.error(`FAIL ${testCase.name}`);
      throw error;
    }
  }

  console.log(`Completed ${passed} agent worker check tests.`);
};

void run();
