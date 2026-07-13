import * as igAccounts from '../../src/lib/db/igAccounts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const tenantId = process.argv[2];
  if (!tenantId) {
    throw new Error('Usage: pnpm tsx scripts/manual/T-036-demo.ts <tenant-id>');
  }

  assert(igAccounts.normalizeIgUsername(' @Foo.Bar ') === 'foo.bar', 'username must normalize');
  assert(igAccounts.normalizeIgUsername('кириллица') === null, 'Cyrillic username must be rejected');
  assert(igAccounts.normalizeIgUsername('with space') === null, 'username with spaces must be rejected');
  assert(igAccounts.normalizeIgUsername('a'.repeat(31)) === null, 'username longer than 30 chars must be rejected');

  const suffix = Date.now().toString(36);
  const pending = await igAccounts.createPending(` @t036_pending_${suffix} `, tenantId);
  assert(pending.ig_username === `t036_pending_${suffix}`, 'repository must store normalized username');

  const approved = await igAccounts.approve(pending.id, 1);
  assert(approved?.status === 'approved', 'first approval must succeed');
  assert((await igAccounts.approve(pending.id, 1)) === null, 'second approval must be idempotent');

  const unbound = await igAccounts.createPending(`t036_unbound_${suffix}`, null);
  assert(await igAccounts.approve(unbound.id, 1), 'unbound account must be approved first');
  const bound = await igAccounts.bindTenant(unbound.id, tenantId);
  assert(bound?.tenant_id === tenantId, 'approved unbound account must bind to tenant');
  assert((await igAccounts.getByTenant(tenantId))?.tenant_id === tenantId, 'tenant lookup must return a request');

  console.log('T-036 demo OK');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
