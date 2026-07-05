import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { labels } from '@/lib/db';

const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
});

export const PUT = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = reorderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  // labels.reorder сам игнорирует id, не принадлежащие тенанту, и id «Без категории»
  // (её позиция всегда последняя) — см. src/lib/db/labels.ts.
  await labels.reorder(tenant.id, parsed.data.ids);

  return jsonResponse({ ok: true });
});
