import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

import type { Database } from './types.gen';

let db: SupabaseClient<Database> | undefined;

export function getDb(): SupabaseClient<Database> {
  if (!db) {
    db = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }

  return db;
}
