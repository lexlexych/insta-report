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

type Draft = Database['public']['Tables']['drafts']['Row'];
type Tenant = Database['public']['Tables']['tenants']['Row'];

type Call = string;

const baseDraft: Draft = {
  id: '11111111-1111-4111-8111-111111111111',
  tenant_id: 'tenant-1',
  conversation_key: 'ig:biz:client',
  contact_id: 'client-1',
  contact_username: 'kunde',
  pending_text: 'Здравствуйте, можно записаться?',
  history_snapshot: null,
  label_id: 'label-1',
  draft_text: 'Здравствуйте! Да, конечно. Когда вам удобно?',
  tg_chat_id: 1001,
  tg_message_id: 2002,
  trigger_ts: Date.parse('2026-07-05T10:00:00Z'),
  status: 'pending',
  error: null,
  provider: 'meta',
  zernio_conversation_id: null,
  created_at: '2026-07-05T10:00:00Z',
};

const tenant: Tenant = {
  id: 'tenant-1',
  telegram_user_id: 42,
  tg_chat_id: 1001,
  tg_topics_enabled: false,
  org_name: null,
  business_sphere: null,
  knowledge_base: null,
  system_prompt: null,
  reply_language: 'ru',
  ui_locale: 'ru',
  plan: 'free',
  onboarding_step: null,
  created_at: '2026-07-05T09:00:00Z',
};

function cloneDraft(patch: Partial<Draft> = {}): Draft {
  return { ...baseDraft, ...patch };
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

type SendModule = typeof import('../../src/lib/pipeline/send');

async function runScenario(
  sendModule: SendModule,
  name: string,
  setup: {
    draft: Draft | null;
    status?: Draft['status'];
    manualReply?: boolean;
    sendFails?: boolean;
    retry?: boolean;
  },
): Promise<void> {
  const calls: Call[] = [];
  let current = setup.draft
    ? cloneDraft({ ...setup.draft, status: setup.status ?? setup.draft.status })
    : null;
  const deps = {
    answerCallback: async (_id: string, text?: string) => {
      calls.push(`answer:${text ?? ''}`);
    },
    getDraftById: async () => current,
    claimPendingToSending: async () => {
      calls.push('claim');
      if (current?.status !== 'pending') return null;
      current = { ...current, status: 'sending' };
      return current;
    },
    setErrorToPending: async () => {
      calls.push('retry-to-pending');
      if (current?.status !== 'error') return null;
      current = { ...current, status: 'pending', error: null };
      return current;
    },
    setDraftStatus: async (_id: string, status: Draft['status'], extra = {}) => {
      calls.push(`status:${status}`);
      if (!current) throw new Error('no draft');
      current = { ...current, ...extra, status };
      return current;
    },
    getTenant: async () => tenant,
    getConnection: async () => ({
      id: 'conn-1',
      tenant_id: 'tenant-1',
      ig_account_id: 'biz-1',
      ig_username: 'business',
      accessToken: 'token',
      token_refreshed_at: null,
      webhook_last_seen_at: null,
      status: 'active' as const,
      created_at: '2026-07-05T09:00:00Z',
    }),
    getConversation: async () => {
      calls.push('conversation');
      return setup.manualReply
        ? [{ text: 'Ответили вручную', fromId: 'biz-1', createdTime: baseDraft.trigger_ts! + 1 }]
        : [{ text: 'Жду', fromId: 'client-1', createdTime: baseDraft.trigger_ts! }];
    },
    sendMessage: async () => {
      calls.push('ig-send');
      if (setup.sendFails) throw new Error('Meta temporary error');
      return ['mid-1'];
    },
    addMessageLog: async () => {
      calls.push('message-log');
      return {} as Awaited<ReturnType<typeof import('../../src/lib/db/messageLog').add>>;
    },
    incrementUsage: async () => {
      calls.push('usage');
    },
    editMessageHTML: async (_chat: number | string, _msg: number, html: string) => {
      calls.push(
        `edit:${html.includes('отправлено в') ? 'sent' : html.includes('Отменено') ? 'manual' : html.includes('Ошибка') ? 'error' : html.includes('устарела') ? 'stale' : 'other'}`,
      );
    },
    markProcessedEvent: async () => {
      calls.push('mark-processed');
      return true;
    },
    // Архивного топика больше нет: после отправки карточка редактируется на месте
    // (editMessageHTML) в лаконичный вид «✅ отправлено в …», без переноса.
    now: () => new Date('2026-07-05T10:05:00Z'),
  };

  if (setup.retry) {
    await sendModule.handleRetryCallback(
      { callbackQuery: { id: 'cb-1' }, answerCallbackQuery: async () => undefined } as never,
      baseDraft.id,
      deps,
    );
  } else {
    await sendModule.attemptSend(baseDraft.id, 'cb-1', deps);
  }

  console.log(`${name}: ${calls.join(' -> ')}`);
  assert(calls[0] === 'answer:Отправляю…', `${name}: callback answer must be first`);
}

async function main(): Promise<void> {
  const sendModule = await import('../../src/lib/pipeline/send');
  await runScenario(sendModule, 'happy path', { draft: cloneDraft() });
  await runScenario(sendModule, 'double click / stale', { draft: cloneDraft({ status: 'sent' }) });
  await runScenario(sendModule, 'manual reply wins', { draft: cloneDraft(), manualReply: true });
  await runScenario(sendModule, 'IG error shows retry', { draft: cloneDraft(), sendFails: true });
  await runScenario(sendModule, 'retry from error', {
    draft: cloneDraft({ status: 'error', error: 'old error' }),
    retry: true,
  });
  console.log('T-021 demo OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
