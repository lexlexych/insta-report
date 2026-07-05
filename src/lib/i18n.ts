export type Locale = 'ru' | 'de';

const dictionary = {
  ru: {
    tgStart: 'Привет! Я помогу отвечать клиентам из Instagram Direct. Откройте панель, чтобы продолжить настройку.',
    openPanel: 'Открыть панель',
  },
  de: {
    tgStart: 'Hallo! Ich helfe dir, Kundinnen und Kunden in Instagram Direct zu antworten. Öffne das Panel, um die Einrichtung fortzusetzen.',
    openPanel: 'Panel öffnen',
  },
} satisfies Record<Locale, Record<string, string>>;

export type I18nKey = keyof (typeof dictionary)['ru'];

export function resolveLocale(languageCode: string | undefined): Locale {
  return languageCode?.toLowerCase().startsWith('de') ? 'de' : 'ru';
}

export function t(locale: Locale, key: I18nKey): string {
  return dictionary[locale][key];
}
