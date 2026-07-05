import { IgAuthError, IgRateLimitError, sendMessage } from '../../src/lib/ig/client';
import { splitMessage } from '../../src/lib/ig/split';

const encoder = new TextEncoder();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const text = `${'Привет 👋 '.repeat(140)}\n\n${'Danke! '.repeat(120)}`;
  const parts = splitMessage(text, 900);
  assert(parts.length >= 3, 'expected 3+ parts for long UTF-8 text');
  assert(parts.join('') === text, 'split parts must reconstruct the source text');
  assert(
    parts.every((part) => encoder.encode(part).byteLength <= 900),
    'each part must be <= 900 bytes',
  );
  for (const part of parts) new TextDecoder('utf-8', { fatal: true }).decode(encoder.encode(part));

  const calls: Array<{ url: string; init?: RequestInit; text: string }> = [];
  globalThis.fetch = (async (url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { message?: { text?: string } };
    calls.push({ url: String(url), init, text: body.message?.text ?? '' });
    return Response.json({ message_id: `mid-${calls.length}` });
  }) as typeof fetch;

  const mids = await sendMessage('secret-token', 'ig-account', 'contact', text);
  assert(mids.length === parts.length, 'sendMessage must POST every split part');
  assert(
    calls.every((call) => !call.url.includes('secret-token')),
    'token must not be in URL',
  );
  assert(
    calls.map((call) => call.text).join('') === text,
    'sent bodies must reconstruct the source text',
  );

  globalThis.fetch = (async () =>
    Response.json(
      { error: { type: 'OAuthException', code: 190, message: 'expired' } },
      { status: 400 },
    )) as typeof fetch;
  await sendMessage('secret-token', 'ig-account', 'contact', 'hello').catch((error: unknown) => {
    assert(error instanceof Error, 'expected Error');
    assert(
      !String(error.stack).includes('secret-token'),
      'token must not be present in error stack',
    );
    assert(error.cause instanceof IgAuthError, 'OAuthException must become IgAuthError');
  });

  globalThis.fetch = (async () =>
    Response.json(
      { error: { code: 613, message: 'rate limit' } },
      { status: 429 },
    )) as typeof fetch;
  await sendMessage('secret-token', 'ig-account', 'contact', 'hello').catch((error: unknown) => {
    assert(error instanceof Error, 'expected Error');
    assert(error.cause instanceof IgRateLimitError, '429/code 613 must become IgRateLimitError');
  });

  console.log('T-013 demo passed');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
