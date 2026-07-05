'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@/lib/i18n';

type Period = 7 | 30;
type Direction = 'in' | 'out' | 'manual';
type Dashboard = {
  period: { days: Period; from: string; to: string };
  metrics: { dialogs: number; drafts: number; sent: number; manual: number; llmCalls: number; tokens: number };
  connection: { status: 'active' | 'needs_setup' | 'error'; username: string | null };
  recent: { direction: Direction; text: string; createdAt: string }[];
};

function directionIcon(direction: Direction): string {
  if (direction === 'out') return '✅';
  if (direction === 'manual') return '✋';
  return '📩';
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

function statusClasses(status: Dashboard['connection']['status']): string {
  if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (status === 'error') return 'border-red-200 bg-red-50 text-red-900';
  return 'border-amber-200 bg-amber-50 text-amber-900';
}

export default function MiniAppPage() {
  const { t } = useT();
  const [period, setPeriod] = useState<Period>(7);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState(false);

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [load]);

  const connectionTitle = useMemo(() => {
    if (!dashboard) return t('dashboardConnectionLoading');
    if (dashboard.connection.status === 'active') return t('dashboardConnectionOk', { username: dashboard.connection.username ?? 'instagram' });
    if (dashboard.connection.status === 'error') return t('dashboardConnectionError');
    return t('dashboardConnectionNeedsSetup');
  }, [dashboard, t]);

  const metrics = dashboard?.metrics;
  const hasActivity = Boolean(dashboard?.recent.length);
  const emptyCtaHref = dashboard?.connection.status === 'active' ? '/app/simulator' : '/app/connect-instagram';
  const emptyCtaText = dashboard?.connection.status === 'active' ? t('onboardingTrySimulator') : t('onboardingConnectInstagram');

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-4 p-4">
      <header className="space-y-1">
        <p className="text-sm text-tg-hint">InstaReply</p>
        <h1 className="text-2xl font-semibold">{t('pageDashboardTitle')}</h1>
      </header>

      <Link className={`rounded-2xl border p-4 shadow-sm ${statusClasses(dashboard?.connection.status ?? 'needs_setup')}`} href="/app/connect-instagram">
        <span className="block text-sm font-medium">{t('dashboardConnectionTitle')}</span>
        <span className="mt-1 block text-lg font-semibold">{connectionTitle}</span>
      </Link>

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
        <MetricCard href="/app/connect-instagram" label={t('dashboardMetricSent')} value={metrics?.sent ?? 0} />
        <MetricCard href="/app/connect-instagram" label={t('dashboardMetricManual')} value={metrics?.manual ?? 0} />
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
            <Link className="mt-4 inline-block rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text" href={emptyCtaHref}>{emptyCtaText}</Link>
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
