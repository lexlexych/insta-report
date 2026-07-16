import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { zernioAccounts } from '@/lib/db';
import { isZernioEnabled } from '@/lib/env';

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  if (!isZernioEnabled()) return jsonResponse({ ok: false, error: 'disabled' }, 404);
  const account = await zernioAccounts.getForTenant(tenant.id);
  return jsonResponse({
    ok: true,
    enabled: true,
    status: account?.status ?? 'none',
    username: account?.username ?? null,
    connectedAt: account?.connected_at ?? null,
  });
});
