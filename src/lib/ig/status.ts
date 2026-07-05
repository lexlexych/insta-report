import type { igConnections } from '@/lib/db';

export type IgConnectionStatus = 'active' | 'needs_setup' | 'error';

export type IgStatusSummary = {
  status: IgConnectionStatus;
  username: string | null;
  hasToken: boolean;
  hasSecret: boolean;
  webhookLastSeenAt: string | null;
  handshakeAt: string | null;
};

type Connection = Awaited<ReturnType<typeof igConnections.getForTenant>>;

export function summarizeConnectionStatus(connection: Connection): IgStatusSummary {
  if (!connection) {
    return {
      status: 'needs_setup',
      username: null,
      hasToken: false,
      hasSecret: false,
      webhookLastSeenAt: null,
      handshakeAt: null,
    };
  }

  const hasToken = Boolean(connection.accessToken);
  const hasSecret = Boolean(connection.appSecret);
  const hasHandshake = Boolean(connection.handshake_at);
  const status = connection.status === 'error' ? 'error' : connection.status === 'active' && hasToken && hasSecret && hasHandshake ? 'active' : 'needs_setup';

  return {
    status,
    username: connection.ig_username,
    hasToken,
    hasSecret,
    webhookLastSeenAt: connection.webhook_last_seen_at,
    handshakeAt: connection.handshake_at,
  };
}
