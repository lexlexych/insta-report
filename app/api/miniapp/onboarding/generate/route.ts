import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { tenants } from '@/lib/db';

const schema = z.object({ orgName: z.string().trim().min(2), orgDescription: z.string().trim().min(80) });

function buildKnowledgeBase(orgName: string, orgDescription: string): string {
  return `# ${orgName}\n\n## О бизнесе\n${orgDescription}\n\n## Как отвечать клиентам\n- Отвечай дружелюбно и по делу.\n- Уточняй детали заказа или записи, если информации не хватает.\n- Предлагай следующий шаг: бронь, консультацию или переход в Instagram Direct.\n\n## Важные правила\n- Не обещай недоступные услуги, цены или сроки.\n- Если вопрос требует решения владельца, предложи передать обращение человеку.`;
}

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);
  const knowledgeBase = buildKnowledgeBase(parsed.data.orgName, parsed.data.orgDescription);
  await tenants.update(tenant.id, {
    org_name: parsed.data.orgName,
    org_description: parsed.data.orgDescription,
    knowledge_base: knowledgeBase,
    onboarding_step: 'review_kb',
  });
  return jsonResponse({ ok: true, knowledgeBase });
});
