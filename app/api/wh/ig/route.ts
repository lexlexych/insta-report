import { waitUntil } from '@vercel/functions';
import type { NextRequest } from 'next/server';

import * as igConnections from '@/lib/db/igConnections';
import { env } from '@/lib/env';
import { verifySignature, timingSafeEqualStrings } from '@/lib/ig/webhook';
import { handleIgEvent, logPipelineError } from '@/lib/pipeline/handleIgEvent';

export const maxDuration = 60;

type IgWebhookBody = { entry?: Array<{ id?: string }> };

export async function GET(req: NextRequest): Promise<Response> {
  const mode = req.nextUrl.searchParams.get('hub.mode');
  const verifyToken = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (
    mode === 'subscribe' &&
    verifyToken !== null &&
    challenge !== null &&
    timingSafeEqualStrings(verifyToken, env.IG_WEBHOOK_VERIFY_TOKEN)
  ) {
    return new Response(challenge, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest): Promise<Response> {
  const raw = await req.text();
  if (!verifySignature(raw, env.INSTAGRAM_APP_SECRET, req.headers.get('x-hub-signature-256'))) {
    console.error('[wh/ig] invalid platform signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let body: IgWebhookBody;
  try {
    body = JSON.parse(raw) as IgWebhookBody;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  for (const entry of body.entry ?? []) {
    const igAccountId = entry.id;
    if (!igAccountId) continue;
    const connection = await igConnections.getByIgAccountId(igAccountId);
    if (!connection) {
      console.debug(`[wh/ig] no platform tenant for ig_account_id=${igAccountId}`);
      continue;
    }
    await igConnections.touchWebhookSeen(connection.tenant_id);
    waitUntil(
      handleIgEvent(connection.tenant_id, { ...body, entry: [entry] }).catch((err: unknown) =>
        logPipelineError(connection.tenant_id, err),
      ),
    );
  }

  return new Response('OK', { status: 200 });
}
