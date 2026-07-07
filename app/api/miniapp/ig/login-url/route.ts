import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { env, isBusinessLoginEnabled } from '@/lib/env';
import { sign } from '@/lib/ig/oauthState';

const SCOPES = 'instagram_business_basic,instagram_business_manage_messages';

export const GET = apiHandler(async (req: Request) => {
  if (!isBusinessLoginEnabled(env)) return jsonResponse({ ok: false, error: 'disabled' }, 404);
  const tenant = await requireTenant(req);
  const embedded = new URL(req.url).searchParams.get('embedded') === '1';
  const url = new URL('https://www.instagram.com/oauth/authorize');
  url.searchParams.set('client_id', env.INSTAGRAM_APP_ID);
  url.searchParams.set('redirect_uri', `${env.APP_BASE_URL}/api/ig/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', sign({ tenantId: tenant.id, embedded }));
  return jsonResponse({ url: url.toString() });
});
