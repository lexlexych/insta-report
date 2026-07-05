'use client';

import Link from 'next/link';

import { PlaceholderPage } from '@/components/miniapp/PlaceholderPage';
import { useT } from '@/lib/i18n';

export default function MiniAppPage() {
  const { t } = useT();

  return (
    <PlaceholderPage titleKey="pageDashboardTitle">
      <Link className="mt-4 block rounded-xl bg-tg-button px-4 py-3 text-center font-medium text-tg-button-text" href="/app/connect-instagram">
        {t('onboardingConnectInstagram')}
      </Link>
    </PlaceholderPage>
  );
}
