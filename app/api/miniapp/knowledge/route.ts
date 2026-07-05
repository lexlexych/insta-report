import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { tenants } from '@/lib/db';

const schema = z.object({ knowledgeBase: z.string().min(1).max(20000) });

export const PUT = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);
  await tenants.update(tenant.id, { knowledge_base: parsed.data.knowledgeBase });
  return jsonResponse({ ok: true });
});
