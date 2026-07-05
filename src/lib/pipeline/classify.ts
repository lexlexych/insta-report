import { z } from 'zod';

import type { Database } from '@/lib/db/types.gen';
import { classifyPrompt } from '@/lib/llm/prompts';
import type { ConversationContext } from '@/lib/pipeline/context';

export type Tenant = Database['public']['Tables']['tenants']['Row'];
export type Label = Database['public']['Tables']['labels']['Row'];
export type LlmUsage = { inTok: number; outTok: number };

const DEFAULT_LABEL_NAME = 'Без категории';
const ZERO_USAGE: LlmUsage = { inTok: 0, outTok: 0 };
const CLASSIFY_SCHEMA = z.object({ label: z.string() });

type ClassifyDeps = {
  completeJSON?: (
    opts: {
      model: string;
      system: string;
      user: string;
      tenantId: string;
    },
    schema: typeof CLASSIFY_SCHEMA,
  ) => Promise<{ data: z.infer<typeof CLASSIFY_SCHEMA>; usage: LlmUsage }>;
  modelClassify?: string;
  logger: Pick<Console, 'error'>;
};

const DEFAULT_DEPS: ClassifyDeps = { logger: console };

function normalizeLabelName(name: string): string {
  return name.trim().toLowerCase();
}

function sortBySort(labels: Label[]): Label[] {
  return [...labels].sort((a, b) => a.sort - b.sort);
}

function findDefaultLabel(labels: Label[]): Label {
  const byName = labels.find(
    (label) => normalizeLabelName(label.name) === normalizeLabelName(DEFAULT_LABEL_NAME),
  );
  if (byName) return byName;

  const [firstBySort] = sortBySort(labels);
  if (!firstBySort) {
    throw new Error('classify requires at least one label');
  }

  return firstBySort;
}

function matchLabel(labels: Label[], answer: string): Label | null {
  const normalizedAnswer = normalizeLabelName(answer);
  if (!normalizedAnswer) return null;
  return labels.find((label) => normalizeLabelName(label.name) === normalizedAnswer) ?? null;
}

function isOnlyDefaultLabel(labels: Label[]): boolean {
  return (
    labels.length === 1 &&
    normalizeLabelName(labels[0]?.name ?? '') === normalizeLabelName(DEFAULT_LABEL_NAME)
  );
}

function isLlmError(error: unknown): boolean {
  return error instanceof Error && error.name === 'LlmError';
}

async function resolveLlmDeps(
  deps: ClassifyDeps,
): Promise<Required<Pick<ClassifyDeps, 'completeJSON' | 'modelClassify'>>> {
  if (deps.completeJSON && deps.modelClassify) {
    return { completeJSON: deps.completeJSON, modelClassify: deps.modelClassify };
  }

  const llm = await import('@/lib/llm/client');
  return {
    completeJSON: deps.completeJSON ?? llm.completeJSON,
    modelClassify: deps.modelClassify ?? llm.getModelClassify(),
  };
}

export async function classify(
  tenant: Tenant,
  labels: Label[],
  ctx: Pick<ConversationContext, 'history' | 'pendingText'>,
  deps: ClassifyDeps = DEFAULT_DEPS,
): Promise<{ label: Label; usage: LlmUsage }> {
  const fallbackLabel = findDefaultLabel(labels);

  if (isOnlyDefaultLabel(labels)) {
    return { label: fallbackLabel, usage: ZERO_USAGE };
  }

  try {
    const prompt = classifyPrompt(labels, ctx.history, ctx.pendingText);
    const llm = await resolveLlmDeps(deps);
    const result = await llm.completeJSON(
      {
        model: llm.modelClassify,
        system: prompt.system,
        user: prompt.user,
        tenantId: tenant.id,
      },
      CLASSIFY_SCHEMA,
    );

    return {
      label: matchLabel(labels, result.data.label) ?? fallbackLabel,
      usage: result.usage,
    };
  } catch (error) {
    if (isLlmError(error)) {
      deps.logger.error('LLM classification failed', error);
    } else {
      deps.logger.error('Classification failed', error);
    }
    return { label: fallbackLabel, usage: ZERO_USAGE };
  }
}

export const __classifyInternals = {
  DEFAULT_LABEL_NAME,
  ZERO_USAGE,
  findDefaultLabel,
  isOnlyDefaultLabel,
  matchLabel,
  normalizeLabelName,
};
