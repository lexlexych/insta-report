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

function assertOk(label: string, condition: boolean): void {
  console.log(`${condition ? 'OK' : 'FAIL'} ${label}`);
  if (!condition) process.exitCode = 1;
}

const tenant = {
  id: 'tenant-1',
  knowledge_base: 'Работаем в Берлине. Стрижка стоит 40 EUR.',
  system_prompt: 'Ты отвечаешь от имени салона.',
  reply_language: 'auto',
} as Tenant;

const label = { instruction: 'Уточни желаемую дату и время записи.' } as Label;
const ctx = {
  username: 'client',
  history: 'Клиент: Сколько стоит стрижка?',
  pendingText: 'Можно записаться завтра?',
  lastBusinessTs: null,
  messages: [],
};
const ev = {
  kind: 'incoming' as const,
  accountId: 'ig-business',
  contactId: 'ig-client',
  text: 'Можно записаться завтра?',
  hasAttachments: false,
  mid: 'mid-1',
  ts: 1,
};

async function main(): Promise<void> {
  const { draftPrompt } = await import('../../src/lib/llm/prompts');
  const { generateDraft } = await import('../../src/lib/pipeline/draft');
  const { conversationKey } = await import('../../src/lib/pipeline/key');

  const prompt = draftPrompt(tenant, label, ctx.history, ctx.pendingText);
  assertOk('prompt содержит базу знаний', prompt.system.includes(tenant.knowledge_base ?? ''));
  assertOk('prompt содержит историю', prompt.user.includes(ctx.history));
  assertOk('prompt содержит pendingText', prompt.user.includes(ctx.pendingText));
  assertOk('prompt содержит инструкцию метки', prompt.user.includes(label.instruction ?? ''));

  let calls = 0;
  const generated = await generateDraft(tenant, label, ctx, ev, {
    modelDraft: 'demo-draft',
    complete: async (opts) => {
      calls += 1;
      assertOk('LLM получает temperature=0.7', opts.temperature === 0.7);
      assertOk('LLM получает maxTokens=500', opts.maxTokens === 500);
      return { text: '"Здравствуйте! Да, напишите удобное время."', usage: { inTok: 42, outTok: 9 } };
    },
  });
  assertOk('кавычки вокруг ответа срезаются', generated.draftText === 'Здравствуйте! Да, напишите удобное время.');
  assertOk('usage возвращается наружу', generated.usage.inTok === 42);
  assertOk('обычный сценарий вызывает LLM один раз', calls === 1);

  const attachment = await generateDraft(
    { ...tenant, reply_language: 'auto' } as Tenant,
    label,
    { ...ctx, history: 'Клиент: Фото', pendingText: '[вложение]' },
    { ...ev, text: '', hasAttachments: true },
    { complete: async () => { throw new Error('LLM must not be called for attachment-only event'); } },
  );
  assertOk('вложение без текста возвращает шаблон', attachment.draftText.includes('вложение'));
  assertOk('вложение без текста не тратит usage', attachment.usage.inTok === 0 && attachment.usage.outTok === 0);

  try {
    await generateDraft(tenant, label, ctx, ev, { modelDraft: 'demo-draft', complete: async () => ({ text: '   ', usage: { inTok: 1, outTok: 0 } }) });
    assertOk('пустой ответ LLM должен упасть', false);
  } catch (error) {
    assertOk('пустой ответ LLM даёт LlmError empty_draft', error instanceof Error && error.name === 'LlmError' && error.message === 'empty_draft');
  }

  assertOk('conversationKey = accountId:contactId', conversationKey(ev) === 'ig-business:ig-client');

  if (process.exitCode) throw new Error('T-019 manual demo failed');
  console.log('OK T-019 demo completed');
}

void main();
