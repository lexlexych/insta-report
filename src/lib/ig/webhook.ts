import { createHmac, timingSafeEqual } from 'node:crypto';

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function verifySignature(rawBody: string, appSecret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const [scheme, hex] = signatureHeader.split('=');
  if (scheme !== 'sha256' || !hex) return false;
  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const providedBuf = Buffer.from(hex, 'hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  return providedBuf.length === expectedBuf.length && timingSafeEqual(providedBuf, expectedBuf);
}
