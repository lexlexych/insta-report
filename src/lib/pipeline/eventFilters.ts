import type { IgEvent } from './types';

// Типы вложений Meta, обозначающие репост чужого контента (share — пост/картинка, ig_reel — reels).
const REPOST_ATTACHMENT_TYPES = new Set(['share', 'ig_reel']);

/** Общие для Meta и Zernio фильтры входящих сообщений после дедупликации. */
export function shouldSkipIncomingEvent(ev: IgEvent): boolean {
  if (!ev.text && !ev.hasAttachments) return true;

  // Репост чужого поста/reels без подписи — создавать черновик не для чего.
  return (
    !ev.text.trim() &&
    ev.hasAttachments &&
    ev.attachmentTypes.length > 0 &&
    ev.attachmentTypes.every((type) => REPOST_ATTACHMENT_TYPES.has(type))
  );
}
