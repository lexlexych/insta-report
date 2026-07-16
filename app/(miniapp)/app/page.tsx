'use client';

import Link from 'next/link';
import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@/lib/i18n';

type Period = 7 | 30;
type Direction = 'in' | 'out' | 'manual';
type ZernioStatus = 'none' | 'pending' | 'active' | 'disconnected' | 'error';
type ZernioFeedback = 'success' | 'error' | 'try_later' | null;
type Dashboard = {
  period: { days: Period; from: string; to: string };
  metrics: { dialogs: number; drafts: number; sent: number; manual: number; llmCalls: number; tokens: number };
  connection: { status: 'active' | 'needs_setup' | 'error'; connect: 'none' | 'awaiting_admin' | 'ready' | 'active' | 'error'; username: string | null };
  zernio: { enabled: boolean; status: ZernioStatus; username: string | null };
  recent: { direction: Direction; text: string; createdAt: string }[];
};

function directionIcon(direction: Direction): string {
  if (direction === 'out') return '✅';
  if (direction === 'manual') return '✋';
  return '📩';
}

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

function relativeTime(value: string): string {
  const diffSeconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (diffSeconds < 60) return 'now';
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function statusClasses(connect: Dashboard['connection']['connect'] | ZernioStatus | undefined): string {
  if (connect === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (connect === 'error') return 'border-red-200 bg-red-50 text-red-900';
  if (connect === 'none' || connect === 'disconnected') return 'border-slate-200 bg-slate-50 text-slate-900';
  return 'border-amber-200 bg-amber-50 text-amber-900';
}

export default function MiniAppPage() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState<Period>(7);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [zernioConnecting, setZernioConnecting] = useState(false);
  const [zernioDisconnecting, setZernioDisconnecting] = useState(false);
  const [zernioFeedback, setZernioFeedback] = useState<ZernioFeedback>(null);
  const zernioResult = searchParams.get('zernio');

  const load = useCallback(async () => {
    setError(false);
    try {
      const response = await fetch(`/api/miniapp/dashboard?days=${period}`);
      if (!response.ok) throw new Error('dashboard_failed');
      setDashboard((await response.json()) as Dashboard);
    } catch {
      setError(true);
    }
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const disconnectInstagram = useCallback(async () => {
    if (!window.confirm(t('settingsDisconnectConfirm'))) return;
    setDisconnecting(true);
    try {
      const response = await fetch('/api/miniapp/ig/disconnect', { method: 'POST' });
      if (!response.ok) throw new Error('disconnect_failed');
      await load();
    } catch {
      setError(true);
    } finally {
      setDisconnecting(false);
    }
  }, [load, t]);

  const connectZernio = useCallback(async () => {
    setZernioFeedback(null);
    setZernioConnecting(true);
    try {
      const response = await fetch('/api/miniapp/zernio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embedded: isMobileTelegram() }),
      });
      if (response.status === 409 || response.status === 404) {
        await load();
        return;
      }
      if (!response.ok) {
        setZernioFeedback('try_later');
        return;
      }

      const payload = await response.json() as { url?: unknown };
      if (typeof payload.url !== 'string') throw new Error('zernio_connect_url_missing');

      if (isMobileTelegram()) window.location.assign(payload.url);
      else if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(payload.url);
      else window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch {
      setZernioFeedback('try_later');
    } finally {
      setZernioConnecting(false);
    }
  }, [load]);

  const disconnectZernio = useCallback(async () => {
    if (!window.confirm(t('zernioDisconnectConfirm'))) return;
    setZernioFeedback(null);
    setZernioDisconnecting(true);
    try {
      const response = await fetch('/api/miniapp/zernio/disconnect', { method: 'POST' });
      if (response.status === 404) {
        await load();
        return;
      }
      if (!response.ok) {
        setZernioFeedback('try_later');
        return;
      }
      await load();
    } catch {
      setZernioFeedback('try_later');
    } finally {
      setZernioDisconnecting(false);
    }
  }, [load, t]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30_000);
    const onFocus = () => void load();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  useEffect(() => {
    if (zernioResult !== 'success' && zernioResult !== 'error') return;
    setZernioFeedback(zernioResult);
    void load();
    router.replace('/app');
  }, [load, router, zernioResult]);

  const connectionTitle = useMemo(() => {
    if (!dashboard) return t('dashboardConnectionLoading');
    if (dashboard.connection.connect === 'awaiting_admin') return t('dashboardConnectionAwaitingAdmin');
    if (dashboard.connection.connect === 'ready') return t('dashboardConnectionReady');
    if (dashboard.connection.connect === 'none') return t('dashboardConnectionNotConnected');
    if (dashboard.connection.connect === 'active') return t('dashboardConnectionOk', { username: dashboard.connection.username ?? 'instagram' });
    return t('dashboardConnectionError');
  }, [dashboard, t]);

  const metrics = dashboard?.metrics;
  const hasActivity = Boolean(dashboard?.recent.length);
  const connect = dashboard?.connection.connect;
  const zernio = dashboard?.zernio;
  const zernioStatus = zernioFeedback === 'error' ? 'error' : zernio?.status;
  const emptyCtaHref = connect === 'active' ? '/app/simulator' : connect === 'ready' ? '/app/connect-instagram?from=dashboard' : null;
  const emptyCtaText = connect === 'active' ? t('onboardingTrySimulator') : t('onboardingConnectInstagram');

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header className="space-y-1">
        <p className="text-sm text-tg-hint">InstaReply</p>
        <h1 className="text-2xl font-semibold">{t('pageDashboardTitle')}</h1>
      </header>

      <section className={`rounded-2xl border p-4 shadow-sm ${statusClasses(connect)} `}>
        <span className="block text-sm font-medium">{t('dashboardConnectionTitle')}</span>
        <span className="mt-1 block text-lg font-semibold">{connect === 'awaiting_admin' ? '⏳ ' : ''}{connectionTitle}</span>
        {connect === 'ready' ? <Link className="mt-3 inline-block rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text" href="/app/connect-instagram?from=dashboard">{t('onboardingConnectInstagram')}</Link> : null}
        {connect === 'active' || connect === 'error' ? (
          <button
            type="button"
            className="mt-3 inline-block rounded-xl bg-tg-bg/70 border px-4 py-2 text-sm font-medium disabled:opacity-40"
            disabled={disconnecting}
            onClick={() => void disconnectInstagram()}
          >
            {t('settingsDisconnect')}
          </button>
        ) : null}
      </section>

      {zernio?.enabled ? (
        <section className={`rounded-2xl border p-4 shadow-sm ${statusClasses(zernioStatus)}`}>
          <span className="block text-sm font-medium">{t('zernioConnectTitle')}</span>
          {zernioStatus === 'active' ? (
            <div className="mt-1 flex items-center gap-2">
              {zernio.username ? <span className="text-lg font-semibold">@{zernio.username}</span> : null}
              <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800">{t('zernioStatusActive')}</span>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm">{t('zernioConnectDescription')}</p>
              {zernioStatus === 'pending' ? <p className="mt-2 text-sm font-medium">{t('zernioStatusPending')}</p> : null}
              {zernioStatus === 'error' ? <p className="mt-2 text-sm font-medium">{t('zernioStatusError')}</p> : null}
            </>
          )}
          {zernioFeedback === 'success' ? <p className="mt-2 text-sm font-medium text-emerald-700" role="status">{t('zernioConnected')}</p> : null}
          {zernioFeedback === 'try_later' ? <p className="mt-2 text-sm font-medium text-red-700" role="alert">{t('zernioTryLater')}</p> : null}
          {zernioStatus === 'active' ? (
            <button
              type="button"
              className="mt-3 inline-block rounded-xl border bg-tg-bg/70 px-4 py-2 text-sm font-medium disabled:opacity-40"
              disabled={zernioDisconnecting}
              onClick={() => void disconnectZernio()}
            >
              {zernioDisconnecting ? <><LoadingSpinner />{t('zernioDisconnecting')}</> : t('zernioDisconnectButton')}
            </button>
          ) : (
            <button
              type="button"
              className="mt-3 inline-block rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text disabled:opacity-40"
              disabled={zernioConnecting}
              onClick={() => void connectZernio()}
            >
              {zernioConnecting ? <><LoadingSpinner />{t('zernioConnecting')}</> : t(zernioStatus === 'none' || zernioStatus === 'pending' ? 'zernioConnectButton' : 'zernioReconnectButton')}
            </button>
          )}
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2 rounded-2xl bg-tg-secondary-bg p-1">
        {[7, 30].map((days) => (
          <button
            key={days}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${period === days ? 'bg-tg-button text-tg-button-text' : 'text-tg-text'}`}
            type="button"
            onClick={() => setPeriod(days as Period)}
          >
            {t('dashboardDays', { days })}
          </button>
        ))}
      </div>

      {error ? <button className="rounded-xl border p-3 text-sm text-red-600" type="button" onClick={() => void load()}>{t('dashboardLoadError')}</button> : null}

      <section className="grid grid-cols-2 gap-3">
        <MetricCard href="/app/simulator" label={t('dashboardMetricDialogs')} value={metrics?.dialogs ?? 0} />
        <MetricCard href="/app/labels" label={t('dashboardMetricDrafts')} value={metrics?.drafts ?? 0} />
        <MetricCard href="/app/connect-instagram?from=dashboard" label={t('dashboardMetricSent')} value={metrics?.sent ?? 0} />
        <MetricCard href="/app/connect-instagram?from=dashboard" label={t('dashboardMetricManual')} value={metrics?.manual ?? 0} />
      </section>

      <p className="rounded-2xl bg-tg-secondary-bg p-3 text-center text-sm text-tg-hint">
        {t('dashboardLlmLine', { calls: metrics?.llmCalls ?? 0, tokens: metrics?.tokens ?? 0 })}
      </p>

      <section className="space-y-3 rounded-2xl bg-tg-secondary-bg p-4">
        <h2 className="text-lg font-semibold">{t('dashboardRecentTitle')}</h2>
        {hasActivity ? (
          <ul className="space-y-2">
            {dashboard?.recent.map((item, index) => (
              <li key={`${item.createdAt}-${index}`} className="flex items-start gap-3 rounded-xl bg-tg-bg p-3">
                <span aria-hidden>{directionIcon(item.direction)}</span>
                <span className="min-w-0 flex-1 text-sm">{item.text || t('dashboardEmptyMessageText')}</span>
                <time className="shrink-0 text-xs text-tg-hint" dateTime={item.createdAt}>{relativeTime(item.createdAt)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl bg-tg-bg p-4 text-center">
            <div className="text-4xl" aria-hidden>💬</div>
            <p className="mt-2 font-medium">{t('dashboardEmptyTitle')}</p>
            <p className="mt-1 text-sm text-tg-hint">{t('dashboardEmptyHint')}</p>
            {emptyCtaHref ? <Link className="mt-4 inline-block rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text" href={emptyCtaHref}>{emptyCtaText}</Link> : null}
          </div>
        )}
      </section>
    </main>
  );
}

function MetricCard({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link className="rounded-2xl bg-tg-secondary-bg p-4 shadow-sm" href={href}>
      <span className="block text-sm text-tg-hint">{label}</span>
      <span className="mt-2 block text-2xl font-semibold">{value}</span>
    </Link>
  );
}
