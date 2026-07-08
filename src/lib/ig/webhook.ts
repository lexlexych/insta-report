import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(rawBody: string, platformSecret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const [scheme, hex] = signatureHeader.split('=');
  if (scheme !== 'sha256' || !hex) return false;
  const expectedHex = createHmac('sha256', platformSecret).update(rawBody, 'utf8').digest('hex');
  const providedBuf = Buffer.from(hex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
}
