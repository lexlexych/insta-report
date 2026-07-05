import { InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';

import { drafts, igConnections, labels, messageLog, tenants, usageStats } from '@/lib/db';
import { getConversation, sendMessage } from '@/lib/ig/client';
import { editMessageHTML, answerCallback } from '@/lib/tg/api';
import { renderDraftCard } from '@/lib/tg/draftCard';

import type { Database } from '@/lib/db/types.gen';

type Draft = Database['public']['Tables']['drafts']['Row'];
type Label = Database['public']['Tables']['labels']['Row'];

type SendDeps = {
  answerCallback: typeof answerCallback;
  claimPendingToSending: typeof drafts.claimPendingToSending;
  getDraftById: typeof drafts.getById;
  setDraftStatus: typeof drafts.setStatus;
  setErrorToPending: typeof drafts.setErrorToPending;
  getTenant: typeof tenants.getById;
  getConnection: typeof igConnections.getForTenant;
  getLabel: typeof labels.getById;
  getConversation: typeof getConversation;
  sendMessage: typeof sendMessage;
  addMessageLog: typeof messageLog.add;
  incrementUsage: typeof usageStats.increment;
  editMessageHTML: typeof editMessageHTML;
  now: () => Date;
};

const DEFAULT_DEPS: SendDeps = {
  answerCallback,
  claimPendingToSending: drafts.claimPendingToSending,
  getDraftById: drafts.getById,
  setDraftStatus: drafts.setStatus,
  setErrorToPending: drafts.setErrorToPending,
  getTenant: tenants.getById,
  getConnection: igConnections.getForTenant,
  getLabel: labels.getById,
  getConversation,
  sendMessage,
  addMessageLog: messageLog.add,
  incrementUsage: usageStats.increment,
  editMessageHTML,
  now: () => new Date(),
};

function shortError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 200);
  return 'неизвестная ошибка';
}

function formatBerlinTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function retryKeyboard(draftId: string): InlineKeyboard {
  return new InlineKeyboard().text('🔁 Повторить', `retry:${draftId}`);
}

async function renderCard(draft: Draft, deps: SendDeps, statusLine: string): Promise<string> {
  let label: Label | null = null;
  if (draft.label_id) label = await deps.getLabel(draft.label_id);

  return renderDraftCard({
    username: draft.contact_username,
    pendingText: draft.pending_text ?? '',
    labelName: label?.name ?? 'Без категории',
    draftText: draft.draft_text ?? '',
    statusLine,
  });
}

async function editDraftCard(
  draft: Draft,
  deps: SendDeps,
  statusLine: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  if (draft.tg_chat_id === null || draft.tg_message_id === null) return;
  await deps.editMessageHTML(
    draft.tg_chat_id,
    draft.tg_message_id,
    await renderCard(draft, deps, statusLine),
    keyboard,
  );
}

async function markError(draft: Draft, deps: SendDeps, message: string): Promise<void> {
  await deps.setDraftStatus(draft.id, 'error', { error: message });
  await editDraftCard(draft, deps, `❌ Ошибка отправки: ${message}`, retryKeyboard(draft.id));
}

export async function attemptSend(
  draftId: string,
  callbackQueryId: string,
  deps: Partial<SendDeps> = {},
  shouldAnswerCallback = true,
): Promise<void> {
  const d = { ...DEFAULT_DEPS, ...deps };
  if (shouldAnswerCallback) await d.answerCallback(callbackQueryId, 'Отправляю…');

  const draft = await d.claimPendingToSending(draftId);
  if (!draft) {
    const staleDraft = await d.getDraftById(draftId);
    if (staleDraft) await editDraftCard(staleDraft, d, '⌛️ Карточка устарела');
    return;
  }

  const [tenant, conn] = await Promise.all([
    d.getTenant(draft.tenant_id),
    d.getConnection(draft.tenant_id),
  ]);
  if (!tenant) {
    await markError(draft, d, 'тенант не найден');
    return;
  }
  if (!conn?.accessToken || !conn.ig_account_id || conn.status !== 'active') {
    await markError(draft, d, 'Instagram подключение неактивно или не настроено');
    return;
  }
  if (!draft.contact_id || !draft.draft_text) {
    await markError(draft, d, 'в черновике нет контакта или текста');
    return;
  }

  const accessToken = conn.accessToken;
  const igAccountId = conn.ig_account_id;
  const contactId = draft.contact_id;
  const draftText = draft.draft_text;

  try {
    const messages = await d.getConversation(accessToken, igAccountId, contactId, 20);
    const hasManualReply = messages.some(
      (message) =>
        message.fromId === igAccountId &&
        draft.trigger_ts !== null &&
        message.createdTime > draft.trigger_ts,
    );
    if (hasManualReply) {
      await d.setDraftStatus(draft.id, 'skipped_manual', { error: null });
      await editDraftCard(draft, d, '⚠️ Отменено: вы уже ответили вручную');
      return;
    }

    await d.sendMessage(accessToken, igAccountId, contactId, draftText);
    await d.setDraftStatus(draft.id, 'sent', { error: null });
    await d.addMessageLog(tenant.id, draft.conversation_key, 'out', draftText);
    await d.incrementUsage(tenant.id, { draftsSent: 1 });
    await editDraftCard(draft, d, `✅ Отправлено ${formatBerlinTime(d.now())}`);
  } catch (error) {
    await markError(draft, d, shortError(error));
  }
}

function callbackQueryId(ctx: Context): string | null {
  const id = (ctx as { callbackQuery?: { id?: unknown } }).callbackQuery?.id;
  return typeof id === 'string' ? id : null;
}

export async function handleSendCallback(
  ctx: Context,
  draftId: string,
  deps: Partial<SendDeps> = {},
): Promise<void> {
  const cbId = callbackQueryId(ctx);
  if (!cbId) {
    await ctx.answerCallbackQuery();
    return;
  }
  await attemptSend(draftId, cbId, deps);
}

export async function handleRetryCallback(
  ctx: Context,
  draftId: string,
  deps: Partial<SendDeps> = {},
): Promise<void> {
  const cbId = callbackQueryId(ctx);
  if (!cbId) {
    await ctx.answerCallbackQuery();
    return;
  }
  const d = { ...DEFAULT_DEPS, ...deps };
  await d.answerCallback(cbId, 'Отправляю…');
  const draft = await d.setErrorToPending(draftId);
  if (!draft) {
    const staleDraft = await d.getDraftById(draftId);
    if (staleDraft) await editDraftCard(staleDraft, d, '⌛️ Карточка устарела');
    return;
  }
  await attemptSend(draftId, cbId, deps, false);
}
