import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { labels, usageStats } from '@/lib/db';
import { env } from '@/lib/env';
import { classify } from '@/lib/pipeline/classify';
import { deriveContext, type ConversationMessage } from '@/lib/pipeline/context';
import { generateDraft } from '@/lib/pipeline/draft';
import type { IgEvent } from '@/lib/pipeline/types';

const SIM_CLIENT_ID = 'sim-client';
const SIM_BUSINESS_ID = 'sim-biz';

const messageSchema = z.object({
  role: z.enum(['client', 'assistant']),
  text: z.string().trim().min(1).max(1000),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toConversationMessages(messages: z.infer<typeof messageSchema>[]): ConversationMessage[] {
  return messages.map((message, index) => ({
    text: message.text,
    fromId: message.role === 'assistant' ? SIM_BUSINESS_ID : SIM_CLIENT_ID,
    createdTime: index + 1,
  }));
}

function simulatorCallsToday(rows: Awaited<ReturnType<typeof usageStats.getRange>>): number {
  return rows.reduce((total, row) => total + row.simulator_calls, 0);
}

export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  if (!tenant.knowledge_base?.trim()) {
    return jsonResponse({ code: 'onboarding_required' }, 409);
  }

  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  const day = today();
  const currentUsage = await usageStats.getRange(tenant.id, day, day);
  if (simulatorCallsToday(currentUsage) >= env.SIMULATOR_DAILY_LIMIT) {
    return jsonResponse({ code: 'daily_limit' }, 429);
  }

  const conversationMessages = toConversationMessages(parsed.data.messages);
  const contextBase = deriveContext(conversationMessages, SIM_BUSINESS_ID, '');
  const ctx = { username: null, ...contextBase };
  const availableLabels = await labels.listByTenant(tenant.id);
  const classified = await classify(tenant, availableLabels, ctx);
  const event: IgEvent = {
    kind: 'incoming',
    accountId: SIM_BUSINESS_ID,
    contactId: SIM_CLIENT_ID,
    mid: `sim-${Date.now()}`,
    ts: Date.now(),
    text: ctx.pendingText,
    hasAttachments: false,
    attachmentTypes: [],
  };
  const draft = await generateDraft(tenant, classified.label, ctx, event);

  await usageStats.increment(tenant.id, { day, simulatorCalls: 1 });

  return jsonResponse({
    label: {
      id: classified.label.id,
      name: classified.label.name,
    },
    draft: draft.draftText,
    usage: {
      llmCalls:
        (classified.usage.inTok || classified.usage.outTok ? 1 : 0) +
        (draft.usage.inTok || draft.usage.outTok ? 1 : 0),
      tokensIn: classified.usage.inTok + draft.usage.inTok,
      tokensOut: classified.usage.outTok + draft.usage.outTok,
      simulatorCalls: simulatorCallsToday(currentUsage) + 1,
      dailyLimit: env.SIMULATOR_DAILY_LIMIT,
    },
  });
});
