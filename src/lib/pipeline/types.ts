export type IgEventKind = 'incoming' | 'echo';
export type MessageProvider = 'meta' | 'zernio';

/** Минимальный контракт активного канала, нужный общей части pipeline. */
export type PipelineConnection = { status: string };

/** Типизированное событие Instagram-вебхука после парсинга (см. T-016, plan §2.2 поток A). */
export interface IgEvent {
  kind: IgEventKind;
  /** ID бизнес-аккаунта тенанта (наша сторона). */
  accountId: string;
  /** ID собеседника-клиента. */
  contactId: string;
  text: string;
  hasAttachments: boolean;
  /** Типы вложений входящего message.attachments (без учёта отсутствующего type). */
  attachmentTypes: string[];
  mid: string;
  ts: number;
  /** Не задан для прямого Meta-вебхука; Zernio передаёт явное значение. */
  provider?: MessageProvider;
  /** ID переписки Zernio — нужен T-050 для отправки ответа через провайдера. */
  zernioConversationId?: string;
  zernioAccountId?: string;
  contactUsername?: string | null;
}
