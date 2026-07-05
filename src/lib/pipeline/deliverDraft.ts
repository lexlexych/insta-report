import type { DecryptedIgConnection } from '@/lib/db/igConnections';
import type { Label, Tenant } from '@/lib/pipeline/classify';
import type { ConversationContext } from '@/lib/pipeline/context';
import type { IgEvent } from '@/lib/pipeline/types';

export type DeliverDraftInput = {
  tenant: Tenant;
  conn: DecryptedIgConnection;
  ev: IgEvent;
  ctx: ConversationContext;
  label: Label;
  draftText: string;
};

/** Заглушка доставки до T-020: сохранять/отправлять карточку будет следующий тикет. */
export async function deliverDraft(input: DeliverDraftInput): Promise<void> {
  void input;
}
