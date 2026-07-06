alter table tenants
  add column tg_topics_enabled boolean not null default false,
  add column history_thread_id bigint;
