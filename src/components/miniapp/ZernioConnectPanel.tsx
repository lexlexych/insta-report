'use client';

import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { useCallback, useState } from 'react';

import { useT } from '@/lib/i18n';

declare global {
  interface Window {
    Telegram?: { WebApp?: { openLink?: (url: string) => void } };
  }
}

export type ZernioStatus = 'none' | 'pending' | 'active' | 'disconnected' | 'error';
export type ZernioFeedback = 'success' | 'error' | 'try_later' | null;
export type ZernioConnection = { enabled: boolean; status: ZernioStatus; username: string | null };

type Props = {
  connection: ZernioConnection | null | undefined;
  feedback?: ZernioFeedback;
  onRefresh: () => Promise<void> | void;
};

function isMobileTelegram(): boolean {
  try {
    const params = retrieveLaunchParams() as { tgWebAppPlatform?: unknown };
    return ['ios', 'android', 'android_x'].includes(String(params.tgWebAppPlatform));
  } catch {
    return false;
  }
}

function LoadingSpinner() {
  return (
    <svg aria-hidden className="mr-2 inline-block h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
    </svg>
  );
}

function statusClasses(status: ZernioStatus | undefined): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-900';
  if (status === 'none' || status === 'disconnected') return 'border-slate-200 bg-slate-50 text-slate-900';
  return 'border-amber-200 bg-amber-50 text-amber-900';
}

export function ZernioConnectPanel({ connection, feedback = null, onRefresh }: Props) {
  const { t } = useT();
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<ZernioFeedback>(null);
  const visibleFeedback = localFeedback ?? feedback;
  const status = visibleFeedback === 'error' ? 'error' : connection?.status;

  const connect = useCallback(async () => {
    setLocalFeedback(null);
    setConnecting(true);
    try {
      const response = await fetch('/api/miniapp/zernio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedded: isMobileTelegram() }),
      });
      if (response.status === 409 || response.status === 404) {
        await onRefresh();
        return;
      }
      if (!response.ok) {
        setLocalFeedback('try_later');
        return;
      }

      const payload = await response.json() as { url?: unknown };
      if (typeof payload.url !== 'string') throw new Error('zernio_connect_url_missing');

      if (isMobileTelegram()) window.location.assign(payload.url);
      else if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(payload.url);
      else window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch {
      setLocalFeedback('try_later');
    } finally {
      setConnecting(false);
    }
  }, [onRefresh]);

  const disconnect = useCallback(async () => {
    if (!window.confirm(t('zernioDisconnectConfirm'))) return;
    setLocalFeedback(null);
    setDisconnecting(true);
    try {
      const response = await fetch('/api/miniapp/zernio/disconnect', { method: 'POST' });
      if (response.status === 404) {
        await onRefresh();
        return;
      }
      if (!response.ok) {
        setLocalFeedback('try_later');
        return;
      }
      await onRefresh();
    } catch {
      setLocalFeedback('try_later');
    } finally {
      setDisconnecting(false);
    }
  }, [onRefresh, t]);

  if (!connection?.enabled) return null;

  return (
    <section className={`rounded-2xl border p-4 shadow-sm ${statusClasses(status)}`}>
      <span className="block text-sm font-medium">{t('zernioConnectTitle')}</span>
      {status === 'active' ? (
        <div className="mt-1 flex items-center gap-2">
          {connection.username ? <span className="text-lg font-semibold">@{connection.username}</span> : null}
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">{t('zernioStatusActive')}</span>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm">{t('zernioConnectDescription')}</p>
          {status === 'pending' ? <p className="mt-2 text-sm font-medium">{t('zernioStatusPending')}</p> : null}
          {status === 'error' ? <p className="mt-2 text-sm font-medium">{t('zernioStatusError')}</p> : null}
        </>
      )}
      {visibleFeedback === 'success' ? <p className="mt-2 text-sm font-medium text-emerald-700" role="status">{t('zernioConnected')}</p> : null}
      {visibleFeedback === 'try_later' ? <p className="mt-2 text-sm font-medium text-red-700" role="alert">{t('zernioTryLater')}</p> : null}
      {status === 'active' ? (
        <button type="button" className="mt-3 inline-block rounded-xl border bg-tg-bg/70 px-4 py-2 text-sm font-medium disabled:opacity-40" disabled={disconnecting} onClick={() => void disconnect()}>
          {disconnecting ? <><LoadingSpinner />{t('zernioDisconnecting')}</> : t('zernioDisconnectButton')}
        </button>
      ) : (
        <button type="button" className="mt-3 inline-block rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text disabled:opacity-40" disabled={connecting} onClick={() => void connect()}>
          {connecting ? <><LoadingSpinner />{t('zernioConnecting')}</> : t(status === 'none' || status === 'pending' ? 'zernioConnectButton' : 'zernioReconnectButton')}
        </button>
      )}
    </section>
  );
}
