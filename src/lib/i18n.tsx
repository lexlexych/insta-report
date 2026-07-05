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
    onboardingWelcomeTitle: 'Добро пожаловать в InstaReply',
    onboardingPointFast: 'Создадим базу знаний для быстрых и точных ответов клиентам.',
    onboardingPointKnowledge: 'Ассистент будет учитывать услуги, цены, адрес, часы и тон общения.',
    onboardingPointTelegram: 'Черновики ответов будут приходить владельцу прямо в Telegram.',
    onboardingStart: 'Начать',
    onboardingOrgTitle: 'Расскажите о компании',
    onboardingOrgName: 'Название организации',
    onboardingOrgNameError: 'Введите минимум 2 символа.',
    onboardingOrgDescription: 'Расскажите о бизнесе',
    onboardingOrgDescriptionPlaceholder: 'Например: услуги, цены, адрес, часы работы, тон общения и частые вопросы клиентов.',
    onboardingOrgDescriptionError: 'Описание должно быть не короче {min} символов.',
    onboardingGenerate: 'Сгенерировать базу знаний',
    onboardingGeneratingTitle: 'Готовим базу знаний',
    onboardingGenAnalyze: 'Анализируем описание бизнеса…',
    onboardingGenStructure: 'Структурируем услуги и правила ответов…',
    onboardingGenTone: 'Настраиваем тон общения…',
    onboardingGenerateError: 'Не удалось сгенерировать базу знаний. Попробуйте ещё раз.',
    onboardingGenerateToast: 'Генерация прервалась — можно повторить.',
    onboardingReviewTitle: 'Проверьте базу знаний',
    onboardingEdit: 'Редактировать',
    onboardingPreview: 'Предпросмотр',
    onboardingApprove: 'Всё верно',
    onboardingSaving: 'Сохраняем…',
    onboardingDoneTitle: 'Готово! База знаний сохранена',
    onboardingDoneHint: 'Теперь можно подключить Instagram или проверить ответы в тест-чате.',
    onboardingConnectInstagram: 'Подключить Instagram',
    onboardingTrySimulator: 'Попробовать тест-чат',
    igIntro: 'Пройдите шаги ниже, чтобы связать Instagram-аккаунт с InstaReply.',
    igLoading: 'Загрузка…',
    igLoadError: 'Не удалось загрузить статус подключения.',
    igStepMetaAppTitle: 'Создайте приложение Meta',
    igStepMetaAppBody: 'Перейдите на developers.facebook.com → My Apps → Create App. Выберите тип «Business» и завершите создание приложения.',
    igStepProductTitle: 'Добавьте продукт Instagram',
    igStepProductBody: 'В настройках приложения добавьте продукт Instagram → «API setup with Instagram business login».',
    igStepLinkAccountTitle: 'Привяжите ваш профессиональный аккаунт Instagram',
    igStepLinkAccountBody: 'В разделе API setup привяжите свой аккаунт Instagram. Аккаунт должен быть типа Business или Creator.',
    igStepTokenTitle: 'Сгенерируйте токен доступа',
    igStepTokenBody: 'В разделе API setup нажмите кнопку Generate token и дождитесь появления токена.',
    igStepTokenWarning: 'Токен показывается только один раз — обязательно скопируйте его, прежде чем закрыть окно.',
    igStepWebhookTitle: 'Настройте Webhooks',
    igStepWebhookBody: 'В настройках Webhooks укажите наши значения Callback URL и Verify Token.',
    igStepWebhookCallbackLabel: 'Callback URL',
    igStepWebhookVerifyLabel: 'Verify Token',
    igStepWebhookSubscribeHint: 'Не забудьте подписаться на поле messages.',
    igStepFormTitle: 'Введите данные ниже',
    igStepFormBody: 'App Secret находится в App settings → Basic. Access Token вы скопировали на предыдущем шаге.',
    igFieldAppSecret: 'App Secret',
    igFieldAppSecretHint: 'App settings → Basic',
    igFieldAccessToken: 'Access Token',
    igFieldMinLengthError: 'Минимум {min} символов.',
    igFieldShow: 'Показать',
    igFieldHide: 'Скрыть',
    igFieldReplace: 'Заменить',
    igSaveButton: 'Сохранить',
    igSaving: 'Сохраняем…',
    igSaveError: 'Не удалось сохранить. Попробуйте ещё раз.',
    igCopy: 'Копировать',
    igCopied: 'Скопировано ✓',
    igGuideImagePlaceholder: 'Скриншот появится здесь',
    igDiagnosticsPlaceholder: 'Проверка появится здесь',
    igDiagnosticsTitle: 'Диагностика подключения',
    igDiagnosticsRefresh: 'Обновить',
    igDiagnosticsRefreshing: 'Обновляем…',
    igDiagnosticsLoadError: 'Не удалось обновить диагностику. Попробуйте ещё раз.',
    igDiagnosticsNotConfigured: 'Сначала сохраните токен доступа и App Secret.',
    igCheck_token: 'Токен доступа',
    igCheck_handshake: 'Вебхук подтверждён (handshake)',
    igCheck_event: 'Событие получено',
    igCheck_token_hint: 'Токен недействителен или отозван — сгенерируйте новый в Meta App Dashboard',
    igCheck_handshake_hint: 'Проверьте, что Callback URL и Verify Token вставлены без пробелов, и нажмите Verify and Save в Meta Dashboard',
    igCheck_event_hint: 'Отправьте сообщение вашему аккаунту c другого профиля Instagram и нажмите Обновить',
    igDiagnosticsAllOk: 'Подключение работает! @{username}',
    igDiagnosticsDashboard: 'На дашборд',
    igStatusBadgeOk: 'Instagram подключён: @{username}',
    igStatusBadgeNeedsSetup: 'Instagram требует настройки',
    igStatusBadgeOpen: 'Открыть',
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
    onboardingWelcomeTitle: 'Willkommen bei InstaReply',
    onboardingPointFast: 'Wir erstellen eine Wissensbasis für schnelle und präzise Kundenantworten.',
    onboardingPointKnowledge: 'Der Assistent berücksichtigt Leistungen, Preise, Adresse, Öffnungszeiten und Tonalität.',
    onboardingPointTelegram: 'Antwortentwürfe kommen direkt in Telegram beim Inhaber an.',
    onboardingStart: 'Starten',
    onboardingOrgTitle: 'Erzähl uns vom Unternehmen',
    onboardingOrgName: 'Name der Organisation',
    onboardingOrgNameError: 'Gib mindestens 2 Zeichen ein.',
    onboardingOrgDescription: 'Beschreibe dein Business',
    onboardingOrgDescriptionPlaceholder: 'Zum Beispiel: Leistungen, Preise, Adresse, Öffnungszeiten, Tonalität und häufige Fragen.',
    onboardingOrgDescriptionError: 'Die Beschreibung muss mindestens {min} Zeichen lang sein.',
    onboardingGenerate: 'Wissensbasis generieren',
    onboardingGeneratingTitle: 'Wissensbasis wird vorbereitet',
    onboardingGenAnalyze: 'Wir analysieren die Beschreibung…',
    onboardingGenStructure: 'Wir strukturieren Leistungen und Antwortregeln…',
    onboardingGenTone: 'Wir stimmen die Tonalität ab…',
    onboardingGenerateError: 'Die Wissensbasis konnte nicht generiert werden. Bitte versuche es erneut.',
    onboardingGenerateToast: 'Die Generierung wurde unterbrochen — du kannst es erneut versuchen.',
    onboardingReviewTitle: 'Prüfe die Wissensbasis',
    onboardingEdit: 'Bearbeiten',
    onboardingPreview: 'Vorschau',
    onboardingApprove: 'Alles korrekt',
    onboardingSaving: 'Speichern…',
    onboardingDoneTitle: 'Fertig! Die Wissensbasis ist gespeichert',
    onboardingDoneHint: 'Verbinde jetzt Instagram oder teste die Antworten im Testchat.',
    onboardingConnectInstagram: 'Instagram verbinden',
    onboardingTrySimulator: 'Testchat ausprobieren',
    igIntro: 'Folge den Schritten unten, um dein Instagram-Konto mit InstaReply zu verbinden.',
    igLoading: 'Wird geladen…',
    igLoadError: 'Der Verbindungsstatus konnte nicht geladen werden.',
    igStepMetaAppTitle: 'Erstelle eine Meta-App',
    igStepMetaAppBody: 'Gehe zu developers.facebook.com → My Apps → Create App. Wähle den Typ „Business“ und schließe die Erstellung der App ab.',
    igStepProductTitle: 'Füge das Produkt Instagram hinzu',
    igStepProductBody: 'Füge in den App-Einstellungen das Produkt Instagram hinzu → „API setup with Instagram business login“.',
    igStepLinkAccountTitle: 'Verknüpfe dein professionelles Instagram-Konto',
    igStepLinkAccountBody: 'Verknüpfe im Bereich API setup dein Instagram-Konto. Das Konto muss vom Typ Business oder Creator sein.',
    igStepTokenTitle: 'Generiere ein Zugriffstoken',
    igStepTokenBody: 'Klicke im Bereich API setup auf Generate token und warte, bis das Token erscheint.',
    igStepTokenWarning: 'Das Token wird nur einmal angezeigt — kopiere es unbedingt, bevor du das Fenster schließt.',
    igStepWebhookTitle: 'Richte Webhooks ein',
    igStepWebhookBody: 'Trage in den Webhook-Einstellungen unsere Werte für Callback URL und Verify Token ein.',
    igStepWebhookCallbackLabel: 'Callback URL',
    igStepWebhookVerifyLabel: 'Verify Token',
    igStepWebhookSubscribeHint: 'Vergiss nicht, das Feld messages zu abonnieren.',
    igStepFormTitle: 'Gib die Daten unten ein',
    igStepFormBody: 'Das App Secret findest du unter App settings → Basic. Das Access Token hast du im vorherigen Schritt kopiert.',
    igFieldAppSecret: 'App Secret',
    igFieldAppSecretHint: 'App settings → Basic',
    igFieldAccessToken: 'Access Token',
    igFieldMinLengthError: 'Mindestens {min} Zeichen.',
    igFieldShow: 'Anzeigen',
    igFieldHide: 'Verbergen',
    igFieldReplace: 'Ersetzen',
    igSaveButton: 'Speichern',
    igSaving: 'Wird gespeichert…',
    igSaveError: 'Speichern fehlgeschlagen. Bitte versuche es erneut.',
    igCopy: 'Kopieren',
    igCopied: 'Kopiert ✓',
    igGuideImagePlaceholder: 'Screenshot erscheint hier',
    igDiagnosticsPlaceholder: 'Die Prüfung erscheint hier',
    igDiagnosticsTitle: 'Verbindungsdiagnose',
    igDiagnosticsRefresh: 'Aktualisieren',
    igDiagnosticsRefreshing: 'Aktualisiert…',
    igDiagnosticsLoadError: 'Die Diagnose konnte nicht aktualisiert werden. Bitte versuche es erneut.',
    igDiagnosticsNotConfigured: 'Speichere zuerst Zugriffstoken und App Secret.',
    igCheck_token: 'Zugriffstoken',
    igCheck_handshake: 'Webhook bestätigt (Handshake)',
    igCheck_event: 'Ereignis empfangen',
    igCheck_token_hint: 'Das Token ist ungültig oder widerrufen — erstelle ein neues im Meta App Dashboard.',
    igCheck_handshake_hint: 'Prüfe, dass Callback URL und Verify Token ohne Leerzeichen eingetragen sind, und klicke Verify and Save im Meta Dashboard.',
    igCheck_event_hint: 'Sende deinem Konto eine Nachricht von einem anderen Instagram-Profil und klicke Aktualisieren.',
    igDiagnosticsAllOk: 'Verbindung funktioniert! @{username}',
    igDiagnosticsDashboard: 'Zum Dashboard',
    igStatusBadgeOk: 'Instagram verbunden: @{username}',
    igStatusBadgeNeedsSetup: 'Instagram muss eingerichtet werden',
    igStatusBadgeOpen: 'Öffnen',
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
