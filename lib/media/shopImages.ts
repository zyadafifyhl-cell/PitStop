import type { ShopExtras } from '@/lib/booking/types';
import { isEphemeralImageUri } from '@/lib/media/persistImageUri';

function cleanUrl(url?: string | null): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (isEphemeralImageUri(trimmed)) return undefined;
  return trimmed;
}

export function resolveShopMedia(extras: ShopExtras | null | undefined): {
  profileImage?: string;
  coverImage?: string;
  galleryImages: string[];
} {
  const profileImage = cleanUrl(extras?.profileImageUrl);
  const rawUrls = (extras?.imageUrls ?? []).map((url) => cleanUrl(url)).filter((url): url is string => !!url);
  const coverImage = rawUrls[0];
  const galleryImages = rawUrls.slice(1).filter((url) => url !== profileImage);
  return { profileImage, coverImage, galleryImages };
}
