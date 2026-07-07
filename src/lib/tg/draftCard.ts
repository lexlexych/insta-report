import { InlineKeyboard } from 'grammy';

import { escapeHTML } from './html';

const TELEGRAM_MESSAGE_LIMIT = 4096;
const PENDING_TEXT_LIMIT = 500;
const DRAFT_TEXT_LIMIT = 3000;
const UUID_LENGTH = 36;
const CALLBACK_DATA_LIMIT_BYTES = 64;

export type DraftCardVariant = 'pending' | 'sent';

export type DraftCardParams = {
  username: string | null;
  pendingText: string;
  draftText: string;
  /** Время для шапки: приход сообщения (pending) или отправки (sent), формат «14:30». */
  time: string;
  variant?: DraftCardVariant;
  statusLine?: string;
};

export function formatBerlinTime(date: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function truncateWithEllipsis(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 1) return '…'.slice(0, maxLength);
  return `${value.slice(0, maxLength - 1)}…`;
}

function contactLink(username: string): string {
  const safeUsername = escapeHTML(username);
  const hrefUsername = encodeURIComponent(username);
  return `<a href="https://instagram.com/${hrefUsername}">@${safeUsername}</a>`;
}

function headerLine(variant: DraftCardVariant, username: string | null, time: string): string {
  const safeTime = escapeHTML(time);

  if (variant === 'sent') {
    const recipient = username ? ` ${contactLink(username)}` : '';
    return `✅ отправлено в ${safeTime}${recipient}`;
  }

  const suffix = time ? ` в ${safeTime}` : '';
  if (!username) return `📩 <b>Новое сообщение</b> от клиента${suffix}`;
  return `📩 <b>Новое сообщение</b> от ${contactLink(username)}${suffix}`;
}

function buildCardHtml(params: DraftCardParams, draftLimit: number): string {
  const pendingText = escapeHTML(truncateWithEllipsis(params.pendingText, PENDING_TEXT_LIMIT));
  const draftText = escapeHTML(truncateWithEllipsis(params.draftText, draftLimit));
  const variant = params.variant ?? 'pending';
  const header = headerLine(variant, params.username, params.time);

  if (variant === 'sent') {
    // Отправленная карточка остаётся в своём топике, но становится лаконичной:
    // без кнопок, без категории и без строки статуса снизу.
    return `${header}
<blockquote>${pendingText}</blockquote>
<b>сообщение</b>:
<blockquote>${draftText}</blockquote>`;
  }

  const statusLine = params.statusLine ? `\n${escapeHTML(params.statusLine)}` : '';
  return `${header}
<blockquote>${pendingText}</blockquote>
<b>Черновик ответа</b>:
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
    // Без .row() — кнопка «IG чат» и «Отправить» остаются в одной строке.
    keyboard.url('IG чат', `https://ig.me/m/${encodeURIComponent(username)}`);
  }

  return keyboard.text('✅ Отправить', callbackData);
}
