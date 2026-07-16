import { shouldSkipIncomingEvent } from '@/lib/pipeline/eventFilters';
import type { HandleIncomingDeps } from '@/lib/pipeline/handleIncoming';
import type { IgEvent } from '@/lib/pipeline/types';
import type { ZernioAccountRow } from '@/lib/db/zernioAccounts';

import { buildZernioContext } from './context';
import { mapZernioMessage, type ZernioPipelineEvent } from './mapEvent';

export type HandleZernioMessageDeps = {
  mapEvent: typeof mapZernioMessage;
  getAccount: (zernioAccountId: string | null | undefined) => Promise<ZernioAccountRow | null>;
  tryInsert: (tenantId: string, mid: string) => Promise<boolean>;
  handleEcho: (tenantId: string, ev: IgEvent) => Promise<void>;
  handleIncoming: (
    tenantId: string,
    ev: IgEvent,
    deps?: Partial<HandleIncomingDeps>,
  ) => Promise<void>;
  buildContext: typeof buildZernioContext;
  logger: Pick<Console, 'debug'>;
};

async function defaultGetAccount(zernioAccountId: string | null | undefined): Promise<ZernioAccountRow | null> {
  const { zernioAccounts } = await import('@/lib/db');
  return zernioAccounts.getByZernioAccountId(zernioAccountId);
}

async function defaultTryInsert(tenantId: string, mid: string): Promise<boolean> {
  const { processedEvents } = await import('@/lib/db');
  return processedEvents.tryInsert(tenantId, mid);
}

async function defaultHandleEcho(tenantId: string, ev: IgEvent): Promise<void> {
  const { handleEcho } = await import('@/lib/pipeline/handleEcho');
  return handleEcho(tenantId, ev);
}

async function defaultHandleIncoming(
  tenantId: string,
  ev: IgEvent,
  deps?: Partial<HandleIncomingDeps>,
): Promise<void> {
  const { handleIncoming } = await import('@/lib/pipeline/handleIncoming');
  return handleIncoming(tenantId, ev, deps);
}

const DEFAULT_DEPS: HandleZernioMessageDeps = {
  mapEvent: mapZernioMessage,
  getAccount: defaultGetAccount,
  tryInsert: defaultTryInsert,
  handleEcho: defaultHandleEcho,
  handleIncoming: defaultHandleIncoming,
  buildContext: buildZernioContext,
  logger: console,
};

/**
 * Отдаёт Zernio message.received/message.sent в уже существующий pipeline.
 * Вставка Meta mid в processed_events намеренно выполняется до echo и фильтров — это сохраняет
 * дедупликацию ретраев и событий того же аккаунта, параллельно полученных от Meta.
 */
export async function handleZernioMessage(
  payload: unknown,
  deps: Partial<HandleZernioMessageDeps> = {},
): Promise<void> {
  const d = { ...DEFAULT_DEPS, ...deps };
  const ev = d.mapEvent(payload);
  if (!ev) return;

  const account = await d.getAccount(ev.zernioAccountId);
  if (!account || account.status !== 'active') {
    d.logger.debug(`[zernio/message] skip inactive or unknown account=${ev.zernioAccountId}`);
    return;
  }
  if (!(await d.tryInsert(account.tenant_id, ev.mid))) return;

  if (ev.kind === 'echo') {
    await d.handleEcho(account.tenant_id, ev);
    return;
  }
  if (shouldSkipIncomingEvent(ev)) return;

  const zernioDeps: Partial<HandleIncomingDeps> = {
    getConnection: async () => account,
    buildContext: (_connection, event) =>
      d.buildContext(account, event as ZernioPipelineEvent),
  };
  await d.handleIncoming(account.tenant_id, ev, zernioDeps);
}
