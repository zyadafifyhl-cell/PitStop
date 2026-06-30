/** True when the URI can be stored and shown across sessions/devices. */
export function isPersistableImageUri(uri: string): boolean {
  const trimmed = uri.trim();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('data:image/')
  );
}

/** Ephemeral picker URIs that break after reload or on other clients. */
export function isEphemeralImageUri(uri: string): boolean {
  const trimmed = uri.trim();
  return trimmed.startsWith('blob:') || trimmed.startsWith('file:') || trimmed.startsWith('content:');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to read image'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

/** Convert local/blob picker URIs to data URLs so they persist in AsyncStorage / Supabase. */
export async function persistImageUri(uri: string): Promise<string> {
  const trimmed = uri.trim();
  if (!trimmed || isPersistableImageUri(trimmed)) return trimmed;

  try {
    const response = await fetch(trimmed);
    if (!response.ok) return trimmed;
    const blob = await response.blob();
    if (!blob.size) return trimmed;
    return await blobToDataUrl(blob);
  } catch {
    return trimmed;
  }
}

export async function persistImageUris(uris: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const uri of uris) {
    const next = (await persistImageUri(uri)).trim();
    if (next) out.push(next);
  }
  return out;
}
