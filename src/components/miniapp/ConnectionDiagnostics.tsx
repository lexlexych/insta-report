'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@/lib/i18n';

type Check = {
  id: 'token' | 'event';
  status: 'ok' | 'fail' | 'pending';
  hint?: string;
};

type StatusPayload =
  | { state: 'not_configured' }
  | {
      state: 'pending' | 'active' | 'error';
      tokenOk: boolean;
      tokenError?: string;
      igUsername: string | null;
      lastEventAt: string | null;
      checks: Check[];
    };

const ICONS: Record<Check['status'], string> = {
  ok: '✅',
  pending: '⏳',
  fail: '❌',
};

function isConfigured(payload: StatusPayload | null): payload is Exclude<StatusPayload, { state: 'not_configured' }> {
  return Boolean(payload && payload.state !== 'not_configured');
}

function isComplete(payload: StatusPayload | null): boolean {
  return Boolean(isConfigured(payload) && payload.checks.every((check) => check.status === 'ok'));
}

export function ConnectionDiagnostics({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const [payload, setPayload] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch('/api/miniapp/ig/status');
      if (!response.ok) throw new Error('status_failed');
      setPayload((await response.json()) as StatusPayload);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (isComplete(payload)) return undefined;
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [payload, refresh]);

  const allOk = isComplete(payload);
  const completedPayload = allOk && isConfigured(payload) ? payload : null;
  const checks = useMemo(() => (isConfigured(payload) ? payload.checks : []), [payload]);

  if (compact) {
    const label = completedPayload ? t('igStatusBadgeOk', { username: completedPayload.igUsername ?? 'Instagram' }) : t('igStatusBadgeNeedsSetup');
    return (
      <div className={`rounded-2xl border p-4 ${allOk ? 'border-green-500/40 bg-green-500/10' : 'border-yellow-500/40 bg-yellow-500/10'}`}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">{label}</span>
          <Link className="text-sm underline" href="/app/connect-instagram">
            {t('igStatusBadgeOpen')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('igDiagnosticsTitle')}</h2>
        <button className="rounded-lg border px-3 py-2 text-xs disabled:opacity-50" disabled={loading} type="button" onClick={() => void refresh()}>
          {loading ? t('igDiagnosticsRefreshing') : t('igDiagnosticsRefresh')}
        </button>
      </div>

      {error ? <p className="text-sm text-red-600">{t('igDiagnosticsLoadError')}</p> : null}
      {payload?.state === 'not_configured' ? <p className="text-sm text-tg-hint">{t('igDiagnosticsNotConfigured')}</p> : null}

      <div className="space-y-3 text-left">
        {checks.map((check) => (
          <div key={check.id} className="rounded-xl border p-3">
            <div className="flex items-start gap-2">
              <span aria-hidden>{ICONS[check.status]}</span>
              <div className="min-w-0">
                <p className="font-medium">{t(`igCheck_${check.id}`)}</p>
                {check.status !== 'ok' ? <p className="mt-1 text-sm text-tg-hint">{check.hint ?? t(`igCheck_${check.id}_hint`)}</p> : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {completedPayload ? (
        <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-center">
          <p className="font-semibold text-green-700">{t('igDiagnosticsAllOk', { username: completedPayload.igUsername ?? 'Instagram' })}</p>
          <Link className="mt-3 block rounded-xl bg-tg-button px-4 py-3 text-center font-medium text-tg-button-text" href="/app">
            {t('igDiagnosticsDashboard')}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
