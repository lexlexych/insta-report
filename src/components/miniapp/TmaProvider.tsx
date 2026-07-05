'use client';

import { init, miniApp, themeParams, useLaunchParams, viewport } from '@telegram-apps/sdk-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { I18nProvider, resolveLocale, t } from '@/lib/i18n';

type TelegramTheme = {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
};

const BOT_USERNAME = 'InstaReplyBot';

const cssVars: Record<keyof TelegramTheme, string> = {
  bg_color: '--bg',
  text_color: '--text',
  hint_color: '--hint',
  link_color: '--link',
  button_color: '--button',
  button_text_color: '--button-text',
  secondary_bg_color: '--secondary-bg',
};

function applyTheme(theme: TelegramTheme | undefined) {
  if (!theme) return;

  for (const [telegramKey, cssVar] of Object.entries(cssVars)) {
    const value = theme[telegramKey as keyof TelegramTheme];

    if (value) {
      document.documentElement.style.setProperty(cssVar, value);
    }
  }
}

function LaunchParamsLocale({ children }: { children: ReactNode }) {
  const launchParams = useLaunchParams();
  const locale = useMemo(
    () => resolveLocale(launchParams.initDataUnsafe?.user?.languageCode ?? launchParams.initDataUnsafe?.user?.language_code),
    [launchParams.initDataUnsafe?.user?.languageCode, launchParams.initDataUnsafe?.user?.language_code],
  );

  return <I18nProvider initialLocale={locale}>{children}</I18nProvider>;
}

function TelegramOnlyFallback() {
  const message = t('de', 'miniAppOpenInTelegram', { botUsername: BOT_USERNAME });
  const hint = t('de', 'miniAppOpenHint');

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-tg-bg p-6 text-center text-tg-text">
      <h1 className="text-xl font-semibold">{message}</h1>
      <p className="max-w-sm text-sm text-tg-hint">{hint}</p>
    </main>
  );
}

export function TmaProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState(true);

  useEffect(() => {
    try {
      init();
      miniApp.ready();
      viewport.expand();
      applyTheme(themeParams.state as TelegramTheme | undefined);
      const unsubscribe = themeParams.on('change', () => applyTheme(themeParams.state as TelegramTheme | undefined));
      setIsReady(true);

      return unsubscribe;
    } catch {
      setIsTelegram(false);
      return undefined;
    }
  }, []);

  if (!isTelegram) {
    return <TelegramOnlyFallback />;
  }

  if (!isReady) {
    return null;
  }

  return <LaunchParamsLocale>{children}</LaunchParamsLocale>;
}
