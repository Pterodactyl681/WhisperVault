import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { generateMirageTransferCommand } from "../lib/mirage";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const testCases: TestCase[] = [];

const test = (name: string, run: () => Promise<void>): void => {
  testCases.push({ name, run });
};

const baseInput = {
  recipient: "recipient-wallet",
  amount: "5",
  mint: "USDC_OR_MINT_ADDRESS",
  memo: "whisperpay:agent:coffee-agent:paylink:pl_123"
};

test("generateMirageTransferCommand creates correct argv", async () => {
  const command = generateMirageTransferCommand(baseInput);

  assert.deepEqual(command.argv, [
    "transfer",
    "--wallet",
    "agent-treasury",
    "--to",
    "recipient-wallet",
    "--mint",
    "USDC_OR_MINT_ADDRESS",
    "--amount",
    "5",
    "--visibility",
    "private",
    "--cluster",
    "devnet",
    "--memo",
    "whisperpay:agent:coffee-agent:paylink:pl_123",
    "--min-delay-ms",
    "500",
    "--max-delay-ms",
    "5000",
    "--split",
    "4"
  ]);
});

test("displayCommand uses mirage transfer", async () => {
  const command = generateMirageTransferCommand(baseInput);
  assert.match(command.displayCommand, /^mirage transfer /);
});

test("command includes --visibility private", async () => {
  const command = generateMirageTransferCommand(baseInput);
  assert.equal(command.argv.includes("--visibility"), true);
  assert.equal(command.argv.includes("private"), true);
});

test("command includes --split 4 by default", async () => {
  const command = generateMirageTransferCommand(baseInput);
  assert.equal(command.argv[command.argv.indexOf("--split") + 1], "4");
});

test("command rejects split below range", async () => {
  assert.throws(() => generateMirageTransferCommand({ ...baseInput, split: 0 }), /between 1 and 15/);
});

test("command rejects split above range", async () => {
  assert.throws(() => generateMirageTransferCommand({ ...baseInput, split: 16 }), /between 1 and 15/);
});

test("command rejects invalid amount", async () => {
  assert.throws(() => generateMirageTransferCommand({ ...baseInput, amount: "0" }), /positive decimal string/);
});

test("command rejects empty recipient", async () => {
  assert.throws(() => generateMirageTransferCommand({ ...baseInput, recipient: "   " }), /recipient is required/);
});

test("command rejects empty mint", async () => {
  assert.throws(() => generateMirageTransferCommand({ ...baseInput, mint: "   " }), /mint is required/);
});

test("command rejects empty memo", async () => {
  assert.throws(() => generateMirageTransferCommand({ ...baseInput, memo: "   " }), /memo is required/);
});

test("command rejects maxDelayMs less than minDelayMs", async () => {
  assert.throws(
    () => generateMirageTransferCommand({ ...baseInput, minDelayMs: 1000, maxDelayMs: 999 }),
    /greater than or equal/
  );
});

test("command does not include secrets or passphrase flags", async () => {
  const command = generateMirageTransferCommand(baseInput);
  const serialized = command.displayCommand.toLowerCase();

  assert.equal(serialized.includes("passphrase"), false);
  assert.equal(serialized.includes("private-key"), false);
  assert.equal(serialized.includes("seed"), false);
  assert.equal(serialized.includes("token"), false);
});

test("no Mirage execution code was added", async () => {
  const files = [
    path.join(process.cwd(), "lib", "mirage", "command-generator.ts"),
    path.join(process.cwd(), "lib", "agent-plan", "http.ts"),
    path.join(process.cwd(), "lib", "whisperpay-server", "service.ts"),
    path.join(process.cwd(), "app", "api", "agent-spend", "confirm-manual", "route.ts")
  ];
  const combined = files.map((file) => fs.readFileSync(file, "utf8")).join("\n");

  assert.equal(/child_process/.test(combined), false);
  assert.equal(/\bspawn\s*\(/.test(combined), false);
  assert.equal(/\bexec\s*\(/.test(combined), false);
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

  console.log(`Completed ${passed} Mirage command generator tests.`);
};

void run();
