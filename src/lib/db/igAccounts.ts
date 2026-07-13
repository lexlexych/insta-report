import { getDb } from './client';
import { throwDb } from './errors';
import type { Database } from './types.gen';
export { normalizeIgUsername } from '@/lib/ig/username';
import { normalizeIgUsername } from '@/lib/ig/username';

type IgAccount = Database['public']['Tables']['ig_accounts']['Row'];

function normalizeOrThrow(username: string): string {
  const normalized = normalizeIgUsername(username);
  if (!normalized) throw new Error('Invalid Instagram username');
  return normalized;
}

export async function findByUsername(username: string): Promise<IgAccount | null> {
  const normalized = normalizeIgUsername(username);
  if (!normalized) return null;

  const { data, error } = await getDb()
    .from('ig_accounts')
    .select()
    .eq('ig_username', normalized)
    .maybeSingle();
  if (error) throwDb('igAccounts.findByUsername', error);
  return data as IgAccount | null;
}

export async function createPending(username: string, tenantId: string | null): Promise<IgAccount> {
  const { data, error } = await getDb()
    .from('ig_accounts')
    .insert({ ig_username: normalizeOrThrow(username), tenant_id: tenantId, status: 'pending' })
    .select()
    .single();
  if (error) throwDb('igAccounts.createPending', error);
  return data as IgAccount;
}

export async function approve(id: string, adminTgId: number): Promise<IgAccount | null> {
  const { data, error } = await getDb()
    .from('ig_accounts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by_tg_id: adminTgId,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select()
    .maybeSingle();
  if (error) throwDb('igAccounts.approve', error);
  return data as IgAccount | null;
}

export async function getByTenant(tenantId: string): Promise<IgAccount | null> {
  const { data, error } = await getDb()
    .from('ig_accounts')
    .select()
    .eq('tenant_id', tenantId)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwDb('igAccounts.getByTenant', error);
  return data as IgAccount | null;
}

export async function bindTenant(id: string, tenantId: string): Promise<IgAccount | null> {
  const { data, error } = await getDb()
    .from('ig_accounts')
    .update({ tenant_id: tenantId })
    .eq('id', id)
    .eq('status', 'approved')
    .is('tenant_id', null)
    .select()
    .maybeSingle();
  if (error) throwDb('igAccounts.bindTenant', error);
  return data as IgAccount | null;
}
