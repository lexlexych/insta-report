'use client';

import { mainButton } from '@telegram-apps/sdk-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useTenant } from '@/components/miniapp/TmaProvider';
import { useT } from '@/lib/i18n';

type Step = 'welcome' | 'org_form' | 'generating' | 'review_kb' | 'done';

const stepOrder: Step[] = ['welcome', 'org_form', 'generating', 'review_kb', 'done'];

function normalizeStep(value: string | null | undefined): Step {
  return stepOrder.includes(value as Step) ? (value as Step) : 'welcome';
}

function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-3 rounded-2xl bg-tg-secondary-bg p-4 text-sm leading-6">
      {markdown.split(/\n{2,}/).map((block, index) => {
        const text = block.trim();
        if (!text) return null;
        if (text.startsWith('#')) {
          return <h3 key={index} className="text-lg font-semibold">{text.replace(/^#+\s*/, '')}</h3>;
        }
        if (/^[-*]\s/m.test(text)) {
          return <ul key={index} className="list-disc space-y-1 pl-5">{text.split('\n').map((line, itemIndex) => <li key={itemIndex}>{line.replace(/^[-*]\s*/, '')}</li>)}</ul>;
        }
        return <p key={index}>{text}</p>;
      })}
    </div>
  );
}

async function patchStep(onboardingStep: Step) {
  await fetch('/api/miniapp/tenant', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ onboardingStep }),
  });
}

export default function Page() {
  const tenant = useTenant();
  const router = useRouter();
  const { t } = useT();
  const [step, setStep] = useState<Step>(() => normalizeStep(tenant.tenant?.onboardingStep));
  const [orgName, setOrgName] = useState(tenant.tenant?.orgName ?? '');
  const [orgDescription, setOrgDescription] = useState('');
  const [knowledgeBase, setKnowledgeBase] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [savingKb, setSavingKb] = useState(false);

  useEffect(() => {
    if (tenant.status === 'ready') {
      const currentStep = normalizeStep(tenant.tenant.onboardingStep);
      if (currentStep === 'done') router.replace('/app');
      else setStep(currentStep);
    }
  }, [router, tenant]);

  const validation = useMemo(() => ({
    orgName: orgName.trim().length < 2 ? t('onboardingOrgNameError') : null,
    orgDescription: orgDescription.trim().length < 80 ? t('onboardingOrgDescriptionError', { min: 80 }) : null,
  }), [orgDescription, orgName, t]);

  const goStep = useCallback((nextStep: Step) => {
    setStep(nextStep);
    void patchStep(nextStep);
  }, []);

  const generate = useCallback(async () => {
    setError(null);
    setStep('generating');
    void patchStep('generating');
    try {
      const response = await fetch('/api/miniapp/onboarding/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgName, orgDescription }),
      });
      const payload = (await response.json()) as { knowledgeBase?: string; error?: string };
      if (!response.ok || !payload.knowledgeBase) throw new Error(payload.error ?? 'generate_failed');
      setKnowledgeBase(payload.knowledgeBase);
      goStep('review_kb');
    } catch {
      setError(t('onboardingGenerateError'));
      setToast(t('onboardingGenerateToast'));
    }
  }, [goStep, orgDescription, orgName, t]);

  const primary = useMemo(() => {
    if (step === 'welcome') return { text: t('onboardingStart'), action: () => goStep('org_form') };
    if (step === 'org_form') return { text: t('onboardingGenerate'), action: () => { if (!validation.orgName && !validation.orgDescription) void generate(); } };
    if (step === 'generating' && error) return { text: t('retry'), action: () => void generate() };
    if (step === 'review_kb') return { text: t('onboardingApprove'), action: async () => {
      setSavingKb(true);
      await fetch('/api/miniapp/knowledge', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ knowledgeBase }) });
      setSavingKb(false);
      goStep('done');
    } };
    return null;
  }, [error, generate, goStep, knowledgeBase, step, t, validation.orgDescription, validation.orgName]);

  useEffect(() => {
    if (!primary) {
      mainButton.hide();
      return;
    }
    mainButton.setText(primary.text);
    mainButton.show();
    const off = mainButton.onClick(primary.action);
    return () => {
      off();
      mainButton.hide();
    };
  }, [primary]);

  if (tenant.status !== 'ready') return null;

  return (
    <main className="min-h-screen bg-tg-bg px-5 py-8 text-tg-text">
      {toast ? <div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{toast}</div> : null}
      {step === 'welcome' ? <section className="space-y-6"><h1 className="text-2xl font-bold">{t('onboardingWelcomeTitle')}</h1>{['onboardingPointFast','onboardingPointKnowledge','onboardingPointTelegram'].map((key) => <div key={key} className="flex gap-3 rounded-2xl bg-tg-secondary-bg p-4"><span>✨</span><p>{t(key)}</p></div>)}</section> : null}
      {step === 'org_form' ? <section className="space-y-5"><h1 className="text-2xl font-bold">{t('onboardingOrgTitle')}</h1><label className="block space-y-2"><span>{t('onboardingOrgName')}</span><input className="w-full rounded-xl border bg-transparent p-3" value={orgName} onChange={(event) => setOrgName(event.target.value)} />{validation.orgName ? <span className="text-sm text-red-600">{validation.orgName}</span> : null}</label><label className="block space-y-2"><span>{t('onboardingOrgDescription')}</span><textarea className="min-h-40 w-full rounded-xl border bg-transparent p-3" value={orgDescription} onChange={(event) => setOrgDescription(event.target.value)} placeholder={t('onboardingOrgDescriptionPlaceholder')} /><span className="text-xs text-tg-hint">{orgDescription.trim().length}/80</span>{validation.orgDescription ? <span className="block text-sm text-red-600">{validation.orgDescription}</span> : null}</label></section> : null}
      {step === 'generating' ? <section className="space-y-5"><h1 className="text-2xl font-bold">{t('onboardingGeneratingTitle')}</h1>{['onboardingGenAnalyze','onboardingGenStructure','onboardingGenTone'].map((key) => <div key={key} className="animate-pulse rounded-2xl bg-tg-secondary-bg p-4">{t(key)}</div>)}{error ? <p className="text-red-600">{error}</p> : null}</section> : null}
      {step === 'review_kb' ? <section className="space-y-5"><h1 className="text-2xl font-bold">{t('onboardingReviewTitle')}</h1>{isEditing ? <textarea className="min-h-72 w-full rounded-xl border bg-transparent p-3" value={knowledgeBase} onChange={(event) => setKnowledgeBase(event.target.value)} /> : <MarkdownView markdown={knowledgeBase} />}<button className="rounded-xl border px-4 py-3" type="button" onClick={() => setIsEditing((value) => !value)}>{isEditing ? t('onboardingPreview') : t('onboardingEdit')}</button>{savingKb ? <p className="text-sm text-tg-hint">{t('onboardingSaving')}</p> : null}</section> : null}
      {step === 'done' ? <section className="space-y-5"><h1 className="text-2xl font-bold">{t('onboardingDoneTitle')}</h1><p>{t('onboardingDoneHint')}</p><button className="w-full rounded-xl bg-tg-button p-4 text-tg-button-text" onClick={async () => { await patchStep('done'); router.push('/app/connect-instagram'); }}>{t('onboardingConnectInstagram')}</button><button className="w-full rounded-xl border p-4" onClick={async () => { await patchStep('done'); router.push('/app/simulator'); }}>{t('onboardingTrySimulator')}</button></section> : null}
    </main>
  );
}
