import { getDb } from './client';
import { ForbiddenLabelError, isSupabaseCode, LabelNameConflictError, throwDb } from './errors';
import type { Database } from './types.gen';

type Label = Database['public']['Tables']['labels']['Row'];
type LabelInsert = Database['public']['Tables']['labels']['Insert'];
type LabelUpdate = Database['public']['Tables']['labels']['Update'];

const DEFAULT_LABEL_NAME = 'Без категории';

function assertNotDefaultLabelName(name: string | null | undefined): void {
  if (name === DEFAULT_LABEL_NAME) {
    throw new ForbiddenLabelError();
  }
}

/** «Без категории» — неизменяемая системная метка (см. seed_default_labels в 0001_init.sql). */
export function isDefaultLabel(label: Pick<Label, 'name'>): boolean {
  return label.name === DEFAULT_LABEL_NAME;
}

export async function getById(id: string): Promise<Label | null> {
  const { data, error } = await getDb().from('labels').select().eq('id', id).maybeSingle();
  if (error) throwDb('labels.getById', error);
  return data as Label | null;
}

export async function listByTenant(tenantId: string): Promise<Label[]> {
  const { data, error } = await getDb()
    .from('labels')
    .select()
    .eq('tenant_id', tenantId)
    .order('sort', { ascending: true })
    .order('name', { ascending: true });
  if (error) throwDb('labels.listByTenant', error);
  return data as Label[];
}

export async function create(patch: LabelInsert): Promise<Label> {
  const { data, error } = await getDb().from('labels').insert(patch).select().single();
  if (isSupabaseCode(error, '23505')) throw new LabelNameConflictError();
  if (error) throwDb('labels.create', error);
  return data as Label;
}

export async function updateById(id: string, patch: LabelUpdate): Promise<Label> {
  // Защита на уровне репозитория (см. T-023 AC "непереименуема/неудаляема на всех уровнях"):
  // и текущее имя метки, и целевое имя из patch не должны быть «Без категории» — это
  // блокирует как переименование обычной метки В «Без категории», так и любое изменение
  // самой системной метки (даже если patch.name не передан), защищая от прямых вызовов
  // репозитория в обход API-роута.
  const existing = await getDb().from('labels').select('name').eq('id', id).maybeSingle();
  if (existing.error) throwDb('labels.updateById.lookup', existing.error);
  assertNotDefaultLabelName((existing.data as Pick<Label, 'name'> | null)?.name);
  assertNotDefaultLabelName(patch.name);

  const { data, error } = await getDb().from('labels').update(patch).eq('id', id).select().single();
  if (isSupabaseCode(error, '23505')) throw new LabelNameConflictError();
  if (error) throwDb('labels.updateById', error);
  return data as Label;
}

export async function deleteById(id: string): Promise<void> {
  const existing = await getDb().from('labels').select('name').eq('id', id).single();
  if (existing.error) throwDb('labels.deleteById.lookup', existing.error);
  assertNotDefaultLabelName((existing.data as unknown as Pick<Label, 'name'>).name);

  const { error } = await getDb().from('labels').delete().eq('id', id);
  if (error) throwDb('labels.deleteById', error);
}

/**
 * Массовое обновление sort по порядку id (см. T-023: кнопки ↑↓ вместо drag).
 * «Без категории» и чужие/несуществующие id из чужого тенанта молча игнорируются —
 * её позиция всегда последняя (сид с sort=999), а сортировка недоступна ей ни в UI,
 * ни здесь, даже если id случайно попал в список.
 */
export async function reorder(tenantId: string, ids: string[]): Promise<void> {
  const existing = await listByTenant(tenantId);
  const existingIds = new Set(existing.map((label) => label.id));
  const defaultLabel = existing.find((label) => isDefaultLabel(label));

  const orderedIds = ids.filter((id) => existingIds.has(id) && id !== defaultLabel?.id);

  for (const [index, id] of orderedIds.entries()) {
    const { error } = await getDb()
      .from('labels')
      .update({ sort: index })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throwDb('labels.reorder', error);
  }
}

export async function findByNameCI(tenantId: string, name: string): Promise<Label | null> {
  const { data, error } = await getDb()
    .from('labels')
    .select()
    .eq('tenant_id', tenantId)
    .ilike('name', name)
    .maybeSingle();
  if (error) throwDb('labels.findByNameCI', error);
  return data as Label | null;
}

export async function seedDefaultLabels(tenantId: string): Promise<void> {
  const { error } = await getDb().rpc('seed_default_labels', { p_tenant: tenantId });
  if (error) throwDb('labels.seedDefaultLabels', error);
}
