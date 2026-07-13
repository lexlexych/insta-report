-- 0011_ig_accounts.sql
-- Реестр Instagram-аккаунтов, вручную добавленных в Meta App.

begin;

create table ig_accounts (
  id uuid primary key default gen_random_uuid(),
  ig_username text not null unique,
  tenant_id uuid references tenants (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved')),
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by_tg_id bigint
);

alter table tenants add column business_sphere text;

-- Политик намеренно нет: RLS без политик запрещает доступ всем, кроме service role.
alter table ig_accounts enable row level security;

commit;
