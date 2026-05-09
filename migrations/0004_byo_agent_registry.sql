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

alter table whisperpay_payment_intents
  add column if not exists pending_execution jsonb;
