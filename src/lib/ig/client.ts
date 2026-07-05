import { splitMessage } from './split';

const GRAPH = 'https://graph.instagram.com';
const V = 'v25.0';

type IgErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
};

export type IgMessage = {
  text: string;
  fromId: string;
  createdTime: string;
};

export class IgApiError extends Error {
  constructor(
    readonly code: number | undefined,
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'IgApiError';
  }
}

export class IgAuthError extends IgApiError {
  constructor(code: number | undefined, message: string, path: string) {
    super(code, message, path);
    this.name = 'IgAuthError';
  }
}

export class IgRateLimitError extends IgApiError {
  constructor(code: number | undefined, message: string, path: string) {
    super(code, message, path);
    this.name = 'IgRateLimitError';
  }
}

export class IgPartialSendError extends IgApiError {
  constructor(
    message: string,
    path: string,
    readonly sentMids: string[],
    readonly failedPart: number,
    cause: unknown,
  ) {
    super(undefined, message, path);
    this.name = 'IgPartialSendError';
    this.cause = cause;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function igFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GRAPH}/${V}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(15_000),
  });

  if (response.ok) return parseJson<T>(response);

  let payload: IgErrorPayload = {};
  try {
    payload = await parseJson<IgErrorPayload>(response);
  } catch {
    // Keep the sanitized fallback message below.
  }
  const code = payload.error?.code;
  const message =
    payload.error?.message ?? `Instagram Graph API request failed (${response.status})`;
  const type = payload.error?.type;

  if (type === 'OAuthException' || code === 190) {
    throw new IgAuthError(code, message, path);
  }
  if (response.status === 429 || code === 4 || code === 17 || code === 613) {
    throw new IgRateLimitError(code, message, path);
  }
  throw new IgApiError(code, message, path);
}

export async function getAccount(
  token: string,
): Promise<{ igAccountId: string; username: string }> {
  const data = await igFetch<{ user_id: string; username: string }>(
    token,
    '/me?fields=user_id,username',
  );
  return { igAccountId: data.user_id, username: data.username };
}

export async function getUsername(token: string, igsid: string): Promise<string | null> {
  try {
    const data = await igFetch<{ username?: string }>(
      token,
      `/${encodeURIComponent(igsid)}?fields=username`,
    );
    return data.username ?? null;
  } catch {
    return null;
  }
}

export async function getConversation(
  token: string,
  _igAccountId: string,
  contactId: string,
  limit = 20,
): Promise<IgMessage[]> {
  const path = `/me/conversations?user_id=${encodeURIComponent(contactId)}&fields=messages.limit(${limit}){message,from,created_time}`;
  const data = await igFetch<{
    data?: Array<{
      messages?: {
        data?: Array<{
          message?: string;
          from?: { id?: string };
          created_time?: string;
        }>;
      };
    }>;
  }>(token, path);

  return (data.data ?? [])
    .flatMap((conversation) => conversation.messages?.data ?? [])
    .filter(
      (message): message is { message: string; from?: { id?: string }; created_time?: string } =>
        Boolean(message.message),
    )
    .map((message) => ({
      text: message.message,
      fromId: message.from?.id ?? '',
      createdTime: message.created_time ?? '',
    }))
    .sort((a, b) => a.createdTime.localeCompare(b.createdTime));
}

export async function sendMessage(
  token: string,
  igAccountId: string,
  igsid: string,
  text: string,
): Promise<string[]> {
  const path = `/${encodeURIComponent(igAccountId)}/messages`;
  const mids: string[] = [];
  const parts = splitMessage(text);

  for (const [index, part] of parts.entries()) {
    try {
      const data = await igFetch<{ message_id?: string; mid?: string }>(token, path, {
        method: 'POST',
        body: JSON.stringify({ recipient: { id: igsid }, message: { text: part } }),
      });
      mids.push(data.message_id ?? data.mid ?? '');
    } catch (error) {
      throw new IgPartialSendError(
        `Instagram message send failed at part ${index + 1}; sent ${mids.length} parts`,
        path,
        mids,
        index + 1,
        error,
      );
    }
  }

  return mids;
}
