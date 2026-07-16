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
import { ZernioApiError } from '../../src/lib/zernio/client';

type Draft = Database['public']['Tables']['drafts']['Row'];
type ZernioMessage = Awaited<
  ReturnType<typeof import('../../src/lib/zernio/client').getConversationMessages>
>[number];

const baseDraft: Draft = {
  id: '00000000-0000-4000-8000-000000000050',
  tenant_id: 'tenant-1',
  conversation_key: 'zernio:account-1:conversation-1',
  contact_id: 'client-1',
  contact_username: 'kunde',
  pending_text: 'Здравствуйте!',
  history_snapshot: null,
  label_id: null,
  draft_text: 'Здравствуйте! Чем могу помочь?',
  tg_chat_id: 1001,
  tg_message_id: 2002,
  trigger_ts: Date.parse('2026-07-16T10:00:00.000Z'),
  status: 'pending',
  error: null,
  provider: 'zernio',
  zernio_conversation_id: 'conversation-1',
  created_at: '2026-07-16T10:00:00.000Z',
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function cloneDraft(patch: Partial<Draft> = {}): Draft {
  return { ...baseDraft, ...patch };
}

type Scenario = {
  draft?: Draft;
  inboxMessages?: ZernioMessage[];
  zernioSend?: (call: number, opts?: { messageTag?: 'HUMAN_AGENT' }) => Promise<string>;
};

async function runScenario(name: string, scenario: Scenario): Promise<string[]> {
  const { attemptSend } = await import('../../src/lib/pipeline/send');
  const draft = scenario.draft ?? cloneDraft();
  const calls: string[] = [];
  let zernioCall = 0;

  await attemptSend(draft.id, 'callback-1', {
    answerCallback: async () => {
      calls.push('answer');
    },
    claimPendingToSending: async () => {
      calls.push('claim');
      return draft;
    },
    getTenant: async () => ({ id: draft.tenant_id }) as never,
    getConnection: async () => ({
      accessToken: 'meta-token',
      ig_account_id: 'meta-account',
      status: 'active',
    }) as never,
    getConversation: async () => {
      calls.push('meta-conversation');
      return [];
    },
    sendMessage: async () => {
      calls.push('ig-send');
      return ['meta-mid'];
    },
    isZernioEnabled: () => true,
    getZernioAccount: async () => ({
      tenant_id: draft.tenant_id,
      zernio_account_id: 'zernio-account-1',
      status: 'active',
    }) as never,
    getZernioConversationMessages: async () => {
      calls.push('zernio-inbox');
      return scenario.inboxMessages ?? [];
    },
    sendZernioMessage: async (_conversationId, _accountId, _text, opts) => {
      zernioCall += 1;
      calls.push(`zernio-send:${opts?.messageTag ?? 'normal'}`);
      const messageId = await (scenario.zernioSend?.(zernioCall, opts) ?? Promise.resolve(`zernio-${zernioCall}`));
      return { messageId };
    },
    markProcessedEvent: async (_tenantId, messageId) => {
      calls.push(`processed:${messageId}`);
      return true;
    },
    setDraftStatus: async (_id, status, extra = {}) => {
      calls.push(`status:${status}:${String(extra.error ?? '')}`);
      return { ...draft, ...extra, status } as never;
    },
    addMessageLog: async () => {
      calls.push('message-log');
      return {} as never;
    },
    incrementUsage: async () => {
      calls.push('usage');
    },
    editMessageHTML: async (_chat, _message, html) => {
      calls.push(`card:${html.includes('Отменено') ? 'manual' : html.includes('Ошибка') ? 'error' : 'sent'}`);
    },
    now: () => new Date('2026-07-16T10:05:00.000Z'),
  });

  console.log(`${name}: ${calls.join(' -> ')}`);
  return calls;
}

async function main(): Promise<void> {
  const happy = await runScenario('happy Zernio send', {});
  assert(happy.includes('zernio-send:normal'), 'happy: Zernio send was not called');
  assert(!happy.includes('ig-send'), 'happy: Meta client must not be called');
  assert(happy.includes('processed:zernio-1'), 'happy: own Zernio message ID was not recorded');
  assert(happy.includes('status:sent:'), 'happy: draft was not sent');

  const manual = await runScenario('manual reply wins', {
    inboxMessages: [
      {
        id: 'manual-1',
        conversationId: 'conversation-1',
        accountId: 'zernio-account-1',
        platform: 'instagram',
        message: 'Ответили вручную',
        senderId: 'business',
        senderName: 'Бизнес',
        direction: 'outgoing',
        createdAt: '2026-07-16T10:00:01.000Z',
        attachments: [],
      },
    ],
  });
  assert(!manual.some((call) => call.startsWith('zernio-send:')), 'manual: send must be skipped');
  assert(manual.includes('status:skipped_manual:'), 'manual: skipped_manual was not set');

  const humanAgent = await runScenario('24h retries with HUMAN_AGENT', {
    zernioSend: async (call) => {
      if (call === 1) throw new ZernioApiError(400, '24h window closed', 'PLATFORM_LIMITATION');
      return 'human-agent-mid';
    },
  });
  assert(
    humanAgent.join(',').includes('zernio-send:normal,zernio-send:HUMAN_AGENT'),
    '24h: HUMAN_AGENT retry was not made',
  );
  assert(humanAgent.includes('status:sent:'), '24h: retry did not send the draft');

  const partial = await runScenario('partial Zernio send', {
    draft: cloneDraft({ draft_text: 'A'.repeat(1001) }),
    zernioSend: async (call) => {
      if (call === 2) throw new Error('network failure');
      return 'first-part-mid';
    },
  });
  assert(partial.includes('processed:first-part-mid'), 'partial: first message ID was not recorded');
  assert(
    partial.some((call) => call.startsWith('status:error:отправлено частично (1 из 2):')),
    'partial: partial-send error was not reported',
  );

  const meta = await runScenario('legacy Meta draft', { draft: cloneDraft({ provider: 'meta', zernio_conversation_id: null }) });
  assert(meta.includes('ig-send'), 'meta: legacy Graph API send was not called');
  assert(!meta.includes('zernio-inbox'), 'meta: Zernio must not be queried');

  console.log('T-050 demo OK');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
