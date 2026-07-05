import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { igConnections } from '@/lib/db';
import { getAccount, IgAuthError } from '@/lib/ig/client';

const TOKEN_ERROR_HINT = 'Токен недействителен или отозван — сгенерируйте новый в Meta App Dashboard';
const HANDSHAKE_HINT = 'Проверьте, что Callback URL и Verify Token вставлены без пробелов, и нажмите Verify and Save в Meta Dashboard';
const EVENT_HINT = 'Отправьте сообщение вашему аккаунту c другого профиля Instagram и нажмите Обновить';

type CheckId = 'token' | 'handshake' | 'event';
type CheckStatus = 'ok' | 'fail' | 'pending';

type Check = {
  id: CheckId;
  status: CheckStatus;
  hint?: string;
};

function isAfter(left: string | null, right: string | null): boolean {
  if (!left || !right) return false;
  return new Date(left).getTime() > new Date(right).getTime();
}

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  let connection = await igConnections.getForTenant(tenant.id);

  if (!connection) {
    return jsonResponse({ state: 'not_configured' });
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

  const handshakeOk = Boolean(connection.handshake_at);
  const eventOk = isAfter(connection.webhook_last_seen_at, connection.handshake_at);
  const checks: Check[] = [
    { id: 'token', status: tokenOk ? 'ok' : 'fail', ...(tokenOk ? {} : { hint: tokenError ?? TOKEN_ERROR_HINT }) },
    { id: 'handshake', status: handshakeOk ? 'ok' : 'fail', ...(handshakeOk ? {} : { hint: HANDSHAKE_HINT }) },
    { id: 'event', status: eventOk ? 'ok' : 'pending', ...(eventOk ? {} : { hint: EVENT_HINT }) },
  ];

  return jsonResponse({
    state: connection.status,
    tokenOk,
    ...(tokenError ? { tokenError } : {}),
    igUsername,
    handshakeOk,
    lastEventAt: connection.webhook_last_seen_at,
    checks,
  });
});
