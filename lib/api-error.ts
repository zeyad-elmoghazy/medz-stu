// Uniform API error handling. Route handlers wrap their body in
//   try { … } catch (e) { return handleApiError(e); }
// and throw new ApiError(status, publicMessage, internalDetails) for
// anything the client should see. Non-ApiError throws collapse to a
// 500 with a generic message — the real cause is logged server-side
// only, so the response body never leaks stack traces or DB errors.
import { NextResponse } from 'next/server';

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly internal?: unknown;

  constructor(statusCode: number, message: string, internal?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.internal = internal;
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    if (error.internal !== undefined) {
      // eslint-disable-next-line no-console
      console.error('[api-error]', error.message, error.internal);
    }
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  // eslint-disable-next-line no-console
  console.error('[api-error] unexpected:', error);
  return NextResponse.json(
    { error: 'Internal server error' },
    { status: 500 },
  );
}
