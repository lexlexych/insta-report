import { InlineKeyboard } from 'grammy';
import type { Context } from 'grammy';

import {
  drafts,
  igConnections,
  messageLog,
  processedEvents,
  tenants,
  usageStats,
  zernioAccounts,
} from '@/lib/db';
import { isZernioEnabled } from '@/lib/env';
import { getConversation, sendMessage } from '@/lib/ig/client';
import { splitMessage } from '@/lib/ig/split';
import { answerCallback, editMessageHTML } from '@/lib/tg/api';
import { formatBerlinTime, renderDraftCard } from '@/lib/tg/draftCard';
import {
  getConversationMessages as getZernioConversationMessages,
  sendMessage as sendZernioMessage,
  ZernioApiError,
} from '@/lib/zernio/client';

import type { DraftCardVariant } from '@/lib/tg/draftCard';
import type { Database } from '@/lib/db/types.gen';

type Draft = Database['public']['Tables']['drafts']['Row'];

type SendDeps = {
  answerCallback: typeof answerCallback;
  claimPendingToSending: typeof drafts.claimPendingToSending;
  getDraftById: typeof drafts.getById;
  setDraftStatus: typeof drafts.setStatus;
  setErrorToPending: typeof drafts.setErrorToPending;
  getTenant: typeof tenants.getById;
  getConnection: typeof igConnections.getForTenant;
  isZernioEnabled: typeof isZernioEnabled;
  getZernioAccount: typeof zernioAccounts.getForTenant;
  getConversation: typeof getConversation;
  sendMessage: typeof sendMessage;
  getZernioConversationMessages: typeof getZernioConversationMessages;
  sendZernioMessage: typeof sendZernioMessage;
  addMessageLog: typeof messageLog.add;
  incrementUsage: typeof usageStats.increment;
  markProcessedEvent: typeof processedEvents.tryInsert;
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
  isZernioEnabled,
  getZernioAccount: zernioAccounts.getForTenant,
  getConversation,
  sendMessage,
  getZernioConversationMessages,
  sendZernioMessage,
  addMessageLog: messageLog.add,
  incrementUsage: usageStats.increment,
  markProcessedEvent: processedEvents.tryInsert,
  editMessageHTML,
  now: () => new Date(),
};

function shortError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 200);
  return 'неизвестная ошибка';
}

function triggerTime(draft: Draft): string {
  return draft.trigger_ts === null ? '' : formatBerlinTime(new Date(draft.trigger_ts));
}

function retryKeyboard(draftId: string): InlineKeyboard {
  return new InlineKeyboard().text('🔁 Повторить', `retry:${draftId}`);
}

/**
 * Финализирует отправленную карточку прямо в её топике: редактирует сообщение в лаконичный
 * вид (шапка «✅ отправлено в …», без кнопок, без категории и без нижней строки статуса).
 * Архивного топика больше нет — карточка никуда не переносится. Ошибки редактирования не
 * срывают факт отправки в Instagram.
 */
async function finalizeSentDraft(draft: Draft, deps: SendDeps): Promise<void> {
  if (draft.tg_chat_id === null || draft.tg_message_id === null) return;
  try {
    const html = await renderCard(draft, {
      variant: 'sent',
      time: formatBerlinTime(deps.now()),
    });
    await deps.editMessageHTML(draft.tg_chat_id, draft.tg_message_id, html);
  } catch (error) {
    console.error(`[pipeline] sent card edit failed draft=${draft.id}`, error);
  }
}

async function renderCard(
  draft: Draft,
  opts: { variant: DraftCardVariant; time: string; statusLine?: string },
): Promise<string> {
  return renderDraftCard({
    username: draft.contact_username,
    pendingText: draft.pending_text ?? '',
    draftText: draft.draft_text ?? '',
    time: opts.time,
    variant: opts.variant,
    statusLine: opts.statusLine,
  });
}

async function editDraftCard(
  draft: Draft,
  deps: SendDeps,
  statusLine: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  if (draft.tg_chat_id === null || draft.tg_message_id === null) return;
  const html = await renderCard(draft, {
    variant: 'pending',
    time: triggerTime(draft),
    statusLine,
  });
  await deps.editMessageHTML(draft.tg_chat_id, draft.tg_message_id, html, keyboard);
}

async function markError(draft: Draft, deps: SendDeps, message: string): Promise<void> {
  await deps.setDraftStatus(draft.id, 'error', { error: message });
  await editDraftCard(draft, deps, `❌ Ошибка отправки: ${message}`, retryKeyboard(draft.id));
}

async function finalizeSuccessfulSend(draft: Draft, deps: SendDeps): Promise<void> {
  await deps.setDraftStatus(draft.id, 'sent', { error: null });
  await deps.addMessageLog(draft.tenant_id, draft.conversation_key, 'out', draft.draft_text ?? '');
  await deps.incrementUsage(draft.tenant_id, { draftsSent: 1 });
  await finalizeSentDraft(draft, deps);
}

function isPlatformLimitation(error: unknown): boolean {
  return (
    error instanceof ZernioApiError &&
    error.status === 400 &&
    error.code === 'PLATFORM_LIMITATION'
  );
}

async function sendZernioPart(
  draft: Draft,
  accountId: string,
  text: string,
  deps: SendDeps,
): Promise<string> {
  const conversationId = draft.zernio_conversation_id!;
  try {
    return (await deps.sendZernioMessage(conversationId, accountId, text)).messageId;
  } catch (error) {
    if (!isPlatformLimitation(error)) throw error;
    return (
      await deps.sendZernioMessage(conversationId, accountId, text, {
        messageTag: 'HUMAN_AGENT',
      })
    ).messageId;
  }
}

async function attemptZernioSend(draft: Draft, deps: SendDeps): Promise<void> {
  if (!deps.isZernioEnabled()) {
    await markError(draft, deps, 'zernio_disabled');
    return;
  }

  let account;
  try {
    account = await deps.getZernioAccount(draft.tenant_id);
  } catch (error) {
    await markError(draft, deps, shortError(error));
    return;
  }

  if (!account || account.status !== 'active' || !account.zernio_account_id) {
    const message =
      account?.status === 'disconnected'
        ? 'Подключение Zernio отключено. Переподключите Instagram.'
        : 'Zernio подключение неактивно или не настроено';
    await markError(draft, deps, message);
    return;
  }
  if (!draft.zernio_conversation_id) {
    await markError(draft, deps, 'в черновике нет Zernio-переписки');
    return;
  }
  if (!draft.draft_text) {
    await markError(draft, deps, 'в черновике нет текста');
    return;
  }

  try {
    try {
      const messages = await deps.getZernioConversationMessages(
        draft.zernio_conversation_id,
        account.zernio_account_id,
        { limit: 20, sortOrder: 'desc' },
      );
      const hasManualReply = messages.some(
        (message) =>
          message.direction === 'outgoing' &&
          draft.trigger_ts !== null &&
          Date.parse(message.createdAt) > draft.trigger_ts,
      );
      if (hasManualReply) {
        await deps.setDraftStatus(draft.id, 'skipped_manual', { error: null });
        await editDraftCard(draft, deps, '⚠️ Отменено: вы уже ответили вручную');
        return;
      }
    } catch (error) {
      // Анти-двойник намеренно best-effort: недоступный Inbox не должен блокировать ответ.
      console.warn(`[pipeline] Zernio anti-double-check failed draft=${draft.id}`, error);
    }

    const parts = splitMessage(draft.draft_text, 1000);
    let sentParts = 0;
    try {
      for (const part of parts) {
        const messageId = await sendZernioPart(draft, account.zernio_account_id, part, deps);
        if (!messageId.trim()) throw new Error('Zernio returned an empty message ID');
        sentParts += 1;
        await deps.markProcessedEvent(draft.tenant_id, messageId);
      }
    } catch (error) {
      const prefix = sentParts > 0 ? `отправлено частично (${sentParts} из ${parts.length}): ` : '';
      await markError(draft, deps, `${prefix}${shortError(error)}`);
      return;
    }

    await finalizeSuccessfulSend(draft, deps);
  } catch (error) {
    await markError(draft, deps, shortError(error));
  }
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

  const tenant = await d.getTenant(draft.tenant_id);
  if (!tenant) {
    await markError(draft, d, 'тенант не найден');
    return;
  }
  if (draft.provider === 'zernio') {
    await attemptZernioSend(draft, d);
    return;
  }

  const conn = await d.getConnection(draft.tenant_id);
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
    await finalizeSuccessfulSend(draft, d);
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
