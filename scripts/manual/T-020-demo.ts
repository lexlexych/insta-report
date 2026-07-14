import type { Database } from '../../src/lib/db/types.gen';

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

type Tenant = Database['public']['Tables']['tenants']['Row'];
type Label = Database['public']['Tables']['labels']['Row'];
type Draft = Database['public']['Tables']['drafts']['Row'];

function assertOk(label: string, condition: boolean): void {
  console.log(`${condition ? 'OK' : 'FAIL'} ${label}`);
  if (!condition) process.exitCode = 1;
}

const tenant = { id: 'tenant-1', tg_chat_id: 1001 } as Tenant;
const label = { id: 'label-1', name: '<VIP>' } as Label;
const conn = { id: 'conn-1' } as never;
const ev = {
  kind: 'incoming' as const,
  accountId: 'ig-business',
  contactId: 'ig-client',
  text: '<script>alert(1)</script>',
  hasAttachments: false,
  attachmentTypes: [],
  mid: 'mid-1',
  ts: 123,
};
const ctx = {
  username: 'client_name',
  history: 'Клиент: <script>alert(1)</script>',
  pendingText: '<script>alert(1)</script>',
  lastBusinessTs: null,
  messages: [],
};

async function main(): Promise<void> {
  const { PendingExistsError } = await import('../../src/lib/db/errors');
  const { deliverDraft } = await import('../../src/lib/pipeline/deliver');
  const { draftKeyboard, renderDraftCard } = await import('../../src/lib/tg/draftCard');

  const html = renderDraftCard({
    username: 'bad"><script>',
    pendingText: '<script>alert(1)</script>',
    draftText: 'Ответ с <b>html</b>',
    time: '10:00',
  });
  assertOk('HTML клиента экранирован', html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assertOk('сырой script не попал в карточку', !html.includes('<script>'));
  assertOk(
    'длинный draftText укладывается в лимит Telegram',
    renderDraftCard({
      username: null,
      pendingText: 'x'.repeat(1000),
      draftText: 'y'.repeat(5000),
      time: '10:00',
    }).length <= 4096,
  );

  const keyboardWithoutUsername = draftKeyboard('00000000-0000-4000-8000-000000000000', null);
  assertOk('без username клавиатура создаётся без URL-кнопки', Boolean(keyboardWithoutUsername));

  const operations: string[] = [];
  let sentHtml = '';
  await deliverDraft(
    { tenant, conn, ev, ctx, label, draftText: 'Готовый ответ' },
    {
      randomUUID: () => '00000000-0000-4000-8000-000000000001',
      cancelPendingByConversation: async () => {
        operations.push('cancel-old');
        return { tg_chat_id: 1001, tg_message_id: 41 } as Draft;
      },
      deleteMessageSafe: async (_chatId, messageId) => {
        operations.push(`delete-${messageId}`);
      },
      sendMessageHTML: async (_chatId, htmlToSend) => {
        operations.push('send-new');
        sentHtml = htmlToSend;
        return { message_id: 42 };
      },
      insertPending: async (draft) => {
        operations.push(`insert-${draft.id}`);
        assertOk(
          'insert получает app-generated UUID',
          draft.id === '00000000-0000-4000-8000-000000000001',
        );
        assertOk('insert получает Telegram message_id', draft.tg_message_id === 42);
        return draft as Draft;
      },
      logger: console,
    },
  );
  assertOk(
    'старый pending отменён и удалён до отправки новой карточки',
    operations.join('>') ===
      'cancel-old>delete-41>send-new>insert-00000000-0000-4000-8000-000000000001',
  );
  assertOk(
    'карточка экранирует pending/draft и не содержит категории',
    sentHtml.includes('&lt;script&gt;') && !sentHtml.includes('🏷'),
  );

  const raceOperations: string[] = [];
  await deliverDraft(
    { tenant, conn, ev, ctx, label, draftText: 'Гонка' },
    {
      randomUUID: () => '00000000-0000-4000-8000-000000000002',
      cancelPendingByConversation: async () => null,
      sendMessageHTML: async () => {
        raceOperations.push('send');
        return { message_id: 52 };
      },
      insertPending: async () => {
        raceOperations.push('insert-race');
        throw new PendingExistsError();
      },
      deleteMessageSafe: async (_chatId, messageId) => {
        raceOperations.push(`delete-${messageId}`);
      },
      logger: { error: () => raceOperations.push('log-race') },
    },
  );
  assertOk(
    'PendingExistsError удаляет только что отправленную карточку и не пробрасывается',
    raceOperations.join('>') === 'send>insert-race>delete-52>log-race',
  );

  if (process.exitCode) throw new Error('T-020 manual demo failed');
  console.log('OK T-020 demo completed');
}

void main();
