import { isZernioEnabled } from '../../src/lib/env';
import { listAccounts, listProfiles, listWebhookSettings } from '../../src/lib/zernio/client';

async function main(): Promise<void> {
  if (!isZernioEnabled()) {
    console.log('isZernioEnabled() === false');
    return;
  }

  const [profiles, accounts, webhookSettings] = await Promise.all([
    listProfiles(),
    listAccounts({}),
    listWebhookSettings(),
  ]);
  console.log(JSON.stringify({ profiles, accounts, webhookSettings }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`T-045 demo failed: ${message}`);
  process.exitCode = 1;
});
