import OpenAI from 'openai';
import type { ZodSchema } from 'zod';

import { usageStats } from '@/lib/db';
import { env } from '@/lib/env';

export type LlmOpts = {
  model: string;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  tenantId?: string;
};

type LlmUsage = { inTok: number; outTok: number };
type LlmResult = { text: string; usage: LlmUsage };

type ChatCompletionParams = {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } | null }>;
  usage?: { prompt_tokens?: number | null; completion_tokens?: number | null } | null;
};

export const MODEL_CLASSIFY = env.LLM_MODEL_CLASSIFY;
export const MODEL_DRAFT = env.LLM_MODEL_DRAFT;

const JSON_SYSTEM_SUFFIX = 'Отвечай строго одним JSON-объектом без пояснений и markdown';
const JSON_RETRY_USER_SUFFIX = 'Предыдущий ответ не был валидным JSON по схеме. Верни только JSON.';
const RETRY_DELAYS_MS = [1_000, 3_000] as const;

let client: OpenAI | undefined;

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

function getClient(): OpenAI {
  client ??= new OpenAI({ baseURL: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY });
  return client;
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const maybeStatus = (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return typeof maybeStatus === 'number' ? maybeStatus : undefined;
}

function shouldRetry(error: unknown): boolean {
  const status = getErrorStatus(error);
  return status === 429 || (typeof status === 'number' && status >= 500 && status <= 599);
}

function jitterMs(): number {
  return Math.floor(Math.random() * 250);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUsage(response: ChatCompletionResponse): LlmUsage {
  return {
    inTok: response.usage?.prompt_tokens ?? 0,
    outTok: response.usage?.completion_tokens ?? 0,
  };
}

function buildParams(opts: LlmOpts, responseFormat?: { type: 'json_object' }): ChatCompletionParams {
  return {
    model: opts.model,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.user },
    ],
    temperature: opts.temperature,
    max_tokens: opts.maxTokens,
    response_format: responseFormat,
  };
}

async function completeWithParams(opts: LlmOpts, params: ChatCompletionParams): Promise<LlmResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = (await getClient().chat.completions.create(params, {
        timeout: 30_000,
      })) as ChatCompletionResponse;
      const text = response.choices?.[0]?.message?.content?.trim();
      if (!text) throw new LlmError('empty');

      const usage = normalizeUsage(response);
      if (opts.tenantId) {
        try {
          await usageStats.increment(opts.tenantId, {
            llmCalls: 1,
            tokensIn: usage.inTok,
            tokensOut: usage.outTok,
          });
        } catch (usageError) {
          console.error('LLM usage accounting failed', usageError);
        }
      }
      return { text, usage };
    } catch (error) {
      if (error instanceof LlmError) throw error;
      lastError = error;
      if (!shouldRetry(error) || attempt === RETRY_DELAYS_MS.length) {
        throw new LlmError(`request_failed${getErrorStatus(error) ? `:${getErrorStatus(error)}` : ''}`, error);
      }
      await sleep((RETRY_DELAYS_MS[attempt] ?? 0) + jitterMs());
    }
  }

  throw new LlmError('request_failed', lastError);
}

export async function complete(opts: LlmOpts): Promise<LlmResult> {
  return completeWithParams(opts, buildParams(opts));
}

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match?.[1] ?? trimmed).trim();
}

function parseJson<T>(text: string, schema: ZodSchema<T>): T {
  return schema.parse(JSON.parse(stripJsonFence(text)));
}

function withJsonPrompt(opts: LlmOpts): LlmOpts {
  return {
    ...opts,
    system: `${opts.system}\n\n${JSON_SYSTEM_SUFFIX}`,
  };
}

export async function completeJSON<T>(
  opts: LlmOpts,
  schema: ZodSchema<T>,
): Promise<{ data: T; usage: LlmUsage }> {
  const jsonOpts = withJsonPrompt(opts);
  const first = await completeWithParams(jsonOpts, buildParams(jsonOpts, { type: 'json_object' }));
  try {
    return { data: parseJson(first.text, schema), usage: first.usage };
  } catch (firstError) {
    const retryOpts = {
      ...jsonOpts,
      user: `${jsonOpts.user}\n\n${JSON_RETRY_USER_SUFFIX}`,
    };
    const second = await completeWithParams(retryOpts, buildParams(retryOpts, { type: 'json_object' }));
    try {
      return { data: parseJson(second.text, schema), usage: second.usage };
    } catch (secondError) {
      throw new LlmError('bad_json', { firstError, secondError });
    }
  }
}

export const __llmClientInternals = {
  stripJsonFence,
};
