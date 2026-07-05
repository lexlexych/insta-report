export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code = 'http_error',
  ) {
    super(code);
    this.name = 'HttpError';
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

export function apiHandler<T extends Request>(fn: (req: T) => Promise<Response>): (req: T) => Promise<Response> {
  return async (req: T) => {
    try {
      return await fn(req);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonResponse({ ok: false, error: error.code }, error.status);
      }
      console.error('Unhandled API error', error);
      return jsonResponse({ ok: false, error: 'internal_error' }, 500);
    }
  };
}
