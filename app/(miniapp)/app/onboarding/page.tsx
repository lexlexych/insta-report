'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { InstagramConnectPanel } from '@/components/miniapp/InstagramConnectPanel';
import { useTenant } from '@/components/miniapp/TmaProvider';
import { normalizeIgUsername } from '@/lib/ig/username';
import { BUSINESS_SPHERES, getKbTemplate, isBusinessSphereId, type BusinessSphereId } from '@/lib/kb-templates';
import { useT } from '@/lib/i18n';

type Step = 'sphere' | 'business' | 'ig_wait' | 'ig_connect' | 'knowledge' | 'finish' | 'done';
const steps: Step[] = ['sphere', 'business', 'ig_wait', 'ig_connect', 'knowledge', 'finish', 'done'];
const normalizeStep = (value: string | null | undefined): Step => steps.includes(value as Step) ? value as Step : 'sphere';
async function patchTenant(data: Record<string, string>) { const response = await fetch('/api/miniapp/tenant', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!response.ok) throw new Error('tenant_update_failed'); }

export default function Page() {
  const tenant = useTenant(); const router = useRouter(); const { t, locale } = useT();
  const [step, setStep] = useState<Step>('sphere'); const [sphere, setSphere] = useState<BusinessSphereId | null>(null);
  const [orgName, setOrgName] = useState(''); const [username, setUsername] = useState(''); const [usernameError, setUsernameError] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState(''); const [active, setActive] = useState(false); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (tenant.status !== 'ready') return; const initial = normalizeStep(tenant.tenant.onboardingStep); if (initial === 'done') { router.replace('/app'); return; } setStep(initial); setOrgName(tenant.tenant.orgName ?? ''); if (isBusinessSphereId(tenant.tenant.businessSphere ?? '')) setSphere(tenant.tenant.businessSphere as BusinessSphereId); if (initial === 'knowledge') setKnowledge(tenant.tenant.knowledgeBase ?? getKbTemplate(tenant.tenant.businessSphere as BusinessSphereId, locale)); if (!tenant.tenant.onboardingStep) void patchTenant({ uiLocale: locale }); }, [locale, router, tenant]);
  const canContinue = useMemo(() => ({ sphere: Boolean(sphere), business: orgName.trim().length >= 2 && Boolean(normalizeIgUsername(username)), ig_wait: true, ig_connect: active, knowledge: knowledge.trim().length > 0 && knowledge.length <= 20_000, finish: true, done: false }[step]), [active, knowledge, orgName, sphere, step, username]);
  const go = useCallback(async (next: Step) => { setSaving(true); setError(null); try { await patchTenant({ onboardingStep: next }); setStep(next); } catch { setError(t('onboardingSaveError')); } finally { setSaving(false); } }, [t]);
  const next = useCallback(async () => {
    if (!canContinue || saving) return;
    if (step === 'sphere' && sphere) { await patchTenant({ businessSphere: sphere, onboardingStep: 'business' }); setStep('business'); return; }
    if (step === 'business') { const normalized = normalizeIgUsername(username); if (!normalized) return; setSaving(true); setError(null); try { await patchTenant({ orgName: orgName.trim() }); const response = await fetch('/api/miniapp/onboarding/ig-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ igUsername: normalized }) }); const data = await response.json() as { status?: 'pending' | 'approved'; code?: string }; if (response.status === 409 && data.code === 'taken') { setUsernameError(t('onboardingUsernameTaken')); return; } if (!response.ok || !data.status) throw new Error('ig_account_failed'); await go(data.status === 'approved' ? 'ig_connect' : 'ig_wait'); } catch { setError(t('onboardingSaveError')); } finally { setSaving(false); } return; }
    if (step === 'ig_wait' || step === 'ig_connect') { await go('knowledge'); if (!knowledge && sphere) setKnowledge(getKbTemplate(sphere, locale)); return; }
    if (step === 'knowledge') { setSaving(true); setError(null); try { const response = await fetch('/api/miniapp/onboarding/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ knowledgeBase: knowledge }) }); if (!response.ok) throw new Error('complete_failed'); setStep('finish'); } catch { setError(t('onboardingSaveError')); } finally { setSaving(false); } return; }
    if (step === 'finish') { await go('done'); tenant.retry(); router.replace('/app'); }
  }, [canContinue, go, knowledge, locale, orgName, router, saving, sphere, step, t, tenant, username]);
  if (tenant.status !== 'ready') return null;
  return <main className="min-h-screen bg-tg-bg pb-28 text-tg-text"><section className="mx-auto max-w-xl space-y-5 px-5 py-8">
    {step === 'sphere' && <><h1 className="text-2xl font-bold">{t('onboardingSphereTitle')}</h1><p className="text-tg-hint">{t('onboardingSphereHint')}</p>{BUSINESS_SPHERES.map((item) => <button key={item.id} type="button" onClick={() => setSphere(item.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${sphere === item.id ? 'border-tg-button bg-tg-secondary-bg' : ''}`}><span className="text-2xl">{item.icon}</span>{t(item.nameKey)}</button>)}</>}
    {step === 'business' && <><h1 className="text-2xl font-bold">{t('onboardingBusinessTitle')}</h1><label className="block space-y-2"><span>{t('onboardingBusinessName')}</span><input className="w-full rounded-xl border bg-transparent p-3" value={orgName} onChange={(e) => setOrgName(e.target.value)} /></label><label className="block space-y-2"><span>{t('onboardingInstagramAccount')}</span><input className="w-full rounded-xl border bg-transparent p-3" placeholder="@username" value={username} onChange={(e) => { setUsername(e.target.value); setUsernameError(null); }} />{username && !normalizeIgUsername(username) ? <span className="text-sm text-red-600">{t('onboardingUsernameInvalid')}</span> : null}{usernameError ? <span className="text-sm text-red-600">{usernameError}</span> : null}</label></>}
    {step === 'ig_wait' && <><h1 className="text-2xl font-bold">{t('onboardingWaitTitle')}</h1><p className="rounded-2xl bg-tg-secondary-bg p-4">⏳ {t('onboardingWaitBody')}</p></>}
    {step === 'ig_connect' && <><h1 className="text-2xl font-bold">{t('onboardingConnectTitle')}</h1><InstagramConnectPanel onActiveChange={setActive} /></>}
    {step === 'knowledge' && <><h1 className="text-2xl font-bold">{t('onboardingKnowledgeTitle')}</h1><p className="text-tg-hint">{t('onboardingKnowledgeHint')}</p><textarea className="min-h-80 w-full rounded-xl border bg-transparent p-3 font-mono text-sm" value={knowledge} onChange={(e) => setKnowledge(e.target.value)} /><p className="text-xs text-tg-hint">{knowledge.length}/20000</p></>}
    {step === 'finish' && <><h1 className="text-2xl font-bold">{t('onboardingFinishTitle')}</h1>{['onboardingFinishSimulator','onboardingFinishIncoming','onboardingFinishLabels','onboardingFinishSettings','onboardingFinishDashboard'].map((key) => <p className="rounded-2xl bg-tg-secondary-bg p-4" key={key}>✓ {t(key)}</p>)}</>}
    {error ? <p className="text-sm text-red-600">{error}</p> : null}
  </section><footer className="fixed inset-x-0 bottom-0 border-t bg-tg-bg p-4"><button type="button" disabled={!canContinue || saving} onClick={() => void next()} className="mx-auto block w-full max-w-xl rounded-xl bg-tg-button p-4 font-medium text-tg-button-text disabled:opacity-40">{saving ? t('onboardingSaving') : step === 'knowledge' ? t('onboardingComplete') : step === 'finish' ? t('onboardingStartWork') : t('onboardingNext')}</button></footer></main>;
}
