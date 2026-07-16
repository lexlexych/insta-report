import { zernioAccounts } from '@/lib/db';
import { ZernioAccountConflictError } from '@/lib/db/errors';
import { env, isZernioEnabled } from '@/lib/env';
import { escapeHTML } from '@/lib/tg/html';
import { listAccounts, ZernioApiError } from '@/lib/zernio/client';
import { verify } from '@/lib/zernio/state';

function miniappRedirect(path: string): Response {
  return Response.redirect(`${env.APP_BASE_URL}${path}`, 303);
}

function returnHref(): string | null {
  return env.TELEGRAM_BOT_USERNAME ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?startapp=zernio` : null;
}

function htmlPage(title: string, message: string, status = 200): Response {
  const href = returnHref();
  const link = href
    ? `<a class="btn" href="${escapeHTML(href)}">Вернуться в Telegram</a>`
    : '<p class="hint">Вернитесь в Telegram и откройте InstaReply.</p>';
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7fb;color:#111}.card{max-width:520px;margin:24px;padding:28px;border-radius:24px;background:#fff;box-shadow:0 12px 40px #0001}.btn{display:inline-block;margin-top:18px;border-radius:14px;background:#229ed9;color:white;padding:12px 16px;text-decoration:none;font-weight:600}.hint{color:#667085}</style></head><body><main class="card"><h1>${escapeHTML(title)}</h1><p>${escapeHTML(message)}</p>${link}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function failure(state: ReturnType<typeof verify>, message: string, status = 502): Response {
  if (state?.embedded) return miniappRedirect('/app?zernio=error');
  return htmlPage('Не получилось', message, status);
}

export async function GET(req: Request): Promise<Response> {
  if (!isZernioEnabled()) return new Response(JSON.stringify({ ok: false, error: 'disabled' }), { status: 404 });

  const url = new URL(req.url);
  const state = verify(url.searchParams.get('state'));
  if (!state) return new Response('Forbidden', { status: 403 });

  const accountId = url.searchParams.get('accountId');
  const profileId = url.searchParams.get('profileId');
  if (!accountId) return failure(state, 'Не получилось подключить Instagram, попробуйте ещё раз.', 400);

  const stored = await zernioAccounts.getForTenant(state.tenantId);
  if (!stored || !profileId || stored.zernio_profile_id !== profileId) return new Response('Forbidden', { status: 403 });

  try {
    const accounts = await listAccounts({ profileId });
    const verified = accounts.find((account) => account.accountId === accountId && account.platform === 'instagram');
    if (!verified) return new Response('Forbidden', { status: 403 });

    const username = url.searchParams.get('username') ?? verified.username ?? null;
    await zernioAccounts.activate(state.tenantId, 'instagram', { zernioAccountId: accountId, username });
    if (state.embedded) return miniappRedirect('/app?zernio=success');
    return htmlPage('Instagram подключён', `Instagram @${username ?? 'account'} подключён через Zernio.`);
  } catch (error) {
    if (error instanceof ZernioAccountConflictError) {
      return failure(state, 'Этот аккаунт уже подключён в другом кабинете.', 409);
    }
    if (error instanceof ZernioApiError) {
      console.error(`[zernio/callback] verification failed tenant=${state.tenantId} status=${error.status} message=${error.message}`);
      await zernioAccounts.setStatus(state.tenantId, 'instagram', 'error', 'zernio_verification_failed').catch(() => undefined);
      return failure(state, 'Не получилось подключить Instagram, попробуйте ещё раз.');
    }
    throw error;
  }
}
