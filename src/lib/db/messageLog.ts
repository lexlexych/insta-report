import { getDb } from './client';
import { throwDb } from './errors';
import type { Database } from './types.gen';

type MessageLog = Database['public']['Tables']['message_log']['Row'];
type MessageDirection = MessageLog['direction'];

export async function add(
  tenantId: string,
  conversationKey: string,
  direction: MessageDirection,
  text: string,
): Promise<MessageLog> {
  const { data, error } = await getDb()
    .from('message_log')
    .insert({ tenant_id: tenantId, conversation_key: conversationKey, direction, text })
    .select()
    .single();
  if (error) throwDb('messageLog.add', error);
  return data as MessageLog;
}

export async function recent(tenantId: string, limit: number): Promise<MessageLog[]> {
  const { data, error } = await getDb()
    .from('message_log')
    .select()
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throwDb('messageLog.recent', error);
  return data as MessageLog[];
}
