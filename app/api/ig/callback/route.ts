import { igConnections } from '@/lib/db';
import { env } from '@/lib/env';
import { exchangeCodeForShortLivedToken, exchangeForLongLivedToken, getAccount, subscribeToMessages } from '@/lib/ig/client';
import { verify } from '@/lib/ig/oauthState';
import { escapeHTML } from '@/lib/tg/html';

function returnHref(): string | null {
  return env.TELEGRAM_BOT_USERNAME ? `https://t.me/${env.TELEGRAM_BOT_USERNAME}?startapp=connect` : null;
}

function htmlPage(title: string, body: string, status = 200): Response {
  const href = returnHref();
  const safeTitle = escapeHTML(title);
  const link = href
    ? `<a class="btn" href="${escapeHTML(href)}">Вернуться в Telegram</a>`
    : '<p class="hint">Вернитесь в Telegram и откройте InstaReply.</p>';
  return new Response(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title><style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7fb;color:#111}.card{max-width:520px;margin:24px;padding:28px;border-radius:24px;background:#fff;box-shadow:0 12px 40px #0001}.btn{display:inline-block;margin-top:18px;border-radius:14px;background:#229ed9;color:white;padding:12px 16px;text-decoration:none;font-weight:600}.hint{color:#667085}</style></head><body><main class="card"><h1>${safeTitle}</h1><p>${escapeHTML(body)}</p>${link}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function sanitizedMetaMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : 'unknown Meta error';
}

// Для embedded-потоков (мобильный Telegram, webview miniapp) вместо HTML-страницы
// возвращаем redirect обратно в miniapp — там результат отрисует сам React-компонент.
function miniappRedirect(path: string): Response {
  return Response.redirect(`${env.APP_BASE_URL}${path}`, 303);
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const state = verify(url.searchParams.get('state'));

  if (url.searchParams.get('error') === 'access_denied') {
    if (state?.embedded) return miniappRedirect('/app/connect-instagram?ig=denied');
    return htmlPage('Доступ не выдан', 'Вы отменили подключение Instagram. Можно вернуться в Telegram и попробовать снова.');
  }

  if (!state) return new Response('Forbidden', { status: 403 });
  const tenantId = state.tenantId;

  const code = url.searchParams.get('code');
  if (!code) {
    if (state.embedded) return miniappRedirect('/app/connect-instagram?ig=error');
    return htmlPage('Не получилось', 'Instagram не вернул код авторизации. Попробуйте ещё раз.', 400);
  }

  try {
    const redirectUri = `${env.APP_BASE_URL}/api/ig/callback`;
    const short = await exchangeCodeForShortLivedToken({ clientId: env.INSTAGRAM_APP_ID, clientSecret: env.INSTAGRAM_APP_SECRET, redirectUri, code });
    const long = await exchangeForLongLivedToken(short.accessToken, env.INSTAGRAM_APP_SECRET);
    const account = await getAccount(long.accessToken);
    await subscribeToMessages(long.accessToken);
    await igConnections.upsertForTenant(tenantId, {
      ig_account_id: account.igAccountId,
      ig_username: account.username,
      accessToken: long.accessToken,
      token_refreshed_at: new Date().toISOString(),
      status: 'active',
    });
    if (state.embedded) return miniappRedirect('/app/connect-instagram/success');
    return htmlPage('Instagram подключён', `Instagram @${account.username} подключён.`);
  } catch (error) {
    console.error(`[ig/callback] Meta OAuth failed tenant=${tenantId}: ${sanitizedMetaMessage(error)}`);
    await igConnections.setStatus(tenantId, 'error').catch(() => undefined);
    if (state.embedded) return miniappRedirect('/app/connect-instagram?ig=error');
    return htmlPage('Не получилось', 'Не получилось подключить Instagram, попробуйте ещё раз.', 502);
  }
}
