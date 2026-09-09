export type SignInFailure =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'email_login_disabled'
  | 'rate_limited'
  | 'network_error';

type ErrorLike = {
  message?: string;
  code?: string | number;
  status?: number;
  name?: string;
};

function toErrorLike(error: unknown): ErrorLike {
  if (!error || typeof error !== 'object') {
    if (typeof error === 'string') return { message: error };
    return {};
  }
  return error as ErrorLike;
}

function lower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export function classifySignInError(error: unknown): SignInFailure {
  const err = toErrorLike(error);
  const message = lower(err.message);
  const code = lower(String(err.code ?? ''));
  const name = lower(err.name);

  if (
    err.status === 429 ||
    code.includes('over_request') ||
    message.includes('too many') ||
    message.includes('rate limit')
  ) {
    return 'rate_limited';
  }

  if (message.includes('email logins are disabled')) return 'email_login_disabled';
  if (message.includes('email not confirmed')) return 'email_not_confirmed';

  if (
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials') ||
    code.includes('invalid_credentials') ||
    code.includes('invalid_grant') ||
    err.status === 400 ||
    err.status === 401
  ) {
    return 'invalid_credentials';
  }

  if (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('connection') ||
    message.includes('offline') ||
    name === 'typeerror' ||
    err.status === 408 ||
    err.status === 502 ||
    err.status === 503 ||
    err.status === 504
  ) {
    return 'network_error';
  }

  return 'invalid_credentials';
}

export function preventAuthFormRefresh(event?: {
  preventDefault?: () => void;
  stopPropagation?: () => void;
  nativeEvent?: { preventDefault?: () => void; stopPropagation?: () => void };
}): void {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  event?.nativeEvent?.preventDefault?.();
  event?.nativeEvent?.stopPropagation?.();
}
