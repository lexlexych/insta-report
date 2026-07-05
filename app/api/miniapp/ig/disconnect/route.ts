import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { igConnections } from '@/lib/db';

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  await igConnections.disconnectTenant(tenant.id);
  return jsonResponse({ ok: true, status: 'pending' });
});
