import { drafts, messageLog } from '@/lib/db';
import { deleteMessageSafe } from '@/lib/tg/api';

import { conversationKey } from './key';
import type { IgEvent } from './types';

type DraftsRepo = Pick<typeof drafts, 'cancelPendingByConversation'>;
type MessageLogRepo = Pick<typeof messageLog, 'add'>;

export interface HandleEchoDeps {
  drafts: DraftsRepo;
  messageLog: MessageLogRepo;
  deleteMessageSafe: typeof deleteMessageSafe;
}

const DEFAULT_DEPS: HandleEchoDeps = {
  drafts,
  messageLog,
  deleteMessageSafe,
};

/** Отзывает pending-карточку, когда владелец бизнеса ответил вручную в Instagram. */
export async function handleEcho(
  tenantId: string,
  ev: IgEvent,
  deps: Partial<HandleEchoDeps> = {},
): Promise<void> {
  const d = { ...DEFAULT_DEPS, ...deps };
  const key = conversationKey(ev);
  const draft = await d.drafts.cancelPendingByConversation(tenantId, key);
  if (!draft) return;

  if (draft.tg_chat_id !== null && draft.tg_message_id !== null) {
    await d.deleteMessageSafe(draft.tg_chat_id, draft.tg_message_id);
  }

  await d.messageLog.add(tenantId, key, 'manual', ev.text || '[вложение]');
}
