'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'ru' | 'de';

type Dictionary = Record<Locale, Record<string, string>>;

export const dictionary: Dictionary = {
  ru: {
    tgStart: 'Привет! Я помогу отвечать клиентам из Instagram Direct. Откройте панель, чтобы продолжить настройку.',
    openPanel: 'Открыть панель',
    miniAppOpenInTelegram: 'Откройте приложение через Telegram-бота @{botUsername}',
    miniAppOpenHint: 'Эта панель работает только внутри Telegram Mini App.',
    navDashboard: 'Дашборд',
    navSimulator: 'Тест-чат',
    navLabels: 'Категории',
    navSettings: 'Настройки',
    pageDashboardTitle: 'Дашборд',
    pageSimulatorTitle: 'Тест-чат',
    pageLabelsTitle: 'Категории',
    pageSettingsTitle: 'Настройки',
    pageOnboardingTitle: 'Онбординг',
    pageConnectInstagramTitle: 'Подключение Instagram',
    pageUnderConstruction: 'Раздел «{section}» в разработке.',
    miniAppAuthErrorTitle: 'Не удалось войти',
    miniAppAuthErrorHint: 'Проверьте, что приложение открыто из Telegram, и попробуйте ещё раз.',
    retry: 'Повторить',
  },
  de: {
    tgStart: 'Hallo! Ich helfe dir, Kundinnen und Kunden in Instagram Direct zu antworten. Öffne das Panel, um die Einrichtung fortzusetzen.',
    openPanel: 'Panel öffnen',
    miniAppOpenInTelegram: 'Öffne die App über den Telegram-Bot @{botUsername}',
    miniAppOpenHint: 'Dieses Panel funktioniert nur innerhalb der Telegram Mini App.',
    navDashboard: 'Dashboard',
    navSimulator: 'Testchat',
    navLabels: 'Kategorien',
    navSettings: 'Einstellungen',
    pageDashboardTitle: 'Dashboard',
    pageSimulatorTitle: 'Testchat',
    pageLabelsTitle: 'Kategorien',
    pageSettingsTitle: 'Einstellungen',
    pageOnboardingTitle: 'Onboarding',
    pageConnectInstagramTitle: 'Instagram verbinden',
    pageUnderConstruction: 'Der Bereich „{section}“ ist in Entwicklung.',
    miniAppAuthErrorTitle: 'Anmeldung fehlgeschlagen',
    miniAppAuthErrorHint: 'Bitte öffne die App aus Telegram und versuche es erneut.',
    retry: 'Wiederholen',
  },
} satisfies Dictionary;

export type I18nKey = keyof (typeof dictionary)['ru'];

export function resolveLocale(languageCode: string | undefined): Locale {
  return languageCode?.toLowerCase().startsWith('ru') ? 'ru' : 'de';
}

export function t(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = dictionary[locale][key] ?? key;

  if (template === key && !(key in dictionary[locale])) {
    console.warn(`Missing i18n key: ${key}`);
  }

  return template.replaceAll(/\{([a-zA-Z0-9_]+)\}/g, (match: string, varName: string) => {
    const value = vars?.[varName];
    return value === undefined ? match : String(value);
  });
}

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children, initialLocale = 'de' }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const translate = useCallback((key: string, vars?: Record<string, string | number>) => t(locale, key, vars), [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: translate }), [locale, translate]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nContextValue {
  const value = useContext(I18nContext);

  if (!value) {
    throw new Error('useT must be used within I18nProvider');
  }

  return value;
}
