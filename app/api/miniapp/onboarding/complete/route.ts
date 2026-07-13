import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { labels, tenants } from '@/lib/db';
import { defaultSystemPrompt } from '@/lib/llm/prompts';

const requestSchema = z.object({ knowledgeBase: z.string().trim().min(1).max(20_000) });

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ code: 'malformed' }, 400);
  if (!tenant.org_name || !tenant.business_sphere) return jsonResponse({ code: 'incomplete' }, 409);

  await tenants.update(tenant.id, {
    knowledge_base: parsed.data.knowledgeBase,
    system_prompt: defaultSystemPrompt(tenant.org_name),
    onboarding_step: 'finish',
  });
  await labels.seedDefaultLabels(tenant.id);
  return jsonResponse({ ok: true });
});
