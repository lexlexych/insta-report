import { env, isZernioEnabled } from '../env';
import type { ZernioAccount, ZernioInboxMessage, ZernioWebhookSetting } from './types';

type ZernioErrorPayload = {
  code?: string;
  error?: string | { message?: string };
  message?: string;
  requiresAddon?: boolean;
};

type WebhookSettingInput = {
  name: string;
  url: string;
  secret?: string;
  events: string[];
  isActive?: boolean;
};

type WebhookSettingPatch = {
  _id: string;
} & Partial<Omit<WebhookSettingInput, 'secret'>>;

export class ZernioApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ZernioApiError';
  }
}

export class ZernioAuthError extends ZernioApiError {
  constructor(message: string, code?: string) {
    super(401, message, code);
    this.name = 'ZernioAuthError';
  }
}

export class ZernioAddonError extends ZernioApiError {
  constructor(status: number, message: string, code?: string) {
    super(status, message, code);
    this.name = 'ZernioAddonError';
  }
}

export class ZernioRateLimitError extends ZernioApiError {
  constructor(message: string, code?: string) {
    super(429, message, code);
    this.name = 'ZernioRateLimitError';
  }
}

function apiUrl(path: string): string {
  return new URL(path.replace(/^\//, ''), `${env.ZERNIO_API_BASE.replace(/\/$/, '')}/`).toString();
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function errorMessage(payload: ZernioErrorPayload, status: number): string {
  const message =
    typeof payload.error === 'string'
      ? payload.error
      : (payload.error?.message ?? payload.message ?? `Zernio API request failed (${status})`);
  const apiKey = env.ZERNIO_API_KEY;
  return apiKey ? message.replaceAll(apiKey, '[REDACTED]') : message;
}

async function throwZernioError(response: Response): Promise<never> {
  let payload: ZernioErrorPayload = {};
  try {
    payload = await readJson<ZernioErrorPayload>(response);
  } catch {
    // A non-JSON response must not leak into the error message.
  }

  const message = errorMessage(payload, response.status);
  if (response.status === 401) throw new ZernioAuthError(message, payload.code);
  if (response.status === 429) throw new ZernioRateLimitError(message, payload.code);
  if (response.status === 403 || payload.requiresAddon) {
    throw new ZernioAddonError(response.status, message, payload.code);
  }
  throw new ZernioApiError(response.status, message, payload.code);
}

async function zernioFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isZernioEnabled()) throw new ZernioApiError(0, 'zernio_disabled');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      headers: {
        Authorization: `Bearer ${env.ZERNIO_API_KEY}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: init?.signal ?? controller.signal,
    });
    if (!response.ok) await throwZernioError(response);
    try {
      return await readJson<T>(response);
    } catch {
      throw new ZernioApiError(response.status, 'Zernio API returned an invalid JSON response');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ZernioApiError(408, 'Zernio API request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createProfile(name: string): Promise<{ profileId: string }> {
  const data = await zernioFetch<{ profile: { _id: string } }>('/v1/profiles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return { profileId: data.profile._id };
}

export async function listProfiles(): Promise<Array<{ profileId: string; name: string }>> {
  const data = await zernioFetch<{ profiles?: Array<{ _id: string; name: string }> }>('/v1/profiles');
  return (data.profiles ?? []).map((profile) => ({ profileId: profile._id, name: profile.name }));
}

export async function getConnectUrl(
  platform: 'instagram',
  profileId: string,
  redirectUrl: string,
): Promise<{ authUrl: string }> {
  const params = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  return zernioFetch<{ authUrl: string }>(`/v1/connect/${platform}?${params.toString()}`);
}

export async function listAccounts(filter: {
  profileId?: string;
  platform?: string;
  status?: 'connected' | 'disconnected';
}): Promise<ZernioAccount[]> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
  const suffix = params.size ? `?${params.toString()}` : '';
  const data = await zernioFetch<{
    accounts?: Array<Omit<ZernioAccount, 'accountId' | 'profileId'> & { _id: string; profileId: { _id: string } }>;
  }>(`/v1/accounts${suffix}`);
  return (data.accounts ?? []).map(({ _id, profileId, ...account }) => ({
    ...account,
    accountId: _id,
    profileId: profileId._id,
  }));
}

export async function deleteAccount(accountId: string): Promise<void> {
  await zernioFetch<unknown>(`/v1/accounts/${encodeURIComponent(accountId)}`, { method: 'DELETE' });
}

export async function getAccountHealth(accountId: string): Promise<{ ok: boolean; raw: unknown }> {
  const raw = await zernioFetch<unknown>(`/v1/accounts/${encodeURIComponent(accountId)}/health`);
  // TODO(T-052): вывести ok из содержимого raw, когда форма ответа health прояснится в пилоте
  return { ok: true, raw };
}

export async function sendMessage(
  conversationId: string,
  accountId: string,
  text: string,
  opts?: { messageTag?: 'HUMAN_AGENT' },
): Promise<{ messageId: string }> {
  const data = await zernioFetch<{ data: { messageId: string } }>(
    `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        accountId,
        message: text,
        ...(opts?.messageTag && { messagingType: 'MESSAGE_TAG', messageTag: opts.messageTag }),
      }),
    },
  );
  return { messageId: data.data.messageId };
}

export async function getConversationMessages(
  conversationId: string,
  accountId: string,
  opts?: { limit?: number; sortOrder?: 'asc' | 'desc' },
): Promise<ZernioInboxMessage[]> {
  const params = new URLSearchParams({ accountId });
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.sortOrder) params.set('sortOrder', opts.sortOrder);
  const data = await zernioFetch<{ messages?: ZernioInboxMessage[] }>(
    `/v1/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
  );
  return data.messages ?? [];
}

export async function listWebhookSettings(): Promise<ZernioWebhookSetting[]> {
  const data = await zernioFetch<{ webhooks?: ZernioWebhookSetting[] }>('/v1/webhooks/settings');
  return data.webhooks ?? [];
}

export async function createWebhookSetting(
  setting: WebhookSettingInput,
): Promise<ZernioWebhookSetting> {
  const data = await zernioFetch<{ webhook?: ZernioWebhookSetting }>('/v1/webhooks/settings', {
    method: 'POST',
    body: JSON.stringify(setting),
  });
  if (!data.webhook) throw new ZernioApiError(200, 'Zernio API returned an invalid webhook response');
  return data.webhook;
}

export async function updateWebhookSetting(
  setting: WebhookSettingPatch,
): Promise<ZernioWebhookSetting> {
  const data = await zernioFetch<{ webhook?: ZernioWebhookSetting }>('/v1/webhooks/settings', {
    method: 'PUT',
    body: JSON.stringify(setting),
  });
  if (!data.webhook) throw new ZernioApiError(200, 'Zernio API returned an invalid webhook response');
  return data.webhook;
}
