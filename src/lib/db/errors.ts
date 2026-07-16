export type SupabaseErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

export class DbError extends Error {
  readonly operation: string;
  readonly cause: SupabaseErrorLike;

  constructor(operation: string, cause: SupabaseErrorLike) {
    super(`Database operation failed: ${operation}`);
    this.name = 'DbError';
    this.operation = operation;
    this.cause = cause;
  }
}

export class ForbiddenLabelError extends Error {
  constructor() {
    super('Default label "Без категории" cannot be changed or deleted');
    this.name = 'ForbiddenLabelError';
  }
}

export class LabelNameConflictError extends Error {
  constructor() {
    super('Label with this name already exists for this tenant');
    this.name = 'LabelNameConflictError';
  }
}

export class PendingExistsError extends Error {
  constructor() {
    super('Pending draft already exists for this conversation');
    this.name = 'PendingExistsError';
  }
}

export class ZernioAccountConflictError extends Error {
  constructor() {
    super('Zernio account is already connected to another tenant');
    this.name = 'ZernioAccountConflictError';
  }
}

export function isSupabaseCode(error: SupabaseErrorLike | null | undefined, code: string): boolean {
  return error?.code === code;
}

export function throwDb(operation: string, error: SupabaseErrorLike | null | undefined): never {
  throw new DbError(operation, error ?? { message: 'Unknown Supabase error' });
}
