'use client';

import { useEffect, useState } from 'react';

import { resolveLocale, t, type Locale } from '@/lib/i18n/shared';

const ALLOWED_OAUTH_DOMAINS = ['instagram.com', 'facebook.com', 'zernio.com'];

function isAllowedOAuthUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  const hostname = url.hostname.toLowerCase();
  return ALLOWED_OAUTH_DOMAINS.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
}

function readOAuthTarget(): URL | null {
  const encoded = window.location.hash.slice(1);
  if (!encoded) return null;

  try {
    const target = new URL(decodeURIComponent(encoded));
    return isAllowedOAuthUrl(target) ? target : null;
  } catch {
    return null;
  }
}

export default function ZernioOAuthBridgePage() {
  const [locale, setLocale] = useState<Locale>('ru');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLocale(resolveLocale(window.navigator.language));

    const target = readOAuthTarget();
    if (!target) {
      setFailed(true);
      return;
    }

    // Удаляем OAuth URL из видимой строки браузера до перехода. Отложенная программная
    // навигация не является тапом по Instagram Universal Link, поэтому остаётся в браузере.
    window.history.replaceState(null, '', window.location.pathname);
    const timer = window.setTimeout(() => window.location.replace(target.toString()), 50);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 p-6 font-sans text-slate-900">
      <section className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        {!failed ? (
          <svg aria-hidden className="mx-auto h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" fill="currentColor" />
          </svg>
        ) : null}
        <p className={`text-sm ${failed ? 'text-red-700' : 'mt-4 text-slate-600'}`} role={failed ? 'alert' : 'status'}>
          {t(locale, failed ? 'zernioBrowserError' : 'zernioBrowserOpening')}
        </p>
      </section>
    </main>
  );
}
