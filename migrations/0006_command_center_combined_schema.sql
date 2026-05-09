-- Combined safety migration for WhisperVault Command Center deployments.
-- Safe to run on a fresh database or on a partially migrated database.

create table if not exists whispervault_controller_wallets (
  address text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists whispervault_agent_budgets (
  agent_id text primary key,
  owner text not null references whispervault_controller_wallets(address) on update cascade,
  agent_wallet text,
  mint text not null,
  total_budget text not null,
  current_balance text not null,
  daily_cap_percent integer not null default 30 check (daily_cap_percent >= 0 and daily_cap_percent <= 100),
  spent_today text not null default '0',
  last_reset_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'paused', 'exhausted')),
  rail text not null default 'magicblock-private' check (rail in ('magicblock-private', 'public-solana')),
  allow_public_fallback boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table whispervault_agent_budgets
  add column if not exists agent_wallet text,
  add column if not exists allowance_mode text not null default 'rolling'
    check (allowance_mode in ('static', 'rolling')),
  add column if not exists live_allowance text not null default '10',
  add column if not exists refill_amount text not null default '5',
  add column if not exists refill_interval_minutes integer not null default 10
    check (refill_interval_minutes > 0),
  add column if not exists max_live_allowance text not null default '20',
  add column if not exists last_refill_at timestamptz,
  add column if not exists session_ends_at timestamptz,
  add column if not exists clawback_on_session_end boolean not null default true,
  add column if not exists metadata jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update whispervault_agent_budgets
set
  allowance_mode = coalesce(nullif(allowance_mode, ''), 'rolling'),
  live_allowance = coalesce(nullif(live_allowance, ''), '10'),
  refill_amount = coalesce(nullif(refill_amount, ''), '5'),
  refill_interval_minutes = coalesce(refill_interval_minutes, 10),
  max_live_allowance = coalesce(nullif(max_live_allowance, ''), '20'),
  last_refill_at = coalesce(last_refill_at, last_reset_at, now()),
  clawback_on_session_end = coalesce(clawback_on_session_end, true);

alter table whispervault_agent_budgets
  alter column last_refill_at set default now();

update whispervault_agent_budgets
set last_refill_at = now()
where last_refill_at is null;

alter table whispervault_agent_budgets
  alter column last_refill_at set not null;

create index if not exists whispervault_agent_budgets_owner_idx
  on whispervault_agent_budgets(owner);

create table if not exists whispervault_agent_budget_reservations (
  id text primary key,
  agent_id text not null references whispervault_agent_budgets(agent_id) on delete cascade,
  amount text not null,
  reference text not null,
  paylink_id text,
  created_at timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved', 'confirmed', 'released')),
  payment_id text,
  settled_at timestamptz,
  released_at timestamptz,
  released_reason text
);

create index if not exists whispervault_agent_budget_reservations_agent_idx
  on whispervault_agent_budget_reservations(agent_id, created_at);

create index if not exists whispervault_agent_budget_reservations_paylink_idx
  on whispervault_agent_budget_reservations(paylink_id);

create table if not exists whisperpay_paylinks (
  id text primary key,
  owner_wallet text not null,
  nickname text not null,
  default_token text not null check (default_token in ('SOL', 'USDC')),
  created_at timestamptz not null,
  is_active boolean not null default true,
  metadata jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists whisperpay_paylinks_owner_wallet_idx
  on whisperpay_paylinks(owner_wallet);

create table if not exists whisperpay_payment_intents (
  id text primary key,
  paylink_id text not null references whisperpay_paylinks(id) on delete cascade,
  from_wallet text not null,
  to_wallet text not null,
  settlement_rail text not null check (settlement_rail in ('sol-public', 'magicblock-private-spl')),
  token_symbol text not null check (token_symbol in ('SOL', 'USDC')),
  status text not null check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null,
  tx_signature text,
  er_lifecycle jsonb,
  magic_private jsonb,
  amount text not null,
  mint text not null,
  recipient text not null,
  metadata jsonb,
  pending_execution jsonb,
  updated_at timestamptz not null default now()
);

alter table whisperpay_payment_intents
  add column if not exists amount text,
  add column if not exists mint text,
  add column if not exists recipient text,
  add column if not exists metadata jsonb,
  add column if not exists pending_execution jsonb,
  add column if not exists er_lifecycle jsonb,
  add column if not exists magic_private jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists whisperpay_payment_intents_paylink_idx
  on whisperpay_payment_intents(paylink_id);

create index if not exists whisperpay_payment_intents_status_idx
  on whisperpay_payment_intents(status);

create table if not exists whispervault_agents (
  id text primary key,
  name text not null,
  controller_wallet text not null references whispervault_controller_wallets(address) on update cascade,
  created_at timestamptz not null default now(),
  status text not null check (status in ('active', 'paused', 'exhausted')),
  daily_cap text not null,
  current_daily_spent text not null,
  vault_balance text not null,
  ghost_allowance_live text not null,
  ghost_allowance_max text not null,
  ghost_refill_amount text not null,
  ghost_refill_interval_minutes integer not null check (ghost_refill_interval_minutes > 0),
  preferred_rail text not null check (preferred_rail in ('magicblock-private', 'public-solana')),
  execution_mode text not null check (execution_mode in ('mirage-private-first', 'native-fallback-devnet')),
  api_token_hash text,
  default_recipient_label text,
  default_recipient_address text,
  updated_at timestamptz not null default now(),
  unique(controller_wallet, name)
);

create index if not exists whispervault_agents_controller_idx
  on whispervault_agents(controller_wallet);

create unique index if not exists whispervault_agents_api_token_hash_idx
  on whispervault_agents(api_token_hash)
  where api_token_hash is not null;

create table if not exists whispervault_active_agents (
  controller_wallet text primary key references whispervault_controller_wallets(address) on update cascade,
  agent_id text not null references whispervault_agents(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists whispervault_agent_recipients (
  controller_wallet text not null references whispervault_controller_wallets(address) on update cascade,
  label text not null,
  address text not null,
  agent_id text references whispervault_agents(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(controller_wallet, label)
);

create index if not exists whispervault_agent_recipients_controller_idx
  on whispervault_agent_recipients(controller_wallet);

create table if not exists whispervault_ghost_tab_sessions (
  id text primary key,
  agent_id text not null,
  controller_wallet text not null references whispervault_controller_wallets(address) on update cascade,
  status text not null check (status in ('active', 'paused', 'expired', 'clawed_back')),
  opened_at timestamptz not null,
  expires_at timestamptz,
  last_refill_at timestamptz not null,
  allowance_live text not null,
  allowance_max text not null,
  refill_amount text not null,
  refill_interval_minutes integer not null check (refill_interval_minutes > 0),
  clawback_enabled boolean not null default true,
  clawback_executed boolean not null default false,
  total_spent text not null default '0',
  total_refilled text not null default '0',
  total_clawed_back text not null default '0',
  execution_mode text not null check (execution_mode in ('mirage-private-first', 'native-fallback-devnet')),
  preferred_rail text not null check (preferred_rail in ('magicblock-private', 'public-solana')),
  updated_at timestamptz not null default now()
);

create index if not exists whispervault_ghost_tab_sessions_controller_idx
  on whispervault_ghost_tab_sessions(controller_wallet, opened_at desc);

create index if not exists whispervault_ghost_tab_sessions_agent_idx
  on whispervault_ghost_tab_sessions(agent_id, opened_at desc);

create table if not exists whispervault_ghost_tab_events (
  id text primary key,
  session_id text not null references whispervault_ghost_tab_sessions(id) on delete cascade,
  agent_id text not null,
  controller_wallet text not null references whispervault_controller_wallets(address) on update cascade,
  type text not null check (type in ('opened', 'refill_tick', 'spend_approved', 'spend_blocked', 'paused', 'resumed', 'expired', 'clawback')),
  at timestamptz not null,
  amount text,
  allowance_before text,
  allowance_after text,
  reason text,
  metadata jsonb
);

create index if not exists whispervault_ghost_tab_events_session_idx
  on whispervault_ghost_tab_events(session_id, at asc);

create index if not exists whispervault_ghost_tab_events_controller_idx
  on whispervault_ghost_tab_events(controller_wallet, at desc);
