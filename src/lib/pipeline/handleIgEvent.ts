import { parseIgEvent } from './parse';
import { handleEcho } from './handleEcho';
import { handleIncoming } from './handleIncoming';
import type { IgEvent } from './types';

// Типы вложений Meta, обозначающие репост чужого контента (share — репост поста/картинки, ig_reel — репост reels).
const REPOST_ATTACHMENT_TYPES = new Set(['share', 'ig_reel']);

/** Внедряемые зависимости — для демо/тестов; в проде используются реальные. */
export interface HandleIgEventDeps {
  tryInsert: (tenantId: string, mid: string) => Promise<boolean>;
  handleEcho: (tenantId: string, ev: IgEvent) => Promise<void>;
  handleIncoming: (tenantId: string, ev: IgEvent) => Promise<void>;
}

/** Динамический импорт db, чтобы статический импорт модуля не тянул 'server-only'. */
async function defaultTryInsert(tenantId: string, mid: string): Promise<boolean> {
  const { processedEvents } = await import('@/lib/db');
  return processedEvents.tryInsert(tenantId, mid);
}

export async function handleIgEvent(
  tenantId: string,
  body: unknown,
  deps?: Partial<HandleIgEventDeps>,
): Promise<void> {
  const ev = parseIgEvent(body);
  if (!ev) return; // мусор/read-событие → мягкий выход
  const tryInsert = deps?.tryInsert ?? defaultTryInsert;
  if (!(await tryInsert(tenantId, ev.mid))) return; // дубликат/ретрай Meta по mid
  const onEcho = deps?.handleEcho ?? handleEcho;
  const onIncoming = deps?.handleIncoming ?? handleIncoming;
  if (ev.kind === 'echo') return onEcho(tenantId, ev); // T-022
  if (!ev.text && !ev.hasAttachments) return; // пустое входящее без вложений → игнор
  // Репост чужого поста/reels без подписи — не создаём черновик, отвечать нечего.
  if (!ev.text.trim() && ev.hasAttachments && ev.attachmentTypes.length > 0 && ev.attachmentTypes.every((type) => REPOST_ATTACHMENT_TYPES.has(type))) return;
  return onIncoming(tenantId, ev); // T-017…T-020
}

export function logPipelineError(tenantId: string, error: unknown): void {
  console.error(`[pipeline] tenant=${tenantId}`, error);
}
