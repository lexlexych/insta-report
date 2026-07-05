-- 0002_increment_usage.sql
-- Атомарный upsert-инкремент статистики использования (usage_stats.unique(tenant_id, day)).

create or replace function increment_usage(p_tenant uuid, p_day date,
  p_llm_calls int, p_tokens_in int, p_tokens_out int,
  p_drafts_created int, p_drafts_sent int) returns void language sql as $$
  insert into usage_stats as u (tenant_id, day, llm_calls, tokens_in, tokens_out, drafts_created, drafts_sent)
  values (p_tenant, p_day, p_llm_calls, p_tokens_in, p_tokens_out, p_drafts_created, p_drafts_sent)
  on conflict (tenant_id, day) do update set
    llm_calls = u.llm_calls + excluded.llm_calls,
    tokens_in = u.tokens_in + excluded.tokens_in,
    tokens_out = u.tokens_out + excluded.tokens_out,
    drafts_created = u.drafts_created + excluded.drafts_created,
    drafts_sent = u.drafts_sent + excluded.drafts_sent;
$$;
