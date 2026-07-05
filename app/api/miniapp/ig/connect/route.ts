import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { igConnections } from '@/lib/db';
import { env } from '@/lib/env';

const TOKEN_MIN_LENGTH = 10;

// Оба поля опциональны (частичное обновление), но если тело присутствует — хотя бы
// одно из полей должно быть заполнено, иначе POST — это no-op, о котором лучше
// сообщить явной ошибкой, чем молча проглотить (см. docs/tickets/T-012.md, "спорные места").
const bodySchema = z
  .object({
    accessToken: z.string().trim().min(TOKEN_MIN_LENGTH).optional(),
    appSecret: z.string().trim().min(TOKEN_MIN_LENGTH).optional(),
  })
  .refine((data) => data.accessToken !== undefined || data.appSecret !== undefined);

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  let connection = await igConnections.getForTenant(tenant.id);

  if (!connection) {
    // Первое обращение к странице подключения — заводим запись со свежим verify_token.
    connection = await igConnections.upsertForTenant(tenant.id, {
      verify_token: randomBytes(16).toString('hex'),
      status: 'pending',
    });
  }

  return jsonResponse({
    status: connection.status,
    igUsername: connection.ig_username,
    webhookUrl: `${env.APP_BASE_URL}/api/wh/ig/${tenant.id}`,
    verifyToken: connection.verify_token,
    // ВАЖНО: сами секреты (access_token/app_secret) никогда не попадают в ответ —
    // наружу отдаём только признак их наличия.
    hasToken: Boolean(connection.accessToken),
    hasSecret: Boolean(connection.appSecret),
    webhookLastSeenAt: connection.webhook_last_seen_at,
    handshakeAt: connection.handshake_at,
  });
});

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  // NB: ни parsed.data, ни какая-либо его часть НЕ логируются — это единственное место,
  // где секреты тенанта существуют в открытом виде до передачи в encrypt() внутри репозитория.
  await igConnections.upsertForTenant(tenant.id, {
    ...(parsed.data.accessToken === undefined ? {} : { accessToken: parsed.data.accessToken }),
    ...(parsed.data.appSecret === undefined ? {} : { appSecret: parsed.data.appSecret }),
  });

  return jsonResponse({ ok: true });
});
