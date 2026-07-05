import { createHmac, randomUUID } from 'node:crypto';

/**
 * Прогоняет GET (verify handshake) и POST (приём события) роута
 * app/api/wh/ig/[tenantId]/route.ts против запущенного `pnpm dev`.
 *
 * Перед запуском нужен тенант с реальным ig_connections (см. docs/manual-tests/T-011.md):
 *   WH_BASE_URL=http://localhost:3000 WH_TENANT_ID=<uuid> WH_VERIFY_TOKEN=<plain> WH_APP_SECRET=<plain> \
 *     pnpm tsx scripts/manual/T-011-demo.ts
 */

const baseUrl = process.env.WH_BASE_URL ?? 'http://localhost:3000';
const tenantId = process.env.WH_TENANT_ID;
const verifyToken = process.env.WH_VERIFY_TOKEN;
const appSecret = process.env.WH_APP_SECRET;

if (!tenantId || !verifyToken || !appSecret) {
  console.error(
    'Нужны env WH_TENANT_ID, WH_VERIFY_TOKEN, WH_APP_SECRET (plaintext-значения того же тенанта, что в ig_connections). См. docs/manual-tests/T-011.md.',
  );
  process.exit(1);
}

const routeUrl = (id: string) => `${baseUrl}/api/wh/ig/${id}`;

function sign(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

let failed = false;

function report(label: string, ok: boolean, extra?: string): void {
  console.log(`${ok ? 'OK' : 'FAIL'}: ${label}${extra ? ` (${extra})` : ''}`);
  failed ||= !ok;
}

async function main(): Promise<void> {
  const challenge = `probe-${randomUUID()}`;

  // 1. GET с верным verify_token → 200 и тело === challenge
  const goodGet = await fetch(
    `${routeUrl(tenantId!)}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken!)}&hub.challenge=${encodeURIComponent(challenge)}`,
  );
  const goodGetBody = await goodGet.text();
  report('GET верный verify_token -> 200 + challenge', goodGet.status === 200 && goodGetBody === challenge, `status=${goodGet.status} body=${goodGetBody}`);

  // 2. GET с неверным verify_token → 403
  const badGet = await fetch(
    `${routeUrl(tenantId!)}?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=${encodeURIComponent(challenge)}`,
  );
  report('GET неверный verify_token -> 403', badGet.status === 403, `status=${badGet.status}`);

  // 3. GET для неизвестного тенанта → 404
  const unknownGet = await fetch(
    `${routeUrl(randomUUID())}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken!)}&hub.challenge=${encodeURIComponent(challenge)}`,
  );
  report('GET неизвестный tenantId -> 404', unknownGet.status === 404, `status=${unknownGet.status}`);

  // 4. POST с корректной подписью → 200 OK
  const payload = JSON.stringify({ object: 'instagram', entry: [{ id: 'demo', time: Date.now(), messaging: [] }] });
  const goodPost = await fetch(routeUrl(tenantId!), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(payload, appSecret!) },
    body: payload,
  });
  const goodPostBody = await goodPost.text();
  report('POST верная подпись -> 200 OK', goodPost.status === 200 && goodPostBody === 'OK', `status=${goodPost.status} body=${goodPostBody}`);

  // 5. POST с подписью от другого секрета → 401
  const wrongSecretPost = await fetch(routeUrl(tenantId!), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(payload, 'not-the-real-secret') },
    body: payload,
  });
  report('POST подпись от другого секрета -> 401', wrongSecretPost.status === 401, `status=${wrongSecretPost.status}`);

  // 6. POST без заголовка подписи → 401
  const noSigPost = await fetch(routeUrl(tenantId!), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
  });
  report('POST без x-hub-signature-256 -> 401', noSigPost.status === 401, `status=${noSigPost.status}`);

  // 7. POST с валидной подписью, но изменённым телом → 401 (подпись считалась по старому телу)
  const mutatedBody = payload.replace('demo', 'demo-mutated');
  const mutatedPost = await fetch(routeUrl(tenantId!), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(payload, appSecret!) },
    body: mutatedBody,
  });
  report('POST изменённое тело при старой подписи -> 401', mutatedPost.status === 401, `status=${mutatedPost.status}`);

  if (failed) {
    throw new Error('T-011 demo: одна или несколько проверок провалились, см. вывод выше');
  }
  console.log('T-011 demo completed: все проверки прошли.');
}

main().catch((error: unknown) => {
  console.error('T-011 FAILED:', error);
  process.exitCode = 1;
});
