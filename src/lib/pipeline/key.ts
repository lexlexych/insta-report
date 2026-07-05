import type { IgEvent } from './types';

export function conversationKey(ev: Pick<IgEvent, 'accountId' | 'contactId'>): string {
  return `${ev.accountId}:${ev.contactId}`;
}
