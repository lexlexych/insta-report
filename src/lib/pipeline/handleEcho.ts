import type { IgEvent } from './types';

/**
 * Обработчик echo-события (владелец ответил вручную) — заглушка до T-022.
 * TODO(T-022): найти pending-черновик по conversation_key, удалить TG-карточку,
 * status=cancelled, message_log(manual).
 */
export async function handleEcho(tenantId: string, ev: IgEvent): Promise<void> {
  void tenantId;
  void ev;
}
