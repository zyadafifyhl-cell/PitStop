type UserErrorKey =
  | 'error_auth_invalid_credentials'
  | 'error_connection_failed'
  | 'error_general_fallback';

type TranslateFn = (key: UserErrorKey) => string;

type ErrorLike = {
  message?: string;
  code?: string | number;
  status?: number;
  name?: string;
};

function toErrorLike(error: unknown): ErrorLike {
  if (!error || typeof error !== 'object') return {};
  return error as ErrorLike;
}

function lower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function detectAuthFailure(error: ErrorLike): boolean {
  const message = lower(error.message);
  const code = lower(String(error.code ?? ''));
  return (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    message.includes('email or password') ||
    message.includes('wrong password') ||
    message.includes('invalid grant') ||
    code.includes('invalid_credentials') ||
    code.includes('invalid_grant') ||
    code.includes('bad_credentials') ||
    error.status === 401 ||
    error.status === 403
  );
}

function detectNetworkFailure(error: ErrorLike): boolean {
  const message = lower(error.message);
  const code = lower(String(error.code ?? ''));
  return (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('connection') ||
    message.includes('timeout') ||
    message.includes('offline') ||
    code.includes('network') ||
    code.includes('timeout') ||
    code.includes('conn') ||
    error.status === 408 ||
    error.status === 502 ||
    error.status === 503 ||
    error.status === 504
  );
}

function keyForError(error: unknown): UserErrorKey {
  const err = toErrorLike(error);
  if (detectAuthFailure(err)) return 'error_auth_invalid_credentials';
  if (detectNetworkFailure(err)) return 'error_connection_failed';
  return 'error_general_fallback';
}

export function safeErrorMessage(error: unknown, t: TranslateFn): string {
  return t(keyForError(error));
}

export function logAndGetSafeErrorMessage(error: unknown, t: TranslateFn, context: string): string {
  console.error(`[${context}]`, error);
  return safeErrorMessage(error, t);
}
