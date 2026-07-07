import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getKey } from '@/lib/crypto';

const TTL_MS = 15 * 60 * 1000;

type StatePayload = {
  tenantId: string;
  nonce: string;
  iat: number;
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payloadB64: string): string {
  return createHmac('sha256', getKey()).update(payloadB64, 'utf8').digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function sign({ tenantId }: { tenantId: string }): string {
  const payload: StatePayload = { tenantId, nonce: randomBytes(16).toString('base64url'), iat: Date.now() };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${signPayload(payloadB64)}`;
}

export function verify(state: string | null | undefined, now = Date.now()): string | null {
  if (!state) return null;
  const [payloadB64, mac, extra] = state.split('.');
  if (!payloadB64 || !mac || extra !== undefined) return null;
  if (!safeEqual(mac, signPayload(payloadB64))) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as StatePayload;
  } catch {
    return null;
  }

  if (!payload.tenantId || !payload.nonce || !Number.isFinite(payload.iat)) return null;
  if (payload.iat > now || now - payload.iat > TTL_MS) return null;
  return payload.tenantId;
}
