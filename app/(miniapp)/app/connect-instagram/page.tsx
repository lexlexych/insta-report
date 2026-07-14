'use client';

import { backButton, retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { useT } from '@/lib/i18n';

declare global { interface Window { Telegram?: { WebApp?: { openLink?: (url: string) => void } } } }

type ConnectStatus = 'none' | 'awaiting_admin' | 'ready' | 'active' | 'error';
type StatusResponse = { connect?: ConnectStatus };
type Screen = 'loading' | 'waiting' | 'invite' | 'success' | 'error';

function isMobileTelegram(): boolean {
  try {
    const params = retrieveLaunchParams() as { tgWebAppPlatform?: unknown };
    return ['ios', 'android', 'android_x'].includes(String(params.tgWebAppPlatform));
  } catch { return false; }
}

function ResultBadge({ error }: { error: boolean }) {
  return (
    <svg aria-hidden className="ig-success-badge" fill="none" height="96" viewBox="0 0 96 96" width="96">
      <circle className={error ? 'ig-success-circle ig-error-circle' : 'ig-success-circle'} cx="48" cy="48" r="42" stroke={error ? '#ef4444' : '#10b981'} strokeLinecap="round" strokeWidth="4" />
      {error ? <path className="ig-error-mark" d="M48 27v30M48 69v.5" stroke="#ef4444" strokeLinecap="round" strokeWidth="5" /> : <path className="ig-success-check" d="M30 49 L42 61 L67 35" stroke="#10b981" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" />}
    </svg>
  );
}

export default function ConnectInstagramPage() {
  const { t } = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [screen, setScreen] = useState<Screen>('loading');
  const [errorReason, setErrorReason] = useState<'denied' | 'error' | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  const from = searchParams.get('from');

  // «Далее» сразу открывает логин Instagram — отдельного OAuth-экрана в визарде нет.
  const startOauth = useCallback(async () => {
    setConnecting(true);
    setConnectFailed(false);
    try {
      const embedded = isMobileTelegram();
      const response = await fetch(`/api/miniapp/ig/login-url${embedded ? '?embedded=1' : ''}`);
      if (response.status === 403) {
        const payload = await response.json() as { code?: string };
        if (payload.code === 'not_approved') { setScreen('waiting'); return; }
      }
      if (!response.ok) throw new Error('login_url_failed');
      const { url } = await response.json() as { url: string };
      if (embedded) window.location.assign(url);
      else if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch { setConnectFailed(true); } finally { setConnecting(false); }
  }, []);

  const leaveWizard = useCallback(() => {
    if (from === 'onboarding') router.replace('/app/onboarding');
    else router.replace('/app');
  }, [from, router]);

  const showError = useCallback((reason: 'denied' | 'error' = 'error') => {
    setErrorReason(reason);
    setScreen('error');
  }, []);

  const openInstagramSettings = useCallback(() => {
    const url = 'https://www.instagram.com/accounts/manage_access/';
    if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  useEffect(() => {
    const oauthResult = searchParams.get('ig');
    if (oauthResult === 'success') {
      setScreen('success');
      return;
    }
    if (oauthResult === 'denied' || oauthResult === 'error') {
      showError(oauthResult);
      return;
    }

    const controller = new AbortController();
    void fetch('/api/miniapp/ig/status', { signal: controller.signal })
      .then(async (response) => response.ok ? await response.json() as StatusResponse : null)
      .then((payload) => {
        if (!payload?.connect) throw new Error('status_failed');
        if (payload.connect === 'none' || payload.connect === 'awaiting_admin') setScreen('waiting');
        else if (payload.connect === 'active') setScreen('success');
        else setScreen('invite');
      })
      .catch(() => { if (!controller.signal.aborted) showError(); });
    return () => controller.abort();
  }, [searchParams, showError]);

  // Возврат в мини-апп после логина в браузере: перепроверяем статус по фокусу.
  useEffect(() => {
    if (screen !== 'invite') return;
    const refresh = () => {
      void fetch('/api/miniapp/ig/status')
        .then(async (response) => response.ok ? await response.json() as StatusResponse : null)
        .then((payload) => { if (payload?.connect === 'active') setScreen('success'); })
        .catch(() => undefined);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [screen]);

  useEffect(() => {
    const handleBack = () => {
      if (screen === 'error') setScreen('invite');
      else leaveWizard();
    };
    if (!backButton.mount.isAvailable()) return;
    backButton.mount();
    if (backButton.show.isAvailable()) backButton.show();
    const off = backButton.onClick.isAvailable() ? backButton.onClick(handleBack) : undefined;
    return () => {
      off?.();
      if (backButton.hide.isAvailable()) backButton.hide();
      backButton.unmount();
    };
  }, [leaveWizard, screen]);

  if (screen === 'loading') return <main className="mx-auto max-w-xl px-5 py-8 text-tg-hint">{t('igLoading')}</main>;

  if (screen === 'waiting') {
    return <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-5 py-8 text-center"><span aria-hidden className="text-5xl">⏳</span><h1 className="text-2xl font-bold">{t('igWizardWaitingTitle')}</h1><p className="max-w-sm text-sm text-tg-hint">{t('igWizardWaitingBody')}</p></main>;
  }

  if (screen === 'invite') {
    return <main className="mx-auto max-w-xl space-y-5 px-5 py-8"><h1 className="text-2xl font-bold">{t('igWizardInviteTitle')}</h1><div className="space-y-3 text-sm text-tg-hint"><p>{t('igWizardInviteSteps')}</p><img alt={t('igWizardInviteImageAlt')} className="w-full rounded-2xl border" src="/images/ig-tester-invite.png" /><p>{t('igWizardInviteReturn')}</p><p>{t('igWizardInviteAlreadyAccepted')}</p></div><button className="w-full rounded-xl border px-4 py-3 font-medium" type="button" onClick={openInstagramSettings}>{t('igWizardInviteOpenSettings')}</button>{connectFailed ? <p className="text-sm text-red-600">{t('igWizardErrorGeneric')}</p> : null}<button className="w-full rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text disabled:opacity-40" disabled={connecting} type="button" onClick={() => void startOauth()}>{connecting ? t('igLoading') : t('onboardingNext')}</button></main>;
  }

  const isError = screen === 'error';
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-5 py-8 text-center"><ResultBadge error={isError} /><div><h1 className="text-2xl font-bold">{t(isError ? 'igWizardErrorTitle' : 'igWizardSuccessTitle')}</h1>{isError ? <p className="mt-2 text-sm text-tg-hint">{t(errorReason === 'denied' ? 'igWizardErrorDenied' : 'igWizardErrorGeneric')}</p> : null}</div>{isError ? <button className="w-full rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text" type="button" onClick={() => { setErrorReason(null); setScreen('invite'); void startOauth(); }}>{t('igWizardTryAgain')}</button> : <button className="w-full rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text" type="button" onClick={() => router.replace('/app')}>{t('igWizardToDashboard')}</button>}</main>;
}
