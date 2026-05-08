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
MIRAGE_EXECUTION_ENABLED=false
WORKER_POLL_INTERVAL_MS=30000
```

`WHISPERVAULT_WORKER_SECRET` must match the value configured on Vercel so the worker can call the protected pending execution and confirmation APIs.

Supabase environment variables are not needed in the worker when the worker only talks to the Vercel control-plane API.

## Real Mirage execution on Railway

Keep Railway in dry-run mode until the worker has passed the readiness check with Mirage installed and the execution wallet available:

```txt
MIRAGE_EXECUTION_ENABLED=false
```

Dry-run mode lets the daemon deploy, reach Vercel, fetch pending spends, and validate planned Mirage commands without executing transfers, confirming receipts, or sending execution-confirmed Telegram pushes.

Switch to real execution only after the worker host has Mirage and the `agent-treasury` wallet configured:

```txt
MIRAGE_EXECUTION_ENABLED=true
```

The worker host/container must have Mirage wallet configuration for the wallet named by:

```txt
AGENT_WALLET_NAME=agent-treasury
```

Configure the `agent-treasury` wallet on the Railway/Linux worker host using the wallet setup flow supported by Mirage/OWS. Keep the wallet on the worker execution host only.

Before enabling real execution, run:

```txt
npm run agent:worker:check
```

The check verifies that `mirage` exists on `PATH`, prints the Mirage version when `mirage --version` is available, confirms `AGENT_WALLET_NAME` is set or warns that the default `agent-treasury` will be used, and checks the Vercel control-plane pending execution endpoint.

With `MIRAGE_EXECUTION_ENABLED=true`, it also attempts:

```txt
mirage address --wallet <AGENT_WALLET_NAME>
```

The check prints pass, warn, and fail lines and does not print secret values, wallet files, private keys, seed phrases, or Mirage command output.

Never commit wallet files, private keys, seed phrases, `.env` files, or Railway secrets to the repository. Configure wallet material through the trusted worker host or Railway secret/runtime setup supported by your Mirage/OWS workflow.

Use Railway Variables or a Railway Volume only if Mirage/OWS supports that storage path safely. If Mirage stores wallet files on disk in the worker container, a Railway persistent volume is the recommended way to preserve the `agent-treasury` wallet across redeploys: mount the volume at the path Mirage expects for wallet configuration, initialize or import the wallet there through a trusted operator process, then rerun `npm run agent:worker:check` with `MIRAGE_EXECUTION_ENABLED=true`.

Only after the check passes should you set:

```txt
MIRAGE_EXECUTION_ENABLED=true
```

Then restart the Railway daemon service so real execution runs in the worker.

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

`npm run agent:worker:check` prints readiness status, the control-plane endpoint, Node version, Mirage executable path, Telegram readiness, and Mirage wallet-address lookup readiness without printing secret values or Mirage command output. It fails for missing `WHISPERVAULT_BASE_URL`, missing `WHISPERVAULT_WORKER_SECRET`, `MIRAGE_EXECUTION_ENABLED=true` with no `mirage` executable on `PATH`, or `MIRAGE_EXECUTION_ENABLED=true` when `mirage address --wallet <AGENT_WALLET_NAME>` cannot resolve the worker wallet.

## Hackathon native fallback mode while Mirage SPL transfer issue is isolated

Use this mode only on the Railway worker execution service while Mirage devnet SPL transfer behavior is being isolated. The browser, Next.js API routes, and Telegram webhook must not execute transfers. They only create pending spends and accept worker confirmations.

Keep the user-facing token label as `USDC` in Telegram, UI, and receipts. The worker still validates and logs the Mirage transfer command from the pending spend, but when `MIRAGE_EXECUTION_MINT` is set it replaces the actual Mirage `--mint` argument with the devnet mint address before execution.

Required Railway variables:

```txt
MIRAGE_EXECUTION_ENABLED=true
MIRAGE_EXECUTION_MINT=4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
EXECUTION_FALLBACK_MODE=solana-devnet-native
SOLANA_EXECUTOR_SECRET_KEY_JSON=<json array keypair>
```

Behavior:

- The worker tries Mirage first.
- If Mirage succeeds, confirmation remains a normal Mirage CLI confirmation.
- If Mirage fails and `EXECUTION_FALLBACK_MODE=solana-devnet-native`, the Railway worker sends a real Solana devnet native SOL transfer using only `@solana/web3.js` and the keypair in `SOLANA_EXECUTOR_SECRET_KEY_JSON`.
- The fallback transfers 5000 lamports to the spend recipient, adds memo `whispervault:fallback:<paylinkId>:<agentId>:<displayAmount>:<displayMint>`, confirms the transaction, and posts the tx signature back to the control plane.
- This is a hackathon settlement-proof fallback while the Mirage SPL issue is isolated; it deliberately does not use token accounts, ATAs, or `@solana/spl-token`.
- The receipt metadata includes `executionRail=solana-devnet-native-fallback`, `mirageAttempted=true`, and `mirageError=<error message>`.
- Telegram confirmation for fallback says:

```txt
Execution confirmed
Rail: Solana devnet native fallback
Display spend: <amount> USDC
Mirage command: attempted
Tx: <signature>
```

Before enabling the daemon, run:

```txt
npm run agent:worker:check
```

With fallback mode enabled, the check validates that `SOLANA_EXECUTOR_SECRET_KEY_JSON` parses as a Solana keypair and that the executor has devnet SOL greater than zero for fees and the fallback transfer.

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
