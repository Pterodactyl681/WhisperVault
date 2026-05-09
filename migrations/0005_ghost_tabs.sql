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
