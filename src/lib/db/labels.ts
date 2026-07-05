import { getDb } from './client';
import { ForbiddenLabelError, throwDb } from './errors';
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
  if (error) throwDb('labels.create', error);
  return data as Label;
}

export async function updateById(id: string, patch: LabelUpdate): Promise<Label> {
  assertNotDefaultLabelName(patch.name);
  const { data, error } = await getDb().from('labels').update(patch).eq('id', id).select().single();
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
