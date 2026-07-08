import { decrypt, encrypt } from '@/lib/crypto';

import { getDb } from './client';
import { throwDb } from './errors';
import type { Database } from './types.gen';

type IgConnection = Database['public']['Tables']['ig_connections']['Row'];
type IgConnectionInsert = Database['public']['Tables']['ig_connections']['Insert'];
type IgConnectionUpdate = Database['public']['Tables']['ig_connections']['Update'];
type IgStatus = IgConnection['status'];

export type IgConnectionPatch = Omit<Partial<IgConnectionInsert>, 'tenant_id' | 'access_token_enc'> & {
  accessToken?: string | null;
};

export type DecryptedIgConnection = Omit<IgConnection, 'access_token_enc'> & {
  accessToken: string | null;
};

function decryptConnection(row: IgConnection): DecryptedIgConnection {
  const { access_token_enc: accessTokenEnc, ...rest } = row;
  return {
    ...rest,
    accessToken: accessTokenEnc ? decrypt(accessTokenEnc) : null,
  };
}

function toDbPatch(patch: IgConnectionPatch): IgConnectionUpdate {
  const { accessToken, ...rest } = patch;
  return {
    ...rest,
    ...(accessToken === undefined ? {} : { access_token_enc: accessToken === null ? null : encrypt(accessToken) }),
  };
}

export async function upsertForTenant(
  tenantId: string,
  patch: IgConnectionPatch,
): Promise<DecryptedIgConnection> {
  const { data, error } = await getDb()
    .from('ig_connections')
    .upsert(
      { tenant_id: tenantId, ...toDbPatch(patch) },
      { onConflict: 'tenant_id' },
    )
    .select()
    .single();
  if (error) throwDb('igConnections.upsertForTenant', error);
  return decryptConnection(data as unknown as IgConnection);
}

export async function getForTenant(tenantId: string): Promise<DecryptedIgConnection | null> {
  const { data, error } = await getDb()
    .from('ig_connections')
    .select()
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throwDb('igConnections.getForTenant', error);
  return data ? decryptConnection(data as unknown as IgConnection) : null;
}

export async function getByIgAccountId(igAccountId: string): Promise<DecryptedIgConnection | null> {
  const { data, error } = await getDb()
    .from('ig_connections')
    .select()
    .eq('ig_account_id', igAccountId)
    .maybeSingle();
  if (error) throwDb('igConnections.getByIgAccountId', error);
  return data ? decryptConnection(data as unknown as IgConnection) : null;
}

export async function setStatus(
  tenantId: string,
  status: IgStatus,
  _errorMessage?: string,
): Promise<IgConnection> {
  void _errorMessage;
  const { data, error } = await getDb()
    .from('ig_connections')
    .update({ status })
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throwDb('igConnections.setStatus', error);
  return data as unknown as IgConnection;
}

export async function touchWebhookSeen(tenantId: string): Promise<IgConnection> {
  const { data, error } = await getDb()
    .from('ig_connections')
    .update({ webhook_last_seen_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throwDb('igConnections.touchWebhookSeen', error);
  return data as unknown as IgConnection;
}

export async function markTokenRefreshed(tenantId: string, newTokenEnc: string): Promise<IgConnection> {
  const { data, error } = await getDb()
    .from('ig_connections')
    .update({ access_token_enc: newTokenEnc, token_refreshed_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throwDb('igConnections.markTokenRefreshed', error);
  return data as unknown as IgConnection;
}

export async function listActiveForRefresh(olderThanDays: number): Promise<DecryptedIgConnection[]> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  const { data: staleData, error: staleError } = await db
    .from('ig_connections')
    .select()
    .eq('status', 'active')
    .lt('token_refreshed_at', cutoff);
  if (staleError) throwDb('igConnections.listActiveForRefresh.stale', staleError);

  const { data: neverRefreshedData, error: neverRefreshedError } = await db
    .from('ig_connections')
    .select()
    .eq('status', 'active')
    .is('token_refreshed_at', null);
  if (neverRefreshedError) {
    throwDb('igConnections.listActiveForRefresh.neverRefreshed', neverRefreshedError);
  }

  const byTenant = new Map<string, IgConnection>();
  for (const row of [...(staleData ?? []), ...(neverRefreshedData ?? [])] as unknown as IgConnection[]) {
    byTenant.set(row.tenant_id, row);
  }
  return [...byTenant.values()].map(decryptConnection);
}

export async function disconnectTenant(tenantId: string): Promise<IgConnection> {
  const { data, error } = await getDb()
    .from('ig_connections')
    .update({
      access_token_enc: null,
      status: 'pending',
      token_refreshed_at: null,
      webhook_last_seen_at: null,
    })
    .eq('tenant_id', tenantId)
    .select()
    .single();
  if (error) throwDb('igConnections.disconnectTenant', error);
  return data as unknown as IgConnection;
}
