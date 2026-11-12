import { HttpErrorResponse } from '@angular/common/http';

import { Translate, viTranslate } from '../i18n/translate';

/** Shape of the backend's RFC 7807 error body (docs/api/api-spec.md). */
interface ProblemDetailsBody {
  title?: string;
  status?: number;
  detail?: string;
  traceId?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Messages per form field, keyed by the same camelCase names the request body uses. */
    readonly fieldErrors: Readonly<Record<string, readonly string[]>> = {},
    readonly traceId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

function isProblem(body: unknown): body is ProblemDetailsBody {
  return typeof body === 'object' && body !== null;
}

/**
 * Turns anything thrown by HttpClient into an ApiError whose message is safe to show to the user.
 * The backend writes its own messages in the language sent in Accept-Language; `t` is only for the texts made here
 * (no connection, rate limit, a status with no message).
 */
export function toApiError(error: unknown, t: Translate = viTranslate): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (!(error instanceof HttpErrorResponse)) {
    return new ApiError(0, t('error.generic'));
  }

  const status = error.status;
  const body = isProblem(error.error) ? error.error : {};
  const detail = typeof body.detail === 'string' && body.detail.trim() ? body.detail : undefined;
  const traceId = typeof body.traceId === 'string' ? body.traceId : undefined;
  const fieldErrors = body.errors && typeof body.errors === 'object' ? body.errors : {};

  if (status === 0) {
    return new ApiError(0, t('error.network'));
  }
  if (status === 429) {
    return new ApiError(status, t('error.tooMany'), {}, traceId);
  }
  if (status >= 500) {
    const reference = traceId ? t('error.reference', { id: traceId }) : '';
    return new ApiError(status, `${t('error.server')}${reference}`, {}, traceId);
  }

  const fallback: Record<number, string> = {
    400: t('error.400'),
    401: t('error.401'),
    404: t('error.404'),
    409: t('error.409'),
  };
  return new ApiError(status, detail ?? fallback[status] ?? t('error.fallback'), fieldErrors, traceId);
}
