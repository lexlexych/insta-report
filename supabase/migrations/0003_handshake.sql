-- 0003_handshake.sql
-- Фиксация факта успешного verify-хэндшейка Meta-вебхука (GET hub.challenge), отдельно от status.

alter table ig_connections add column handshake_at timestamptz;
