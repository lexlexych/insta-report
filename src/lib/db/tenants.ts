import { getDb } from './client';
import { throwDb } from './errors';
import type { Database } from './types.gen';

type Tenant = Database['public']['Tables']['tenants']['Row'];
type TenantInsert = Database['public']['Tables']['tenants']['Insert'];
type TenantUpdate = Database['public']['Tables']['tenants']['Update'];

export async function upsertByTelegramUserId(
  telegramUserId: number,
  patch: Omit<TenantInsert, 'telegram_user_id'>,
): Promise<Tenant> {
  const { data, error } = await getDb()
    .from('tenants')
    .upsert({ ...patch, telegram_user_id: telegramUserId }, { onConflict: 'telegram_user_id' })
    .select()
    .single();
  if (error) throwDb('tenants.upsertByTelegramUserId', error);
  return data as unknown as Tenant;
}

export async function getById(id: string): Promise<Tenant | null> {
  const { data, error } = await getDb().from('tenants').select().eq('id', id).maybeSingle();
  if (error) throwDb('tenants.getById', error);
  return data as unknown as Tenant;
}

export async function getByTelegramUserId(telegramUserId: number): Promise<Tenant | null> {
  const { data, error } = await getDb()
    .from('tenants')
    .select()
    .eq('telegram_user_id', telegramUserId)
    .maybeSingle();
  if (error) throwDb('tenants.getByTelegramUserId', error);
  return data as unknown as Tenant;
}

export async function update(id: string, patch: TenantUpdate): Promise<Tenant> {
  const { data, error } = await getDb().from('tenants').update(patch).eq('id', id).select().single();
  if (error) throwDb('tenants.update', error);
  return data as unknown as Tenant;
}

const TENANT_SCOPED_TABLES = [
  'processed_events',
  'drafts',
  'message_log',
  'usage_stats',
  'labels',
  'ig_connections',
] as const satisfies readonly (keyof Database['public']['Tables'])[];

export async function deleteCascade(id: string): Promise<void> {
  const db = getDb();

  for (const table of TENANT_SCOPED_TABLES) {
    const { error } = await db.from(table).delete().eq('tenant_id', id);
    if (error) throwDb(`tenants.deleteCascade.${table}`, error);
  }

  const { error } = await db.from('tenants').delete().eq('id', id);
  if (error) throwDb('tenants.deleteCascade.tenants', error);
}
