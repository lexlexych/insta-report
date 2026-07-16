-- 0013_zernio.sql
-- Реестр подключений Instagram через Zernio и источник черновика.

begin;

create table zernio_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram')),
  zernio_profile_id text not null,
  zernio_account_id text,
  username text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'disconnected', 'error')),
  connected_at timestamptz,
  disconnect_reason text,
  created_at timestamptz not null default now()
);

create unique index zernio_accounts_tenant_platform_uniq
  on zernio_accounts (tenant_id, platform);
create unique index zernio_accounts_account_id_uniq
  on zernio_accounts (zernio_account_id) where zernio_account_id is not null;
create index zernio_accounts_profile_idx on zernio_accounts (zernio_profile_id);

alter table drafts add column provider text not null default 'meta'
  check (provider in ('meta', 'zernio'));
alter table drafts add column zernio_conversation_id text;

-- Политик намеренно нет: RLS без политик запрещает доступ всем, кроме service role.
alter table zernio_accounts enable row level security;

commit;
