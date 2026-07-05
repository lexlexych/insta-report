import { getConversation, getUsername, type IgMessage } from '@/lib/ig/client';
import type { DecryptedIgConnection } from '@/lib/db/igConnections';

import type { IgEvent } from './types';

export type ConversationMessage = {
  text: string;
  fromId: string;
  createdTime: number;
};

export type ConversationContext = {
  username: string | null;
  history: string;
  pendingText: string;
  lastBusinessTs: number | null;
  messages: ConversationMessage[];
};

type BuildContextDeps = {
  getUsername: typeof getUsername;
  getConversation: typeof getConversation;
};

const DEFAULT_DEPS: BuildContextDeps = { getUsername, getConversation };

function normalizeMessage(message: IgMessage): ConversationMessage {
  return {
    text: message.text,
    fromId: message.fromId,
    createdTime: message.createdTime,
  };
}

function messageText(text: string): string {
  return text.trim() ? text : '[вложение]';
}

export function deriveContext(
  messages: ConversationMessage[],
  igAccountId: string,
  fallbackText: string,
): Omit<ConversationContext, 'username'> {
  const chronological = [...messages].sort((a, b) => a.createdTime - b.createdTime);
  const history = chronological
    .map((message) => {
      const side = message.fromId === igAccountId ? 'Бизнес' : 'Клиент';
      return `${side}: ${messageText(message.text)}`;
    })
    .join('\n');

  const pending: ConversationMessage[] = [];
  for (let index = chronological.length - 1; index >= 0; index -= 1) {
    const message = chronological[index];
    if (!message) continue;
    if (message.fromId === igAccountId) break;
    pending.push(message);
  }

  const pendingText = pending
    .reverse()
    .map((message) => messageText(message.text))
    .join('\n');

  const lastBusiness = [...chronological]
    .reverse()
    .find((message) => message.fromId === igAccountId);

  return {
    history,
    pendingText: pendingText || fallbackText,
    lastBusinessTs: lastBusiness?.createdTime ?? null,
    messages: chronological,
  };
}

export async function buildContext(
  conn: DecryptedIgConnection,
  ev: IgEvent,
  deps: BuildContextDeps = DEFAULT_DEPS,
): Promise<ConversationContext> {
  if (!conn.accessToken) {
    throw new Error('Instagram connection has no access token');
  }

  const igAccountId = conn.ig_account_id ?? ev.accountId;

  const [username, conversation] = await Promise.all([
    deps.getUsername(conn.accessToken, ev.contactId),
    deps.getConversation(conn.accessToken, igAccountId, ev.contactId, 20),
  ]);

  const messages = conversation.length
    ? conversation.map(normalizeMessage)
    : [{ text: ev.text, fromId: ev.contactId, createdTime: ev.ts }];

  return {
    username,
    ...deriveContext(messages, igAccountId, ev.text),
  };
}
