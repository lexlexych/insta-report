'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { t, type Locale } from './i18n/shared';
export { dictionary, resolveLocale, t, type I18nKey, type Locale } from './i18n/shared';

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
