import { InlineKeyboard } from 'grammy';

import { escapeHTML } from './html';

const TELEGRAM_MESSAGE_LIMIT = 4096;
const PENDING_TEXT_LIMIT = 500;
const DRAFT_TEXT_LIMIT = 3000;
const UUID_LENGTH = 36;
const CALLBACK_DATA_LIMIT_BYTES = 64;

type DraftCardStatus = 'pending' | 'sent' | 'skipped' | 'error';

export type DraftCardParams = {
  username: string | null;
  pendingText: string;
  labelName: string;
  draftText: string;
  status?: DraftCardStatus;
  statusLine?: string;
};

function truncateWithEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return '…'.slice(0, maxLength);
  return `${value.slice(0, maxLength - 1)}…`;
}

function usernameLine(username: string | null): string {
  if (!username) return '📩 <b>Новое сообщение</b> от клиента';

  const safeUsername = escapeHTML(username);
  const hrefUsername = encodeURIComponent(username);
  return `📩 <b>Новое сообщение</b> от <a href="https://instagram.com/${hrefUsername}">@${safeUsername}</a>`;
}

function buildCardHtml(params: DraftCardParams, draftLimit: number): string {
  const pendingText = escapeHTML(truncateWithEllipsis(params.pendingText, PENDING_TEXT_LIMIT));
  const labelName = escapeHTML(params.labelName);
  const draftText = escapeHTML(truncateWithEllipsis(params.draftText, draftLimit));
  const statusLine = params.statusLine ? `\n${escapeHTML(params.statusLine)}` : '';

  return `${usernameLine(params.username)}
<blockquote>${pendingText}</blockquote>
🏷 ${labelName}

<b>Черновик ответа</b> <i>(нажмите текст, чтобы скопировать)</i>:
<pre>${draftText}</pre>${statusLine}`;
}

export function renderDraftCard(params: DraftCardParams): string {
  let draftLimit = DRAFT_TEXT_LIMIT;
  let html = buildCardHtml(params, draftLimit);

  while (html.length > TELEGRAM_MESSAGE_LIMIT && draftLimit > 1) {
    draftLimit -= html.length - TELEGRAM_MESSAGE_LIMIT + 1;
    html = buildCardHtml(params, Math.max(1, draftLimit));
  }

  if (html.length > TELEGRAM_MESSAGE_LIMIT) {
    throw new Error('Draft card cannot fit Telegram message limit');
  }

  return html;
}

export function draftKeyboard(draftId: string, username: string | null): InlineKeyboard {
  if (draftId.length !== UUID_LENGTH) {
    throw new Error('draftKeyboard requires UUID draftId');
  }

  const callbackData = `send:${draftId}`;
  if (Buffer.byteLength(callbackData, 'utf8') > CALLBACK_DATA_LIMIT_BYTES) {
    throw new Error('draftKeyboard callback_data exceeds Telegram limit');
  }

  const keyboard = new InlineKeyboard();
  if (username) {
    keyboard.url('🔗 Открыть в Instagram', `https://ig.me/m/${encodeURIComponent(username)}`).row();
  }

  return keyboard.text('✅ Отправить', callbackData);
}
