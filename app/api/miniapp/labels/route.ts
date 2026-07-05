import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { drafts, labels } from '@/lib/db';
import { LabelNameConflictError } from '@/lib/db/errors';
import type { Database } from '@/lib/db';

type Label = Database['public']['Tables']['labels']['Row'];

const DRAFT_COUNT_WINDOW_DAYS = 30;

const NAME_MAX = 50;
const DESCRIPTION_MAX = 300;
const INSTRUCTION_MAX = 1000;

const createSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  description: z.string().trim().max(DESCRIPTION_MAX).optional().default(''),
  instruction: z.string().trim().max(INSTRUCTION_MAX).optional().default(''),
});

function sinceIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function toApiLabel(label: Label, draftCounts: Record<string, number>) {
  return {
    id: label.id,
    name: label.name,
    description: label.description,
    instruction: label.instruction,
    sort: label.sort,
    isDefault: labels.isDefaultLabel(label),
    draftCount30d: draftCounts[label.id] ?? 0,
  };
}

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);

  const [list, draftCounts] = await Promise.all([
    labels.listByTenant(tenant.id),
    drafts.countByLabelSince(tenant.id, sinceIso(DRAFT_COUNT_WINDOW_DAYS)),
  ]);

  return jsonResponse({
    labels: list.map((label) => toApiLabel(label, draftCounts)),
  });
});

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  // Новая метка встаёт в конец пользовательского порядка (перед «Без категории»,
  // у которой sort=999 и которая в этом расчёте не участвует) — иначе sort=0 по
  // умолчанию сталкивал бы новые метки с уже существующими на первом месте.
  const existing = await labels.listByTenant(tenant.id);
  const maxSort = existing.reduce(
    (max, label) => (labels.isDefaultLabel(label) ? max : Math.max(max, label.sort)),
    -1,
  );

  try {
    const created = await labels.create({
      tenant_id: tenant.id,
      name: parsed.data.name,
      description: parsed.data.description,
      instruction: parsed.data.instruction,
      sort: maxSort + 1,
    });

    return jsonResponse({ ok: true, label: toApiLabel(created, {}) }, 201);
  } catch (error) {
    if (error instanceof LabelNameConflictError) {
      return jsonResponse({ ok: false, error: 'name_conflict' }, 409);
    }
    throw error;
  }
});
