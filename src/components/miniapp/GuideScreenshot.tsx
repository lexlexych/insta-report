'use client';

import Image from 'next/image';
import { useState } from 'react';

import { useT } from '@/lib/i18n';

/**
 * Место под скриншот шага инструкции (`/public/guide/*.png`). Пока файла нет (или он не
 * загрузился) — показываем оформленный плейсхолдер вместо падения рендера/битой картинки.
 */
export function GuideScreenshot({ src, alt }: { src: string; alt: string }) {
  const { t } = useT();
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="flex h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-tg-hint/40 bg-tg-secondary-bg text-tg-hint">
        <PlaceholderIcon />
        <span className="text-xs">{t('igGuideImagePlaceholder')}</span>
      </div>
    );
  }

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-xl bg-tg-secondary-bg">
      <Image fill alt={alt} className="object-contain" src={src} onError={() => setFailed(true)} />
    </div>
  );
}

function PlaceholderIcon() {
  return (
    <svg aria-hidden="true" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Z" />
      <path d="m5 17 4.5-5 3 3.2L16 11l3 5" />
      <circle cx="9" cy="9" r="1.3" />
    </svg>
  );
}
