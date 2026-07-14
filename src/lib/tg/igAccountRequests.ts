import { InlineKeyboard } from 'grammy';

import type { Tenant } from '@/lib/auth/requireTenant';
import type { Database } from '@/lib/db';
import { env } from '@/lib/env';
import { resolveLocale, t } from '@/lib/i18n/shared';

import { sendMessageHTML } from './api';
import { escapeHTML } from './html';

type IgAccount = Database['public']['Tables']['ig_accounts']['Row'];

export function adminTelegramIds(): number[] {
  return [
    ...new Set(
      env.ADMIN_TELEGRAM_IDS.split(',')
        .map((value) => Number(value.trim()))
        .filter((id) => Number.isSafeInteger(id) && id > 0),
    ),
  ];
}

function approvalKeyboard(id: string): InlineKeyboard {
  const callbackData = `igacc_ok:${id}`;
  if (Buffer.byteLength(callbackData, 'utf8') > 64)
    throw new Error('ig account callback_data exceeds Telegram limit');
  return new InlineKeyboard().text('✅ Подтвердить', callbackData);
}

export async function notifyIgAccountAdmins(account: IgAccount, tenant: Tenant): Promise<void> {
  const business = tenant.org_name ? `\nБизнес: ${escapeHTML(tenant.org_name)}` : '';
  const text = `🆕 Заявка на подключение Instagram: @${escapeHTML(account.ig_username)}${business}\nTelegram ID: ${tenant.telegram_user_id}`;

  await Promise.all(
    adminTelegramIds().map(async (adminId) => {
      try {
        await sendMessageHTML(adminId, text, approvalKeyboard(account.id));
      } catch (error) {
        console.error(
          `[tg] failed to notify admin=${adminId} about Instagram account request`,
          error,
        );
      }
    }),
  );
}

export async function notifyIgAccountOwner(account: IgAccount, tenant: Tenant): Promise<void> {
  if (!tenant.tg_chat_id) return;

  const locale = resolveLocale(tenant.ui_locale);
  const text = escapeHTML(t(locale, 'igAccountApproved', { username: account.ig_username }));
  const url = `${env.APP_BASE_URL}/app/connect-instagram`;
  await sendMessageHTML(
    tenant.tg_chat_id,
    text,
    new InlineKeyboard().webApp(t(locale, 'igAccountApprovedOpen'), url),
  );
}
