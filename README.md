# WhisperVault

**Agent Spend Firewall for private AI-agent payments on Solana devnet.**

WhisperVault lets a connected controller wallet create policy-bound Agent Vaults for autonomous agents. Each spend request is checked before execution: the recipient must be valid, the spend must fit the budget policy, the rail must stay private, public fallback stays disabled, and a permissioned receipt is created for the controller.

The goal is simple:

> Autonomous agents should be able to spend privately, but not uncontrollably.

---

## What It Does

WhisperVault separates **policy control** from **agent execution**.

| Layer | Role |
|---|---|
| **Controller Wallet** | Connected user wallet. Owns the Agent Vault and spending policy. |
| **Agent Vault** | Stores the agent budget, daily cap, rail policy, and receipt state. |
| **Agent Wallet** | Mirage execution wallet, for example `agent-treasury`. |
| **WhisperVault** | Validates requests, reserves budget, creates private spend intents, and produces receipts. |
| **Mirage** | Executes approved private transfers from the agent runtime. |

The browser does **not** custody agent keys and does **not** execute Mirage CLI commands.

---

## Core Demo

A typical demo uses an agent named `coffee-agent`.

Example vault:

```txt
Agent ID: coffee-agent
Asset: Devnet USDC
Total Budget: 500
Current Balance: 320
Daily Cap: 25%
Private Rail: enabled
Public Fallback: disabled
```

That gives the agent an 80 USDC daily allowance.

### Approved spend

```txt
Request: buy coffee for 5 USDC
Result: approved
```

WhisperVault checks the request and creates:

```txt
Spend Firewall: Passed
Budget reserved: yes
Private spend created: yes
Mirage command ready: yes
Private receipt: available
Payment status: Pending/manual
```

### Blocked overspend

```txt
Request: buy expensive gear for 100 USDC
Result: blocked
```

Because the daily allowance is 80 USDC:

```txt
Spend Firewall: Blocked
Reason: Requested spend exceeds the remaining daily cap.
Budget reserved: no
Private spend created: no
Mirage command generated: no
```

### Blocked invalid recipient

```txt
Recipient: invalid wallet text
Result: blocked
```

Invalid recipients are rejected before any spend or execution command is created.

---

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Solana Web3.js
- MagicBlock router/private rail integration
- MagicBlock Ephemeral Rollups SDK hooks
- Mirage CLI execution model
- Anchor BudgetVault program foundation
- Node.js runtime scripts
- Local file-backed demo store

---

## Architecture

```txt
┌─────────────────────────────┐
│ Controller Wallet            │
│ Owns the Agent Vault policy  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ WhisperVault                 │
│ Agent Spend Firewall         │
│                             │
│ - recipient validation       │
│ - daily cap enforcement      │
│ - private rail policy        │
│ - budget reservation         │
│ - receipt generation         │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Claude / Mirage Agent        │
│ Agent execution wallet       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ Solana / MagicBlock Devnet   │
│ Private execution rail       │
└─────────────────────────────┘
```

---

## Main Routes

| Route | Purpose |
|---|---|
| `/` | Main WhisperVault workspace |
| `/agent-vaults` | Compatibility route |
| `/agent-budgets` | Compatibility route |
| `/api/agent-budgets` | Create/list Agent Vaults |
| `/api/agent-plan` | Validate spend request and create private spend intent |
| `/api/agent-spend/confirm-manual` | Confirm manual devnet execution with a transaction signature |
| `/pay/[id]` | Existing private spend/paylink route |

---

## Main API Flow

### `POST /api/agent-plan`

Checks whether an agent spend can be created.

It validates:

- connected controller ownership,
- selected Agent Vault,
- recipient Solana wallet,
- daily cap,
- current balance,
- private rail policy,
- public fallback disabled.

If approved, it creates:

- budget reservation,
- private spend intent,
- Mirage-ready command,
- private receipt.

If rejected, it creates no executable artifact.

### `POST /api/agent-spend/confirm-manual`

Records a devnet transaction signature after the operator or agent runtime runs the Mirage command manually.

This updates the receipt to:

```txt
Payment status: Confirmed
Execution: Mirage CLI
Devnet tx: <signature>
```

---

## Local Setup

### Install

```bash
npm install
```

### Start the app

```bash
npm run dev
```

Windows:

```powershell
npm.cmd run dev
```

Open:

```txt
http://localhost:3000
```

If port `3000` is busy, Next.js may use another port such as `3001`.

---

## Demo Setup

Reset and seed local demo data:

```powershell
npm.cmd run demo:agent-vault:reset
npm.cmd run demo:agent-vault:seed
```

Start the app:

```powershell
npm.cmd run dev
```

Open:

```txt
http://localhost:3000
```

Recommended UI demo:

1. Connect a Solana controller wallet.
2. Create an Agent Vault for `coffee-agent`.
3. Submit a 5 USDC spend request.
4. Show `Spend Firewall: Passed`.
5. Open the private receipt.
6. Submit a 100 USDC spend request.
7. Show `Spend Firewall: Blocked`.
8. Submit an invalid recipient.
9. Show recipient validation blocking execution.

---

## Agent Runtime Scripts

The local scripts simulate a Claude/Mirage agent hitting the same policy flow.

### Approved spend

```powershell
npm.cmd run agent:coffee
```

Expected result:

```txt
Agent Runtime: Claude + Mirage
Agent: coffee-agent
Task: buy coffee for 5 USDC
Spend request: Approved
Mirage command ready
Receipt: available
Payment status: Pending/manual
Execution pending — run Mirage command manually
```

### Rejected spend

```powershell
npm.cmd run agent:coffee:reject
```

Expected result:

```txt
Agent Runtime: Claude + Mirage
Agent: coffee-agent
Task: buy expensive gear for 100 USDC
Spend request: Rejected
Private spend: none
Mirage command: not generated
```

---

## Full Telegram Agent Demo

This is the complete operator flow for:

- WhisperVault UI on local dev or Vercel
- Telegram bot webhook commands
- Agent Worker dry-run and real execution
- Mirage devnet transfer execution
- receipt confirmation and Telegram push

Important guardrails:

- Mirage execution stays in the Agent Worker only.
- Vercel or Next.js API routes do not execute Mirage.
- Telegram webhook handling does not execute Mirage.
- Browser UI does not custody private keys.

### 1. Create a Telegram bot with BotFather

In Telegram:

1. Open `@BotFather`.
2. Send `/newbot`.
3. Pick a bot name and username.
4. Copy the bot token.
5. Optional but recommended: send `/setdescription` and `/setabouttext` so operators can recognize the bot.

### 2. Configure env

Local `.env` or `.env.local` baseline:

```txt
STORAGE_MODE=local
AGENT_BUDGET_POLICY_MODE=offchain
TELEGRAM_BOT_TOKEN=<botfather-token>
TELEGRAM_WEBHOOK_SECRET=<random-shared-secret>
WHISPERVAULT_BASE_URL=http://localhost:3000
WHISPERVAULT_WORKER_SECRET=<shared-worker-secret>
AGENT_WALLET_NAME=agent-treasury
MIRAGE_EXECUTION_ENABLED=false
WORKER_POLL_INTERVAL_MS=30000
```

Database-backed or Vercel-hosted control plane:

```txt
STORAGE_MODE=database
SUPABASE_URL=<supabase-rest-url>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
AGENT_BUDGET_POLICY_MODE=offchain
TELEGRAM_BOT_TOKEN=<botfather-token>
TELEGRAM_WEBHOOK_SECRET=<random-shared-secret>
WHISPERVAULT_BASE_URL=https://<your-app>.vercel.app
WHISPERVAULT_WORKER_SECRET=<shared-worker-secret>
AGENT_WALLET_NAME=agent-treasury
MIRAGE_EXECUTION_ENABLED=false
WORKER_POLL_INTERVAL_MS=30000
```

Quick operator check:

```powershell
npm.cmd run demo:telegram:check
```

### 3. Set Vercel env vars if hosting the UI/control plane there

Add these in the Vercel project settings:

- `STORAGE_MODE=database`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AGENT_BUDGET_POLICY_MODE=offchain`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `WHISPERVAULT_BASE_URL=https://<your-app>.vercel.app`
- `WHISPERVAULT_WORKER_SECRET`

Do not enable Mirage execution in Vercel. Keep the worker on an operator machine or other trusted runtime that already runs the existing worker flow.

### 4. Start WhisperVault

Local UI:

```powershell
npm.cmd run demo:agent-vault:reset
npm.cmd run demo:agent-vault:seed
npm.cmd run dev
```

Hosted UI:

```powershell
npm.cmd run build
```

Deploy the existing Next.js app to Vercel after env configuration.

### 5. Set the Telegram webhook

Inspect current webhook state:

```powershell
npm.cmd run telegram:webhook:info
```

Set the webhook manually with `curl`:

Local tunnel or public URL:

```powershell
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" -H "Content-Type: application/json" -d "{\"url\":\"https://<public-base-url>/api/telegram/webhook\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\"}"
```

Vercel-hosted URL:

```powershell
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" -H "Content-Type: application/json" -d "{\"url\":\"https://<your-app>.vercel.app/api/telegram/webhook\",\"secret_token\":\"<TELEGRAM_WEBHOOK_SECRET>\"}"
```

### 6. Connect wallet and create or seed an Agent Vault

In the WhisperVault UI:

1. Open the app.
2. Connect the controller wallet.
3. Create an Agent Vault for `coffee-agent` if you are not using the seeded demo.
4. Use devnet USDC and keep private rail enabled.

The seeded local demo already prepares the `coffee-agent` budget for operator walkthroughs.

### 7. Generate link code and link Telegram

In the UI:

1. Generate a Telegram link code for the connected controller wallet.
2. In Telegram, send `/link <code>` to the bot.
3. Wait for the success reply confirming the controller wallet link.

### 8. Send an approved spend from Telegram

In Telegram:

```txt
/spend 5 buy coffee
```

Expected reply:

```txt
Spend Firewall: Passed
Agent: coffee-agent
Amount: 5 USDC
Execution: pending/manual
Paylink/Receipt id: <paylinkId>
```

### 9. Run worker dry-run

Dry-run keeps Mirage execution disabled and does not confirm the receipt:

```powershell
$env:WHISPERVAULT_BASE_URL="http://localhost:3000"
$env:WHISPERVAULT_WORKER_SECRET="<shared-worker-secret>"
$env:AGENT_WALLET_NAME="agent-treasury"
$env:MIRAGE_EXECUTION_ENABLED="false"
$env:WORKER_POLL_INTERVAL_MS="30000"
npm.cmd run agent:worker:dry-run
```

Expected result:

- pending spend is listed
- `executed=0`
- `confirmed=0`
- no Telegram push is sent

### 10. Run worker real execution

Only do this on a machine where Mirage CLI is already installed and the existing worker execution model is allowed:

```powershell
$env:WHISPERVAULT_BASE_URL="http://localhost:3000"
$env:WHISPERVAULT_WORKER_SECRET="<shared-worker-secret>"
$env:AGENT_WALLET_NAME="agent-treasury"
$env:MIRAGE_EXECUTION_ENABLED="true"
$env:TELEGRAM_BOT_TOKEN="<botfather-token>"
npm.cmd run agent:worker
```

Long-running Railway worker:

```powershell
$env:WHISPERVAULT_BASE_URL="https://<your-app>.vercel.app"
$env:WHISPERVAULT_WORKER_SECRET="<shared-worker-secret>"
$env:TELEGRAM_BOT_TOKEN="<botfather-token>"
$env:AGENT_WALLET_NAME="agent-treasury"
$env:MIRAGE_EXECUTION_ENABLED="false"
$env:WORKER_POLL_INTERVAL_MS="30000"
npm.cmd run agent:worker:daemon
```

Expected worker behavior:

- fetch pending spend
- validate Mirage argv
- execute Mirage locally
- confirm receipt through `/api/agent-spend/confirm-manual`
- send Telegram push if the spend came from Telegram

### 11. Verify Telegram push and receipt

Expected Telegram push after successful worker confirmation:

```txt
Execution confirmed
Agent: coffee-agent
Amount: 5 USDC
Devnet tx: <signature>
Receipt: confirmed
```

Then in Telegram:

```txt
/receipt <paylinkId>
```

Expected receipt status:

- `Status: confirmed`
- `Execution status: confirmed/manual`
- `Tx signature: <signature>`

### 12. Verify blocked overspend

In Telegram:

```txt
/spend 100 buy gear
```

Expected result:

```txt
Spend Firewall: Blocked
Reason: Requested spend exceeds the remaining daily cap.
Private spend: none
Mirage command: not generated
```

### Local demo command sequence

```powershell
npm.cmd run demo:telegram:check
npm.cmd run demo:agent-vault:reset
npm.cmd run demo:agent-vault:seed
npm.cmd run dev
npm.cmd run agent:worker:dry-run
```

Real execution after approval:

```powershell
$env:MIRAGE_EXECUTION_ENABLED="true"
npm.cmd run agent:worker
```

### Vercel plus worker command sequence

Control plane:

```powershell
npm.cmd run demo:telegram:check
npm.cmd run telegram:webhook:info
npm.cmd run build
```

Worker machine:

```powershell
$env:WHISPERVAULT_BASE_URL="https://<your-app>.vercel.app"
$env:WHISPERVAULT_WORKER_SECRET="<shared-worker-secret>"
$env:AGENT_WALLET_NAME="agent-treasury"
$env:TELEGRAM_BOT_TOKEN="<botfather-token>"
$env:MIRAGE_EXECUTION_ENABLED="false"
$env:WORKER_POLL_INTERVAL_MS="30000"
npm.cmd run agent:worker:dry-run

$env:MIRAGE_EXECUTION_ENABLED="true"
npm.cmd run agent:worker:daemon
```

---

## Validation

```powershell
npm.cmd run smoke:agent-vault
npm.cmd run test:agent-budget
npm.cmd run typecheck
npm.cmd run build
```

The smoke test verifies:

- seeded demo Agent Vault,
- approved 5 USDC spend,
- budget reservation,
- Mirage command generation,
- rejected 100 USDC spend,
- no Mirage command on rejection,
- private receipt availability.

---

## MagicBlock / Mirage Integration

WhisperVault is designed around MagicBlock and Mirage as the private agent execution layer.

Implemented pieces include:

- MagicBlock router-aware transaction helpers,
- fallback-aware transaction semantics,
- ER permission lifecycle helper hooks,
- MagicBlock/private rail metadata on Agent Spend intents,
- Mirage-ready private transfer command generation,
- permissioned receipt and memo context,
- Anchor-aware BudgetVault adapter foundation.

Approved spends generate Mirage-ready execution commands. Unsafe spends are blocked before any command exists.

---

## Environment

Recommended default:

```txt
AGENT_BUDGET_POLICY_MODE=offchain
```

Optional Anchor-related values:

```txt
ANCHOR_PROVIDER_URL=
ANCHOR_WALLET=
BUDGET_VAULT_PROGRAM_ID=
```

Default demo mode is `offchain`.

Anchor-aware mode exists as a foundation, but live Anchor BudgetVault policy execution is not the default path.

---

## Deployment Notes

WhisperVault can be deployed to Vercel as a devnet showcase/control plane.

For Linux Mirage execution, deploy the agent worker separately on Railway with `Dockerfile.worker`. See [docs/railway-worker.md](docs/railway-worker.md).

### Real Mirage execution on Railway

Railway should deploy first with:

```txt
MIRAGE_EXECUTION_ENABLED=false
```

This is dry-run mode: the worker can reach Vercel, read pending spends, and validate planned Mirage commands without executing Mirage, confirming receipts, or sending execution-confirmed Telegram pushes.

Only switch Railway to real execution after Mirage CLI is installed and the worker host has the Mirage wallet named by `AGENT_WALLET_NAME`:

```txt
AGENT_WALLET_NAME=agent-treasury
MIRAGE_EXECUTION_ENABLED=true
```

Configure the `agent-treasury` wallet on the Railway/Linux worker host using the wallet setup flow supported by Mirage/OWS. Keep the wallet on the worker execution host only.

Run the readiness check before starting real execution:

```powershell
npm.cmd run agent:worker:check
```

The check verifies `mirage` exists, prints the Mirage version when `mirage --version` is available, checks `AGENT_WALLET_NAME`, and checks the worker control-plane endpoint. When execution is enabled, it also attempts `mirage address --wallet <AGENT_WALLET_NAME>`. It prints clear pass, warn, and fail lines and never prints secret values, wallet files, private keys, seed phrases, or Mirage command output.

Never commit wallet files, private keys, seed phrases, `.env` files, or Railway secrets. Use Railway Variables or a Railway Volume only if Mirage/OWS supports that storage path safely. If Mirage wallet files need to survive Railway redeploys, use a Railway persistent volume mounted at the Mirage wallet configuration path, initialize or import `agent-treasury` there through a trusted operator process, then rerun `npm.cmd run agent:worker:check` with `MIRAGE_EXECUTION_ENABLED=true`.

Recommended Vercel environment variable:

```txt
AGENT_BUDGET_POLICY_MODE=offchain
```

Important limitations:

- the browser does not custody agent keys,
- the browser does not execute Mirage CLI,
- local demo storage is not a production durable database,
- production multi-user persistence should use a real database,
- mainnet custody and production auth are not claimed.

---

## Repository Structure

```txt
app/
  api/
  agent-budgets/
  agent-vaults/
  pay/
components/
lib/
  agent-budget/
  agent-plan/
  agent-payment-lifecycle/
  whisperpay-server/
  magicblock-*.ts
programs/
  budget_vault/
scripts/
tests/
types/
```

---

## Current Status

WhisperVault is a **devnet prototype / live-beta architecture**.

Implemented:

- controller-wallet gated UI,
- Agent Vault creation,
- Devnet USDC budget model,
- daily cap enforcement,
- recipient validation,
- overspend blocking,
- invalid recipient blocking,
- Mirage command generation,
- private receipt view,
- manual devnet tx confirmation,
- agent runtime scripts,
- smoke tests,
- MagicBlock/private rail metadata bridge,
- Anchor-aware BudgetVault adapter foundation.

Not claimed:

- production custody,
- mainnet readiness,
- production authentication,
- hosted backend Mirage execution,
- fully durable multi-user database,
- automatic browser-side Mirage execution.

---

## Product Truth

WhisperVault is intentionally explicit about what is live, what is devnet, and what is manual.

- **Live:** policy checks, private spend intent creation, receipt generation, agent runtime scripts.
- **Devnet:** asset and execution model.
- **Manual:** Mirage CLI execution and tx confirmation.
- **Prototype:** production storage, auth, custody, and mainnet hardening.

---

## Summary

**WhisperVault is an Agent Spend Firewall for private AI payments.**

It lets Claude/Mirage agents spend through a MagicBlock-ready private rail while enforcing controller-owned policies before execution.

Safe spends produce Mirage commands and permissioned receipts. Unsafe spends are blocked before any private spend exists.

```txt
Private agent spending.
Policy controlled.
Receipt auditable.
Execution via Mirage.
```
