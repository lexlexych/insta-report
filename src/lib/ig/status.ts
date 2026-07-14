import type { igConnections } from '@/lib/db';
import type { igAccounts } from '@/lib/db';

export type IgConnectionStatus = 'active' | 'needs_setup' | 'error';
export type IgConnectStatus = 'none' | 'awaiting_admin' | 'ready' | 'active' | 'error';

export type IgStatusSummary = {
  status: IgConnectionStatus;
  connect: IgConnectStatus;
  username: string | null;
  hasToken: boolean;
  webhookLastSeenAt: string | null;
};

type Connection = Awaited<ReturnType<typeof igConnections.getForTenant>>;
type Account = Awaited<ReturnType<typeof igAccounts.getByTenant>>;

export function summarizeConnectionStatus(connection: Connection, account: Account): IgStatusSummary {
  const hasToken = Boolean(connection?.accessToken);
  const status = !connection
    ? 'needs_setup'
    : connection.status === 'error'
      ? 'error'
      : connection.status === 'active' && hasToken
        ? 'active'
        : 'needs_setup';
  const connect: IgConnectStatus = !account
    ? 'none'
    : account.status === 'pending'
      ? 'awaiting_admin'
      : status === 'active' || status === 'error'
        ? status
        : 'ready';

  if (!connection) {
    return {
      status,
      connect,
      username: null,
      hasToken: false,
      webhookLastSeenAt: null,
    };
  }

  return {
    status,
    connect,
    username: connection.ig_username,
    hasToken,
    webhookLastSeenAt: connection.webhook_last_seen_at,
  };
}
