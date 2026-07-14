import { z } from 'zod';

import type { IgEvent } from './types';

// Meta шлёт больше полей, чем нам нужно — .passthrough() на каждом уровне объекта,
// чтобы не терять валидность схемы на будущих полях API.
const igIdRefSchema = z.object({ id: z.string() }).passthrough();

const igMessageSchema = z
  .object({
    mid: z.string(),
    text: z.string().optional(),
    is_echo: z.boolean().optional(),
    attachments: z.array(z.unknown()).optional(),
  })
  .passthrough();

const igMessagingSchema = z
  .object({
    sender: igIdRefSchema,
    recipient: igIdRefSchema,
    timestamp: z.number(),
    message: igMessageSchema.optional(),
    read: z.unknown().optional(),
  })
  .passthrough();

const igEntrySchema = z
  .object({
    id: z.string(),
    time: z.number(),
    messaging: z.array(igMessagingSchema).optional(),
  })
  .passthrough();

export const igWebhookSchema = z
  .object({
    object: z.literal('instagram'),
    entry: z.array(igEntrySchema),
  })
  .passthrough();

/**
 * Разбирает сырое тело Meta-вебхука в типизированное событие.
 * Возвращает null для невалидных/нерелевантных тел (не-instagram, read-квитанции без message и т.п.) —
 * это ожидаемый мягкий выход, а не ошибка (см. T-016, plan §2.2).
 */
export function parseIgEvent(body: unknown): IgEvent | null {
  const parsed = igWebhookSchema.safeParse(body);
  if (!parsed.success) return null;
  const entry = parsed.data.entry[0];
  if (!entry) return null;
  const m = entry.messaging?.[0];
  if (!m) return null;
  if (!m.message) return null; // read-событие / нет message → пропуск
  const isEcho = m.message.is_echo === true;
  // Правило сторон (порт из n8n «Parse & Route»):
  //   echo   → accountId = sender.id,   contactId = recipient.id
  //   иначе  → accountId = recipient.id, contactId = sender.id
  const accountId = isEcho ? m.sender.id : m.recipient.id;
  const contactId = isEcho ? m.recipient.id : m.sender.id;
  const text = m.message.text ?? '';
  const hasAttachments = Array.isArray(m.message.attachments) && m.message.attachments.length > 0;
  // Держим attachmentTypes той же длины, что attachments: элементу без строкового type подставляем
  // 'unknown', чтобы смешанные вложения (например share + вложение без type) не были ошибочно
  // распознаны как "все — репост" в handleIgEvent.
  const attachmentTypes = (m.message.attachments ?? []).map((attachment) =>
    attachment && typeof attachment === 'object' && 'type' in attachment && typeof (attachment as { type?: unknown }).type === 'string'
      ? (attachment as { type: string }).type
      : 'unknown',
  );
  return {
    kind: isEcho ? 'echo' : 'incoming',
    accountId,
    contactId,
    text,
    hasAttachments,
    attachmentTypes,
    mid: m.message.mid,
    ts: m.timestamp,
  };
}
