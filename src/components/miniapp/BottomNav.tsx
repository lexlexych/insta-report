'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { useT } from '@/lib/i18n';
import { useTenant } from './TmaProvider';

type NavItem = {
  href: string;
  labelKey: string;
  icon: ReactNode;
};

const iconClass = 'h-5 w-5';

const items: NavItem[] = [
  { href: '/app', labelKey: 'navDashboard', icon: <DashboardIcon /> },
  { href: '/app/simulator', labelKey: 'navSimulator', icon: <ChatIcon /> },
  { href: '/app/labels', labelKey: 'navLabels', icon: <LabelsIcon /> },
  { href: '/app/settings', labelKey: 'navSettings', icon: <SettingsIcon /> },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useT();
  const tenant = useTenant();

  if (tenant.status !== 'ready' || tenant.tenant.onboardingStep !== 'done') return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-tg-secondary-bg bg-tg-bg px-2 pb-3 pt-2 text-tg-hint">
      <ul className="mx-auto grid max-w-xl grid-cols-4 gap-1">
        {items.map((item) => {
          const active = pathname === item.href;

          return (
            <li key={item.href}>
              <Link
                className={`flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-xs font-medium ${active ? 'text-tg-link' : 'text-tg-hint'}`}
                href={item.href}
              >
                {item.icon}
                <span>{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function DashboardIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 13h7V4H4v9Zm9 7h7V4h-7v16ZM4 20h7v-5H4v5Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v5A3.5 3.5 0 0 1 15.5 15H12l-4.5 4v-4A3.5 3.5 0 0 1 5 11.5v-5Z" />
    </svg>
  );
}

function LabelsIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5A3.5 3.5 0 0 1 7.5 4H12l8 8-8 8H7.5A3.5 3.5 0 0 1 4 16.5v-9Z" />
      <path d="M8 9h.01" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a8 8 0 0 0 0-6l2-1.5-2-3.5-2.4 1a8 8 0 0 0-5.2-3L11.5 0h-4l-.3 2a8 8 0 0 0-5.2 3L-.4 4l-2 3.5L-.4 9a8 8 0 0 0 0 6l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 5.2 3l.3 2h4l.3-2a8 8 0 0 0 5.2-3l2.4 1 2-3.5-2-1.5Z" transform="translate(2.5) scale(.8)" />
    </svg>
  );
}
