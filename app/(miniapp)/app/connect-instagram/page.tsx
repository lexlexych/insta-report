'use client';

import { ConnectionDiagnostics } from '@/components/miniapp/ConnectionDiagnostics';
import { InstagramConnectPanel } from '@/components/miniapp/InstagramConnectPanel';
import { useT } from '@/lib/i18n';

export default function Page() {
  const { t } = useT();
  return <main className="mx-auto max-w-xl space-y-4 px-5 py-8"><h1 className="text-2xl font-bold">{t('pageConnectInstagramTitle')}</h1><p className="text-sm text-tg-hint">{t('igIntro')}</p><InstagramConnectPanel /><ConnectionDiagnostics /></main>;
}
