import { z } from 'zod';

import { tenants, zernioAccounts } from '@/lib/db';
import { sendMessageHTML } from '@/lib/tg/api';

const OWNER_DISCONNECTED_ALERT = '⚠️ Подключение Instagram через Zernio разорвано, переподключите.';

const zernioAccountSchema = z
  .object({
    accountId: z.string().trim().min(1).optional(),
    profileId: z.string().trim().min(1).optional(),
    platform: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).nullable().optional(),
  })
  .passthrough();

/** Zernio добавляет поля к событиям; неизвестные поля не должны делать доставку невалидной. */
export const zernioWebhookPayloadSchema = z
  .object({
    id: z.string().trim().min(1).optional(),
    event: z.string().trim().min(1),
    timestamp: z.union([z.string(), z.number()]).optional(),
    account: zernioAccountSchema.optional(),
    disconnectionType: z.enum(['intentional', 'unintentional']).optional(),
    reason: z.string().trim().min(1).optional(),
  })
  .passthrough();

export type ZernioWebhookPayload = z.infer<typeof zernioWebhookPayloadSchema>;

function logIgnored(event: string, reason: string): void {
  console.debug(`[zernio/webhook] ignored event=${event}: ${reason}`);
}

async function notifyOwnerAboutDisconnection(tenantId: string): Promise<void> {
  const tenant = await tenants.getById(tenantId);
  const chatId = tenant?.tg_chat_id ?? tenant?.telegram_user_id;
  if (chatId === null || chatId === undefined) {
    console.debug(`[zernio/webhook] tenant=${tenantId} has no Telegram chat for disconnect alert`);
    return;
  }
  await sendMessageHTML(chatId, OWNER_DISCONNECTED_ALERT);
}

function isInstagramAccount(payload: ZernioWebhookPayload): boolean {
  return !payload.account?.platform || payload.account.platform === 'instagram';
}

async function handleAccountConnected(payload: ZernioWebhookPayload): Promise<void> {
  const account = payload.account;
  if (!account?.profileId) {
    logIgnored(payload.event, 'account.profileId is missing');
    return;
  }
  if (!account.accountId) {
    logIgnored(payload.event, 'account.accountId is missing');
    return;
  }
  if (!isInstagramAccount(payload)) {
    logIgnored(payload.event, `unsupported platform=${account.platform}`);
    return;
  }

  const registered = await zernioAccounts.getByZernioProfileId(account.profileId);
  if (!registered) {
    logIgnored(payload.event, `no tenant for profileId=${account.profileId}`);
    return;
  }

  const username = account.username ?? registered.username;
  if (
    registered.status === 'active' &&
    registered.zernio_account_id === account.accountId &&
    registered.username === username
  ) {
    return; // точный ретрай не меняет connected_at
  }

  // Новый accountId намеренно перезаписывается: пользователь мог переподключить другой IG-аккаунт.
  await zernioAccounts.activate(registered.tenant_id, 'instagram', {
    zernioAccountId: account.accountId,
    username,
  });
}

async function handleAccountDisconnected(payload: ZernioWebhookPayload): Promise<void> {
  const account = payload.account;
  if (!account?.profileId) {
    logIgnored(payload.event, 'account.profileId is missing');
    return;
  }

  const accountId = account.accountId;
  if (!accountId) {
    logIgnored(payload.event, 'account.accountId is missing');
    return;
  }
  if (!isInstagramAccount(payload)) {
    logIgnored(payload.event, `unsupported platform=${account.platform}`);
    return;
  }

  const registered = await zernioAccounts.getByZernioAccountId(accountId);
  if (!registered) {
    logIgnored(payload.event, `no tenant for accountId=${accountId}`);
    return;
  }

  const reason = payload.reason ?? 'zernio_account_disconnected';
  if (payload.disconnectionType === 'intentional') {
    await zernioAccounts.disconnect(registered.tenant_id, 'instagram', reason);
    return;
  }

  await zernioAccounts.setStatus(registered.tenant_id, 'instagram', 'error', reason);
  await notifyOwnerAboutDisconnection(registered.tenant_id);
}

async function handleZernioMessage(payload: ZernioWebhookPayload): Promise<void> {
  // TODO(T-049): разобрать message.*, дедуплицировать platformMessageId и передать в pipeline.
  console.debug(`[zernio/webhook] ${payload.event} deferred to T-049`);
}

/** Маршрутизирует уже провалидированное событие Zernio. */
export async function handleZernioWebhook(payload: ZernioWebhookPayload): Promise<void> {
  switch (payload.event) {
    case 'account.connected':
      return handleAccountConnected(payload);
    case 'account.disconnected':
      return handleAccountDisconnected(payload);
    case 'message.received':
    case 'message.sent':
      return handleZernioMessage(payload);
    default:
      logIgnored(payload.event, 'unknown event');
  }
}
