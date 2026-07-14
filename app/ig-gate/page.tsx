'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { IG_MANAGE_ACCESS_URL } from '@/lib/ig/manageAccessUrl';
import { t, type Locale } from '@/lib/i18n/shared';

// Instagram отдаёт мобильную вёрстку по ширине окна (~375-430px), а не только по UA — из webview
// Telegram размер внешнего окна задать нельзя, поэтому эта страница открывает Instagram
// popup-окном нужного размера сама (user gesture по клику гарантирует, что браузер применит размеры).
const IG_POPUP_NAME = 'ig_mobile';
const IG_POPUP_FEATURES = 'popup=yes,width=430,height=850';

function openIgPopup(): Window | null {
  return window.open(IG_MANAGE_ACCESS_URL, IG_POPUP_NAME, IG_POPUP_FEATURES);
}

function resolveGateLocale(hl: string | null): Locale {
  return hl === 'de' ? 'de' : 'ru';
}

function IgGateContent() {
  const searchParams = useSearchParams();
  const locale = resolveGateLocale(searchParams.get('hl'));
  const [popupBlocked, setPopupBlocked] = useState(false);

  // Пытаемся открыть popup один раз при маунте; повторный автопопап на ре-рендерах не нужен.
  useEffect(() => {
    if (!openIgPopup()) setPopupBlocked(true);
  }, []);

  const handleOpen = () => {
    if (!openIgPopup()) setPopupBlocked(true);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 p-6 font-sans text-slate-900">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-xl">
        <h1 className="text-xl font-bold">{t(locale, 'igGateTitle')}</h1>
        <p className="mt-2 text-sm text-slate-500">{t(locale, 'igGateHint')}</p>
        <button className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white" type="button" onClick={handleOpen}>{t(locale, 'igGateOpen')}</button>
        <p className="mt-4 text-xs text-slate-400">{t(locale, 'igGateReturn')}</p>
        {popupBlocked ? (
          <a className="mt-3 inline-block text-sm text-blue-600 underline" href={IG_MANAGE_ACCESS_URL} rel="noopener noreferrer" target="_blank">{t(locale, 'igGateFallback')}</a>
        ) : null}
      </div>
    </main>
  );
}

export default function IgGatePage() {
  return (
    <Suspense fallback={null}>
      <IgGateContent />
    </Suspense>
  );
}
