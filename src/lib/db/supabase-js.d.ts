declare module '@supabase/supabase-js' {
  export type QueryResult<T> = Promise<{ data: T; error: null | { code?: string; message?: string; details?: string; hint?: string } }>;

  export type QueryBuilder<T = unknown> = {
    select(columns?: string): QueryBuilder<T>;
    single(): QueryResult<T>;
    maybeSingle(): QueryResult<T | null>;
    eq(column: string, value: unknown): QueryBuilder<T>;
    ilike(column: string, value: string): QueryBuilder<T>;
    is(column: string, value: null): QueryBuilder<T>;
    lt(column: string, value: unknown): QueryBuilder<T>;
    gte(column: string, value: unknown): QueryBuilder<T>;
    lte(column: string, value: unknown): QueryBuilder<T>;
    order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
    limit(count: number): QueryBuilder<T>;
    then<TResult1 = { data: T; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: T; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2>;
  };

  export type SupabaseClient<Database = unknown> = {
    readonly __database?: Database;
    from(table: string): {
      select(columns?: string): QueryBuilder<unknown[]>;
      insert(values: unknown): QueryBuilder<unknown>;
      upsert(values: unknown, options?: { onConflict?: string }): QueryBuilder<unknown>;
      update(values: unknown): QueryBuilder<unknown>;
      delete(): QueryBuilder<unknown>;
    };
    rpc(functionName: string, args: Record<string, unknown>): QueryResult<unknown>;
  };

  export function createClient<Database = unknown>(
    supabaseUrl: string,
    supabaseKey: string,
    options?: { auth?: { persistSession?: boolean } },
  ): SupabaseClient<Database>;
}
