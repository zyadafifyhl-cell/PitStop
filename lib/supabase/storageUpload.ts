import { Platform } from 'react-native';

import { getSupabase } from '@/lib/supabase/client';

export type StorageImageSource = {
  localUri: string;
  bucket: string;
  folderPath: string;
  mimeType?: string | null;
  fileName?: string | null;
  webFile?: Blob | File | null;
  base64?: string | null;
  throwOnError?: boolean;
};

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
  if (mimeType.includes('heic') || mimeType.includes('heif')) return 'heic';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  return null;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 10);
}

function safeFileStem(fileName?: string | null): string {
  const stem = fileName?.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return stem?.slice(0, 48) || 'image';
}

function normalizeContentType(mimeType?: string | null): string {
  if (!mimeType || mimeType === 'application/octet-stream') return 'image/jpeg';
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return mimeType;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Image upload failed.';
}

function decodeBase64(base64: string): ArrayBuffer {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  const atobFn = typeof globalThis.atob === 'function' ? globalThis.atob : null;
  if (!atobFn) throw new Error('Could not decode the selected image.');
  const binary = atobFn(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function browserFetch(uri: string): Promise<Response> {
  if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
    return window.fetch(uri);
  }
  return fetch(uri);
}

function isUsableBlob(value: Blob | File | null | undefined): value is Blob {
  return !!value && typeof value.size === 'number' && value.size > 0;
}

async function blobFromWebUri(uri: string): Promise<Blob | null> {
  if (!uri) return null;
  if (uri.startsWith('data:')) {
    const [header, data] = uri.split(',');
    if (!data) return null;
    const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
    return new Blob([new Uint8Array(decodeBase64(data))], { type: mime });
  }
  const response = await browserFetch(uri);
  if (!response.ok) throw new Error(`Could not read the selected image (${response.status}).`);
  const blob = await response.blob();
  return blob.size > 0 ? blob : null;
}

async function readNativeBody(uri: string, base64?: string | null): Promise<ArrayBuffer> {
  if (base64) return decodeBase64(base64);
  try {
    const { File: ExpoFile } = await import('expo-file-system');
    const file = new ExpoFile(uri);
    const bytes = await file.bytes();
    if (!bytes.byteLength) throw new Error('The selected image is empty.');
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch (error) {
    console.error('Storage Upload Error:', error);
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read the selected image.');
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) throw new Error('The selected image is empty.');
    return buffer;
  }
}

/** Keep a durable File/Blob on web so blob: URLs can still be uploaded later. */
export async function materializePickerAsset(asset: {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  file?: File | null;
  base64?: string | null;
}): Promise<Omit<StorageImageSource, 'bucket' | 'folderPath' | 'throwOnError'>> {
  let webFile: Blob | File | null = isUsableBlob(asset.file) ? asset.file : null;
  if (Platform.OS === 'web' && !webFile && asset.uri) {
    try {
      webFile = await blobFromWebUri(asset.uri);
    } catch (error) {
      console.error('Storage Upload Error:', error);
    }
  }
  return {
    localUri: asset.uri,
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    webFile,
    base64: asset.base64 ?? null,
  };
}

export async function uploadImageToBucket(input: StorageImageSource): Promise<string> {
  const uri = input.localUri.trim();
  if (!uri) return uri;
  const supabase = getSupabase();
  if (!supabase) {
    const error = new Error('Supabase is not configured.');
    console.error('Storage Upload Error:', error);
    if (input.throwOnError) throw error;
    return uri;
  }

  try {
    let uploadBody: Blob | ArrayBuffer;
    let detectedMime = input.mimeType || (isUsableBlob(input.webFile) ? input.webFile.type : null);

    if (isUsableBlob(input.webFile)) {
      uploadBody = input.webFile;
      detectedMime = input.webFile.type || detectedMime;
    } else if (Platform.OS === 'web') {
      const blob = await blobFromWebUri(uri);
      if (!blob) throw new Error('Could not read the selected image.');
      uploadBody = blob;
      detectedMime = blob.type || detectedMime;
    } else if (uri.startsWith('data:')) {
      const blob = await blobFromWebUri(uri);
      if (!blob) throw new Error('Could not read the selected image.');
      uploadBody = blob;
      detectedMime = blob.type || detectedMime;
    } else {
      uploadBody = await readNativeBody(uri, input.base64);
    }

    const contentType = normalizeContentType(detectedMime);
    const ext = extFromMime(contentType) ?? extFromUri(input.fileName || uri);
    const folder = input.folderPath.replace(/^\/+|\/+$/g, '');
    const path = `${folder}/${Date.now()}-${safeFileStem(input.fileName)}-${randomSuffix()}.${ext}`;

    const { error } = await supabase.storage.from(input.bucket).upload(path, uploadBody, {
      cacheControl: '3600',
      upsert: false,
      contentType,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(input.bucket).getPublicUrl(path);
    if (!data.publicUrl) throw new Error('Supabase did not return a public image URL.');
    return data.publicUrl;
  } catch (error) {
    console.error('Storage Upload Error:', error);
    if (input.throwOnError) throw new Error(errorMessage(error));
    return uri;
  }
}
