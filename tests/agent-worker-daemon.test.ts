import assert from "node:assert/strict";
import { parseWorkerPollIntervalMs, runAgentWorkerDaemon } from "../lib/agent-worker";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

type SignalHandler = () => void;

type FakeSignalHost = {
  emit: (signal: "SIGINT" | "SIGTERM") => void;
  off: (signal: "SIGINT" | "SIGTERM", handler: SignalHandler) => void;
  on: (signal: "SIGINT" | "SIGTERM", handler: SignalHandler) => void;
};

type FakeSleepHandle = {
  cancel: () => void;
  promise: Promise<void>;
  release: () => void;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
};

const createFakeSignalHost = (): FakeSignalHost => {
  const listeners = new Map<"SIGINT" | "SIGTERM", Set<SignalHandler>>([
    ["SIGINT", new Set()],
    ["SIGTERM", new Set()]
  ]);

  return {
    emit(signal) {
      for (const listener of listeners.get(signal) ?? []) {
        listener();
      }
    },
    off(signal, handler) {
      listeners.get(signal)?.delete(handler);
    },
    on(signal, handler) {
      listeners.get(signal)?.add(handler);
    }
  };
};

const createFakeSleepController = () => {
  const sleeps: FakeSleepHandle[] = [];

  return {
    sleep: () => {
      let resolvePromise = (): void => {};
      let settled = false;
      const handle: FakeSleepHandle = {
        cancel() {
          handle.release();
        },
        promise: new Promise<void>((resolve) => {
          resolvePromise = () => {
            if (settled) {
              return;
            }

            settled = true;
            resolve();
          };
        }),
        release() {
          resolvePromise();
        }
      };

      sleeps.push(handle);
      return handle;
    },
    sleeps
  };
};

test("daemon repeats run loop on each mocked timer tick", async () => {
  const signalHost = createFakeSignalHost();
  const sleepController = createFakeSleepController();
  let runCount = 0;
  const daemon = runAgentWorkerDaemon({
    logger: {
      error() {},
      log() {}
    },
    pollIntervalMs: 25,
    runOnce: async () => {
      runCount += 1;
      if (runCount === 3) {
        signalHost.emit("SIGTERM");
      }
      return 0;
    },
    signalHost,
    sleep: sleepController.sleep
  });

  await flush();
  assert.equal(runCount, 1);
  assert.equal(sleepController.sleeps.length, 1);

  sleepController.sleeps[0]?.release();
  await flush();
  assert.equal(runCount, 2);
  assert.equal(sleepController.sleeps.length, 2);

  sleepController.sleeps[1]?.release();
  await daemon;
  assert.equal(runCount, 3);
});

test("daemon catches iteration errors and continues polling", async () => {
  const signalHost = createFakeSignalHost();
  const sleepController = createFakeSleepController();
  const errors: string[] = [];
  let runCount = 0;
  const daemon = runAgentWorkerDaemon({
    logger: {
      error(message) {
        errors.push(message);
      },
      log() {}
    },
    pollIntervalMs: 25,
    runOnce: async () => {
      runCount += 1;
      if (runCount === 1) {
        throw new Error("boom");
      }

      signalHost.emit("SIGTERM");
      return 0;
    },
    signalHost,
    sleep: sleepController.sleep
  });

  await flush();
  assert.equal(runCount, 1);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /Worker iteration 1 failed: boom/);
  assert.equal(sleepController.sleeps.length, 1);

  sleepController.sleeps[0]?.release();
  await daemon;
  assert.equal(runCount, 2);
});

test("daemon shuts down cleanly on SIGINT and SIGTERM", async () => {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const signalHost = createFakeSignalHost();
    const sleepController = createFakeSleepController();
    let runCount = 0;
    const logs: string[] = [];
    const daemon = runAgentWorkerDaemon({
      logger: {
        error() {},
        log(message) {
          logs.push(message);
        }
      },
      pollIntervalMs: 25,
      runOnce: async () => {
        runCount += 1;
        return 0;
      },
      signalHost,
      sleep: sleepController.sleep
    });

    await flush();
    assert.equal(runCount, 1);
    assert.equal(sleepController.sleeps.length, 1);

    signalHost.emit(signal);
    await daemon;

    assert.equal(runCount, 1);
    assert.ok(logs.some((message) => message.includes("Shutdown signal received.")));
    assert.ok(logs.some((message) => message.includes("daemon stopped.")));
  }
});

test("parseWorkerPollIntervalMs defaults to 30000", async () => {
  assert.equal(parseWorkerPollIntervalMs({}), 30000);
});

test("parseWorkerPollIntervalMs rejects invalid values", async () => {
  assert.throws(() => parseWorkerPollIntervalMs({ WORKER_POLL_INTERVAL_MS: "0" }), /positive number/);
  assert.throws(() => parseWorkerPollIntervalMs({ WORKER_POLL_INTERVAL_MS: "nan" }), /positive number/);
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

  console.log(`Completed ${passed} agent worker daemon tests.`);
};

void run();
