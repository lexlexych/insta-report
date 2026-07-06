import { labels, tenants } from '@/lib/db';
import { createForumTopic, editForumTopic, deleteForumTopic } from '@/lib/tg/api';

import type { Database } from '@/lib/db/types.gen';

type Tenant = Database['public']['Tables']['tenants']['Row'];
type Label = Database['public']['Tables']['labels']['Row'];

const HISTORY_TOPIC_NAME = '📜 История';

type TopicLogger = Pick<Console, 'error'>;

function canUseTopics(tenant: Pick<Tenant, 'tg_topics_enabled' | 'tg_chat_id'>): tenant is Tenant & { tg_chat_id: number } {
  return tenant.tg_topics_enabled && tenant.tg_chat_id !== null;
}

export async function syncTopicsEnabled(tenant: Tenant, valueFromUpdate?: boolean): Promise<Tenant> {
  const enabled = valueFromUpdate ?? tenant.tg_topics_enabled;
  if (enabled === tenant.tg_topics_enabled) return tenant;
  return tenants.update(tenant.id, { tg_topics_enabled: enabled });
}

export async function ensureLabelTopic(
  tenant: Tenant,
  label: Label | null,
  logger: TopicLogger = console,
): Promise<number | null> {
  if (!label || !canUseTopics(tenant)) return null;
  if (label.tg_thread_id !== null) return label.tg_thread_id;

  try {
    const threadId = await createForumTopic(tenant.tg_chat_id, label.name);
    await labels.updateTopicId(label.id, threadId);
    label.tg_thread_id = threadId;
    return threadId;
  } catch (error) {
    logger.error(`[tg] label topic fallback tenant=${tenant.id} label=${label.id}`, error);
    return null;
  }
}

export async function ensureHistoryTopic(tenant: Tenant, logger: TopicLogger = console): Promise<number | null> {
  if (!canUseTopics(tenant)) return null;
  if (tenant.history_thread_id !== null) return tenant.history_thread_id;

  try {
    const threadId = await createForumTopic(tenant.tg_chat_id, HISTORY_TOPIC_NAME);
    await tenants.update(tenant.id, { history_thread_id: threadId });
    tenant.history_thread_id = threadId;
    return threadId;
  } catch (error) {
    logger.error(`[tg] history topic fallback tenant=${tenant.id}`, error);
    return null;
  }
}

export async function renameLabelTopic(tenant: Tenant, label: Label, name: string, logger: TopicLogger = console): Promise<void> {
  if (!canUseTopics(tenant) || label.tg_thread_id === null) return;
  try {
    await editForumTopic(tenant.tg_chat_id, label.tg_thread_id, name);
  } catch (error) {
    logger.error(`[tg] label topic rename failed tenant=${tenant.id} label=${label.id}`, error);
  }
}

export async function removeLabelTopic(tenant: Tenant, label: Label, logger: TopicLogger = console): Promise<void> {
  if (!canUseTopics(tenant) || label.tg_thread_id === null) return;
  try {
    await deleteForumTopic(tenant.tg_chat_id, label.tg_thread_id);
  } catch (error) {
    logger.error(`[tg] label topic delete failed tenant=${tenant.id} label=${label.id}`, error);
  }
}
