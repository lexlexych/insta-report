import type { InlineKeyboard } from 'grammy';

import { getBot } from './bot';

type ChatId = number | string;
type TelegramApiErrorLike = { description?: string };
type ForumTopic = { message_thread_id: number };
type ChatInfo = { has_topics_enabled?: boolean };

type MessageOptions = {
  parse_mode: 'HTML';
  link_preview_options: { is_disabled: true };
  reply_markup?: InlineKeyboard;
  message_thread_id?: number;
};

function htmlOptions(keyboard?: InlineKeyboard, threadId?: number): MessageOptions {
  return {
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
    ...(threadId === undefined ? {} : { message_thread_id: threadId }),
  };
}

function isMessageToDeleteNotFound(error: unknown): boolean {
  const description = (error as TelegramApiErrorLike | undefined)?.description;
  return typeof description === 'string' && description.toLowerCase().includes('message to delete not found');
}

export async function sendMessageHTML(
  chatId: ChatId,
  html: string,
  keyboard?: InlineKeyboard,
  threadId?: number,
): Promise<unknown> {
  return getBot().api.sendMessage(chatId, html, htmlOptions(keyboard, threadId));
}

export async function editMessageHTML(
  chatId: ChatId,
  messageId: number,
  html: string,
  keyboard?: InlineKeyboard,
): Promise<unknown> {
  return getBot().api.editMessageText(chatId, messageId, html, htmlOptions(keyboard));
}

export async function deleteMessageSafe(chatId: ChatId, messageId: number): Promise<void> {
  try {
    await getBot().api.deleteMessage(chatId, messageId);
  } catch (error) {
    if (!isMessageToDeleteNotFound(error)) {
      throw error;
    }
  }
}

export async function answerCallback(id: string, text?: string): Promise<unknown> {
  return getBot().api.answerCallbackQuery(id, text ? { text } : undefined);
}


export async function createForumTopic(chatId: ChatId, name: string): Promise<number> {
  const topic = (await getBot().api.createForumTopic(chatId, name)) as ForumTopic;
  if (typeof topic.message_thread_id !== 'number') {
    throw new Error('Telegram createForumTopic returned no message_thread_id');
  }
  return topic.message_thread_id;
}

export async function editForumTopic(chatId: ChatId, threadId: number, name: string): Promise<unknown> {
  return getBot().api.editForumTopic(chatId, threadId, { name });
}

export async function deleteForumTopic(chatId: ChatId, threadId: number): Promise<unknown> {
  return getBot().api.deleteForumTopic(chatId, threadId);
}

export async function readTopicsEnabled(chatId: ChatId): Promise<boolean> {
  const chat = (await getBot().api.getChat(chatId)) as ChatInfo;
  return chat.has_topics_enabled === true;
}
