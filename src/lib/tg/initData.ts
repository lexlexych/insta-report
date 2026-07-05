import { createHmac, timingSafeEqual } from 'node:crypto';

export type InitDataErrorCode = 'bad_hash' | 'expired' | 'malformed';

export class InitDataError extends Error {
  constructor(public readonly code: InitDataErrorCode) {
    super(`Telegram initData ${code}`);
    this.name = 'InitDataError';
  }
}

export type TelegramInitDataUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  allows_write_to_pm?: boolean;
  photo_url?: string;
  [key: string]: unknown;
};

export type ValidatedInitData = { user: TelegramInitDataUser };

function hmacHex(key: string | Buffer, message: string): string {
  return createHmac('sha256', key).update(message).digest('hex');
}

function parseAuthDate(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) throw new InitDataError('malformed');
  return Number(value);
}

function parseUser(value: string | null): TelegramInitDataUser {
  if (!value) throw new InitDataError('malformed');
  try {
    const parsed = JSON.parse(value) as Partial<TelegramInitDataUser>;
    if (!Number.isSafeInteger(parsed.id)) throw new InitDataError('malformed');
    return parsed as TelegramInitDataUser;
  } catch (error) {
    if (error instanceof InitDataError) throw error;
    throw new InitDataError('malformed');
  }
}

export function validateInitData(raw: string, botToken: string, maxAgeSec = 3600): ValidatedInitData {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    throw new InitDataError('malformed');
  }

  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) throw new InitDataError('malformed');
  params.delete('hash');

  const authDate = parseAuthDate(params.get('auth_date'));
  const nowSec = Math.floor(Date.now() / 1000);
  if (authDate > nowSec + 60 || nowSec - authDate > maxAgeSec) throw new InitDataError('expired');

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = hmacHex(secretKey, dataCheckString);
  const actual = Buffer.from(hash, 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new InitDataError('bad_hash');
  }

  return { user: parseUser(params.get('user')) };
}
