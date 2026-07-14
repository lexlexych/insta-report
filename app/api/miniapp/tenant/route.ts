import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { tenants } from '@/lib/db';
import { isBusinessSphereId } from '@/lib/kb-templates';
import { sendMessageHTML } from '@/lib/tg/api';
import { escapeHTML } from '@/lib/tg/html';

const patchSchema = z
  .object({
    onboardingStep: z.enum(['sphere', 'business', 'knowledge', 'finish', 'done']).optional(),
    uiLocale: z.enum(['ru', 'de']).optional(),
    businessSphere: z.string().refine(isBusinessSphereId).optional(),
    orgName: z.string().trim().min(2).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined));

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
    business_sphere: parsed.data.businessSphere,
    org_name: parsed.data.orgName,
  });

  return jsonResponse({
    ok: true,
    tenant: {
      id: updated.id,
      onboardingStep: updated.onboarding_step,
      orgName: updated.org_name,
      businessSphere: updated.business_sphere,
      knowledgeBase: updated.knowledge_base,
      uiLocale: updated.ui_locale,
      tgTopicsEnabled: updated.tg_topics_enabled,
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
