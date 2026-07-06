import { labels, tenants } from '@/lib/db';
import { createForumTopic, deleteForumTopic, editForumTopic } from '@/lib/tg/api';

import type { Database } from '@/lib/db/types.gen';

type Tenant = Database['public']['Tables']['tenants']['Row'];
type Label = Database['public']['Tables']['labels']['Row'];

const HISTORY_TOPIC_NAME = '📜 Архив';

type TopicLogger = Pick<Console, 'error'>;

export async function syncTopicsEnabled(tenant: Tenant, valueFromUpdate?: boolean): Promise<Tenant> {
  const enabled = valueFromUpdate ?? tenant.tg_topics_enabled;
  if (enabled === tenant.tg_topics_enabled) return tenant;
  return tenants.update(tenant.id, { tg_topics_enabled: enabled });
}

/**
 * Кэшируем факт «темы включены» после первого успешного создания топика. Раньше режим тем
 * определялся только по `has_topics_enabled` из `/start`/initData, но Telegram отдаёт это
 * поле ненадёжно (нет в `ChatFullInfo`/getChat для приватных чатов), поэтому кэш оставался
 * `false` и топики не создавались никогда. Теперь источником истины служит сам вызов
 * `createForumTopic`: удался — темы включены, обновляем кэш для индикатора в настройках.
 */
async function markTopicsEnabled(tenant: Tenant): Promise<void> {
  if (tenant.tg_topics_enabled) return;
  await tenants.update(tenant.id, { tg_topics_enabled: true });
  tenant.tg_topics_enabled = true;
}

export async function ensureLabelTopic(
  tenant: Tenant,
  label: Label | null,
  logger: TopicLogger = console,
): Promise<number | null> {
  if (!label) return null;
  if (label.tg_thread_id !== null) return label.tg_thread_id;
  const chatId = tenant.tg_chat_id;
  if (chatId === null) return null;

  try {
    // Пробуем создать топик напрямую: если Threaded Mode у бота выключен — вызов упадёт,
    // и мы бесшовно деградируем в плоский чат. Успех = темы включены (см. markTopicsEnabled).
    const threadId = await createForumTopic(chatId, label.name);
    await labels.updateTopicId(label.id, threadId);
    label.tg_thread_id = threadId;
    await markTopicsEnabled(tenant);
    return threadId;
  } catch (error) {
    logger.error(`[tg] label topic fallback tenant=${tenant.id} label=${label.id}`, error);
    return null;
  }
}

export async function ensureHistoryTopic(tenant: Tenant, logger: TopicLogger = console): Promise<number | null> {
  if (tenant.history_thread_id !== null) return tenant.history_thread_id;
  const chatId = tenant.tg_chat_id;
  if (chatId === null) return null;

  try {
    const threadId = await createForumTopic(chatId, HISTORY_TOPIC_NAME);
    await tenants.update(tenant.id, { history_thread_id: threadId });
    tenant.history_thread_id = threadId;
    await markTopicsEnabled(tenant);
    return threadId;
  } catch (error) {
    logger.error(`[tg] history topic fallback tenant=${tenant.id}`, error);
    return null;
  }
}

export async function renameLabelTopic(tenant: Tenant, label: Label, name: string, logger: TopicLogger = console): Promise<void> {
  const chatId = tenant.tg_chat_id;
  if (chatId === null || label.tg_thread_id === null) return;
  try {
    await editForumTopic(chatId, label.tg_thread_id, name);
  } catch (error) {
    logger.error(`[tg] label topic rename failed tenant=${tenant.id} label=${label.id}`, error);
  }
}

export async function removeLabelTopic(tenant: Tenant, label: Label, logger: TopicLogger = console): Promise<void> {
  const chatId = tenant.tg_chat_id;
  if (chatId === null || label.tg_thread_id === null) return;
  try {
    await deleteForumTopic(chatId, label.tg_thread_id);
  } catch (error) {
    logger.error(`[tg] label topic delete failed tenant=${tenant.id} label=${label.id}`, error);
  }
}
