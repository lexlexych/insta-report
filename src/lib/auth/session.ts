import { jwtVerify, SignJWT } from 'jose';

import { env } from '@/lib/env';

export type SessionPayload = { tenantId: string };

const SESSION_TTL_SECONDS = 60 * 60 * 12;
const encoder = new TextEncoder();

function getSecret(): Uint8Array {
  return encoder.encode(env.MINIAPP_JWT_SECRET);
}

export async function signSession({ tenantId }: SessionPayload): Promise<string> {
  return new SignJWT({ tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
  if (typeof payload.tenantId !== 'string' || payload.tenantId.length === 0) {
    throw new Error('Invalid session payload');
  }
  return { tenantId: payload.tenantId };
}
