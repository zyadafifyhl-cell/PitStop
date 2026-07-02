import { getSupabase } from '@/lib/supabase/client';

function extFromUri(uri: string): string {
  const clean = uri.split('?')[0] ?? uri;
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() || 'jpg';
}

function extFromMime(mimeType?: string | null): string | null {
  if (!mimeType) return null;
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('gif')) return 'gif';
  if (mimeType.includes('heic')) return 'heic';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return null;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function uploadImageToBucket(input: {
  localUri: string;
  bucket: string;
  folderPath: string;
  mimeType?: string | null;
}): Promise<string> {
  const uri = input.localUri.trim();
  if (!uri) return uri;
  const supabase = getSupabase();
  if (!supabase) return uri;

  try {
    const response = await fetch(uri);
    if (!response.ok) return uri;
    const blob = await response.blob();
    if (!blob.size) return uri;

    const ext = extFromMime(input.mimeType) ?? extFromMime(blob.type) ?? extFromUri(uri);
    const path = `${input.folderPath}/${Date.now()}-${randomSuffix()}.${ext}`;
    const contentType = input.mimeType || blob.type || 'image/jpeg';

    const { error } = await supabase.storage.from(input.bucket).upload(path, blob, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    });
    if (error) return uri;

    const { data } = supabase.storage.from(input.bucket).getPublicUrl(path);
    return data.publicUrl || uri;
  } catch {
    return uri;
  }
}
