import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { zernioAccounts } from '@/lib/db';
import { isZernioEnabled } from '@/lib/env';
import { deleteAccount, ZernioApiError } from '@/lib/zernio/client';

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  if (!isZernioEnabled()) return jsonResponse({ ok: false, error: 'disabled' }, 404);

  const account = await zernioAccounts.getForTenant(tenant.id);
  try {
    if (account?.zernio_account_id) await deleteAccount(account.zernio_account_id);
    if (account) await zernioAccounts.disconnect(tenant.id, 'instagram', 'user_request');
    return jsonResponse({ ok: true });
  } catch (error) {
    if (error instanceof ZernioApiError && error.status === 404) {
      await zernioAccounts.disconnect(tenant.id, 'instagram', 'user_request');
      return jsonResponse({ ok: true });
    }
    if (error instanceof ZernioApiError) {
      console.error(`[zernio/disconnect] request failed tenant=${tenant.id} status=${error.status} message=${error.message}`);
      return jsonResponse({ ok: false, error: 'zernio_error' }, 502);
    }
    throw error;
  }
});
