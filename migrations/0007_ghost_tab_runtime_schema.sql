-- Ghost Tab runtime safety migration for Command Center onboarding.
-- Safe to run repeatedly on fresh or partially migrated Supabase projects.

create table if not exists public.whispervault_controller_wallets (
  address text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.whispervault_ghost_tab_sessions (
  id text primary key,
  agent_id text not null,
  controller_wallet text not null references public.whispervault_controller_wallets(address) on update cascade,
  status text not null default 'active',
  opened_at timestamptz not null default now(),
  expires_at timestamptz,
  last_refill_at timestamptz not null default now(),
  allowance_live text not null default '0',
  allowance_max text not null default '0',
  refill_amount text not null default '0',
  refill_interval_minutes integer not null default 10,
  clawback_enabled boolean not null default true,
  clawback_executed boolean not null default false,
  total_spent text not null default '0',
  total_refilled text not null default '0',
  total_clawed_back text not null default '0',
  execution_mode text not null default 'mirage-private-first',
  preferred_rail text not null default 'magicblock-private',
  refill_engine text not null default 'er-scheduled',
  per_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whispervault_ghost_tab_sessions
  add column if not exists refill_engine text not null default 'er-scheduled',
  add column if not exists per_status text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists whispervault_ghost_tab_sessions_controller_idx
  on public.whispervault_ghost_tab_sessions(controller_wallet, opened_at desc);

create index if not exists whispervault_ghost_tab_sessions_agent_idx
  on public.whispervault_ghost_tab_sessions(agent_id, opened_at desc);

create table if not exists public.whispervault_ghost_tab_events (
  id text primary key,
  session_id text references public.whispervault_ghost_tab_sessions(id) on delete cascade,
  agent_id text not null,
  controller_wallet text not null references public.whispervault_controller_wallets(address) on update cascade,
  event_type text,
  type text,
  at timestamptz,
  amount text,
  allowance_before text,
  allowance_after text,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table public.whispervault_ghost_tab_events
  add column if not exists event_type text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists whispervault_ghost_tab_events_session_idx
  on public.whispervault_ghost_tab_events(session_id, coalesce(at, created_at) asc);

create index if not exists whispervault_ghost_tab_events_controller_idx
  on public.whispervault_ghost_tab_events(controller_wallet, created_at desc);
