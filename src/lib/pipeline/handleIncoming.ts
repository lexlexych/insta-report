import { igConnections, labels, messageLog, tenants, usageStats } from '@/lib/db';
import { classify } from '@/lib/pipeline/classify';
import { buildContext } from '@/lib/pipeline/context';
import { deliverDraft } from '@/lib/pipeline/deliverDraft';
import { generateDraft } from '@/lib/pipeline/draft';
import { conversationKey } from '@/lib/pipeline/key';

import type { IgEvent } from './types';

type HandleIncomingDeps = {
  getTenant: typeof tenants.getById;
  getConnection: typeof igConnections.getForTenant;
  buildContext: typeof buildContext;
  listLabels: typeof labels.listByTenant;
  classify: typeof classify;
  generateDraft: typeof generateDraft;
  deliverDraft: typeof deliverDraft;
  addMessageLog: typeof messageLog.add;
  incrementUsage: typeof usageStats.increment;
  logger: Pick<Console, 'log'>;
};

const DEFAULT_DEPS: HandleIncomingDeps = {
  getTenant: tenants.getById,
  getConnection: igConnections.getForTenant,
  buildContext,
  listLabels: labels.listByTenant,
  classify,
  generateDraft,
  deliverDraft,
  addMessageLog: messageLog.add,
  incrementUsage: usageStats.increment,
  logger: console,
};

/** Обработчик входящего сообщения клиента: контекст → классификация → черновик → доставка (T-020). */
export async function handleIncoming(
  tenantId: string,
  ev: IgEvent,
  deps: Partial<HandleIncomingDeps> = {},
): Promise<void> {
  const d = { ...DEFAULT_DEPS, ...deps };
  const [tenant, conn] = await Promise.all([d.getTenant(tenantId), d.getConnection(tenantId)]);
  if (!tenant) throw new Error(`Tenant not found: ${tenantId}`);
  if (!conn || conn.status !== 'active') {
    d.logger.log(`[pipeline] skip inactive Instagram connection tenant=${tenantId}`);
    return;
  }

  const ctx = await d.buildContext(conn, ev);
  const tenantLabels = await d.listLabels(tenantId);
  const { label } = await d.classify(tenant, tenantLabels, ctx);
  const { draftText } = await d.generateDraft(tenant, label, ctx, ev);

  await d.deliverDraft({ tenant, conn, ev, ctx, label, draftText });
  await d.addMessageLog(tenantId, conversationKey(ev), 'in', ctx.pendingText);
  await d.incrementUsage(tenantId, { draftsCreated: 1 });
}
