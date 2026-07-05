-- 0001_init.sql
-- Схема БД InstaReply (см. docs/plan.md §2.4). Все таблицы — только для service role;
-- RLS включён везде, политик нет => anon (и любой ключ, кроме service role) получает deny-all
-- по умолчанию Postgres (RLS без политик запрещает все операции для ролей, на которые
-- распространяется RLS).

create extension if not exists "pgcrypto";

-- ============================================================================
-- tenants
-- ============================================================================
create table tenants (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  tg_chat_id bigint,
  org_name text,
  org_description text,
  knowledge_base text,
  system_prompt text,
  reply_language text not null default 'auto',
  plan text not null default 'free',
  onboarding_step text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ig_connections
-- ============================================================================
create table ig_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references tenants (id) on delete cascade,
  connection_mode text not null check (connection_mode in ('own_app')),
  ig_account_id text,
  ig_username text,
  access_token_enc text,
  app_secret_enc text,
  verify_token text,
  token_refreshed_at timestamptz,
  webhook_last_seen_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'active', 'error')),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- labels
-- ============================================================================
create table labels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  description text,
  instruction text,
  tg_thread_id bigint,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- ============================================================================
-- drafts
-- ============================================================================
create table drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  conversation_key text not null, -- "{ig_account_id}:{contact_id}"
  contact_id text,
  contact_username text,
  pending_text text,
  history_snapshot text,
  -- при удалении метки черновики не удаляются: пользователь мог уже увидеть/отправить их;
  -- обнуляем label_id (см. T-023 AC "удаление метки -> drafts.label_id NULL").
  label_id uuid references labels (id) on delete set null,
  draft_text text,
  tg_chat_id bigint,
  tg_message_id bigint,
  trigger_ts bigint,
  status text not null default 'pending' check (
    status in ('pending', 'sending', 'sent', 'cancelled', 'skipped_manual', 'error')
  ),
  error text,
  created_at timestamptz not null default now()
);

-- Не более одного pending-черновика на беседу одновременно: новый черновик должен сначала
-- отменить предыдущий (см. deliver.ts / cancelPendingByConversation), это ограничение —
-- подстраховка на уровне БД.
create unique index drafts_pending_uniq
  on drafts (tenant_id, conversation_key)
  where status = 'pending';

create index on drafts (tenant_id, status);

-- ============================================================================
-- processed_events
-- ============================================================================
create table processed_events (
  tenant_id uuid not null references tenants (id) on delete cascade,
  event_mid text not null,
  created_at timestamptz not null default now()
);

create unique index processed_events_uniq on processed_events (tenant_id, event_mid);

-- ============================================================================
-- message_log
-- ============================================================================
create table message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  conversation_key text not null,
  direction text not null check (direction in ('in', 'out', 'manual')),
  text text,
  created_at timestamptz not null default now()
);

create index on message_log (tenant_id, created_at desc);

-- ============================================================================
-- usage_stats
-- ============================================================================
create table usage_stats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  day date not null,
  llm_calls int not null default 0,
  tokens_in int not null default 0,
  tokens_out int not null default 0,
  drafts_created int not null default 0,
  drafts_sent int not null default 0,
  created_at timestamptz not null default now()
);

create unique index usage_stats_uniq on usage_stats (tenant_id, day);

-- ============================================================================
-- RLS: включаем на всех таблицах, без политик => deny-all для всех ролей кроме
-- service role (service role обходит RLS всегда).
-- ============================================================================
alter table tenants enable row level security;
alter table ig_connections enable row level security;
alter table labels enable row level security;
alter table drafts enable row level security;
alter table processed_events enable row level security;
alter table message_log enable row level security;
alter table usage_stats enable row level security;

-- ============================================================================
-- Функция сида метки по умолчанию "Без категории".
-- ============================================================================
create or replace function seed_default_labels(p_tenant uuid) returns void language sql as $$
  insert into labels (tenant_id, name, description, instruction, sort)
  values (p_tenant, 'Без категории', 'Обращения, не подошедшие под другие категории',
          'Ответь вежливо и по существу, опираясь на базу знаний.', 999)
  on conflict do nothing;
$$;
