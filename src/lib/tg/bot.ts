import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';

import { igAccounts, tenants } from '@/lib/db';
import { env } from '@/lib/env';
import { resolveLocale, t } from '@/lib/i18n/shared';
import { handleRetryCallback, handleSendCallback } from '@/lib/pipeline/send';

import { adminTelegramIds, notifyIgAccountOwner } from './igAccountRequests';

let bot: Bot | undefined;

function panelUrl(): string {
  return new URL('/app', env.APP_BASE_URL).toString();
}

export async function onStart(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.chat) {
    return;
  }

  await tenants.upsertByTelegramUserId(ctx.from.id, {
    tg_chat_id: ctx.chat.id,
    ...(ctx.from.has_topics_enabled === undefined
      ? {}
      : { tg_topics_enabled: ctx.from.has_topics_enabled }),
  });

  const locale = resolveLocale(ctx.from.language_code);
  const keyboard = new InlineKeyboard().webApp(t(locale, 'openPanel'), panelUrl());

  await ctx.reply(t(locale, 'tgStart'), { reply_markup: keyboard });
}

export async function onCallback(ctx: Context): Promise<void> {
  const data = (ctx as { callbackQuery?: { data?: unknown } }).callbackQuery?.data;
  const fromId = ctx.from?.id ?? 'unknown';
  if (typeof data !== 'string') {
    console.warn(`[tg] callback without data from=${fromId}`);
    await ctx.answerCallbackQuery();
    return;
  }

  const [action, id] = data.split(':', 2);
  console.info(`[tg] callback received action=${action} from=${fromId}`);
  if (action === 'send' && id) {
    await handleSendCallback(ctx, id);
    return;
  }
  if (action === 'retry' && id) {
    await handleRetryCallback(ctx, id);
    return;
  }
  if (action === 'igacc_ok' && id) {
    await handleIgAccountApproval(ctx, id);
    return;
  }

  console.warn(`[tg] unhandled callback data="${data}" from=${fromId}`);
  await ctx.answerCallbackQuery();
}

async function handleIgAccountApproval(ctx: Context, id: string): Promise<void> {
  const adminId = ctx.from?.id;
  if (!adminId || !adminTelegramIds().includes(adminId)) {
    await ctx.answerCallbackQuery({ text: 'Недостаточно прав' });
    return;
  }

  const account = await igAccounts.approve(id, adminId);
  const message = (
    ctx as { callbackQuery?: { message?: { chat?: { id?: number }; message_id?: number } } }
  ).callbackQuery?.message;
  const chatId = message?.chat?.id;
  const messageId = message?.message_id;

  if (!account) {
    await ctx.answerCallbackQuery({ text: 'Уже подтверждено' });
    if (chatId !== undefined && messageId !== undefined) {
      await getBot().api.editMessageText(chatId, messageId, '✅ Заявка уже подтверждена', {
        reply_markup: new InlineKeyboard(),
      });
    }
    return;
  }

  await ctx.answerCallbackQuery();
  if (chatId !== undefined && messageId !== undefined) {
    await getBot().api.editMessageText(
      chatId,
      messageId,
      `✅ Подтверждено: @${account.ig_username}`,
      {
        reply_markup: new InlineKeyboard(),
      },
    );
  }

  if (!account.tenant_id) return;
  const tenant = await tenants.getById(account.tenant_id);
  if (!tenant) return;
  try {
    await notifyIgAccountOwner(account, tenant);
  } catch (error) {
    console.error(
      `[tg] failed to notify tenant=${tenant.id} about approved Instagram account`,
      error,
    );
  }
}

export function getBot(): Bot {
  if (!bot) {
    bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    bot.command('start', onStart);
    bot.on('callback_query:data', onCallback);
  }

  return bot;
}
