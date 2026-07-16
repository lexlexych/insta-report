import type { ZernioAccountRow } from '@/lib/db/zernioAccounts';
import { getConversationMessages } from '@/lib/zernio/client';
import { deriveContext, type ConversationContext, type ConversationMessage } from '@/lib/pipeline/context';

import type { ZernioPipelineEvent } from './mapEvent';

export type BuildZernioContextDeps = {
  getConversationMessages: typeof getConversationMessages;
};

const DEFAULT_DEPS: BuildZernioContextDeps = { getConversationMessages };

/**
 * Собирает контекст без Graph API: username приходит с вебхуком, а историю отдаёт Inbox Zernio.
 * Ошибки Inbox намеренно пробрасываются так же, как ошибки getConversation в Meta-варианте.
 */
export async function buildZernioContext(
  account: ZernioAccountRow,
  ev: ZernioPipelineEvent,
  deps: Partial<BuildZernioContextDeps> = {},
): Promise<ConversationContext> {
  const d = { ...DEFAULT_DEPS, ...deps };
  const zernioAccountId = account.zernio_account_id ?? ev.zernioAccountId;
  const rawMessages = await d.getConversationMessages(ev.zernioConversationId, zernioAccountId, {
    limit: 20,
    sortOrder: 'desc',
  });
  const messages: ConversationMessage[] = rawMessages.map((message) => ({
    text: message.message ?? '',
    // deriveContext определяет сторону сравнением с accountId; не полагаемся на senderId бизнеса.
    fromId: message.direction === 'outgoing' ? ev.accountId : message.senderId,
    createdTime: Number.isFinite(Date.parse(message.createdAt)) ? Date.parse(message.createdAt) : ev.ts,
  }));
  const contextMessages = messages.length
    ? messages
    : [{ text: ev.text, fromId: ev.contactId, createdTime: ev.ts }];

  return {
    username: ev.contactUsername,
    ...deriveContext(contextMessages, ev.accountId, ev.text),
  };
}
