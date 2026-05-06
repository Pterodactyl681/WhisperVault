# Railway Agent Worker Daemon Update

This folder contains the files needed to apply the Railway worker daemon build/path update to the repository.

## Important

If Railway shows:

```text
error TS6053: File '/app/scripts/agent-worker-daemon.ts' not found.
```

then `tsconfig.agent-worker.json` was copied, but this required file was not copied:

```text
scripts/agent-worker-daemon.ts
```

Do not upload only the config files. Copy this whole update folder into the repository root with paths preserved, or run:

```powershell
powershell -ExecutionPolicy Bypass -File .\APPLY_UPDATE.ps1
```

from inside this update folder.

## Root Cause

Railway starts:

```sh
npm run agent:worker:daemon
```

That script expects:

```text
.agent-worker-dist/scripts/agent-worker-daemon.js
```

The daemon TypeScript entrypoint must therefore be compiled from:

```text
scripts/agent-worker-daemon.ts
```

`tsconfig.agent-worker.json` now makes both worker entrypoints explicit TypeScript root files, so `npx tsc -p tsconfig.agent-worker.json` reliably emits the daemon JS path Railway starts.

## Required Files

Copy all of these files into the repository root, preserving paths:

```text
Dockerfile.worker
package.json
tsconfig.agent-worker.json
tsconfig.json
scripts/agent-worker.ts
scripts/agent-worker-daemon.ts
lib/agent-worker/cli.ts
lib/agent-worker/daemon.ts
lib/agent-worker/index.ts
lib/agent-worker/runner.ts
lib/agent-worker/validation.ts
tests/agent-worker.test.ts
tests/agent-worker-daemon.test.ts
tests/agent-worker-check.test.ts
```

The most important required pair is:

```text
tsconfig.agent-worker.json
scripts/agent-worker-daemon.ts
```

They must be committed together.

## Expected Compiled Path

After running:

```sh
npx tsc -p tsconfig.agent-worker.json
```

this file must exist:

```text
.agent-worker-dist/scripts/agent-worker-daemon.js
```

## Validation Commands

These commands were run in the source workspace:

```sh
npx.cmd tsc -p tsconfig.agent-worker.json
npm.cmd run agent:worker:daemon
npm.cmd run agent:worker:dry-run
npm.cmd run test:agent-budget
npm.cmd run typecheck
npm.cmd run build
```

All passed, with the daemon smoke test intentionally stopped after it printed startup output.
