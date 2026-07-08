'use client';

import { useEffect, useMemo, useState } from 'react';

import { useTenant } from '@/components/miniapp/TmaProvider';
import { useT, type Locale } from '@/lib/i18n';

type KnowledgePayload = { knowledgeBase: string | null; systemPrompt: string | null };
type IgPayload = { status: string; igUsername: string | null } | { state: string };

const DELETE_WORD: Record<Locale, string> = { ru: 'УДАЛИТЬ', de: 'LÖSCHEN' };

function firstLines(value: string, count: number): string {
  return value.split('\n').slice(0, count).join('\n');
}

export default function Page() {
  const tenantState = useTenant();
  const { locale, setLocale, t } = useT();
  const [knowledge, setKnowledge] = useState('');
  const [prompt, setPrompt] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<'knowledge' | 'prompt' | null>(null);
  const [draft, setDraft] = useState('');
  const [ig, setIg] = useState<IgPayload | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [knowledgeResponse, igResponse] = await Promise.all([
          fetch('/api/miniapp/knowledge', { signal: controller.signal }),
          fetch('/api/miniapp/ig/connect', { signal: controller.signal }),
        ]);
        if (!knowledgeResponse.ok || !igResponse.ok) throw new Error('settings load failed');
        const knowledgePayload = (await knowledgeResponse.json()) as KnowledgePayload;
        setKnowledge(knowledgePayload.knowledgeBase ?? '');
        setPrompt(knowledgePayload.systemPrompt ?? '');
        setIg((await igResponse.json()) as IgPayload);
      } catch {
        if (!controller.signal.aborted) setError(t('settingsLoadError'));
      }
    }
    void load();
    return () => controller.abort();
  }, [t]);

  const preview = useMemo(() => firstLines(knowledge || t('settingsKnowledgeEmpty'), expanded ? 200 : 6), [expanded, knowledge, t]);
  const deleteWord = DELETE_WORD[locale];

  if (deleted) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-5 text-center">
        <h1 className="text-2xl font-semibold">{t('settingsDeletedTitle')}</h1>
        <p className="text-tg-hint">{t('settingsDeletedHint')}</p>
      </main>
    );
  }

  async function saveEditor() {
    if (!editing) return;
    setBusy('save');
    setError(null);
    const body = editing === 'knowledge' ? { knowledgeBase: draft } : { systemPrompt: draft };
    const response = await fetch('/api/miniapp/knowledge', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(null);
    if (!response.ok) {
      setError(t('settingsSaveError'));
      return;
    }
    if (editing === 'knowledge') setKnowledge(draft);
    if (editing === 'prompt') setPrompt(draft);
    setEditing(null);
  }

  async function saveLocale(nextLocale: Locale) {
    setBusy('locale');
    const response = await fetch('/api/miniapp/tenant', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uiLocale: nextLocale }),
    });
    setBusy(null);
    if (!response.ok) {
      setError(t('settingsSaveError'));
      return;
    }
    setLocale(nextLocale);
  }

  async function disconnect() {
    if (!window.confirm(t('settingsDisconnectConfirm'))) return;
    setBusy('disconnect');
    const response = await fetch('/api/miniapp/ig/disconnect', { method: 'POST' });
    setBusy(null);
    if (!response.ok) {
      setError(t('settingsSaveError'));
      return;
    }
    setIg({ status: 'pending', igUsername: null });
  }

  async function deleteTenant() {
    if (deleteText !== deleteWord) return;
    if (!window.confirm(t('settingsDeleteConfirm'))) return;
    setBusy('delete');
    const response = await fetch('/api/miniapp/tenant', { method: 'DELETE' });
    setBusy(null);
    if (!response.ok) {
      setError(t('settingsSaveError'));
      return;
    }
    setDeleted(true);
  }

  const igStatus = ig && 'status' in ig && ig.status === 'active' ? t('settingsIgConnected', { username: ig.igUsername ?? 'Instagram' }) : t('settingsIgDisconnected');

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-5">
      <h1 className="text-2xl font-semibold">{t('pageSettingsTitle')}</h1>
      {error ? <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <section className="rounded-3xl bg-tg-secondary-bg p-4">
        <h2 className="text-lg font-semibold">{t('settingsKnowledgeTitle')}</h2>
        <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-tg-bg p-3 text-sm">{preview}</pre>
        <div className="mt-3 flex gap-2">
          <button className="rounded-xl bg-tg-button px-4 py-2 text-tg-button-text" onClick={() => { setDraft(knowledge); setEditing('knowledge'); }}>{t('settingsEdit')}</button>
          <button className="rounded-xl bg-tg-bg px-4 py-2" onClick={() => setExpanded((value) => !value)}>{expanded ? t('settingsCollapse') : t('settingsExpand')}</button>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer font-medium">{t('settingsPromptTitle')}</summary>
          <p className="mt-1 text-sm text-tg-hint">{t('settingsPromptHint')}</p>
          <button className="mt-3 rounded-xl bg-tg-bg px-4 py-2" onClick={() => { setDraft(prompt); setEditing('prompt'); }}>{t('settingsEdit')}</button>
        </details>
      </section>

      <section className="rounded-3xl bg-tg-secondary-bg p-4">
        <h2 className="text-lg font-semibold">{t('settingsLanguageTitle')}</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {(['ru', 'de'] as const).map((item) => <button key={item} className={`rounded-xl px-4 py-3 ${locale === item ? 'bg-tg-button text-tg-button-text' : 'bg-tg-bg'}`} disabled={busy === 'locale'} onClick={() => void saveLocale(item)}>{item === 'ru' ? 'Русский' : 'Deutsch'}</button>)}
        </div>
      </section>

      <section className="rounded-3xl bg-tg-secondary-bg p-4">
        <h2 className="text-lg font-semibold">{t('settingsDeliveryTitle')}</h2>
        <p className="mt-2 text-sm font-medium">{t(tenantState.status === 'ready' && tenantState.tenant.tgTopicsEnabled ? 'settingsTopicsEnabled' : 'settingsTopicsDisabled')}</p>
        <p className="mt-1 text-sm text-tg-hint">{t('settingsTopicsHint')}</p>
      </section>

      <section className="rounded-3xl bg-tg-secondary-bg p-4">
        <h2 className="text-lg font-semibold">Instagram</h2>
        <p className="mt-2 text-sm text-tg-hint">{igStatus}</p>
        <button className="mt-3 rounded-xl bg-tg-bg px-4 py-2" disabled={busy === 'disconnect'} onClick={() => void disconnect()}>{t('settingsDisconnect')}</button>
      </section>

      <section className="rounded-3xl bg-tg-secondary-bg p-4">
        <h2 className="text-lg font-semibold">{t('settingsLegalTitle')}</h2>
        <div className="mt-3 flex flex-col gap-2 text-tg-link">
          <a href="/legal/privacy">{t('settingsPrivacy')}</a>
          <a href="/legal/terms">{t('settingsTerms')}</a>
        </div>
      </section>

      <section className="rounded-3xl border border-red-200 bg-red-50 p-4 text-red-900">
        <h2 className="text-lg font-semibold">{t('settingsDangerTitle')}</h2>
        <p className="mt-2 text-sm">{t('settingsDeleteHint', { word: deleteWord })}</p>
        <input className="mt-3 w-full rounded-xl border border-red-200 p-3" value={deleteText} onChange={(event) => setDeleteText(event.target.value)} />
        <button className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-white disabled:opacity-50" disabled={deleteText !== deleteWord || busy === 'delete' || tenantState.status !== 'ready'} onClick={() => void deleteTenant()}>{t('settingsDelete')}</button>
      </section>

      {editing ? <div className="fixed inset-0 z-20 flex flex-col bg-tg-bg p-5"><h2 className="text-xl font-semibold">{editing === 'knowledge' ? t('settingsKnowledgeTitle') : t('settingsPromptTitle')}</h2><textarea className="mt-4 min-h-0 flex-1 rounded-2xl border p-3" maxLength={20000} value={draft} onChange={(event) => setDraft(event.target.value)} /><p className="mt-2 text-right text-sm text-tg-hint">{draft.length}/20000</p><div className="mt-3 grid grid-cols-2 gap-2"><button className="rounded-xl bg-tg-secondary-bg p-3" onClick={() => setEditing(null)}>{t('settingsCancel')}</button><button className="rounded-xl bg-tg-button p-3 text-tg-button-text" disabled={busy === 'save' || draft.trim().length === 0} onClick={() => void saveEditor()}>{t('settingsSave')}</button></div></div> : null}
    </main>
  );
}
