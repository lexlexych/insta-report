import { getDb } from './client';
import { isSupabaseCode, PendingExistsError, throwDb } from './errors';
import type { Database } from './types.gen';

type Draft = Database['public']['Tables']['drafts']['Row'];
type DraftInsert = Database['public']['Tables']['drafts']['Insert'];
type DraftUpdate = Database['public']['Tables']['drafts']['Update'];
type DraftStatus = Draft['status'];

export async function insertPending(data: Omit<DraftInsert, 'status'>): Promise<Draft> {
  const result = await getDb()
    .from('drafts')
    .insert({ ...data, status: 'pending' })
    .select()
    .single();
  if (isSupabaseCode(result.error, '23505')) throw new PendingExistsError();
  if (result.error) throwDb('drafts.insertPending', result.error);
  return result.data as Draft;
}

export async function getById(id: string): Promise<Draft | null> {
  const { data, error } = await getDb().from('drafts').select().eq('id', id).maybeSingle();
  if (error) throwDb('drafts.getById', error);
  return data as Draft | null;
}

export async function claimPendingToSending(id: string): Promise<Draft | null> {
  const { data, error } = await getDb()
    .from('drafts')
    .update({ status: 'sending' })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throwDb('drafts.claimPendingToSending', error);
  return data as Draft | null;
}

export async function setStatus(
  id: string,
  status: DraftStatus,
  extra: Omit<DraftUpdate, 'id' | 'status'> = {},
): Promise<Draft> {
  const { data, error } = await getDb()
    .from('drafts')
    .update({ ...extra, status })
    .eq('id', id)
    .select()
    .single();
  if (error) throwDb('drafts.setStatus', error);
  return data as Draft;
}

export async function getPendingByConversation(
  tenantId: string,
  conversationKey: string,
): Promise<Draft | null> {
  const { data, error } = await getDb()
    .from('drafts')
    .select()
    .eq('tenant_id', tenantId)
    .eq('conversation_key', conversationKey)
    .eq('status', 'pending')
    .maybeSingle();
  if (error) throwDb('drafts.getPendingByConversation', error);
  return data as Draft | null;
}

export async function cancelPendingByConversation(
  tenantId: string,
  conversationKey: string,
): Promise<Draft | null> {
  const { data, error } = await getDb()
    .from('drafts')
    .update({ status: 'cancelled' })
    .eq('tenant_id', tenantId)
    .eq('conversation_key', conversationKey)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throwDb('drafts.cancelPendingByConversation', error);
  return data as Draft | null;
}

export async function setErrorToPending(id: string): Promise<Draft | null> {
  const { data, error } = await getDb()
    .from('drafts')
    .update({ status: 'pending', error: null })
    .eq('id', id)
    .eq('status', 'error')
    .select()
    .maybeSingle();
  if (error) throwDb('drafts.setErrorToPending', error);
  return data as Draft | null;
}


export type DraftStatusCounts = Record<DraftStatus, number> & { total: number };

export async function countByStatusSince(tenantId: string, sinceIso: string): Promise<DraftStatusCounts> {
  const { data, error } = await getDb()
    .from('drafts')
    .select('status')
    .eq('tenant_id', tenantId)
    .gte('created_at', sinceIso);
  if (error) throwDb('drafts.countByStatusSince', error);

  const counts: DraftStatusCounts = {
    pending: 0,
    sending: 0,
    sent: 0,
    cancelled: 0,
    skipped_manual: 0,
    error: 0,
    total: 0,
  };
  for (const row of (data ?? []) as Pick<Draft, 'status'>[]) {
    counts[row.status] += 1;
    counts.total += 1;
  }
  return counts;
}
