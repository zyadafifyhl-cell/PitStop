const MAX_STORED_IMAGE_URL_LENGTH = 2048;

/** True when the URI is a short remote URL safe to cache in localStorage. */
export function isPersistableImageUri(uri: string): boolean {
  const trimmed = uri.trim();
  return (
    (trimmed.startsWith('https://') || trimmed.startsWith('http://')) &&
    trimmed.length <= MAX_STORED_IMAGE_URL_LENGTH &&
    !trimmed.startsWith('data:')
  );
}

/** Ephemeral picker URIs that break after reload or on other clients. */
export function isEphemeralImageUri(uri: string): boolean {
  const trimmed = uri.trim();
  return (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('content:') ||
    trimmed.startsWith('data:')
  );
}

export function compactStoredImageUrl(uri?: string | null): string | undefined {
  const trimmed = uri?.trim();
  if (!trimmed || !isPersistableImageUri(trimmed)) return undefined;
  return trimmed;
}

export function compactStoredImageUrls(uris?: Array<string | null | undefined>): string[] {
  return (uris ?? []).map((uri) => compactStoredImageUrl(uri)).filter((uri): uri is string => !!uri);
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = 'name' in error ? String((error as { name?: unknown }).name) : '';
  const message = 'message' in error ? String((error as { message?: unknown }).message) : '';
  return name === 'QuotaExceededError' || /quota|exceeded the quota/i.test(message);
}

/** Keep only remote http(s) URLs. Never convert picker blobs into Base64 for storage. */
export async function persistImageUri(uri: string): Promise<string> {
  return compactStoredImageUrl(uri) ?? '';
}

export async function persistImageUris(uris: string[]): Promise<string[]> {
  return compactStoredImageUrls(uris);
}
