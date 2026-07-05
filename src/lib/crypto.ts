import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from './env';

/**
 * Шифрование секретов тенантов (токены Instagram, app_secret и т.п.) — AES-256-GCM
 * с версионированным текстовым форматом. Это единственный способ записи/чтения
 * секретов в БД (см. docs/plan.md §5, п.6): пишем только через `encrypt()`, читаем
 * только через `decrypt()`.
 *
 * Формат зашифрованного значения: `v1:<iv base64>:<authTag base64>:<ciphertext base64>`.
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION_PREFIX = 'v1';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/** Бросается при невозможности расшифровать значение (неверный формат/тег/ключ). */
export class DecryptError extends Error {
  constructor() {
    // ВАЖНО: сюда нельзя передавать payload или его фрагменты — это может утечь
    // зашифрованный секрет (или его часть) в логи/трейсы ошибок.
    super('Failed to decrypt payload: invalid format, key or authentication tag');
    this.name = 'DecryptError';
  }
}

let cachedKey: Buffer | undefined;

/**
 * Декодирует `env.ENCRYPTION_KEY` из base64 и кэширует результат в памяти модуля.
 * Схема `env.ts` уже гарантирует, что значение декодируется ровно в 32 байта, но
 * здесь проверка дублируется как защита от регрессий/прямого использования модуля.
 */
export function getKey(): Buffer {
  if (!cachedKey) {
    const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${key.length})`,
      );
    }
    cachedKey = key;
  }
  return cachedKey;
}

/** Шифрует строку (в т.ч. пустую) и возвращает версионированное значение для хранения. */
export function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${VERSION_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Расшифровывает значение, полученное из `encrypt()`. Любая ошибка формата,
 * версии, ключа или тега аутентификации превращается в `DecryptError` без
 * включения исходного payload в сообщение об ошибке.
 */
export function decrypt(payload: string): string {
  try {
    const parts = payload.split(':');
    if (parts.length !== 4) {
      throw new DecryptError();
    }

    const [version, ivB64, authTagB64, ciphertextB64] = parts;
    // Note: ciphertextB64 can legitimately be an empty string (encrypting ''), so we only
    // check for `undefined` (impossible here since parts.length === 4, but needed for TS
    // narrowing under noUncheckedIndexedAccess) rather than falsy values.
    if (
      version !== VERSION_PREFIX ||
      ivB64 === undefined ||
      authTagB64 === undefined ||
      ciphertextB64 === undefined
    ) {
      throw new DecryptError();
    }

    const key = getKey();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    return plain.toString('utf8');
  } catch {
    throw new DecryptError();
  }
}

/** true, если строка похожа на значение, произведённое `encrypt()` (версия `v1:`). */
export function isEncrypted(value: string): boolean {
  return value.startsWith(`${VERSION_PREFIX}:`);
}
