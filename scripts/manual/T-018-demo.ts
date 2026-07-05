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

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  console.log(
    `${ok ? 'OK' : 'FAIL'} ${label} — expected=${JSON.stringify(expected)} actual=${JSON.stringify(actual)}`,
  );
  if (!ok) process.exitCode = 1;
}

function makeLabel(name: string, sort: number, description = `${name} description`): Label {
  return {
    id: `label-${sort}`,
    tenant_id: 'tenant-1',
    name,
    description,
    instruction: `${name} instruction`,
    tg_thread_id: null,
    sort,
    created_at: '2026-07-05T00:00:00.000Z',
  };
}

async function main(): Promise<void> {
  const { classify } = await import('../../src/lib/pipeline/classify');

  const tenant = { id: 'tenant-1' } as Tenant;
  const labels = [makeLabel('Без категории', 0), makeLabel('Доставка', 1), makeLabel('Возврат', 2)];
  const ctx = { history: 'Клиент: Где мой заказ?', pendingText: 'Где мой заказ?' };

  let calls = 0;
  const exact = await classify(tenant, labels, ctx, {
    completeJSON: async () => {
      calls += 1;
      return { data: { label: 'Доставка' }, usage: { inTok: 11, outTok: 3 } };
    },
    modelClassify: 'demo-model',
    logger: console,
  });
  assertEqual('точное имя выбирает метку', exact.label.name, 'Доставка');
  assertEqual('usage возвращается из LLM', exact.usage.inTok, 11);

  const normalized = await classify(tenant, labels, ctx, {
    completeJSON: async () => ({ data: { label: '  возврат  ' }, usage: { inTok: 7, outTok: 2 } }),
    modelClassify: 'demo-model',
    logger: console,
  });
  assertEqual('регистр и пробелы нормализуются', normalized.label.name, 'Возврат');

  const unknown = await classify(tenant, labels, ctx, {
    completeJSON: async () => ({ data: { label: 'Другое' }, usage: { inTok: 5, outTok: 1 } }),
    modelClassify: 'demo-model',
    logger: console,
  });
  assertEqual('выдуманная метка падает в Без категории', unknown.label.name, 'Без категории');

  const empty = await classify(tenant, labels, ctx, {
    completeJSON: async () => ({ data: { label: '' }, usage: { inTok: 5, outTok: 1 } }),
    modelClassify: 'demo-model',
    logger: console,
  });
  assertEqual('пустая строка падает в Без категории', empty.label.name, 'Без категории');

  const onlyDefault = await classify(tenant, [makeLabel('Без категории', 0)], ctx, {
    completeJSON: async () => {
      calls += 1;
      throw new Error('LLM must not be called for the only default label');
    },
    logger: console,
  });
  assertEqual(
    'единственная Без категории возвращается без LLM',
    onlyDefault.label.name,
    'Без категории',
  );
  assertEqual('LLM вызван только для первого сценария с calls', calls, 1);

  const llmError = await classify(tenant, labels, ctx, {
    completeJSON: async () => {
      const error = new Error('boom');
      error.name = 'LlmError';
      throw error;
    },
    modelClassify: 'demo-model',
    logger: { error: () => undefined },
  });
  assertEqual('LlmError не пробрасывается наружу', llmError.label.name, 'Без категории');

  if (process.exitCode) throw new Error('T-018 manual demo failed');
  console.log('OK T-018 demo completed');
}

void main();
