'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useT } from '@/lib/i18n';

type ConnectState = { igUsername: string | null };
type LabelsResponse = { labels: Array<{ isDefault: boolean }> };

// Анимированный бейдж-галочка успешного подключения. Круг и галочка рисуются
// через stroke-dasharray/dashoffset — анимация в globals.css (ig-pop/ig-draw).
function SuccessBadge() {
  return (
    <svg aria-hidden className="ig-success-badge" fill="none" height="96" viewBox="0 0 96 96" width="96">
      <circle className="ig-success-circle" cx="48" cy="48" r="42" stroke="#10b981" strokeLinecap="round" strokeWidth="4" />
      <path className="ig-success-check" d="M30 49 L42 61 L67 35" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />
    </svg>
  );
}

export default function ConnectInstagramSuccessPage() {
  const { t } = useT();
  const [igUsername, setIgUsername] = useState<string | null>(null);
  const [labelsConfigured, setLabelsConfigured] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetch('/api/miniapp/ig/connect')
        .then((response) => (response.ok ? (response.json() as Promise<ConnectState>) : null))
        .then((payload) => setIgUsername(payload?.igUsername ?? null))
        .catch(() => undefined),
      fetch('/api/miniapp/labels')
        .then((response) => (response.ok ? (response.json() as Promise<LabelsResponse>) : null))
        .then((payload) => setLabelsConfigured(Boolean(payload?.labels.some((label) => !label.isDefault))))
        .catch(() => undefined),
    ]);
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center gap-6 px-5 py-10 text-center">
      <SuccessBadge />

      <div>
        <h1 className="text-2xl font-bold">{t('igSuccessTitle')}</h1>
        <p className="mt-1 text-sm text-tg-hint">{igUsername ? t('igSuccessConnectedAs', { username: igUsername }) : t('igSuccessSubtitle')}</p>
      </div>

      <section className="w-full space-y-3 text-left">
        <h2 className="text-lg font-semibold">{t('igSuccessNextTitle')}</h2>

        <div className="rounded-2xl border p-4">
          {labelsConfigured ? (
            <p className="text-sm">
              <span aria-hidden className="text-emerald-600">✓ </span>
              {t('igSuccessStepLabelsDone')}
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">{t('igSuccessStepLabels')}</p>
              <Link className="inline-block rounded-xl border px-4 py-3 font-medium" href="/app/labels">
                {t('igSuccessStepLabelsButton')}
              </Link>
            </div>
          )}
        </div>

        <div className="rounded-2xl border p-4">
          <p className="text-sm">{t('igSuccessStepTest')}</p>
        </div>
      </section>

      <Link className="mt-2 w-full rounded-xl bg-tg-button p-3 text-center font-medium text-tg-button-text" href="/app">
        {t('igSuccessGoHome')}
      </Link>
    </main>
  );
}
