create table if not exists whispervault_telegram_link_codes (
  code text primary key,
  controller_wallet text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whispervault_telegram_link_codes_wallet_idx
  on whispervault_telegram_link_codes(controller_wallet);

create index if not exists whispervault_telegram_link_codes_expires_idx
  on whispervault_telegram_link_codes(expires_at);

create table if not exists whispervault_telegram_linked_accounts (
  telegram_user_id text primary key,
  controller_wallet text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whispervault_telegram_linked_accounts_wallet_idx
  on whispervault_telegram_linked_accounts(controller_wallet);
