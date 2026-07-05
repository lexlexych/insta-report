import { randomBytes } from 'node:crypto';

/**
 * Генерирует случайный ключ AES-256-GCM (32 байта, base64) для `ENCRYPTION_KEY`.
 * Запуск: `pnpm gen:key`.
 */
function main(): void {
  const key = randomBytes(32).toString('base64');

  process.stdout.write(`${key}\n`);
  process.stdout.write('\nСкопируйте значение выше в переменную ENCRYPTION_KEY в .env.local\n');
}

main();
