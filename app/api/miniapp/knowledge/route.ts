import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { tenants } from '@/lib/db';

const updateSchema = z
  .object({
    knowledgeBase: z.string().trim().min(1).max(20000).optional(),
    systemPrompt: z.string().trim().min(1).max(20000).optional(),
  })
  .refine((data) => data.knowledgeBase !== undefined || data.systemPrompt !== undefined);

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  return jsonResponse({
    knowledgeBase: tenant.knowledge_base,
    systemPrompt: tenant.system_prompt,
  });
});

export const PUT = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  await tenants.update(tenant.id, {
    knowledge_base: parsed.data.knowledgeBase,
    system_prompt: parsed.data.systemPrompt,
  });
  return jsonResponse({ ok: true });
});
