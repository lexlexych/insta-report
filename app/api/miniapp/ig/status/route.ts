import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { igAccounts, igConnections } from '@/lib/db';
import { getAccount, IgAuthError } from '@/lib/ig/client';

const TOKEN_ERROR_HINT = 'Токен недействителен или отозван — подключите Instagram заново через OAuth';
const EVENT_HINT = 'Отправьте сообщение вашему аккаунту c другого профиля Instagram и нажмите Обновить';

type CheckId = 'token' | 'event';
type CheckStatus = 'ok' | 'fail' | 'pending';

type Check = {
  id: CheckId;
  status: CheckStatus;
  hint?: string;
};

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const [account, initialConnection] = await Promise.all([
    igAccounts.getByTenant(tenant.id),
    igConnections.getForTenant(tenant.id),
  ]);
  const connect = !account
    ? 'none'
    : account.status === 'pending'
      ? 'awaiting_admin'
      : initialConnection?.status === 'active'
        ? 'active'
        : initialConnection?.status === 'error'
          ? 'error'
          : 'ready';
  let connection = initialConnection;

  if (!connection) {
    return jsonResponse({ state: 'not_configured', connect });
  }

  let tokenOk = false;
  let tokenError: string | undefined;
  let igUsername = connection.ig_username;

  if (connection.accessToken) {
    try {
      const account = await getAccount(connection.accessToken);
      connection = await igConnections.upsertForTenant(tenant.id, {
        ig_account_id: account.igAccountId,
        ig_username: account.username,
        status: 'active',
      });
      tokenOk = true;
      igUsername = account.username;
    } catch (error) {
      if (error instanceof IgAuthError) {
        connection = await igConnections.upsertForTenant(tenant.id, { status: 'error' });
        tokenError = TOKEN_ERROR_HINT;
      } else {
        throw error;
      }
    }
  } else {
    tokenError = TOKEN_ERROR_HINT;
  }

  const eventOk = Boolean(connection.webhook_last_seen_at);
  const checks: Check[] = [
    { id: 'token', status: tokenOk ? 'ok' : 'fail', ...(tokenOk ? {} : { hint: tokenError ?? TOKEN_ERROR_HINT }) },
    { id: 'event', status: eventOk ? 'ok' : 'pending', ...(eventOk ? {} : { hint: EVENT_HINT }) },
  ];

  return jsonResponse({
    state: connection.status,
    connect: account?.status === 'approved'
      ? connection.status === 'active' ? 'active' : connection.status === 'error' ? 'error' : 'ready'
      : connect,
    tokenOk,
    ...(tokenError ? { tokenError } : {}),
    igUsername,
    lastEventAt: connection.webhook_last_seen_at,
    checks,
  });
});
