'use client';

import { retrieveLaunchParams } from '@telegram-apps/sdk-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ConnectionDiagnostics } from '@/components/miniapp/ConnectionDiagnostics';
import { CopyField } from '@/components/miniapp/CopyField';
import { GuideScreenshot } from '@/components/miniapp/GuideScreenshot';
import { GuideStep } from '@/components/miniapp/GuideStep';
import { useT } from '@/lib/i18n';

declare global {
  interface Window {
    Telegram?: { WebApp?: { openLink?: (url: string) => void } };
  }
}

// На мобильных клиентах Telegram miniapp открывается в полноценном webview, и OAuth
// можно пройти обычной навигацией текущей страницы. На Telegram Web miniapp — iframe,
// а instagram.com запрещает framing, поэтому там оставляем внешнее открытие ссылки.
function isMobileTelegram(): boolean {
  try {
    const launchParams = retrieveLaunchParams() as { tgWebAppPlatform?: unknown } | null | undefined;
    const platform = typeof launchParams?.tgWebAppPlatform === 'string' ? launchParams.tgWebAppPlatform : '';
    return platform === 'ios' || platform === 'android' || platform === 'android_x';
  } catch {
    return false;
  }
}

type ConnectState = {
  status: 'pending' | 'active' | 'error';
  igUsername: string | null;
  webhookUrl: string;
  verifyToken: string;
  hasToken: boolean;
  hasSecret: boolean;
  webhookLastSeenAt: string | null;
  handshakeAt: string | null;
  businessLoginEnabled: boolean;
  connectionMode: 'own_app' | 'platform_app';
};

const TOKEN_MIN_LENGTH = 10;

function PasswordField({
  id,
  label,
  hint,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}) {
  const { t } = useT();
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {hint ? <span className="block text-xs text-tg-hint">{hint}</span> : null}
      <div className="flex items-center gap-2">
        <input
          autoComplete="off"
          className="w-full min-w-0 flex-1 rounded-xl border bg-transparent p-3"
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <button className="shrink-0 rounded-lg border px-3 py-2 text-xs" type="button" onClick={() => setVisible((current) => !current)}>
          {visible ? t('igFieldHide') : t('igFieldShow')}
        </button>
      </div>
      {error ? <span className="block text-sm text-red-600">{error}</span> : null}
    </div>
  );
}

function MaskedField({ label, hint, onReplace }: { label: string; hint?: string; onReplace: () => void }) {
  const { t } = useT();

  return (
    <div className="space-y-1">
      <span className="block text-sm font-medium">{label}</span>
      {hint ? <span className="block text-xs text-tg-hint">{hint}</span> : null}
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 rounded-xl border bg-transparent p-3 font-mono text-tg-hint">••••••••</span>
        <button className="shrink-0 rounded-lg border px-3 py-2 text-xs" type="button" onClick={onReplace}>
          {t('igFieldReplace')}
        </button>
      </div>
    </div>
  );
}


function ManualShell({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { t } = useT();
  if (!enabled) return <>{children}</>;
  return (
    <details className="rounded-2xl border p-3">
      <summary className="cursor-pointer font-medium">{t('igManualAdvancedTitle')}</summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

export default function Page() {
  const { t } = useT();
  const [state, setState] = useState<ConnectState | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [openStep, setOpenStep] = useState(1);
  const [accessToken, setAccessToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [editToken, setEditToken] = useState(true);
  const [editSecret, setEditSecret] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveDone, setSaveDone] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState(false);
  const [oauthResult, setOauthResult] = useState<'denied' | 'error' | null>(null);
  const diagnosticsRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch('/api/miniapp/ig/connect');
      if (!response.ok) throw new Error('load_failed');
      const payload = (await response.json()) as ConnectState;
      setState(payload);
      setEditToken(!payload.hasToken);
      setEditSecret(!payload.hasSecret);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleStep = useCallback((index: number) => {
    setOpenStep((current) => (current === index ? 0 : index));
  }, []);

  // Краевой случай: поле не должно валидироваться/уходить в запрос, пока не заполнено —
  // ошибка показывается только когда пользователь начал вводить значение.
  const tokenFilled = accessToken.trim().length > 0;
  const secretFilled = appSecret.trim().length > 0;
  const tokenError = tokenFilled && accessToken.trim().length < TOKEN_MIN_LENGTH ? t('igFieldMinLengthError', { min: TOKEN_MIN_LENGTH }) : null;
  const secretError = secretFilled && appSecret.trim().length < TOKEN_MIN_LENGTH ? t('igFieldMinLengthError', { min: TOKEN_MIN_LENGTH }) : null;

  // Форма не отправляется с пустыми полями и не отправляется, если заполненное поле короче лимита.
  const isValid = useMemo(() => {
    const hasAnyInput = tokenFilled || secretFilled;
    const tokenOk = !tokenFilled || accessToken.trim().length >= TOKEN_MIN_LENGTH;
    const secretOk = !secretFilled || appSecret.trim().length >= TOKEN_MIN_LENGTH;
    return hasAnyInput && tokenOk && secretOk;
  }, [accessToken, appSecret, secretFilled, tokenFilled]);

  const openBusinessLogin = useCallback(async () => {
    setOauthLoading(true);
    setOauthError(false);
    try {
      const embedded = isMobileTelegram();
      const response = await fetch(embedded ? '/api/miniapp/ig/login-url?embedded=1' : '/api/miniapp/ig/login-url');
      if (!response.ok) throw new Error('login_url_failed');
      const payload = (await response.json()) as { url: string };
      if (embedded) {
        // Навигация текущей страницы внутри webview miniapp — вернёмся сюда через redirect из callback.
        window.location.assign(payload.url);
        return;
      }
      const webApp = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;
      if (webApp?.openLink) webApp.openLink(payload.url);
      else window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch {
      setOauthError(true);
    } finally {
      setOauthLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('ig');
    if (result === 'denied' || result === 'error') {
      setOauthResult(result);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  const submit = useCallback(async () => {
    if (!isValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body: Record<string, string> = {};
      if (tokenFilled) body.accessToken = accessToken.trim();
      if (secretFilled) body.appSecret = appSecret.trim();

      const response = await fetch('/api/miniapp/ig/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('save_failed');

      setAccessToken('');
      setAppSecret('');
      setSaveDone(true);
      await load();
      requestAnimationFrame(() => diagnosticsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch {
      setSaveError(t('igSaveError'));
    } finally {
      setSaving(false);
    }
  }, [accessToken, appSecret, isValid, load, secretFilled, t, tokenFilled]);

  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-tg-hint">{t('igLoadError')}</p>
        <button className="rounded-xl bg-tg-button px-5 py-3 font-medium text-tg-button-text" type="button" onClick={() => void load()}>
          {t('retry')}
        </button>
      </main>
    );
  }

  if (!state) {
    return <main className="flex min-h-screen items-center justify-center text-tg-hint">{t('igLoading')}</main>;
  }

  const formDone = state.hasToken && state.hasSecret;
  const showSubmit = editToken || editSecret;

  return (
    <main className="mx-auto max-w-xl space-y-4 px-5 py-8">
      <h1 className="text-2xl font-bold">{t('pageConnectInstagramTitle')}</h1>
      <p className="text-sm text-tg-hint">{t('igIntro')}</p>

      {state.businessLoginEnabled ? (
        <section className="space-y-3 rounded-2xl border bg-white/60 p-4 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">{t('igBusinessLoginTitle')}</h2>
            <p className="text-sm text-tg-hint">{state.connectionMode === 'platform_app' && state.igUsername ? t('igBusinessLoginConnected', { username: state.igUsername }) : t('igBusinessLoginBody')}</p>
          </div>
          {oauthError ? <p className="text-sm text-red-600">{t('igBusinessLoginError')}</p> : null}
          {oauthResult === 'denied' ? <p className="text-sm text-tg-hint">{t('igOauthResultDenied')}</p> : null}
          {oauthResult === 'error' ? <p className="text-sm text-red-600">{t('igOauthResultError')}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button className="rounded-xl bg-tg-button px-4 py-3 font-medium text-tg-button-text disabled:opacity-50" disabled={oauthLoading} type="button" onClick={() => void openBusinessLogin()}>
              {state.connectionMode === 'platform_app' ? t('igBusinessLoginReconnect') : t('igBusinessLoginButton')}
            </button>
            <button className="rounded-xl border px-4 py-3 font-medium" type="button" onClick={() => void load()}>
              {t('igBusinessLoginCheck')}
            </button>
          </div>
        </section>
      ) : null}

      <ManualShell enabled={state.businessLoginEnabled}>
      <GuideStep index={1} isOpen={openStep === 1} title={t('igStepMetaAppTitle')} onToggle={() => toggleStep(1)}>
        <p>{t('igStepMetaAppBody')}</p>
        <GuideScreenshot alt={t('igStepMetaAppTitle')} src="/guide/step1.png" />
      </GuideStep>

      <GuideStep index={2} isOpen={openStep === 2} title={t('igStepProductTitle')} onToggle={() => toggleStep(2)}>
        <p>{t('igStepProductBody')}</p>
        <GuideScreenshot alt={t('igStepProductTitle')} src="/guide/step2.png" />
      </GuideStep>

      <GuideStep index={3} isOpen={openStep === 3} title={t('igStepLinkAccountTitle')} onToggle={() => toggleStep(3)}>
        <p>{t('igStepLinkAccountBody')}</p>
      </GuideStep>

      <GuideStep index={4} isOpen={openStep === 4} title={t('igStepTokenTitle')} onToggle={() => toggleStep(4)}>
        <p>{t('igStepTokenBody')}</p>
        <p className="rounded-xl bg-red-500/10 p-3 text-red-600">{t('igStepTokenWarning')}</p>
      </GuideStep>

      <GuideStep index={5} isOpen={openStep === 5} title={t('igStepWebhookTitle')} onToggle={() => toggleStep(5)}>
        <p>{t('igStepWebhookBody')}</p>
        <CopyField label={t('igStepWebhookCallbackLabel')} value={state.webhookUrl} />
        <CopyField label={t('igStepWebhookVerifyLabel')} value={state.verifyToken} />
        <p className="text-xs text-tg-hint">{t('igStepWebhookSubscribeHint')}</p>
      </GuideStep>

      <GuideStep index={6} isDone={formDone} isOpen={openStep === 6} title={t('igStepFormTitle')} onToggle={() => toggleStep(6)}>
        <p>{t('igStepFormBody')}</p>

        {state.hasSecret && !editSecret ? (
          <MaskedField hint={t('igFieldAppSecretHint')} label={t('igFieldAppSecret')} onReplace={() => setEditSecret(true)} />
        ) : (
          <PasswordField error={secretError} hint={t('igFieldAppSecretHint')} id="ig-app-secret" label={t('igFieldAppSecret')} value={appSecret} onChange={setAppSecret} />
        )}

        {state.hasToken && !editToken ? (
          <MaskedField label={t('igFieldAccessToken')} onReplace={() => setEditToken(true)} />
        ) : (
          <PasswordField error={tokenError} id="ig-access-token" label={t('igFieldAccessToken')} value={accessToken} onChange={setAccessToken} />
        )}

        {saveError ? <p className="text-sm text-red-600">{saveError}</p> : null}

        {showSubmit ? (
          <button
            className="w-full rounded-xl bg-tg-button p-3 font-medium text-tg-button-text disabled:opacity-50"
            disabled={!isValid || saving}
            type="button"
            onClick={() => void submit()}
          >
            {saving ? t('igSaving') : t('igSaveButton')}
          </button>
        ) : null}
      </GuideStep>

      {saveDone || formDone ? (
        <div ref={diagnosticsRef}>
          <ConnectionDiagnostics />
        </div>
      ) : null}

      </ManualShell>
    </main>
  );
}
