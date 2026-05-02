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
  daily_cap_percent integer not null check (daily_cap_percent >= 0 and daily_cap_percent <= 100),
  spent_today text not null,
  last_reset_at timestamptz not null,
  status text not null check (status in ('active', 'paused', 'exhausted')),
  rail text not null check (rail in ('magicblock-private', 'public-solana')),
  allow_public_fallback boolean not null default false,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  updated_at timestamptz not null default now()
);

create index if not exists whisperpay_payment_intents_paylink_idx
  on whisperpay_payment_intents(paylink_id);

create index if not exists whisperpay_payment_intents_status_idx
  on whisperpay_payment_intents(status);
