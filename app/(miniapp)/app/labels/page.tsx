'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useT } from '@/lib/i18n';

type ApiLabel = {
  id: string;
  name: string;
  description: string | null;
  instruction: string | null;
  sort: number;
  isDefault: boolean;
  draftCount30d: number;
};

type FormState = {
  mode: 'create' | 'edit';
  id: string | null;
  name: string;
  description: string;
  instruction: string;
};

const NAME_MAX = 50;
const DESCRIPTION_MAX = 300;
const INSTRUCTION_MAX = 1000;

const EMPTY_FORM: Omit<FormState, 'mode' | 'id'> = { name: '', description: '', instruction: '' };

function LabelCard({
  label,
  index,
  isFirst,
  isLast,
  busy,
  onMove,
  onEdit,
  onDelete,
}: {
  label: ApiLabel;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onEdit: (label: ApiLabel) => void;
  onDelete: (label: ApiLabel) => void;
}) {
  const { t } = useT();

  return (
    <article className="flex items-start gap-3 rounded-2xl bg-tg-secondary-bg p-4">
      <div className="flex shrink-0 flex-col gap-1 pt-0.5">
        <button
          aria-label={t('labelsMoveUp')}
          className="rounded-lg border border-tg-hint/30 px-2 py-1 text-xs disabled:opacity-30"
          disabled={isFirst || busy}
          type="button"
          onClick={() => onMove(index, -1)}
        >
          ↑
        </button>
        <button
          aria-label={t('labelsMoveDown')}
          className="rounded-lg border border-tg-hint/30 px-2 py-1 text-xs disabled:opacity-30"
          disabled={isLast || busy}
          type="button"
          onClick={() => onMove(index, 1)}
        >
          ↓
        </button>
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{label.name}</h3>
        {label.description ? <p className="mt-1 text-sm text-tg-hint">{label.description}</p> : null}
        <p className="mt-1 text-xs text-tg-hint">{t('labelsDraftCount', { count: label.draftCount30d })}</p>
      </div>

      <div className="flex shrink-0 gap-1">
        <button
          aria-label={t('labelsEditAction')}
          className="rounded-lg border border-tg-hint/30 px-2 py-2"
          type="button"
          onClick={() => onEdit(label)}
        >
          ✏️
        </button>
        <button
          aria-label={t('labelsDeleteAction')}
          className="rounded-lg border border-red-300 px-2 py-2 text-red-600 disabled:opacity-50"
          disabled={busy}
          type="button"
          onClick={() => onDelete(label)}
        >
          🗑
        </button>
      </div>
    </article>
  );
}

function DefaultLabelCard({ label }: { label: ApiLabel }) {
  const { t } = useT();

  return (
    <article className="flex items-start gap-3 rounded-2xl bg-tg-secondary-bg/60 p-4">
      <span aria-hidden className="pt-0.5 text-lg" title={t('labelsDefaultLocked')}>
        🔒
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold">{label.name}</h3>
        {label.description ? <p className="mt-1 text-sm text-tg-hint">{label.description}</p> : null}
        <p className="mt-1 text-xs text-tg-hint">{t('labelsDraftCount', { count: label.draftCount30d })}</p>
      </div>
    </article>
  );
}

export default function Page() {
  const { t } = useT();
  const [labelsList, setLabelsList] = useState<ApiLabel[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const response = await fetch('/api/miniapp/labels');
      if (!response.ok) throw new Error('load_failed');
      const payload = (await response.json()) as { labels: ApiLabel[] };
      setLabelsList(payload.labels);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const movable = useMemo(() => (labelsList ?? []).filter((label) => !label.isDefault), [labelsList]);
  const defaultLabel = useMemo(() => (labelsList ?? []).find((label) => label.isDefault) ?? null, [labelsList]);

  const openCreate = useCallback(() => {
    setFormError(null);
    setFormState({ mode: 'create', id: null, ...EMPTY_FORM });
  }, []);

  const openEdit = useCallback((label: ApiLabel) => {
    setFormError(null);
    setFormState({
      mode: 'edit',
      id: label.id,
      name: label.name,
      description: label.description ?? '',
      instruction: label.instruction ?? '',
    });
  }, []);

  const closeForm = useCallback(() => {
    if (saving) return;
    setFormState(null);
    setFormError(null);
  }, [saving]);

  const nameTrimmed = formState?.name.trim() ?? '';
  const isNameValid = nameTrimmed.length > 0 && nameTrimmed.length <= NAME_MAX;
  const nameTouched = (formState?.name.length ?? 0) > 0;

  const submitForm = useCallback(async () => {
    if (!formState || !isNameValid) return;
    setSaving(true);
    setFormError(null);

    try {
      const body = {
        name: formState.name.trim(),
        description: formState.description.trim(),
        instruction: formState.instruction.trim(),
      };
      const response =
        formState.mode === 'create'
          ? await fetch('/api/miniapp/labels', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
          : await fetch(`/api/miniapp/labels/${formState.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });

      if (response.status === 409) {
        setFormError(t('labelsFormNameConflict'));
        return;
      }
      if (!response.ok) throw new Error('save_failed');

      setFormState(null);
      await load();
    } catch {
      setFormError(t('labelsFormGenericError'));
    } finally {
      setSaving(false);
    }
  }, [formState, isNameValid, load, t]);

  const handleDelete = useCallback(
    async (label: ApiLabel) => {
      if (!window.confirm(t('labelsDeleteConfirm', { name: label.name }))) return;
      setActionError(null);
      setBusyId(label.id);
      try {
        const response = await fetch(`/api/miniapp/labels/${label.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('delete_failed');
        await load();
      } catch {
        setActionError(t('labelsDeleteError'));
      } finally {
        setBusyId(null);
      }
    },
    [load, t],
  );

  const move = useCallback(
    async (index: number, direction: -1 | 1) => {
      const target = index + direction;
      if (index < 0 || index >= movable.length || target < 0 || target >= movable.length) return;

      const reordered = [...movable];
      const moved = reordered[index];
      const other = reordered[target];
      if (!moved || !other) return;
      reordered[index] = other;
      reordered[target] = moved;

      const ids = reordered.map((label) => label.id);
      setActionError(null);
      setBusyId(moved.id);
      // Оптимистичное обновление порядка на клиенте: сервер — источник истины, но пока
      // ответ не пришёл, список уже выглядит переставленным (см. T-023 AC "порядок сохраняется").
      setLabelsList(defaultLabel ? [...reordered, defaultLabel] : reordered);

      try {
        const response = await fetch('/api/miniapp/labels/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        if (!response.ok) throw new Error('reorder_failed');
      } catch {
        setActionError(t('labelsReorderError'));
        await load();
      } finally {
        setBusyId(null);
      }
    },
    [defaultLabel, load, movable, t],
  );

  if (loadError) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-tg-hint">{t('labelsLoadError')}</p>
        <button className="rounded-xl bg-tg-button px-5 py-3 font-medium text-tg-button-text" type="button" onClick={() => void load()}>
          {t('retry')}
        </button>
      </main>
    );
  }

  if (!labelsList) {
    return <main className="flex min-h-screen items-center justify-center text-tg-hint">{t('igLoading')}</main>;
  }

  return (
    <main className="mx-auto max-w-xl space-y-4 px-5 py-8">
      <h1 className="text-2xl font-bold">{t('pageLabelsTitle')}</h1>

      {actionError ? <p className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{actionError}</p> : null}

      {labelsList.length === 0 ? <p className="text-sm text-tg-hint">{t('labelsEmptyHint')}</p> : null}

      <div className="space-y-3">
        {movable.map((label, index) => (
          <LabelCard
            key={label.id}
            busy={busyId === label.id}
            index={index}
            isFirst={index === 0}
            isLast={index === movable.length - 1}
            label={label}
            onDelete={(target) => void handleDelete(target)}
            onEdit={openEdit}
            onMove={(cardIndex, direction) => void move(cardIndex, direction)}
          />
        ))}
        {defaultLabel ? <DefaultLabelCard label={defaultLabel} /> : null}
      </div>

      <button
        aria-label={t('labelsAddButton')}
        className="fixed bottom-24 right-5 z-30 rounded-full bg-tg-button px-5 py-4 font-semibold text-tg-button-text shadow-lg"
        type="button"
        onClick={openCreate}
      >
        {t('labelsAddButton')}
      </button>

      {formState ? (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <button
            aria-label={t('labelsFormCancel')}
            className="flex-1 bg-black/40"
            type="button"
            onClick={closeForm}
          />
          <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-tg-bg p-5 pb-8 shadow-2xl">
            <h2 className="text-xl font-semibold">
              {formState.mode === 'create' ? t('labelsFormTitleCreate') : t('labelsFormTitleEdit')}
            </h2>

            <label className="mt-4 block text-sm font-medium" htmlFor="label-name">
              {t('labelsFieldName')}
            </label>
            <input
              className="mt-1 w-full rounded-xl border border-tg-hint/30 bg-transparent p-3"
              id="label-name"
              maxLength={NAME_MAX}
              placeholder={t('labelsFieldNamePlaceholder')}
              value={formState.name}
              onChange={(event) => setFormState((current) => (current ? { ...current, name: event.target.value } : current))}
            />
            {nameTouched && !isNameValid ? (
              <p className="mt-1 text-sm text-red-600">{t('labelsFieldNameError', { max: NAME_MAX })}</p>
            ) : null}

            <label className="mt-4 block text-sm font-medium" htmlFor="label-description">
              {t('labelsFieldDescription')}
            </label>
            <textarea
              className="mt-1 w-full rounded-xl border border-tg-hint/30 bg-transparent p-3"
              id="label-description"
              maxLength={DESCRIPTION_MAX}
              placeholder={t('labelsFieldDescriptionPlaceholder')}
              rows={2}
              value={formState.description}
              onChange={(event) =>
                setFormState((current) => (current ? { ...current, description: event.target.value } : current))
              }
            />

            <label className="mt-4 block text-sm font-medium" htmlFor="label-instruction">
              {t('labelsFieldInstruction')}
            </label>
            <textarea
              className="mt-1 w-full rounded-xl border border-tg-hint/30 bg-transparent p-3"
              id="label-instruction"
              maxLength={INSTRUCTION_MAX}
              placeholder={t('labelsFieldInstructionPlaceholder')}
              rows={3}
              value={formState.instruction}
              onChange={(event) =>
                setFormState((current) => (current ? { ...current, instruction: event.target.value } : current))
              }
            />

            {formError ? <p className="mt-3 text-sm text-red-600">{formError}</p> : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="rounded-xl bg-tg-secondary-bg p-3" disabled={saving} type="button" onClick={closeForm}>
                {t('labelsFormCancel')}
              </button>
              <button
                className="rounded-xl bg-tg-button p-3 text-tg-button-text disabled:opacity-50"
                disabled={!isNameValid || saving}
                type="button"
                onClick={() => void submitForm()}
              >
                {saving ? t('labelsFormSaving') : t('labelsFormSave')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
