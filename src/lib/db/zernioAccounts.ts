import { getDb } from './client';
import { isSupabaseCode, throwDb, ZernioAccountConflictError } from './errors';
import type { Database } from './types.gen';

export type ZernioAccountRow = Database['public']['Tables']['zernio_accounts']['Row'];
export type ZernioPlatform = ZernioAccountRow['platform'];
export type ZernioAccountStatus = ZernioAccountRow['status'];

type ActivateInput = {
  zernioAccountId: string;
  username: string | null;
};

export async function getForTenant(
  tenantId: string,
  platform: ZernioPlatform = 'instagram',
): Promise<ZernioAccountRow | null> {
  const { data, error } = await getDb()
    .from('zernio_accounts')
    .select()
    .eq('tenant_id', tenantId)
    .eq('platform', platform)
    .maybeSingle();
  if (error) throwDb('zernioAccounts.getForTenant', error);
  return data as ZernioAccountRow | null;
}

export async function insertPending(
  tenantId: string,
  platform: ZernioPlatform,
  zernioProfileId: string,
): Promise<ZernioAccountRow> {
  const { data, error } = await getDb()
    .from('zernio_accounts')
    .insert({ tenant_id: tenantId, platform, zernio_profile_id: zernioProfileId, status: 'pending' })
    .select()
    .single();
  if (isSupabaseCode(error, '23505')) throw new ZernioAccountConflictError();
  if (error) throwDb('zernioAccounts.insertPending', error);
  return data as ZernioAccountRow;
}

export async function ensureProfile(
  tenantId: string,
  platform: ZernioPlatform,
  createProfileFn: () => Promise<string>,
): Promise<string> {
  const existing = await getForTenant(tenantId, platform);
  if (existing) return existing.zernio_profile_id;

  const zernioProfileId = await createProfileFn();
  try {
    await insertPending(tenantId, platform, zernioProfileId);
    return zernioProfileId;
  } catch (error) {
    if (!(error instanceof ZernioAccountConflictError)) throw error;
    const concurrent = await getForTenant(tenantId, platform);
    if (concurrent) return concurrent.zernio_profile_id;
    throw error;
  }
}

export async function activate(
  tenantId: string,
  platform: ZernioPlatform,
  { zernioAccountId, username }: ActivateInput,
): Promise<void> {
  const { error } = await getDb()
    .from('zernio_accounts')
    .update({
      zernio_account_id: zernioAccountId,
      username,
      status: 'active',
      connected_at: new Date().toISOString(),
      disconnect_reason: null,
    })
    .eq('tenant_id', tenantId)
    .eq('platform', platform);
  if (isSupabaseCode(error, '23505')) throw new ZernioAccountConflictError();
  if (error) throwDb('zernioAccounts.activate', error);
}

export async function getByZernioAccountId(
  zernioAccountId: string | null | undefined,
): Promise<ZernioAccountRow | null> {
  if (!zernioAccountId) return null;

  const { data, error } = await getDb()
    .from('zernio_accounts')
    .select()
    .eq('zernio_account_id', zernioAccountId)
    .maybeSingle();
  if (error) throwDb('zernioAccounts.getByZernioAccountId', error);
  return data as ZernioAccountRow | null;
}

export async function getByZernioProfileId(
  zernioProfileId: string,
): Promise<ZernioAccountRow | null> {
  const { data, error } = await getDb()
    .from('zernio_accounts')
    .select()
    .eq('zernio_profile_id', zernioProfileId)
    .maybeSingle();
  if (error) throwDb('zernioAccounts.getByZernioProfileId', error);
  return data as ZernioAccountRow | null;
}

export async function setStatus(
  tenantId: string,
  platform: ZernioPlatform,
  status: ZernioAccountStatus,
  reason?: string,
): Promise<void> {
  const { error } = await getDb()
    .from('zernio_accounts')
    .update({ status, disconnect_reason: reason ?? null })
    .eq('tenant_id', tenantId)
    .eq('platform', platform);
  if (error) throwDb('zernioAccounts.setStatus', error);
}

export async function disconnect(
  tenantId: string,
  platform: ZernioPlatform,
  reason: string,
): Promise<void> {
  await setStatus(tenantId, platform, 'disconnected', reason);
}
