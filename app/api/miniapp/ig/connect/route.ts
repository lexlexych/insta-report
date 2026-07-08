import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { igConnections } from '@/lib/db';

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const connection = await igConnections.getForTenant(tenant.id);

  return jsonResponse({
    status: connection?.status ?? 'pending',
    igUsername: connection?.ig_username ?? null,
    webhookLastSeenAt: connection?.webhook_last_seen_at ?? null,
  });
});
