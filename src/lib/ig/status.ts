import type { igConnections } from '@/lib/db';

export type IgConnectionStatus = 'active' | 'needs_setup' | 'error';

export type IgStatusSummary = {
  status: IgConnectionStatus;
  username: string | null;
  hasToken: boolean;
  webhookLastSeenAt: string | null;
};

type Connection = Awaited<ReturnType<typeof igConnections.getForTenant>>;

export function summarizeConnectionStatus(connection: Connection): IgStatusSummary {
  if (!connection) {
    return {
      status: 'needs_setup',
      username: null,
      hasToken: false,
      webhookLastSeenAt: null,
    };
  }

  const hasToken = Boolean(connection.accessToken);
  const status = connection.status === 'error' ? 'error' : connection.status === 'active' && hasToken ? 'active' : 'needs_setup';

  return {
    status,
    username: connection.ig_username,
    hasToken,
    webhookLastSeenAt: connection.webhook_last_seen_at,
  };
}
