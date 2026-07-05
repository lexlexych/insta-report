import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const requiredFiles = [
  'src/lib/db/client.ts',
  'src/lib/db/errors.ts',
  'src/lib/db/tenants.ts',
  'src/lib/db/igConnections.ts',
  'src/lib/db/labels.ts',
  'src/lib/db/drafts.ts',
  'src/lib/db/processedEvents.ts',
  'src/lib/db/usageStats.ts',
  'src/lib/db/messageLog.ts',
  'src/lib/db/index.ts',
];

for (const file of requiredFiles) {
  read(file);
}

const igConnections = read('src/lib/db/igConnections.ts');
const drafts = read('src/lib/db/drafts.ts');
const processedEvents = read('src/lib/db/processedEvents.ts');
const labels = read('src/lib/db/labels.ts');
const eslint = read('eslint.config.mjs');

const checks: Array<[string, boolean]> = [
  ['Supabase client is server-only and uses service role env', read('src/lib/db/client.ts').includes("import 'server-only'") && read('src/lib/db/client.ts').includes('SUPABASE_SERVICE_ROLE_KEY')],
  ['IG access token/app secret are encrypted before upsert', igConnections.includes('access_token_enc: encrypt(accessToken)') && igConnections.includes('app_secret_enc: encrypt(appSecret)')],
  ['IG secrets are decrypted on getForTenant', igConnections.includes('decrypt(accessTokenEnc)') && igConnections.includes('decrypt(appSecretEnc)')],
  ['claimPendingToSending updates only pending drafts and may return null', drafts.includes(".eq('status', 'pending')") && drafts.includes('.maybeSingle()')],
  ['processedEvents.tryInsert returns false on duplicate 23505', processedEvents.includes("isSupabaseCode(error, '23505')") && processedEvents.includes('return false')],
  ['default label deletion/update is blocked', labels.includes('ForbiddenLabelError') && labels.includes("'Без категории'")],
  ['ESLint restricts @supabase/supabase-js outside db client', eslint.includes('no-restricted-imports') && eslint.includes('@supabase/supabase-js')],
];

let failed = false;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'OK' : 'FAIL'}: ${label}`);
  failed ||= !ok;
}

if (failed) {
  throw new Error('T-004 repository layer demo checks failed');
}

console.log('T-004 demo completed: repository edge cases are represented in code.');
