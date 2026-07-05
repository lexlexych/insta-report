import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { tenants } from '@/lib/db';

const schema = z.object({ onboardingStep: z.enum(['welcome', 'org_form', 'generating', 'review_kb', 'done']) });

export const PATCH = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);
  const updated = await tenants.update(tenant.id, { onboarding_step: parsed.data.onboardingStep });
  return jsonResponse({ ok: true, tenant: { id: updated.id, onboardingStep: updated.onboarding_step, orgName: updated.org_name } });
});
