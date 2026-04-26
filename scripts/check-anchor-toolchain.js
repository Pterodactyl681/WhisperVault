const fs = require("node:fs");
const path = require("node:path");

const checks = ["anchor", "solana", "cargo", "rustc"];

const pathEntries = (process.env.PATH || "")
  .split(path.delimiter)
  .map((entry) => entry.trim())
  .filter(Boolean);

const executableExtensions =
  process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM")
        .split(";")
        .map((extension) => extension.toLowerCase())
    : [""];

const resolveExecutable = (command) => {
  for (const entry of pathEntries) {
    if (process.platform === "win32") {
      for (const extension of executableExtensions) {
        const candidate = path.join(entry, `${command}${extension}`);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    } else {
      const candidate = path.join(entry, command);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
};

let missingCount = 0;

console.log("Anchor toolchain check");

for (const command of checks) {
  const resolved = resolveExecutable(command);

  if (!resolved) {
    missingCount += 1;
    console.log(`- ${command}: not found on PATH`);
    continue;
  }

  console.log(`- ${command}: found at ${resolved}`);
}

if (missingCount > 0) {
  console.log(
    `Toolchain incomplete: ${missingCount} command(s) missing. Install Anchor CLI, Solana CLI, Rust, and Cargo or add them to PATH.`
  );
  process.exitCode = 1;
} else {
  console.log("Toolchain ready for anchor build/test.");
}
