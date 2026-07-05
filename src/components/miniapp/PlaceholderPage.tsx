'use client';

import { useT } from '@/lib/i18n';

export function PlaceholderPage({ titleKey }: { titleKey: string }) {
  const { t } = useT();
  const title = t(titleKey);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-3 px-6 py-10">
      <p className="text-sm font-medium uppercase tracking-wide text-tg-link">InstaReply</p>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="text-base text-tg-hint">{t('pageUnderConstruction', { section: title })}</p>
    </main>
  );
}
