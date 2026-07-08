'use client';

import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConnectionDiagnostics } from '@/components/miniapp/ConnectionDiagnostics';
import { useT } from '@/lib/i18n';

declare global {
  interface Window {
    Telegram?: { WebApp?: { openLink?: (url: string) => void } };
  }
}

function isMobileTelegram(): boolean {
  try {
    const launchParams = retrieveLaunchParams() as { tgWebAppPlatform?: unknown } | null | undefined;
    const platform = typeof launchParams?.tgWebAppPlatform === 'string' ? launchParams.tgWebAppPlatform : '';
    return platform === 'ios' || platform === 'android' || platform === 'android_x';
  } catch {
    return false;
  }
}

type ConnectState = {
  status: 'pending' | 'active' | 'error';
  igUsername: string | null;
  webhookLastSeenAt: string | null;
};

export default function Page() {
  const { t } = useT();
  const [state, setState] = useState<ConnectState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState(false);
  const [oauthResult, setOauthResult] = useState<'denied' | 'error' | null>(null);
  const diagnosticsRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch('/api/miniapp/ig/connect');
      if (!response.ok) throw new Error('load_failed');
      setState((await response.json()) as ConnectState);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openBusinessLogin = useCallback(async () => {
    setOauthLoading(true);
    setOauthError(false);
    try {
      const embedded = isMobileTelegram();
      const response = await fetch(embedded ? '/api/miniapp/ig/login-url?embedded=1' : '/api/miniapp/ig/login-url');
      if (!response.ok) throw new Error('login_url_failed');
      const payload = (await response.json()) as { url: string };
      if (embedded) {
        window.location.assign(payload.url);
        return;
      }
      const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
      if (webApp?.openLink) webApp.openLink(payload.url);
      else window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch {
      setOauthError(true);
    } finally {
      setOauthLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('ig');
    if (result === 'denied' || result === 'error') {
      setOauthResult(result);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-tg-hint">{t('igLoadError')}</p>
        <button className="rounded-xl bg-tg-button px-5 py-3 font-medium text-tg-button-text" type="button" onClick={() => void load()}>
          {t('retry')}
        </button>
      </main>
    );
  }

  if (!state) {
    return <main className="flex min-h-screen items-center justify-center text-tg-hint">{t('igLoading')}</main>;
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 px-5 py-8">
      <h1 className="text-2xl font-bold">{t('pageConnectInstagramTitle')}</h1>
      <p className="text-sm text-tg-hint">{t('igIntro')}</p>

      <section className="space-y-3 rounded-2xl border bg-white/60 p-4 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold">{t('igBusinessLoginTitle')}</h2>
          <p className="text-sm text-tg-hint">{state.igUsername ? t('igBusinessLoginConnected', { username: state.igUsername }) : t('igBusinessLoginBody')}</p>
        </div>
        {oauthError ? <p className="text-sm text-red-600">{t('igBusinessLoginError')}</p> : null}
        {oauthResult === 'denied' ? <p className="text-sm text-tg-hint">{t('igOauthResultDenied')}</p> : null}
        {oauthResult === 'error' ? <p className="text-sm text-red-600">{t('igOauthResultError')}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button className="rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text disabled:opacity-50" disabled={oauthLoading} type="button" onClick={() => void openBusinessLogin()}>
            {state.igUsername ? t('igBusinessLoginReconnect') : t('igBusinessLoginButton')}
          </button>
          <button className="rounded-xl border px-4 py-3 font-medium" type="button" onClick={() => void load()}>
            {t('igBusinessLoginCheck')}
          </button>
        </div>
      </section>

      <div ref={diagnosticsRef}>
        <ConnectionDiagnostics />
      </div>
    </main>
  );
}
