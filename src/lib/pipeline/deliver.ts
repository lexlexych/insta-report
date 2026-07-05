import { PendingExistsError } from '@/lib/db/errors';
import { conversationKey } from '@/lib/pipeline/key';
import { draftKeyboard, renderDraftCard } from '@/lib/tg/draftCard';

import type { DecryptedIgConnection } from '@/lib/db/igConnections';
import type { Label, Tenant } from '@/lib/pipeline/classify';
import type { ConversationContext } from '@/lib/pipeline/context';
import type { IgEvent } from '@/lib/pipeline/types';

type SentTelegramMessage = { message_id: number };

export type DeliverDraftInput = {
  tenant: Tenant;
  conn: DecryptedIgConnection;
  ev: IgEvent;
  ctx: ConversationContext;
  label: Label;
  draftText: string;
};

type DeliverDraftDeps = {
  cancelPendingByConversation: typeof import('@/lib/db/drafts').cancelPendingByConversation;
  insertPending: typeof import('@/lib/db/drafts').insertPending;
  sendMessageHTML: typeof import('@/lib/tg/api').sendMessageHTML;
  deleteMessageSafe: typeof import('@/lib/tg/api').deleteMessageSafe;
  randomUUID: typeof crypto.randomUUID;
  logger: Pick<Console, 'error'>;
};

async function resolveDeps(deps: Partial<DeliverDraftDeps>): Promise<DeliverDraftDeps> {
  const draftRepo =
    deps.cancelPendingByConversation && deps.insertPending ? null : await import('@/lib/db/drafts');
  const tgApi =
    deps.sendMessageHTML && deps.deleteMessageSafe ? null : await import('@/lib/tg/api');

  return {
    cancelPendingByConversation:
      deps.cancelPendingByConversation ?? draftRepo?.cancelPendingByConversation,
    insertPending: deps.insertPending ?? draftRepo?.insertPending,
    sendMessageHTML: deps.sendMessageHTML ?? tgApi?.sendMessageHTML,
    deleteMessageSafe: deps.deleteMessageSafe ?? tgApi?.deleteMessageSafe,
    randomUUID: deps.randomUUID ?? crypto.randomUUID,
    logger: deps.logger ?? console,
  } as DeliverDraftDeps;
}

function sentMessageId(message: unknown): number {
  const messageId = (message as SentTelegramMessage | undefined)?.message_id;
  if (typeof messageId !== 'number') throw new Error('Telegram sendMessage returned no message_id');
  return messageId;
}

function isPendingExistsError(error: unknown): boolean {
  return (
    error instanceof PendingExistsError ||
    (error instanceof Error && error.name === 'PendingExistsError')
  );
}

/** Доставляет новую Telegram-карточку черновика, замещая предыдущий pending той же беседы. */
export async function deliverDraft(
  input: DeliverDraftInput,
  deps: Partial<DeliverDraftDeps> = {},
): Promise<void> {
  const d = await resolveDeps(deps);
  const key = conversationKey(input.ev);
  const old = await d.cancelPendingByConversation(input.tenant.id, key);
  if (old?.tg_chat_id && old.tg_message_id) {
    await d.deleteMessageSafe(old.tg_chat_id, old.tg_message_id);
  }

  const chatId = input.tenant.tg_chat_id;
  if (chatId === null) {
    d.logger.error(`[pipeline] cannot deliver draft without tg_chat_id tenant=${input.tenant.id}`);
    return;
  }

  const draftId = d.randomUUID();
  const html = renderDraftCard({
    username: input.ctx.username,
    pendingText: input.ctx.pendingText,
    labelName: input.label.name,
    draftText: input.draftText,
  });
  const sent = await d.sendMessageHTML(chatId, html, draftKeyboard(draftId, input.ctx.username));
  const messageId = sentMessageId(sent);

  try {
    await d.insertPending({
      id: draftId,
      tenant_id: input.tenant.id,
      conversation_key: key,
      contact_id: input.ev.contactId,
      contact_username: input.ctx.username,
      pending_text: input.ctx.pendingText,
      history_snapshot: input.ctx.history,
      label_id: input.label.id,
      draft_text: input.draftText,
      tg_chat_id: chatId,
      tg_message_id: messageId,
      trigger_ts: input.ev.ts,
    });
  } catch (error) {
    if (!isPendingExistsError(error)) throw error;
    await d.deleteMessageSafe(chatId, messageId);
    d.logger.error(`[pipeline] pending draft race tenant=${input.tenant.id} conversation=${key}`);
  }
}
