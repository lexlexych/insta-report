import { apiHandler, HttpError, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { zernioAccounts } from '@/lib/db';
import { env, isZernioEnabled } from '@/lib/env';
import { createProfile, getConnectUrl, ZernioApiError } from '@/lib/zernio/client';
import { sign } from '@/lib/zernio/state';

function unwrapInstagramOAuthUrl(authUrl: string): string {
  try {
    const loginUrl = new URL(authUrl);
    if (
      loginUrl.protocol !== 'https:' ||
      loginUrl.hostname !== 'www.instagram.com' ||
      loginUrl.pathname !== '/accounts/login/' ||
      loginUrl.searchParams.get('force_authentication') !== '1'
    ) {
      return authUrl;
    }

    const next = loginUrl.searchParams.get('next');
    if (!next) return authUrl;

    const oauthUrl = new URL(next, loginUrl.origin);
    if (
      oauthUrl.origin !== loginUrl.origin ||
      !['/oauth/authorize', '/oauth/authorize/'].includes(oauthUrl.pathname)
    ) {
      return authUrl;
    }

    return oauthUrl.toString();
  } catch {
    return authUrl;
  }
}

async function requestBody(req: Request): Promise<{ embedded: boolean; ios: boolean }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'invalid_request');
  }
  if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid_request');
  const { embedded, ios } = body as { embedded?: unknown; ios?: unknown };
  if (embedded !== undefined && typeof embedded !== 'boolean') throw new HttpError(400, 'invalid_request');
  if (ios !== undefined && typeof ios !== 'boolean') throw new HttpError(400, 'invalid_request');
  return { embedded: embedded === true, ios: ios === true };
}

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  if (!isZernioEnabled()) return jsonResponse({ ok: false, error: 'disabled' }, 404);

  const { embedded, ios } = await requestBody(req);
  const existing = await zernioAccounts.getForTenant(tenant.id);
  if (existing?.status === 'active') return jsonResponse({ ok: false, error: 'already_connected' }, 409);

  try {
    const profileId = await zernioAccounts.ensureProfile(tenant.id, 'instagram', async () => {
      const name = `tenant-${tenant.id}`.slice(0, 50);
      return (await createProfile(name)).profileId;
    });
    const state = sign({ tenantId: tenant.id, embedded });
    const redirectUrl = `${env.APP_BASE_URL}/api/zernio/callback?state=${encodeURIComponent(state)}`;
    const { authUrl } = await getConnectUrl('instagram', profileId, redirectUrl);
    // iOS получает прямую OAuth-цель без известной Universal Link-обёртки. Клиент всё
    // равно открывает её через same-origin browser bridge, поэтому Instagram URL никогда
    // не передаётся Telegram/iOS как исходная ссылка пользовательского клика.
    return jsonResponse({ ok: true, url: ios ? unwrapInstagramOAuthUrl(authUrl) : authUrl });
  } catch (error) {
    if (error instanceof ZernioApiError) {
      console.error(`[zernio/connect] request failed tenant=${tenant.id} status=${error.status} message=${error.message}`);
      return jsonResponse({ ok: false, error: 'zernio_error' }, 502);
    }
    throw error;
  }
});
