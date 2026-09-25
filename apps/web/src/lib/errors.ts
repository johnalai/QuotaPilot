import 'server-only';

/**
 * The error contract (architecture §9.3 / route-map §4).
 *
 * Every route handler and Server Action returns either a success payload or
 * `ApiError`. The fixed code vocabulary is part of the contract — clients and
 * tests pattern-match on it, so a new failure mode gets a new code.
 *
 *   VALIDATION      — input failed zod or a domain invariant
 *   FORBIDDEN       — authorized session, role insufficient for the action
 *   NOT_FOUND       — scoped entity doesn't exist (or doesn't exist for this org)
 *   TENANT_VIOLATION— a cross-org boundary was touched (should never reach here;
 *                      RLS is the backstop, this code is the app-layer signal)
 *   AI_QUOTA        — per-org AI cap exceeded (Phase 4)
 *   RATE_LIMITED    — too many requests (Phase 6)
 */
export type ErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'TENANT_VIOLATION'
  | 'AI_QUOTA'
  | 'RATE_LIMITED';

export interface ApiErrorShape {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly _tag = 'ApiError' as const;
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = code;
  }
}

export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError('VALIDATION', message, details);
}

export function forbidden(message = 'You do not have permission to perform this action'): ApiError {
  return new ApiError('FORBIDDEN', message);
}

export function notFound(message = 'Not found'): ApiError {
  return new ApiError('NOT_FOUND', message);
}

export function tenantViolation(message = 'Cross-tenant access is not permitted'): ApiError {
  return new ApiError('TENANT_VIOLATION', message);
}

/** Serialize an ApiError (or unknown thrown value) into the wire shape. */
export function toApiError(err: unknown): ApiErrorShape {
  if (err instanceof ApiError) {
    return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
  }
  // Zod errors carry their own shape — surface the field-level messages.
  if (err && typeof err === 'object' && 'issues' in err) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Validation failed',
        details: (err as { issues: unknown[] }).issues,
      },
    };
  }
  if (err instanceof Error) {
    return { ok: false, error: { code: 'VALIDATION', message: err.message } };
  }
  return { ok: false, error: { code: 'VALIDATION', message: 'Unknown error' } };
}

export function errorResponse(err: unknown, status = 400): Response {
  return Response.json(toApiError(err), { status });
}