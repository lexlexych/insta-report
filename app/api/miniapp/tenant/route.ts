import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { tenants } from '@/lib/db';
import { sendMessageHTML } from '@/lib/tg/api';
import { escapeHTML } from '@/lib/tg/html';

const patchSchema = z
  .object({
    onboardingStep: z.enum(['welcome', 'org_form', 'generating', 'review_kb', 'done']).optional(),
    uiLocale: z.enum(['ru', 'de']).optional(),
  })
  .refine((data) => data.onboardingStep !== undefined || data.uiLocale !== undefined);

function clearSessionCookie(): string {
  return 'session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0';
}

export const PATCH = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  const updated = await tenants.update(tenant.id, {
    onboarding_step: parsed.data.onboardingStep,
    ui_locale: parsed.data.uiLocale,
  });

  return jsonResponse({
    ok: true,
    tenant: {
      id: updated.id,
      onboardingStep: updated.onboarding_step,
      orgName: updated.org_name,
      uiLocale: updated.ui_locale,
    },
  });
});

export const DELETE = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);

  if (tenant.tg_chat_id) {
    await sendMessageHTML(tenant.tg_chat_id, escapeHTML('Все данные удалены. /start — начать заново'));
  }

  await tenants.deleteCascade(tenant.id);

  return Response.json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
});
