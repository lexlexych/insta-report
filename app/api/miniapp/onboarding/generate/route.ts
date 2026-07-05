import { z } from 'zod';

import { apiHandler, jsonResponse } from '@/lib/api/http';
import { requireTenant } from '@/lib/auth/requireTenant';
import { labels, tenants } from '@/lib/db';
import { completeJSON, getModelDraft } from '@/lib/llm/client';
import { kbGenerationPrompt } from '@/lib/llm/prompts';

const requestSchema = z.object({
  orgName: z.string().trim().min(2),
  orgDescription: z.string().trim().min(80),
  overwrite: z.boolean().optional(),
});

const llmResponseSchema = z.object({
  knowledge_base: z.string().trim().min(1).max(20000),
  system_prompt: z.string().trim().min(1).max(20000),
});


export const POST = apiHandler(async (req: Request) => {
  const tenant = await requireTenant(req);
  const parsed = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonResponse({ ok: false, error: 'malformed' }, 400);

  if (tenant.knowledge_base && parsed.data.overwrite !== true) {
    return jsonResponse({ code: 'exists' }, 409);
  }

  const prompt = kbGenerationPrompt(parsed.data.orgName, parsed.data.orgDescription);
  const generated = await completeJSON(
    {
      model: getModelDraft(),
      system: prompt.system,
      user: prompt.user,
      temperature: 0.2,
      maxTokens: 3_000,
      tenantId: tenant.id,
    },
    llmResponseSchema,
  );

  await tenants.update(tenant.id, {
    org_name: parsed.data.orgName,
    org_description: parsed.data.orgDescription,
    knowledge_base: generated.data.knowledge_base,
    system_prompt: generated.data.system_prompt,
    onboarding_step: 'review_kb',
  });
  await labels.seedDefaultLabels(tenant.id);

  return jsonResponse({
    knowledgeBase: generated.data.knowledge_base,
    systemPrompt: generated.data.system_prompt,
  });
});
