alter table whispervault_agent_budgets
  add column if not exists allowance_mode text not null default 'rolling'
    check (allowance_mode in ('static', 'rolling')),
  add column if not exists live_allowance text not null default '10',
  add column if not exists refill_amount text not null default '5',
  add column if not exists refill_interval_minutes integer not null default 10
    check (refill_interval_minutes > 0),
  add column if not exists max_live_allowance text not null default '20',
  add column if not exists last_refill_at timestamptz,
  add column if not exists session_ends_at timestamptz,
  add column if not exists clawback_on_session_end boolean not null default true;

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
