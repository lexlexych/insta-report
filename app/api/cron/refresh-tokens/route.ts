import { InlineKeyboard } from 'grammy';
import { NextRequest, NextResponse } from 'next/server';

import { encrypt } from '@/lib/crypto';
import { igConnections, tenants } from '@/lib/db';
import { env } from '@/lib/env';
import { refreshToken } from '@/lib/ig/client';
import { sendMessageHTML } from '@/lib/tg/api';

export const maxDuration = 60;

type RefreshSummary = {
  processed: number;
  refreshed: number;
  failed: string[];
};

const OWNER_ALERT =
  '⚠️ Подключение Instagram требует внимания: токен не удалось обновить. Откройте панель → Подключение';

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get('authorization');
  const key = req.nextUrl.searchParams.get('key');
  return header === `Bearer ${env.CRON_SECRET}` || key === env.CRON_SECRET;
}

function adminIds(): string[] {
  return env.ADMIN_TELEGRAM_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function panelKeyboard(): InlineKeyboard {
  return new InlineKeyboard().webApp('Открыть панель', new URL('/app', env.APP_BASE_URL).toString());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown token refresh error';
}

async function notifyOwner(tenantId: string): Promise<void> {
  const tenant = await tenants.getById(tenantId);
  const chatId = tenant?.tg_chat_id ?? tenant?.telegram_user_id;
  if (chatId === undefined || chatId === null) return;
  await sendMessageHTML(chatId, OWNER_ALERT, panelKeyboard());
}

async function notifyAdmins(tenantId: string, message: string): Promise<void> {
  await Promise.allSettled(
    adminIds().map((chatId) =>
      sendMessageHTML(
        chatId,
        `⚠️ token_refresh failed for tenant ${tenantId}: ${message}`,
      ),
    ),
  );
}

export async function GET(req: NextRequest): Promise<NextResponse<RefreshSummary | { error: string }>> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const connections = await igConnections.listActiveForRefresh(7);
  const summary: RefreshSummary = { processed: connections.length, refreshed: 0, failed: [] };

  for (const connection of connections) {
    try {
      if (!connection.accessToken) throw new Error('Instagram access token is missing');
      const refreshed = await refreshToken(connection.accessToken);
      await igConnections.markTokenRefreshed(connection.tenant_id, encrypt(refreshed.accessToken));
      summary.refreshed += 1;
    } catch (error) {
      const message = errorMessage(error);
      summary.failed.push(connection.tenant_id);
      await igConnections.setStatus(connection.tenant_id, 'error', message);
      await Promise.allSettled([
        notifyOwner(connection.tenant_id),
        notifyAdmins(connection.tenant_id, message),
      ]);
    }
  }

  console.log('cron.refresh-tokens', summary);
  return NextResponse.json(summary);
}
