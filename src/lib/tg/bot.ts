import { Bot, InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';

import { tenants } from '@/lib/db';
import { env } from '@/lib/env';
import { resolveLocale, t } from '@/lib/i18n';

let bot: Bot | undefined;

function panelUrl(): string {
  return new URL('/app', env.APP_BASE_URL).toString();
}

export async function onStart(ctx: Context): Promise<void> {
  if (!ctx.from || !ctx.chat) {
    return;
  }

  await tenants.upsertByTelegramUserId(ctx.from.id, { tg_chat_id: ctx.chat.id });

  const locale = resolveLocale(ctx.from.language_code);
  const keyboard = new InlineKeyboard().webApp(t(locale, 'openPanel'), panelUrl());

  await ctx.reply(t(locale, 'tgStart'), { reply_markup: keyboard });
}

export async function onCallback(ctx: Context): Promise<void> {
  // TODO(T-021): route callback query actions for draft approval/cancellation.
  await ctx.answerCallbackQuery();
}

export function getBot(): Bot {
  if (!bot) {
    bot = new Bot(env.TELEGRAM_BOT_TOKEN);
    bot.command('start', onStart);
    bot.on('callback_query:data', onCallback);
  }

  return bot;
}
