import { randomBytes } from 'node:crypto';

/**
 * Ручная демонстрация T-003 (`src/lib/crypto.ts`) — без UI, поэтому проверяется
 * скриптом. Запуск: `pnpm tsx scripts/manual/T-003-demo.ts`.
 *
 * ВАЖНО: `env.ts` парсит process.env лениво (см. src/lib/env.ts), но парсит СРАЗУ
 * ВСЮ схему при первом обращении к любому полю — поэтому здесь заполняются
 * все обязательные переменные фиктивными значениями, а не только ENCRYPTION_KEY.
 * `src/lib/crypto.ts` импортируется динамически (`await import(...)`) ПОСЛЕ того,
 * как process.env заполнен, чтобы избежать падения на реальном .env файле.
 */

process.env.TELEGRAM_BOT_TOKEN ??= 'demo-telegram-bot-token';
process.env.TELEGRAM_WEBHOOK_SECRET ??= 'demo-telegram-webhook-secret';
process.env.MINIAPP_JWT_SECRET ??= 'demo-miniapp-jwt-secret';
process.env.ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
process.env.SUPABASE_URL ??= 'https://demo.supabase.co';
process.env.SUPABASE_SECRET_KEY ??= 'demo-supabase-secret-key';
process.env.LLM_BASE_URL ??= 'https://openrouter.ai/api/v1';
process.env.LLM_API_KEY ??= 'demo-llm-api-key';
process.env.LLM_MODEL_CLASSIFY ??= 'openai/gpt-4o-mini';
process.env.LLM_MODEL_DRAFT ??= 'openai/gpt-4o-mini';
process.env.APP_BASE_URL ??= 'https://demo.example.com';
process.env.CRON_SECRET ??= 'demo-cron-secret';

async function main(): Promise<void> {
  const { encrypt, decrypt, isEncrypted, DecryptError } = await import('../../src/lib/crypto');

  const failures: string[] = [];

  const heading = (title: string): void => {
    process.stdout.write(`\n=== ${title} ===\n`);
  };

  const report = (ok: boolean, label: string): void => {
    if (ok) {
      process.stdout.write(`OK: ${label}\n`);
    } else {
      process.stdout.write(`FAIL: ${label}\n`);
      failures.push(label);
    }
  };

  // --- 1. Roundtrip encrypt/decrypt для разных видов строк -----------------
  heading('1. Roundtrip encrypt() -> decrypt() для разных видов строк');

  const samples: Array<{ label: string; value: string }> = [
    { label: 'ascii', value: 'Hello, InstaReply!' },
    { label: 'кириллица', value: 'Привет, тест шифрования' },
    { label: 'emoji', value: '🔐🚀✅ секрет с эмодзи' },
    { label: 'пустая строка', value: '' },
  ];

  for (const sample of samples) {
    const encrypted = encrypt(sample.value);
    const decrypted = decrypt(encrypted);
    const ok = decrypted === sample.value;
    process.stdout.write(
      `  [${sample.label}] plain=${JSON.stringify(sample.value)} decrypted=${JSON.stringify(decrypted)}\n`,
    );
    report(ok, `roundtrip (${sample.label})`);
  }

  // --- 2. Разные вызовы encrypt() с одинаковым plaintext дают разные строки -
  heading('2. Два вызова encrypt() с одинаковым plaintext должны отличаться (случайный IV)');

  const plaintextForIvCheck = 'один и тот же секрет';
  const encryptedFirst = encrypt(plaintextForIvCheck);
  const encryptedSecond = encrypt(plaintextForIvCheck);
  process.stdout.write(`  encrypt(#1) = ${encryptedFirst}\n`);
  process.stdout.write(`  encrypt(#2) = ${encryptedSecond}\n`);
  report(encryptedFirst !== encryptedSecond, 'два вызова encrypt() дают разные строки (разный IV)');

  // --- 3. Порча tag-части -> DecryptError -----------------------------------
  heading('3. Порча одного символа в tag-части зашифрованного значения');

  {
    const encrypted = encrypt('секрет для порчи тега');
    const parts = encrypted.split(':');
    const [version, iv, tag, ciphertext] = parts;
    if (version === undefined || iv === undefined || tag === undefined || ciphertext === undefined) {
      report(false, 'не удалось разобрать формат v1:iv:tag:ciphertext для порчи тега');
    } else {
      const corruptedTag = corruptOneChar(tag);
      const corrupted = [version, iv, corruptedTag, ciphertext].join(':');
      process.stdout.write(`  оригинал:  ${encrypted}\n`);
      process.stdout.write(`  испорчен:  ${corrupted}\n`);
      try {
        decrypt(corrupted);
        report(false, 'decrypt() с испорченным tag должен был бросить DecryptError, но не бросил');
      } catch (error) {
        report(
          error instanceof DecryptError,
          'DecryptError выброшен как ожидалось (испорчен tag)',
        );
      }
    }
  }

  // --- 4. Порча ciphertext-части -> DecryptError ----------------------------
  heading('4. Порча одного символа в ciphertext-части зашифрованного значения');

  {
    const encrypted = encrypt('секрет для порчи шифротекста');
    const parts = encrypted.split(':');
    const [version, iv, tag, ciphertext] = parts;
    if (version === undefined || iv === undefined || tag === undefined || ciphertext === undefined) {
      report(false, 'не удалось разобрать формат v1:iv:tag:ciphertext для порчи шифротекста');
    } else {
      const corruptedCiphertext = corruptOneChar(ciphertext);
      const corrupted = [version, iv, tag, corruptedCiphertext].join(':');
      process.stdout.write(`  оригинал:  ${encrypted}\n`);
      process.stdout.write(`  испорчен:  ${corrupted}\n`);
      try {
        decrypt(corrupted);
        report(
          false,
          'decrypt() с испорченным ciphertext должен был бросить DecryptError, но не бросил',
        );
      } catch (error) {
        report(
          error instanceof DecryptError,
          'DecryptError выброшен как ожидалось (испорчен ciphertext)',
        );
      }
    }
  }

  // --- 5. decrypt('мусор') -> DecryptError ----------------------------------
  heading('5. decrypt() на произвольном "мусоре" (не наш формат)');

  {
    const garbage = 'мусор';
    process.stdout.write(`  вход: ${JSON.stringify(garbage)}\n`);
    try {
      decrypt(garbage);
      report(false, 'decrypt("мусор") должен был бросить DecryptError, но не бросил');
    } catch (error) {
      report(error instanceof DecryptError, 'DecryptError выброшен как ожидалось (мусор на входе)');
    }
  }

  // --- 6. isEncrypted() ------------------------------------------------------
  heading('6. isEncrypted()');

  {
    const encrypted = encrypt('проверка isEncrypted');
    const plain = 'обычная нешифрованная строка';
    process.stdout.write(`  isEncrypted(encrypt(...)) = ${isEncrypted(encrypted)}\n`);
    process.stdout.write(`  isEncrypted("${plain}") = ${isEncrypted(plain)}\n`);
    report(isEncrypted(encrypted) === true, 'isEncrypted() === true для результата encrypt()');
    report(isEncrypted(plain) === false, 'isEncrypted() === false для обычной строки');
  }

  // --- Итог ------------------------------------------------------------------
  heading('Итог');

  if (failures.length === 0) {
    process.stdout.write('Все проверки пройдены\n');
    process.exit(0);
  } else {
    process.stdout.write(`Провалено проверок: ${failures.length}\n`);
    for (const failure of failures) {
      process.stdout.write(`  - ${failure}\n`);
    }
    process.exit(1);
  }
}

/** Меняет один символ строки на другой печатный символ, сохраняя длину. */
function corruptOneChar(value: string): string {
  if (value.length === 0) {
    // Крайний случай: нечего портить (например, пустой base64 у пустого ciphertext) —
    // добавляем один "мусорный" символ, чтобы значение всё равно стало невалидным.
    return 'X';
  }
  const index = 0;
  const original = value[index];
  const replacement = original === 'A' ? 'B' : 'A';
  return replacement + value.slice(1);
}

main().catch((error: unknown) => {
  process.stdout.write(`\nНеожиданная ошибка при выполнении демо-скрипта: ${String(error)}\n`);
  process.exit(1);
});
