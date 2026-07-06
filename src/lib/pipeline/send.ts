import { InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';

import {
  drafts,
  igConnections,
  labels,
  messageLog,
  processedEvents,
  tenants,
  usageStats,
} from '@/lib/db';
import { getConversation, sendMessage } from '@/lib/ig/client';
import { answerCallback, deleteMessageSafe, editMessageHTML, sendMessageHTML } from '@/lib/tg/api';
import { renderDraftCard } from '@/lib/tg/draftCard';
import { ensureHistoryTopic } from '@/lib/tg/topics';

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
  markProcessedEvent: typeof processedEvents.tryInsert;
  editMessageHTML: typeof editMessageHTML;
  sendMessageHTML: typeof sendMessageHTML;
  deleteMessageSafe: typeof deleteMessageSafe;
  ensureHistoryTopic: typeof ensureHistoryTopic;
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
  markProcessedEvent: processedEvents.tryInsert,
  editMessageHTML,
  sendMessageHTML,
  deleteMessageSafe,
  ensureHistoryTopic,
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


function sentMessageId(message: unknown): number {
  const messageId = (message as { message_id?: unknown } | undefined)?.message_id;
  if (typeof messageId !== 'number') throw new Error('Telegram sendMessage returned no message_id');
  return messageId;
}

/**
 * Переносит отправленную карточку из топика категории в топик «Архив»: публикует итоговую
 * карточку (со статусом «Отправлено») в архивном топике и удаляет оригинал из текущего
 * топика. Указатель черновика переводится на архивное сообщение, чтобы поздние правки не
 * били по удалённой карточке. Если темы выключены (плоский режим) или переносить некуда —
 * карточка просто помечается на месте. Ошибки архивации не срывают факт отправки в Instagram.
 */
async function archiveSentDraft(
  tenant: NonNullable<Awaited<ReturnType<typeof tenants.getById>>>,
  draft: Draft,
  deps: SendDeps,
): Promise<void> {
  const statusLine = `✅ Отправлено ${formatBerlinTime(deps.now())}`;
  try {
    const chatId = tenant.tg_chat_id;
    const cardChatId = draft.tg_chat_id;
    const cardMessageId = draft.tg_message_id;
    const historyThreadId = chatId === null ? null : await deps.ensureHistoryTopic(tenant);

    if (historyThreadId === null || chatId === null || cardChatId === null || cardMessageId === null) {
      await editDraftCard(draft, deps, statusLine);
      return;
    }

    const html = await renderCard(draft, deps, statusLine);
    const archived = await deps.sendMessageHTML(chatId, html, undefined, historyThreadId);
    const archivedMessageId = sentMessageId(archived);
    await deps.deleteMessageSafe(cardChatId, cardMessageId);
    await deps.setDraftStatus(draft.id, 'sent', {
      tg_chat_id: chatId,
      tg_message_id: archivedMessageId,
    });
  } catch (error) {
    console.error(`[pipeline] archive move failed tenant=${tenant.id} draft=${draft.id}`, error);
    try {
      await editDraftCard(draft, deps, statusLine);
    } catch (editError) {
      console.error(`[pipeline] archive fallback edit failed draft=${draft.id}`, editError);
    }
  }
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
    if (staleDraft) {
      console.warn(`[pipeline] draft not pending draft=${draftId} status=${staleDraft.status}`);
      await editDraftCard(staleDraft, d, '⌛️ Карточка устарела');
    } else {
      console.warn(`[pipeline] draft not found for send draft=${draftId}`);
    }
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

    const mids = await d.sendMessage(accessToken, igAccountId, contactId, draftText);
    await Promise.all(
      mids.filter((mid) => mid.trim()).map((mid) => d.markProcessedEvent(tenant.id, mid)),
    );
    await d.setDraftStatus(draft.id, 'sent', { error: null });
    await d.addMessageLog(tenant.id, draft.conversation_key, 'out', draftText);
    await d.incrementUsage(tenant.id, { draftsSent: 1 });
    await archiveSentDraft(tenant, draft, d);
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
