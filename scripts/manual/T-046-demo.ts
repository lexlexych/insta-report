import * as tenants from '../../src/lib/db/tenants';
import * as zernioAccounts from '../../src/lib/db/zernioAccounts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const tenant = await tenants.upsertByTelegramUserId(Number(suffix), {});

  try {
    const pending = await zernioAccounts.insertPending(
      tenant.id,
      'instagram',
      `t046-profile-${suffix}`,
    );
    assert(pending.status === 'pending', 'new Zernio account must be pending');

    const accountId = `t046-account-${suffix}`;
    await zernioAccounts.activate(tenant.id, 'instagram', {
      zernioAccountId: accountId,
      username: `t046_${suffix}`,
    });
    await zernioAccounts.activate(tenant.id, 'instagram', {
      zernioAccountId: accountId,
      username: `t046_${suffix}`,
    });

    const active = await zernioAccounts.getByZernioAccountId(accountId);
    assert(active?.status === 'active', 'activated account must be found by Zernio account ID');
    assert(
      (await zernioAccounts.getByZernioAccountId(null)) === null &&
        (await zernioAccounts.getByZernioAccountId('')) === null,
      'empty Zernio account IDs must not query the database',
    );

    await zernioAccounts.disconnect(tenant.id, 'instagram', 'T-046 demo cleanup');
    const disconnected = await zernioAccounts.getForTenant(tenant.id);
    assert(disconnected?.status === 'disconnected', 'account must be disconnected without deletion');
    console.log(JSON.stringify(disconnected, null, 2));
    console.log('T-046 demo OK');
  } finally {
    await tenants.deleteCascade(tenant.id);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
