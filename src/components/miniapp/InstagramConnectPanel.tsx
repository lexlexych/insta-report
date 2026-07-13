'use client';

import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import { useCallback, useEffect, useState } from 'react';

import { useT } from '@/lib/i18n';

declare global { interface Window { Telegram?: { WebApp?: { openLink?: (url: string) => void } } } }

type ConnectState = { status: 'pending' | 'active' | 'error'; igUsername: string | null };
type Props = { onActiveChange?: (active: boolean) => void };

function isMobileTelegram(): boolean {
  try {
    const params = retrieveLaunchParams() as { tgWebAppPlatform?: unknown };
    return ['ios', 'android', 'android_x'].includes(String(params.tgWebAppPlatform));
  } catch { return false; }
}

export function InstagramConnectPanel({ onActiveChange }: Props) {
  const { t } = useT();
  const [state, setState] = useState<ConnectState | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/miniapp/ig/connect');
      if (!response.ok) throw new Error('load_failed');
      const next = await response.json() as ConnectState;
      setState(next); setFailed(false); onActiveChange?.(next.status === 'active');
    } catch { setFailed(true); onActiveChange?.(false); }
  }, [onActiveChange]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [load]);
  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const embedded = isMobileTelegram();
      const response = await fetch(`/api/miniapp/ig/login-url${embedded ? '?embedded=1' : ''}`);
      if (!response.ok) throw new Error('login_url_failed');
      const { url } = await response.json() as { url: string };
      if (embedded) window.location.assign(url);
      else if (window.Telegram?.WebApp?.openLink) window.Telegram.WebApp.openLink(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    } catch { setFailed(true); } finally { setLoading(false); }
  }, []);
  if (!state && !failed) return <p className="text-tg-hint">{t('igLoading')}</p>;
  return <section className="space-y-3 rounded-2xl border bg-white/60 p-4 shadow-sm">
    <h2 className="text-lg font-semibold">{t('igBusinessLoginTitle')}</h2>
    <p className="text-sm text-tg-hint">{state?.igUsername ? t('igBusinessLoginConnected', { username: state.igUsername }) : t('igBusinessLoginBody')}</p>
    {failed ? <p className="text-sm text-red-600">{t('igBusinessLoginError')}</p> : null}
    <div className="flex flex-wrap gap-2"><button className="rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text disabled:opacity-50" disabled={loading} type="button" onClick={() => void connect()}>{state?.igUsername ? t('igBusinessLoginReconnect') : t('igBusinessLoginButton')}</button><button className="rounded-xl border px-4 py-3 font-medium" type="button" onClick={() => void load()}>{t('igBusinessLoginCheck')}</button></div>
  </section>;
}
