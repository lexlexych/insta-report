alter table public.ig_connections
  drop constraint if exists ig_connections_connection_mode_check;

alter table public.ig_connections
  add constraint ig_connections_connection_mode_check
  check (connection_mode in ('own_app', 'platform_app'));

create unique index if not exists ig_connections_platform_ig_account_id_key
  on public.ig_connections (ig_account_id)
  where connection_mode = 'platform_app' and ig_account_id is not null;
