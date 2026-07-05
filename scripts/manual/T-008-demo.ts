import { z } from 'zod';

import { completeJSON, MODEL_CLASSIFY } from '@/lib/llm/client';

async function main(): Promise<void> {
  const result = await completeJSON(
    {
      model: MODEL_CLASSIFY,
      system: 'Ты тестовый ассистент. Верни JSON с полем ok=true и коротким полем message.',
      user: 'Проверь JSON-режим LLM-клиента.',
      temperature: 0,
      maxTokens: 80,
      tenantId: process.argv[2],
    },
    z.object({ ok: z.boolean(), message: z.string().min(1) }),
  );

  console.log('T-008 OK: JSON parsed successfully');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error('T-008 FAILED:', error);
  process.exitCode = 1;
});
