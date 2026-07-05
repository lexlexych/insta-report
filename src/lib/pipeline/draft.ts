import type { complete } from '@/lib/llm/client';
import { draftPrompt } from '@/lib/llm/prompts';
import type { ConversationContext } from '@/lib/pipeline/context';
import type { Label, Tenant, LlmUsage } from '@/lib/pipeline/classify';
import type { IgEvent } from '@/lib/pipeline/types';

const ZERO_USAGE: LlmUsage = { inTok: 0, outTok: 0 };
const ATTACHMENT_FALLBACK_TEXT = '[вложение]';

const ATTACHMENT_REPLIES = {
  ru: 'Здравствуйте! Вижу, вы отправили вложение — подскажите, пожалуйста, что вас интересует?',
  de: 'Hallo! Ich sehe, dass Sie einen Anhang gesendet haben — sagen Sie mir bitte, was Sie interessiert?',
} as const;

class DraftLlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmError';
  }
}

type DraftDeps = {
  complete?: typeof complete;
  modelDraft?: string;
};

function stripWrappingQuotes(text: string): string {
  const trimmed = text.trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ['“', '”'],
    ['«', '»'],
    ['„', '“'],
  ];
  for (const [open, close] of pairs) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close) && trimmed.length >= open.length + close.length) {
      return trimmed.slice(open.length, -close.length).trim();
    }
  }
  return trimmed;
}

function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

function attachmentLanguage(tenant: Tenant, ctx: ConversationContext): keyof typeof ATTACHMENT_REPLIES {
  if (tenant.reply_language === 'ru') return 'ru';
  if (tenant.reply_language === 'de') return 'de';
  return hasCyrillic(`${ctx.history}\n${ctx.pendingText}`) ? 'ru' : 'de';
}

function isAttachmentOnly(ctx: ConversationContext, ev: IgEvent): boolean {
  const pendingText = ctx.pendingText.trim();
  return ev.hasAttachments && (!pendingText || pendingText === ATTACHMENT_FALLBACK_TEXT);
}

export async function generateDraft(
  tenant: Tenant,
  label: Label,
  ctx: ConversationContext,
  ev: IgEvent,
  deps: DraftDeps = {},
): Promise<{ draftText: string; usage: LlmUsage }> {
  if (isAttachmentOnly(ctx, ev)) {
    return { draftText: ATTACHMENT_REPLIES[attachmentLanguage(tenant, ctx)], usage: ZERO_USAGE };
  }

  const prompt = draftPrompt(tenant, label, ctx.history, ctx.pendingText);
  const injectedModel = deps.modelDraft;
  const llm = deps.complete && injectedModel
    ? { complete: deps.complete, getModelDraft: () => injectedModel, LlmError: DraftLlmError }
    : await import('@/lib/llm/client');
  const llmComplete = deps.complete ?? llm.complete;
  const result = await llmComplete({
    model: deps.modelDraft ?? llm.getModelDraft(),
    system: prompt.system,
    user: prompt.user,
    temperature: 0.7,
    maxTokens: 500,
    tenantId: tenant.id,
  });

  const draftText = stripWrappingQuotes(result.text);
  if (!draftText) throw new llm.LlmError('empty_draft');
  return { draftText, usage: result.usage };
}

export const __draftInternals = {
  ATTACHMENT_FALLBACK_TEXT,
  ATTACHMENT_REPLIES,
  attachmentLanguage,
  hasCyrillic,
  isAttachmentOnly,
  stripWrappingQuotes,
};
