import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { drafts, igAccounts, igConnections, messageLog, usageStats } from '@/lib/db';
import { summarizeConnectionStatus } from '@/lib/ig/status';

const querySchema = z.object({ days: z.enum(['7', '30']).default('7') });

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function periodStart(days: 7 | 30): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - days + 1);
  return date;
}

export const GET = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({ days: url.searchParams.get('days') ?? '7' });
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  const days = Number(parsed.data.days) as 7 | 30;
  const from = periodStart(days);
  const fromDay = toDay(from);
  const toDayValue = toDay(new Date());

  const [usageRows, draftCounts, connection, account, recentRows] = await Promise.all([
    usageStats.getRange(tenant.id, fromDay, toDayValue),
    drafts.countByStatusSince(tenant.id, from.toISOString()),
    igConnections.getForTenant(tenant.id),
    igAccounts.getByTenant(tenant.id),
    messageLog.recent(tenant.id, 10),
  ]);

  const usage = usageRows.reduce(
    (acc, row) => ({
      llmCalls: acc.llmCalls + row.llm_calls,
      tokens: acc.tokens + row.tokens_in + row.tokens_out,
      draftsCreated: acc.draftsCreated + row.drafts_created,
      draftsSent: acc.draftsSent + row.drafts_sent,
    }),
    { llmCalls: 0, tokens: 0, draftsCreated: 0, draftsSent: 0 },
  );

  return jsonResponse({
    period: { days, from: fromDay, to: toDayValue },
    metrics: {
      dialogs: draftCounts.total,
      drafts: usage.draftsCreated || draftCounts.total,
      sent: usage.draftsSent || draftCounts.sent,
      manual: draftCounts.cancelled + draftCounts.skipped_manual,
      llmCalls: usage.llmCalls,
      tokens: usage.tokens,
      statuses: draftCounts,
    },
    connection: summarizeConnectionStatus(connection, account),
    recent: recentRows.map((row) => ({
      direction: row.direction,
      text: row.text && row.text.length > 80 ? `${row.text.slice(0, 79)}…` : (row.text ?? ''),
      createdAt: row.created_at,
    })),
  });
});
