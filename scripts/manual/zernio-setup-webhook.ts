import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { env, isZernioEnabled } from '../../src/lib/env';
import {
  createWebhookSetting,
  listWebhookSettings,
  updateWebhookSetting,
} from '../../src/lib/zernio/client';
import type { ZernioWebhookSetting } from '../../src/lib/zernio/types';

const WEBHOOK_NAME = 'insta-reply';
const WEBHOOK_EVENTS = [
  'message.received',
  'message.sent',
  'account.connected',
  'account.disconnected',
];

function loadLocalEnv(): void {
  const envPath = resolve(process.cwd(), '.env.local');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function publicSetting(setting: ZernioWebhookSetting): Record<string, unknown> {
  return {
    id: setting._id,
    name: setting.name,
    url: setting.url,
    events: setting.events,
    isActive: setting.isActive,
    failureCount: setting.failureCount ?? 0,
    lastFiredAt: setting.lastFiredAt ?? null,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  if (!isZernioEnabled()) {
    throw new Error('Zernio is disabled: set ZERNIO_API_KEY and ZERNIO_WEBHOOK_SECRET together.');
  }

  const url = new URL('/api/wh/zernio', env.APP_BASE_URL).toString();
  const existing = (await listWebhookSettings()).find((setting) => setting.name === WEBHOOK_NAME);
  const action = existing ? 'updated' : 'created';
  const setting = existing
    ? await updateWebhookSetting({
        _id: existing._id,
        name: WEBHOOK_NAME,
        url,
        events: WEBHOOK_EVENTS,
        isActive: true,
      })
    : await createWebhookSetting({
        name: WEBHOOK_NAME,
        url,
        secret: env.ZERNIO_WEBHOOK_SECRET,
        events: WEBHOOK_EVENTS,
        isActive: true,
      });

  // Secret deliberately omitted from output: it is only sent while the setting is created.
  process.stdout.write(`${JSON.stringify({ action, webhook: publicSetting(setting) }, null, 2)}\n`);
}

function redactSecrets(message: string): string {
  let redacted = message;
  for (const secret of [process.env.ZERNIO_API_KEY, process.env.ZERNIO_WEBHOOK_SECRET]) {
    if (secret) redacted = redacted.replaceAll(secret, '[REDACTED]');
  }
  return redacted;
}

function publicError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { name: 'UnknownError', message: 'Unknown failure' };
  const details = error as Error & { status?: unknown; code?: unknown };
  return {
    name: error.name,
    ...(typeof details.status === 'number' && { status: details.status }),
    ...(typeof details.code === 'string' && { code: details.code }),
    message: redactSecrets(error.message),
  };
}

main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ ok: false, error: publicError(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
