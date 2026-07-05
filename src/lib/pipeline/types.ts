export type IgEventKind = 'incoming' | 'echo';

/** Типизированное событие Instagram-вебхука после парсинга (см. T-016, plan §2.2 поток A). */
export interface IgEvent {
  kind: IgEventKind;
  /** ID бизнес-аккаунта тенанта (наша сторона). */
  accountId: string;
  /** ID собеседника-клиента. */
  contactId: string;
  text: string;
  hasAttachments: boolean;
  mid: string;
  ts: number;
}
