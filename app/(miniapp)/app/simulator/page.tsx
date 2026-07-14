'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { useT } from '@/lib/i18n';

type ChatMessage = {
  role: 'client' | 'assistant' | 'system';
  text: string;
  label?: string;
};

type ApiMessage = Pick<ChatMessage, 'role' | 'text'> & { role: 'client' | 'assistant' };

type SimulatorResponse = {
  draft?: string;
  label?: { name: string };
  code?: string;
};

const STORAGE_KEY = 'instareply:simulator:messages';
const HINT_KEY = 'instareply:simulator:hint-dismissed';
const EXAMPLES = ['simulatorExamplePrice', 'simulatorExampleAddress', 'simulatorExampleBooking'] as const;

function loadMessages(): ChatMessage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
    return Array.isArray(parsed)
      ? parsed.filter((message) => ['client', 'assistant', 'system'].includes(message.role) && typeof message.text === 'string')
      : [];
  } catch {
    return [];
  }
}

function loadHintDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(HINT_KEY) === '1';
}

function TypingIndicator() {
  return (
    <div className="flex max-w-[78%] self-start rounded-3xl rounded-bl-md bg-tg-secondary-bg px-4 py-3" aria-label="typing">
      <span className="flex gap-1">
        {[0, 1, 2].map((item) => (
          <span key={item} className="h-2 w-2 animate-bounce rounded-full bg-tg-hint" style={{ animationDelay: `${item * 120}ms` }} />
        ))}
      </span>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const { t } = useT();
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages());
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [lastClientText, setLastClientText] = useState<string | null>(null);
  const [hintDismissed, setHintDismissed] = useState(() => loadHintDismissed());
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const lineHeight = 24;
    textarea.style.height = `${Math.min(textarea.scrollHeight, lineHeight * 4 + 24)}px`;
  }, [input]);

  const apiHistory = useMemo(
    () => messages.filter((message): message is ApiMessage => message.role === 'client' || message.role === 'assistant'),
    [messages],
  );

  const dismissHint = useCallback(() => {
    window.localStorage.setItem(HINT_KEY, '1');
    setHintDismissed(true);
  }, []);

  const reset = useCallback(() => {
    if (!window.confirm(t('simulatorResetConfirm'))) return;
    setMessages([]);
    setInput('');
    setLastClientText(null);
    setNeedsOnboarding(false);
    window.sessionStorage.removeItem(STORAGE_KEY);
  }, [t]);

  const sendText = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isSending) return;

    setNeedsOnboarding(false);
    setIsSending(true);
    setLastClientText(text);
    setInput('');

    const nextHistory: ApiMessage[] = [...apiHistory, { role: 'client', text }];
    setMessages((current) => [...current, { role: 'client', text }]);

    try {
      const response = await fetch('/api/miniapp/simulator/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHistory }),
      });
      const payload = (await response.json().catch(() => ({}))) as SimulatorResponse;

      if (response.status === 409 && payload.code === 'onboarding_required') {
        setNeedsOnboarding(true);
        return;
      }

      if (response.status === 429 && payload.code === 'daily_limit') {
        setMessages((current) => [...current, { role: 'system', text: t('simulatorDailyLimit') }]);
        return;
      }

      if (!response.ok || !payload.draft) throw new Error(payload.code ?? 'simulator_failed');

      setMessages((current) => [
        ...current,
        { role: 'assistant', text: payload.draft ?? '', label: payload.label?.name ?? t('simulatorLabelFallback') },
      ]);
    } catch {
      setMessages((current) => [...current, { role: 'system', text: t('simulatorGenericError') }]);
    } finally {
      setIsSending(false);
    }
  }, [apiHistory, isSending, t]);

  const retry = useCallback(() => {
    if (lastClientText) void sendText(lastClientText);
  }, [lastClientText, sendText]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void sendText(input);
  }, [input, sendText]);

  if (needsOnboarding) {
    return (
      <main className="mx-auto flex min-h-full max-w-xl flex-col justify-center gap-5 bg-tg-bg px-5 py-8 text-tg-text">
        <p className="text-sm font-medium uppercase tracking-wide text-tg-link">InstaReply</p>
        <h1 className="text-3xl font-semibold">{t('simulatorOnboardingTitle')}</h1>
        <p className="text-tg-hint">{t('simulatorOnboardingHint')}</p>
        <button className="rounded-2xl bg-tg-button px-5 py-4 font-semibold text-tg-button-text" type="button" onClick={() => router.push('/app/onboarding')}>
          {t('simulatorGoOnboarding')}
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col bg-tg-bg px-4 py-5 text-tg-text">
      <header className="sticky top-0 z-10 -mx-4 bg-tg-bg/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-tg-link">InstaReply</p>
            <h1 className="text-2xl font-bold">{t('pageSimulatorTitle')}</h1>
          </div>
          <button className="rounded-xl border border-tg-hint/30 px-3 py-2 text-sm" type="button" onClick={reset}>
            {t('simulatorReset')}
          </button>
        </div>
        {!hintDismissed ? (
          <div className="mt-4 flex gap-3 rounded-2xl bg-tg-secondary-bg p-3 text-sm leading-5">
            <span aria-hidden>💡</span>
            <p className="flex-1">{t('simulatorHint')}</p>
            <button className="text-lg leading-none text-tg-hint" type="button" aria-label={t('simulatorDismissHint')} onClick={dismissHint}>×</button>
          </div>
        ) : null}
      </header>

      <section className="flex flex-1 flex-col gap-3 overflow-y-auto py-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mt-8 space-y-4 text-center">
            <p className="text-tg-hint">{t('simulatorEmptyHint')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLES.map((key) => (
                <button key={key} className="rounded-full bg-tg-secondary-bg px-4 py-2 text-sm" type="button" onClick={() => setInput(t(key))}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message, index) => {
          const isClient = message.role === 'client';
          const isSystem = message.role === 'system';
          return (
            <div key={`${message.role}-${index}-${message.text}`} className={isSystem ? 'self-center rounded-2xl bg-red-500/10 px-4 py-3 text-sm text-red-700' : isClient ? 'max-w-[78%] self-end rounded-3xl rounded-br-md bg-tg-button px-4 py-3 text-tg-button-text' : 'max-w-[78%] self-start rounded-3xl rounded-bl-md bg-tg-secondary-bg px-4 py-3'}>
              {message.label ? <p className="mb-1 text-xs font-semibold text-tg-link">🏷 {message.label}</p> : null}
              <p className="whitespace-pre-wrap leading-6">{message.text}</p>
              {isSystem && message.text === t('simulatorGenericError') && lastClientText ? (
                <button className="mt-2 rounded-xl border border-red-400 px-3 py-2 text-sm font-medium" type="button" onClick={retry} disabled={isSending}>
                  {t('simulatorRetryLast')}
                </button>
              ) : null}
            </div>
          );
        })}
        {isSending ? <TypingIndicator /> : null}
        <div ref={bottomRef} />
      </section>

      <form className="sticky bottom-0 -mx-4 flex gap-2 bg-tg-bg/95 px-4 pb-4 pt-3 backdrop-blur" onSubmit={(event) => { event.preventDefault(); void sendText(input); }}>
        <textarea ref={textareaRef} className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-tg-hint/30 bg-transparent px-4 py-3 leading-6 outline-none focus:border-tg-link disabled:opacity-60" placeholder={t('simulatorInputPlaceholder')} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} disabled={isSending} rows={1} />
        <button className="rounded-2xl bg-tg-button px-4 py-3 font-semibold text-tg-button-text disabled:opacity-50" type="submit" disabled={isSending || !input.trim()}>
          {t('simulatorSend')}
        </button>
      </form>
    </main>
  );
}
