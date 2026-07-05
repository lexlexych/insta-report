import { tenants } from '@/lib/db';
import type { Database } from '@/lib/db';
import { HttpError } from '@/lib/api/http';
import { verifySession } from './session';

export type Tenant = Database['public']['Tables']['tenants']['Row'];

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (rawKey === name) return decodeURIComponent(rawValue.join('='));
  }
  return null;
}

export async function requireTenant(req: Request): Promise<Tenant> {
  const token = readCookie(req.headers.get('cookie'), 'session');
  if (!token) throw new HttpError(401, 'unauthorized');

  try {
    const session = await verifySession(token);
    const tenant = await tenants.getById(session.tenantId);
    if (!tenant) throw new HttpError(401, 'unauthorized');
    return tenant;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(401, 'unauthorized');
  }
}
