import { waitUntil } from '@vercel/functions';

import { isZernioEnabled } from '@/lib/env';
import { logPipelineError } from '@/lib/pipeline/handleIgEvent';
import { handleZernioWebhook, zernioWebhookPayloadSchema } from '@/lib/zernio/handleWebhook';
import { verifyZernioSignature } from '@/lib/zernio/webhook';

export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  if (!isZernioEnabled()) return new Response('Not Found', { status: 404 });

  const rawBody = await req.text();
  if (!verifyZernioSignature(rawBody, req.headers.get('x-zernio-signature'))) {
    console.debug('[wh/zernio] invalid signature');
    return new Response('Unauthorized', { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(rawBody) as unknown;
  } catch {
    console.debug('[wh/zernio] ignored non-JSON payload');
    return new Response('OK', { status: 200 });
  }

  const parsed = zernioWebhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    console.debug('[wh/zernio] ignored payload without a valid event');
    return new Response('OK', { status: 200 });
  }

  waitUntil(
    handleZernioWebhook(parsed.data).catch((error: unknown) =>
      logPipelineError('zernio-webhook', error),
    ),
  );
  return new Response('OK', { status: 200 });
}
