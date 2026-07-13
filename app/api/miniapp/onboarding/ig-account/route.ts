import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { igAccounts } from '@/lib/db';
import { notifyIgAccountAdmins } from '@/lib/tg/igAccountRequests';

const requestSchema = z.object({ igUsername: z.string() });

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  const username = parsed.success ? igAccounts.normalizeIgUsername(parsed.data.igUsername) : null;
  if (!username) return jsonResponse({ code: 'invalid_username' }, 400);

  const existing = await igAccounts.findByUsername(username);
  if (!existing) {
    const request = await igAccounts.createPending(username, tenant.id);
    await notifyIgAccountAdmins(request, tenant);
    return jsonResponse({ status: 'pending' });
  }

  if (existing.tenant_id !== tenant.id) {
    if (existing.status === 'approved' && existing.tenant_id === null) {
      await igAccounts.bindTenant(existing.id, tenant.id);
      return jsonResponse({ status: 'approved' });
    }
    return jsonResponse({ code: 'taken' }, 409);
  }

  return jsonResponse({ status: existing.status });
});

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const account = await igAccounts.getByTenant(tenant.id);
  if (!account) return jsonResponse({ status: 'none' });

  return jsonResponse({ status: account.status, igUsername: account.ig_username });
});
