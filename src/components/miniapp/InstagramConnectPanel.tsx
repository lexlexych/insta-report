'use client';

import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { useCallback, useEffect, useState } from 'react';

import { useT } from '@/lib/i18n';

declare global { interface Window { Telegram?: { WebApp?: { openLink?: (url: string) => void } } } }

type StatusResponse = { connect?: 'none' | 'awaiting_admin' | 'ready' | 'active' | 'error' };
type Props = {
  onActive?: () => void;
  onAwaitingAdmin?: () => void;
  onError?: () => void;
};

function isMobileTelegram(): boolean {
  try {
    const params = retrieveLaunchParams() as { tgWebAppPlatform?: unknown };
    return ['ios', 'android', 'android_x'].includes(String(params.tgWebAppPlatform));
  } catch { return false; }
}

export function InstagramConnectPanel({ onActive, onAwaitingAdmin, onError }: Props) {
  const { t } = useT();
  const [loadFailed, setLoadFailed] = useState(false);
  const [connectFailed, setConnectFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthResult, setOauthResult] = useState<'denied' | 'error' | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/miniapp/ig/status');
      if (!response.ok) throw new Error('load_failed');
      const next = await response.json() as StatusResponse;
      setLoadFailed(false);
      if (next.connect === 'active') onActive?.();
      if (next.connect === 'none' || next.connect === 'awaiting_admin') onAwaitingAdmin?.();
      if (next.connect === 'error') onError?.();
    } catch { setLoadFailed(true); }
  }, [onActive, onAwaitingAdmin, onError]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('ig');
    if (result !== 'denied' && result !== 'error') return;
    setOauthResult(result);
    onError?.();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.hash}`);
  }, [onError]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  const connect = useCallback(async () => {
    setLoading(true);
    setConnectFailed(false);
    try {
      const embedded = isMobileTelegram();
      const response = await fetch(`/api/miniapp/ig/login-url${embedded ? '?embedded=1' : ''}`);
      if (response.status === 403) {
        const payload = await response.json() as { code?: string };
        if (payload.code === 'not_approved') {
          onAwaitingAdmin?.();
          return;
        }
      }
      if (!response.ok) throw new Error('login_url_failed');
      const { url } = await response.json() as { url: string };
      if (embedded) window.location.assign(url);
      else if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch { setConnectFailed(true); } finally { setLoading(false); }
  }, [onAwaitingAdmin]);
  if (!loadFailed && loading) return <p className="text-tg-hint">{t('igLoading')}</p>;
  return <section className="space-y-3 rounded-2xl border bg-white/60 p-4 shadow-sm">
    <h2 className="text-lg font-semibold">{t('igBusinessLoginTitle')}</h2>
    <p className="text-sm text-tg-hint">{t('igBusinessLoginBody')}</p>
    {loadFailed ? <p className="text-sm text-red-600">{t('igLoadError')}</p> : null}
    {connectFailed ? <p className="text-sm text-red-600">{t('igBusinessLoginError')}</p> : null}
    {oauthResult === 'denied' ? <p className="text-sm text-red-600">{t('igOauthResultDenied')}</p> : null}
    {oauthResult === 'error' ? <p className="text-sm text-red-600">{t('igOauthResultError')}</p> : null}
    <div className="flex flex-wrap gap-2"><button className="rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text disabled:opacity-50" disabled={loading} type="button" onClick={() => void connect()}>{t('igBusinessLoginButton')}</button><button className="rounded-xl border px-4 py-3 font-medium" type="button" onClick={() => void load()}>{t('igBusinessLoginCheck')}</button></div>
  </section>;
}
