import { getDb } from './client';
import { throwDb } from './errors';
import type { Database } from './types.gen';

type UsageStat = Database['public']['Tables']['usage_stats']['Row'];

export type UsageIncrementPatch = Partial<{
  day: string;
  llmCalls: number;
  tokensIn: number;
  tokensOut: number;
  draftsCreated: number;
  draftsSent: number;
  simulatorCalls: number;
}>;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function increment(tenantId: string, patch: UsageIncrementPatch): Promise<void> {
  const { error } = await getDb().rpc('increment_usage', {
    p_tenant: tenantId,
    p_day: patch.day ?? today(),
    p_llm_calls: patch.llmCalls ?? 0,
    p_tokens_in: patch.tokensIn ?? 0,
    p_tokens_out: patch.tokensOut ?? 0,
    p_drafts_created: patch.draftsCreated ?? 0,
    p_drafts_sent: patch.draftsSent ?? 0,
    p_simulator_calls: patch.simulatorCalls ?? 0,
  });
  if (error) throwDb('usageStats.increment', error);
}

export async function getRange(
  tenantId: string,
  fromDay: string,
  toDay: string,
): Promise<UsageStat[]> {
  const { data, error } = await getDb()
    .from('usage_stats')
    .select()
    .eq('tenant_id', tenantId)
    .gte('day', fromDay)
    .lte('day', toDay)
    .order('day', { ascending: true });
  if (error) throwDb('usageStats.getRange', error);
  return data as UsageStat[];
}
