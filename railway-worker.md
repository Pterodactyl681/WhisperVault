# Railway Worker Deployment

This service is the WhisperVault execution plane. Vercel stays the web app, Telegram webhook, and policy/control plane. Supabase stays shared persistent state. Railway runs the Linux worker that fetches approved pending spends from Vercel and, when enabled, executes Mirage CLI inside the worker container.

Browser/API/webhook code must not execute Mirage. Keep Mirage execution in this worker service only.

## Create the Railway Service

1. Create a Railway project.
2. Add a new service from the GitHub repository.
3. Set the custom Dockerfile path to:

```txt
Dockerfile.worker
```

If Railway does not expose the custom Dockerfile path field, set this Railway environment variable instead:

```txt
RAILWAY_DOCKERFILE_PATH=Dockerfile.worker
```

The worker Dockerfile does not run a Next.js server and does not expose an HTTP port.

## Required Railway Environment Variables

```txt
WHISPERVAULT_BASE_URL=https://whisper-vault-sigma.vercel.app
WHISPERVAULT_WORKER_SECRET=<same as Vercel>
TELEGRAM_BOT_TOKEN=<BotFather token>
AGENT_WALLET_NAME=agent-treasury
MIRAGE_EXECUTION_ENABLED=true
WORKER_POLL_INTERVAL_MS=30000
```

`WHISPERVAULT_WORKER_SECRET` must match the value configured on Vercel so the worker can call the protected pending execution and confirmation APIs.

Supabase environment variables are not needed in the worker when the worker only talks to the Vercel control-plane API.

## Wallet Setup

The worker host/container must have Mirage/OWS wallet configuration for:

```txt
agent-treasury
```

Do not commit wallet files, private keys, seed phrases, or Railway secrets to the repository. Configure wallet material through the trusted worker host or Railway secret/runtime setup supported by your Mirage/OWS workflow.

## Dry-Run Mode

Use dry-run mode to verify the Vercel control plane and pending spend fetch without executing Mirage:

```txt
MIRAGE_EXECUTION_ENABLED=false
npm run agent:worker:check
npm run agent:worker:dry-run
npm run agent:worker:daemon
```

In dry-run mode the daemon stays alive, fetches and validates pending Mirage commands every `WORKER_POLL_INTERVAL_MS` milliseconds, may print planned pending spends, does not confirm receipts, and does not send Telegram execution-confirmed notifications.

## Real Execution Mode

Enable real execution only in the Railway worker service after Mirage CLI and the `agent-treasury` wallet are ready:

```txt
MIRAGE_EXECUTION_ENABLED=true
npm run agent:worker:check
npm run agent:worker:daemon
```

`npm run agent:worker:check` prints readiness status, the control-plane endpoint, Node version, Mirage executable path, and Telegram readiness without printing secret values. It fails for missing `WHISPERVAULT_BASE_URL`, missing `WHISPERVAULT_WORKER_SECRET`, or `MIRAGE_EXECUTION_ENABLED=true` with no `mirage` executable on `PATH`.

## Worker Logs

Expected worker logs include:

- control plane URL,
- pending execution endpoint,
- Mirage executable path,
- whether execution is enabled,
- daemon poll interval,
- fetched/planned/executed/confirmed counts,
- Telegram notification status.

Secrets are never printed.
