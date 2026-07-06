import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Bot } from 'grammy';

import { env } from '@/lib/env';

/**
 * Next.js подхватывает `.env.local` сам, но этот скрипт запускается через
 * `tsx` вне Next.js, поэтому грузим `.env.local` вручную. Уже заданные
 * переменные окружения (например, в CI) не перезаписываются.
 */
function loadDotEnvLocal(): void {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnvLocal();

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
