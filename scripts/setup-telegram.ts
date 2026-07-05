import { Bot } from 'grammy';

import { env } from '@/lib/env';

async function main(): Promise<void> {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const appUrl = new URL('/app', env.APP_BASE_URL).toString();
  const webhookUrl = new URL('/api/telegram', env.APP_BASE_URL).toString();

  await bot.api.setWebhook(webhookUrl, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
  });

  for (const language_code of ['ru', 'de']) {
    await bot.api.setMyCommands(
      [{ command: 'start', description: 'Запустить / открыть панель' }],
      { language_code },
    );
  }

  await bot.api.setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Панель', web_app: { url: appUrl } },
  });

  const info = await bot.api.getWebhookInfo();
  process.stdout.write(`${JSON.stringify(info, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
