import { waitUntil } from '@vercel/functions';
import type { NextRequest } from 'next/server';

import * as igConnections from '@/lib/db/igConnections';
import { verifySignature, timingSafeEqualStrings } from '@/lib/ig/webhook';
import { handleIgEvent, logPipelineError } from '@/lib/pipeline/handleIgEvent';

export const maxDuration = 60;

type RouteParams = { params: Promise<{ tenantId: string }> };

export async function GET(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { tenantId } = await params;
  const connection = await igConnections.getForTenant(tenantId);
  if (!connection) {
    return new Response('Not Found', { status: 404 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const verifyToken = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode !== 'subscribe' || verifyToken === null || challenge === null || !connection.verify_token) {
    return new Response('Forbidden', { status: 403 });
  }

  if (!timingSafeEqualStrings(verifyToken, connection.verify_token)) {
    return new Response('Forbidden', { status: 403 });
  }

  await igConnections.markHandshake(tenantId);
  return new Response(challenge, { status: 200 });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const { tenantId } = await params;
  // Тело читаем как raw ДО любого парсинга — подпись считается по сырым байтам.
  const raw = await req.text();

  const connection = await igConnections.getForTenant(tenantId);
  if (!connection) {
    return new Response('Not Found', { status: 404 });
  }

  const signatureHeader = req.headers.get('x-hub-signature-256');
  if (!connection.appSecret || !verifySignature(raw, connection.appSecret, signatureHeader)) {
    console.error(`[wh/ig] invalid signature tenant=${tenantId}`);
    return new Response('Unauthorized', { status: 401 });
  }

  await igConnections.touchWebhookSeen(tenantId);

  waitUntil(
    handleIgEvent(tenantId, JSON.parse(raw) as unknown).catch((err: unknown) => logPipelineError(tenantId, err)),
  );

  return new Response('OK', { status: 200 });
}
