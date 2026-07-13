'use client';

import {
  init,
  miniApp,
  retrieveLaunchParams,
  retrieveRawInitData,
  themeParams,
  useLaunchParams,
  viewport,
} from '@telegram-apps/sdk-react';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { I18nProvider, resolveLocale, t, useT, type Locale } from '@/lib/i18n';

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
  businessSphere?: string | null;
  knowledgeBase?: string | null;
  uiLocale?: Locale;
  tgTopicsEnabled?: boolean;
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
    () =>
      resolveLocale(
        launchParams.tgWebAppData?.user?.language_code ??
          launchParams.tgWebAppData?.user?.languageCode,
      ),
    [
      launchParams.tgWebAppData?.user?.language_code,
      launchParams.tgWebAppData?.user?.languageCode,
    ],
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
      <button
        className="rounded-xl bg-tg-button px-5 py-3 font-medium text-tg-button-text"
        type="button"
        onClick={onRetry}
      >
        {t('de', 'retry')}
      </button>
    </main>
  );
}

function TenantProvider({ children }: { children: ReactNode }) {
  const { setLocale } = useT();
  const launchParams = useLaunchParams(true);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [state, setState] = useState<Omit<TenantContextValue, 'retry'>>({
    status: 'loading',
    tenant: null,
  });
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
        const payload = (await response.json()) as { tenant?: MiniAppTenant; tgLocale?: Locale };
        if (!payload.tenant) throw new Error('Mini App auth response missing tenant');
        // До завершения онбординга язык всегда берётся из Telegram (сервер-авторитетный
        // tgLocale, не зависит от формы клиентского SDK). После онбординга — из
        // сохранённого выбора тенанта (ui_locale).
        if (payload.tenant.onboardingStep === 'done') {
          if (payload.tenant.uiLocale) setLocale(payload.tenant.uiLocale);
        } else if (payload.tgLocale) {
          setLocale(payload.tgLocale);
        }
        setState({ status: 'ready', tenant: payload.tenant });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error', tenant: null });
      }
    }

    void authenticate();
    return () => controller.abort();
  }, [authAttempt, setLocale]);

  const pathname = usePathname();
  const router = useRouter();
  const didInitialRouteRef = useRef(false);

  // Одноразовая маршрутизация сразу после аутентификации: новичка (онбординг
  // ещё не завершён) один раз отправляем на онбординг, а уже завершившего —
  // уводим с него на дашборд. Дальше НЕ вмешиваемся: иначе любая навигация по
  // нижнему меню во время онбординга мгновенно откатывается назад на онбординг
  // (пункты меню «мигают» и возвращают на приветствие).
  useEffect(() => {
    if (state.status !== 'ready') return;
    const tenant = state.tenant;
    if (!tenant) return;
    if (didInitialRouteRef.current) return;
    didInitialRouteRef.current = true;

    const isOnboarding = pathname === '/app/onboarding';
    const isDone = tenant.onboardingStep === 'done';
    const startParam = launchParams.tgWebAppStartParam;

    if (startParam === 'connect') {
      router.replace('/app/connect-instagram');
      return;
    }

    if (!isDone && !isOnboarding) {
      router.replace('/app/onboarding');
    } else if (isDone && isOnboarding) {
      router.replace('/app');
    }
  }, [launchParams.tgWebAppStartParam, pathname, router, state]);

  const value = useMemo<TenantContextValue>(
    () => ({ ...state, retry }) as TenantContextValue,
    [retry, state],
  );

  let content: ReactNode = children;
  if (state.status === 'error') content = <AuthErrorScreen onRetry={retry} />;
  if (state.status === 'loading') content = null;

  return <TenantContext.Provider value={value}>{content}</TenantContext.Provider>;
}

export function TmaProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [isTelegram, setIsTelegram] = useState<boolean | null>(null);

  useEffect(() => {
    // 1) Детекция Telegram-окружения НЕЗАВИСИМО от побочных эффектов init().
    //    retrieveLaunchParams() читает launch params из hash/sessionStorage и
    //    бросает, только если мы реально не внутри Telegram.
    let inTelegram = false;
    try {
      retrieveLaunchParams();
      inTelegram = true;
    } catch {
      inTelegram = false;
    }

    if (!inTelegram) {
      setIsTelegram(false);
      return;
    }
    setIsTelegram(true);

    // 2) Инициализация и монтирование компонентов. Любой сбой ЗДЕСЬ не должен
    //    переводить приложение в fallback — мы уже знаем, что мы в Telegram.
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      try {
        init();

        if (miniApp.mount.isAvailable()) miniApp.mount();
        if (themeParams.mount.isAvailable()) themeParams.mount();
        if (viewport.mount.isAvailable()) await viewport.mount();

        if (miniApp.ready.isAvailable()) miniApp.ready();
        if (viewport.expand.isAvailable()) viewport.expand();

        applyTheme(themeParams.state() as TelegramTheme);
        unsubscribe = themeParams.state.sub(() => applyTheme(themeParams.state() as TelegramTheme));
      } catch (error) {
        console.error('[TmaProvider] Telegram SDK init failed', error);
      } finally {
        if (!cancelled) setIsReady(true);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  if (isTelegram === false) {
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
