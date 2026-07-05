import { getDb } from './client';
import { isSupabaseCode, throwDb } from './errors';

export async function tryInsert(tenantId: string, mid: string): Promise<boolean> {
  const { error } = await getDb().from('processed_events').insert({ tenant_id: tenantId, event_mid: mid });
  if (isSupabaseCode(error, '23505')) return false;
  if (error) throwDb('processedEvents.tryInsert', error);
  return true;
}
