import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { signSession } from '@/lib/auth/session';
import { tenants } from '@/lib/db';
import { env } from '@/lib/env';
import { resolveLocale } from '@/lib/i18n/shared';
import { InitDataError, validateInitData } from '@/lib/tg/initData';

const authSchema = z.object({ initData: z.string().min(1) });
const SESSION_MAX_AGE = 60 * 60 * 12;

export const POST = apiHandler(async (req: Request) => {
  const parsed = authSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  try {
    const { user } = validateInitData(parsed.data.initData, env.TELEGRAM_BOT_TOKEN);
    const tenant = await tenants.upsertByTelegramUserId(user.id, {
      tg_chat_id: user.id,
      ...(user.has_topics_enabled === undefined ? {} : { tg_topics_enabled: user.has_topics_enabled }),
    });
    const session = await signSession({ tenantId: tenant.id });

    return Response.json(
      {
        ok: true,
        tenant: {
          id: tenant.id,
          onboardingStep: tenant.onboarding_step,
          orgName: tenant.org_name,
          businessSphere: tenant.business_sphere,
          knowledgeBase: tenant.knowledge_base,
          uiLocale: tenant.ui_locale,
          tgTopicsEnabled: tenant.tg_topics_enabled,
        },
        tgLocale: resolveLocale(user.language_code),
      },
      {
        headers: {
          'Set-Cookie': `session=${encodeURIComponent(session)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_MAX_AGE}`,
        },
      },
    );
  } catch (error) {
    if (error instanceof InitDataError) return jsonResponse({ ok: false, error: error.code }, 401);
    throw error;
  }
});
