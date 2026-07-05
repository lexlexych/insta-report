import type { IgEvent } from './types';

/**
 * Обработчик входящего сообщения клиента — заглушка до T-017…T-020.
 * TODO(T-017+): сбор контекста → классификация → черновик → карточка в Telegram.
 */
export async function handleIncoming(tenantId: string, ev: IgEvent): Promise<void> {
  void tenantId;
  void ev;
}
