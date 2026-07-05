import { webhookCallback } from 'grammy';
import type { NextRequest } from 'next/server';

import { env } from '@/lib/env';
import { getBot } from '@/lib/tg/bot';

export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<Response> {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  return webhookCallback(getBot(), 'std/http')(req);
}
