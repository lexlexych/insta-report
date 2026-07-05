import { decrypt, encrypt } from '@/lib/crypto';

import { getDb } from './client';
import { throwDb } from './errors';
import type { Database } from './types.gen';

type IgConnection = Database['public']['Tables']['ig_connections']['Row'];
type IgConnectionInsert = Database['public']['Tables']['ig_connections']['Insert'];
type IgConnectionUpdate = Database['public']['Tables']['ig_connections']['Update'];
type IgStatus = IgConnection['status'];

export type IgConnectionPatch = Omit<Partial<IgConnectionInsert>, 'tenant_id' | 'access_token_enc' | 'app_secret_enc'> & {
  accessToken?: string;
  appSecret?: string;
};

export type DecryptedIgConnection = Omit<IgConnection, 'access_token_enc' | 'app_secret_enc'> & {
  accessToken: string | null;
  appSecret: string | null;
};

function decryptConnection(row: IgConnection): DecryptedIgConnection {
  const { access_token_enc: accessTokenEnc, app_secret_enc: appSecretEnc, ...rest } = row;
  return {
    ...rest,
    accessToken: accessTokenEnc ? decrypt(accessTokenEnc) : null,
    appSecret: appSecretEnc ? decrypt(appSecretEnc) : null,
  };
}

function toDbPatch(patch: IgConnectionPatch): IgConnectionUpdate {
  const { accessToken, appSecret, ...rest } = patch;
  return {
    ...rest,
    ...(accessToken === undefined ? {} : { access_token_enc: encrypt(accessToken) }),
    ...(appSecret === undefined ? {} : { app_secret_enc: encrypt(appSecret) }),
  };
}

export async function upsertForTenant(
  tenantId: string,
  patch: IgConnectionPatch,
): Promise<DecryptedIgConnection> {
  const { data, error } = await getDb()
    .from('ig_connections')
    .upsert(
      { tenant_id: tenantId, connection_mode: 'own_app', ...toDbPatch(patch) },
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

export async function listActiveForRefresh(olderThanDays: number): Promise<IgConnection[]> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await getDb()
    .from('ig_connections')
    .select()
    .eq('status', 'active')
    .lt('token_refreshed_at', cutoff);
  if (error) throwDb('igConnections.listActiveForRefresh', error);
  return data as unknown as IgConnection[];
}
