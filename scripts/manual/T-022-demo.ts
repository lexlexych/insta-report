import { mkdirSync, writeFileSync } from 'node:fs';

process.env.TELEGRAM_BOT_TOKEN ??= 'dummy';
process.env.TELEGRAM_WEBHOOK_SECRET ??= 'dummy';
process.env.MINIAPP_JWT_SECRET ??= 'dummy';
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32).toString('base64');
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SECRET_KEY ??= 'dummy';
process.env.LLM_BASE_URL ??= 'https://llm.example.test';
process.env.LLM_API_KEY ??= 'dummy';
process.env.LLM_MODEL_CLASSIFY ??= 'dummy-classify';
process.env.LLM_MODEL_DRAFT ??= 'dummy-draft';
process.env.APP_BASE_URL ??= 'https://app.example.test';
process.env.CRON_SECRET ??= 'dummy';
process.env.ADMIN_TELEGRAM_IDS ??= '';

mkdirSync('node_modules/server-only', { recursive: true });
writeFileSync('node_modules/server-only/index.js', 'module.exports = {};\n');

import type { Database } from '../../src/lib/db/types.gen';
import type { IgEvent } from '../../src/lib/pipeline/types';

type Draft = Database['public']['Tables']['drafts']['Row'];
type Call = string;

const baseDraft: Draft = {
  id: '22222222-2222-4222-8222-222222222222',
  tenant_id: 'tenant-1',
  conversation_key: 'biz-1:client-1',
  contact_id: 'client-1',
  contact_username: 'kunde',
  pending_text: 'Можно сегодня?',
  history_snapshot: null,
  label_id: null,
  draft_text: 'Да, сегодня есть окно.',
  tg_chat_id: 1001,
  tg_message_id: 2002,
  trigger_ts: Date.parse('2026-07-05T10:00:00Z'),
  status: 'pending',
  error: null,
  created_at: '2026-07-05T10:00:00Z',
};

const echo: IgEvent = {
  kind: 'echo',
  accountId: 'biz-1',
  contactId: 'client-1',
  text: 'Ответ владельца',
  hasAttachments: false,
  mid: 'manual-mid',
  ts: Date.parse('2026-07-05T10:01:00Z'),
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function demoHandleEcho(): Promise<void> {
  const { handleEcho } = await import('../../src/lib/pipeline/handleEcho');
  const calls: Call[] = [];
  let current: Draft | null = { ...baseDraft };

  await handleEcho('tenant-1', echo, {
    drafts: {
      cancelPendingByConversation: async (_tenantId, key) => {
        calls.push(`cancel:${key}`);
        if (!current || current.status !== 'pending') return null;
        current = { ...current, status: 'cancelled' };
        return current;
      },
    },
    deleteMessageSafe: async (_chatId, messageId) => {
      calls.push(`delete:${messageId}`);
    },
    messageLog: {
      add: async (_tenantId, key, direction, text) => {
        calls.push(`log:${key}:${direction}:${text}`);
        return {} as Awaited<ReturnType<typeof import('../../src/lib/db/messageLog').add>>;
      },
    },
  });

  assert(
    calls.join(' -> ') ===
      'cancel:biz-1:client-1 -> delete:2002 -> log:biz-1:client-1:manual:Ответ владельца',
    'pending echo must cancel, delete Telegram card and write manual log',
  );
  console.log(`pending echo: ${calls.join(' -> ')}`);

  calls.length = 0;
  current = null;
  await handleEcho('tenant-1', echo, {
    drafts: {
      cancelPendingByConversation: async () => {
        calls.push('cancel-empty');
        return null;
      },
    },
    deleteMessageSafe: async () => {
      calls.push('delete-unexpected');
    },
    messageLog: {
      add: async () => {
        calls.push('log-unexpected');
        return {} as Awaited<ReturnType<typeof import('../../src/lib/db/messageLog').add>>;
      },
    },
  });
  assert(calls.join(' -> ') === 'cancel-empty', 'no pending draft must be no-op after lookup');
  console.log(`no pending echo: ${calls.join(' -> ')}`);
}

async function demoOwnEchoDedup(): Promise<void> {
  const { attemptSend } = await import('../../src/lib/pipeline/send');
  const { handleIgEvent } = await import('../../src/lib/pipeline/handleIgEvent');
  const calls: Call[] = [];
  const processed = new Set<string>();
  const draft = { ...baseDraft };

  await attemptSend('draft-1', 'cb-1', {
    answerCallback: async () => undefined,
    claimPendingToSending: async () => draft,
    getDraftById: async () => draft,
    setDraftStatus: async () => draft,
    setErrorToPending: async () => draft,
    getTenant: async () =>
      ({ id: 'tenant-1' }) as Awaited<
        ReturnType<typeof import('../../src/lib/db/tenants').getById>
      >,
    getConnection: async () =>
      ({ accessToken: 'token', ig_account_id: 'biz-1', status: 'active' }) as Awaited<
        ReturnType<typeof import('../../src/lib/db/igConnections').getForTenant>
      >,
    getConversation: async () => [],
    sendMessage: async () => ['own-mid'],
    markProcessedEvent: async (_tenantId, mid) => {
      calls.push(`mark:${mid}`);
      const fresh = !processed.has(mid);
      processed.add(mid);
      return fresh;
    },
    addMessageLog: async () =>
      ({}) as Awaited<ReturnType<typeof import('../../src/lib/db/messageLog').add>>,
    incrementUsage: async () => undefined,
    editMessageHTML: async () => undefined,
    now: () => new Date('2026-07-05T10:05:00Z'),
  });

  await handleIgEvent(
    'tenant-1',
    {
      object: 'instagram',
      entry: [
        {
          id: 'entry-1',
          time: 1780000000,
          messaging: [
            {
              sender: { id: 'biz-1' },
              recipient: { id: 'client-1' },
              timestamp: 1780000001,
              message: { mid: 'own-mid', text: 'Да', is_echo: true },
            },
          ],
        },
      ],
    },
    {
      tryInsert: async (_tenantId, mid) => {
        calls.push(`try:${mid}`);
        const fresh = !processed.has(mid);
        if (fresh) processed.add(mid);
        return fresh;
      },
      handleEcho: async () => {
        calls.push('echo-unexpected');
      },
      handleIncoming: async () => {
        calls.push('incoming-unexpected');
      },
    },
  );

  console.log(`own echo raw calls: ${calls.join(' -> ')}`);
  assert(calls.includes('mark:own-mid'), 'send must register returned Instagram mid');
  assert(calls.includes('try:own-mid'), 'webhook must check the same mid');
  assert(!calls.includes('echo-unexpected'), 'own echo must stop at processed_events dedup');
  console.log(`own echo dedup: ${calls.join(' -> ')}`);
}

async function main(): Promise<void> {
  await demoHandleEcho();
  await demoOwnEchoDedup();
  console.log('T-022 demo OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
