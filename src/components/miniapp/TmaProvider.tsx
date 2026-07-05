'use client';

import { init, miniApp, retrieveRawInitData, themeParams, useLaunchParams, viewport } from '@telegram-apps/sdk-react';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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

type TenantContextValue =
  | { status: 'loading'; tenant: null; retry: () => void }
  | { status: 'ready'; tenant: MiniAppTenant; retry: () => void }
  | { status: 'error'; tenant: null; retry: () => void };

export type MiniAppTenant = {
  id: string;
  onboardingStep: string | null;
  orgName: string | null;
};

const BOT_USERNAME = 'InstaReplyBot';
const TenantContext = createContext<TenantContextValue | null>(null);

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

function AuthErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tg-bg p-6 text-center text-tg-text">
      <h1 className="text-xl font-semibold">{t('de', 'miniAppAuthErrorTitle')}</h1>
      <p className="max-w-sm text-sm text-tg-hint">{t('de', 'miniAppAuthErrorHint')}</p>
      <button className="rounded-xl bg-tg-button px-5 py-3 font-medium text-tg-button-text" type="button" onClick={onRetry}>
        {t('de', 'retry')}
      </button>
    </main>
  );
}

function TenantProvider({ children }: { children: ReactNode }) {
  const [authAttempt, setAuthAttempt] = useState(0);
  const [state, setState] = useState<Omit<TenantContextValue, 'retry'>>({ status: 'loading', tenant: null });
  const retry = useCallback(() => {
    setState({ status: 'loading', tenant: null });
    setAuthAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function authenticate() {
      const initData = retrieveRawInitData();
      if (!initData) {
        setState({ status: 'error', tenant: null });
        return;
      }

      try {
        const response = await fetch('/api/miniapp/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Mini App auth failed');
        const payload = (await response.json()) as { tenant?: MiniAppTenant };
        if (!payload.tenant) throw new Error('Mini App auth response missing tenant');
        setState({ status: 'ready', tenant: payload.tenant });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error', tenant: null });
      }
    }

    void authenticate();
    return () => controller.abort();
  }, [authAttempt]);

  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (state.status !== 'ready') return;
    const tenant = state.tenant;
    if (!tenant) return;
    const isOnboarding = pathname === '/app/onboarding';
    const isDone = tenant.onboardingStep === 'done';

    if (!isDone && !isOnboarding) {
      router.replace('/app/onboarding');
    }
    if (isDone && isOnboarding) {
      router.replace('/app');
    }
  }, [pathname, router, state]);

  const value = useMemo<TenantContextValue>(() => ({ ...state, retry }) as TenantContextValue, [retry, state]);

  let content: ReactNode = children;
  if (state.status === 'error') content = <AuthErrorScreen onRetry={retry} />;
  if (state.status === 'loading') content = null;

  return <TenantContext.Provider value={value}>{content}</TenantContext.Provider>;
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

  return (
    <LaunchParamsLocale>
      <TenantProvider>{children}</TenantProvider>
    </LaunchParamsLocale>
  );
}

export function useTenant(): TenantContextValue {
  const value = useContext(TenantContext);
  if (!value) throw new Error('useTenant must be used within TmaProvider');
  return value;
}
