-- 0010_remove_own_app.sql
-- Business Login is now the only Instagram connection flow.

begin;

delete from ig_connections where connection_mode = 'own_app';

drop index if exists ig_connections_platform_ig_account_id_key;

alter table ig_connections
  drop constraint if exists ig_connections_connection_mode_check,
  drop column if exists connection_mode,
  drop column if exists app_secret_enc,
  drop column if exists verify_token,
  drop column if exists handshake_at;

create unique index ig_connections_platform_ig_account_id_key
  on ig_connections (ig_account_id)
  where ig_account_id is not null;

alter table tenants
  drop column if exists history_thread_id;

commit;
