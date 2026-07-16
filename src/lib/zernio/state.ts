import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getKey } from '@/lib/crypto';

const TTL_MS = 15 * 60 * 1000;

type StatePayload = {
  tenantId: string;
  nonce: string;
  iat: number;
  embedded?: boolean;
};

export type VerifiedZernioState = { tenantId: string; embedded: boolean };

function signPayload(payloadB64: string): string {
  return createHmac('sha256', getKey()).update(payloadB64, 'utf8').digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sign({ tenantId, embedded }: { tenantId: string; embedded?: boolean }): string {
  const payload: StatePayload = {
    tenantId,
    nonce: randomBytes(16).toString('base64url'),
    iat: Date.now(),
  };
  if (embedded) payload.embedded = true;
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${signPayload(payloadB64)}`;
}

export function verify(state: string | null | undefined, now = Date.now()): VerifiedZernioState | null {
  if (!state) return null;
  const [payloadB64, mac, extra] = state.split('.');
  if (!payloadB64 || !mac || extra !== undefined || !safeEqual(mac, signPayload(payloadB64))) return null;

  let payload: StatePayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as StatePayload;
  } catch {
    return null;
  }

  if (!payload.tenantId || !payload.nonce || !Number.isFinite(payload.iat)) return null;
  if (payload.iat > now || now - payload.iat > TTL_MS) return null;
  return { tenantId: payload.tenantId, embedded: payload.embedded === true };
}
