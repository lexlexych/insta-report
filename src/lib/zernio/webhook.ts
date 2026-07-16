import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../env';

const HEX_SHA256_LENGTH = 64;

/**
 * Проверяет подпись глобального webhook-а Zernio.
 *
 * Zernio передаёт чистый lowercase hex HMAC-SHA256 без префикса `sha256=`.
 */
export function verifyZernioSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !new RegExp(`^[a-f0-9]{${HEX_SHA256_LENGTH}}$`).test(signatureHeader)) {
    return false;
  }

  const secret = env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) return false;

  const expectedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const provided = Buffer.from(signatureHeader, 'hex');
  const expected = Buffer.from(expectedHex, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
