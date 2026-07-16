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
  if (!isZernioEnabled()) {
    throw new Error('Zernio is disabled: set ZERNIO_API_KEY and ZERNIO_WEBHOOK_SECRET together.');
  }

  const url = new URL('/api/wh/zernio', env.APP_BASE_URL).toString();
  const existing = (await listWebhookSettings()).find((setting) => setting.name === WEBHOOK_NAME);
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
  process.stdout.write(`${JSON.stringify(publicSetting(setting), null, 2)}\n`);
}

main().catch(() => {
  process.stderr.write('Zernio webhook setup failed. Check the configuration and Zernio dashboard.\n');
  process.exitCode = 1;
});
