import { z } from 'zod';

import { apiHandler, HttpError, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { labels } from '@/lib/db';
import { ForbiddenLabelError, LabelNameConflictError } from '@/lib/db/errors';
import { removeLabelTopic, renameLabelTopic } from '@/lib/tg/topics';

type RouteParams = { params: Promise<{ id: string }> };

const NAME_MAX = 50;
const DESCRIPTION_MAX = 300;
const INSTRUCTION_MAX = 1000;

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(NAME_MAX).optional(),
    description: z.string().trim().max(DESCRIPTION_MAX).optional(),
    instruction: z.string().trim().max(INSTRUCTION_MAX).optional(),
    sort: z.number().int().min(0).optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), { message: 'empty_patch' });

export const PUT = async (req: Request, { params }: RouteParams): Promise<Response> =>
  apiHandler(async (request: Request) => {
    const tenant = await requireTenant(request);
    const { id } = await params;

    const existing = await labels.getById(id);
    if (!existing || existing.tenant_id !== tenant.id) {
      throw new HttpError(404, 'not_found');
    }
    // Защита на уровне API (см. T-023 AC): «Без категории» непереименуема/неизменяема —
    // отдельно от той же проверки в labels.updateById (repo), чтобы не тратить лишний
    // round-trip к БД на заведомо запрещённый запрос.
    if (labels.isDefaultLabel(existing)) {
      throw new HttpError(403, 'forbidden_default_label');
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

    try {
      await labels.updateById(id, {
        name: parsed.data.name,
        description: parsed.data.description,
        instruction: parsed.data.instruction,
        sort: parsed.data.sort,
      });
      if (parsed.data.name) await renameLabelTopic(tenant, existing, parsed.data.name);
    } catch (error) {
      if (error instanceof ForbiddenLabelError) throw new HttpError(403, 'forbidden_default_label');
      if (error instanceof LabelNameConflictError) return jsonResponse({ ok: false, error: 'name_conflict' }, 409);
      throw error;
    }

    return jsonResponse({ ok: true });
  })(req);

export const DELETE = async (req: Request, { params }: RouteParams): Promise<Response> =>
  apiHandler(async (request: Request) => {
    const tenant = await requireTenant(request);
    const { id } = await params;

    const existing = await labels.getById(id);
    if (!existing || existing.tenant_id !== tenant.id) {
      throw new HttpError(404, 'not_found');
    }
    if (labels.isDefaultLabel(existing)) {
      throw new HttpError(403, 'forbidden_default_label');
    }

    try {
      // drafts.label_id -> NULL при удалении метки обеспечивает FK `on delete set null`
      // (см. supabase/migrations/0001_init.sql) — приложению не нужно чистить drafts руками.
      await removeLabelTopic(tenant, existing);
      await labels.deleteById(id);
    } catch (error) {
      if (error instanceof ForbiddenLabelError) throw new HttpError(403, 'forbidden_default_label');
      throw error;
    }

    return jsonResponse({ ok: true });
  })(req);
