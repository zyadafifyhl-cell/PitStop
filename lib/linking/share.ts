import * as Linking from 'expo-linking';
import { Share } from 'react-native';

import type { Locale } from '@/lib/i18n/strings';
import { APP_BRAND_NAME } from '@/constants/Brand';

export const WEB_ORIGIN = 'https://car-care-eg.com';
export const APP_SCHEME = 'pitstop';

export function shopProfileAppPath(shopId: string): `/shop-profile/${string}` {
  return `/shop-profile/${shopId}`;
}

export function driverNetworkAppPath(postId: string): `/driver-network/${string}` {
  return `/driver-network/${postId}`;
}

export function shopProfileDeepLink(shopId: string): string {
  return `${APP_SCHEME}://shop-profile/${encodeURIComponent(shopId)}`;
}

export function shopProfileWebLink(shopId: string): string {
  return `${WEB_ORIGIN}/shop-profile/${encodeURIComponent(shopId)}`;
}

export function driverNetworkDeepLink(postId: string): string {
  return `${APP_SCHEME}://driver-network/${encodeURIComponent(postId)}`;
}

export function driverNetworkWebLink(postId: string): string {
  return `${WEB_ORIGIN}/driver-network/${encodeURIComponent(postId)}`;
}

/** Resolve pitstop:// or https://car-care-eg.com links into Expo Router paths. */
export function parsePitstopDeepLink(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  let path = '';
  if (trimmed.startsWith(`${APP_SCHEME}://`)) {
    path = trimmed.slice(`${APP_SCHEME}://`.length);
  } else if (trimmed.startsWith(`${WEB_ORIGIN}/`)) {
    path = trimmed.slice(`${WEB_ORIGIN}/`.length);
  } else {
    const parsed = Linking.parse(trimmed);
    if (parsed.scheme === APP_SCHEME && parsed.hostname) {
      path = `${parsed.hostname}${parsed.path ? `/${parsed.path.replace(/^\//, '')}` : ''}`;
    } else if (parsed.hostname === 'car-care-eg.com' && parsed.path) {
      path = parsed.path.replace(/^\//, '');
    }
  }

  path = path.replace(/\/$/, '');
  if (!path) return null;

  const shopMatch = path.match(/^shop-profile\/([^/?#]+)/i);
  if (shopMatch?.[1]) return shopProfileAppPath(decodeURIComponent(shopMatch[1]));

  const postMatch = path.match(/^driver-network\/([^/?#]+)/i);
  if (postMatch?.[1]) return driverNetworkAppPath(decodeURIComponent(postMatch[1]));

  return null;
}

export async function shareShopProfile(input: {
  shopId: string;
  shopName: string;
  locale: Locale;
}): Promise<void> {
  const webUrl = shopProfileWebLink(input.shopId);
  const deepLink = shopProfileDeepLink(input.shopId);
  const message =
    input.locale === 'ar'
      ? `تصفح ${input.shopName} على ${APP_BRAND_NAME}:\n${webUrl}\n${deepLink}`
      : `Check out ${input.shopName} on ${APP_BRAND_NAME}:\n${webUrl}\n${deepLink}`;

  await Share.share({
    message,
    url: webUrl,
    title: input.shopName,
  });
}

export async function shareDriverNetworkPost(input: {
  postId: string;
  title: string;
  locale: Locale;
}): Promise<void> {
  const webUrl = driverNetworkWebLink(input.postId);
  const deepLink = driverNetworkDeepLink(input.postId);
  const message =
    input.locale === 'ar'
      ? `${input.title}\n\nشوف المنشور على ${APP_BRAND_NAME}:\n${webUrl}\n${deepLink}`
      : `${input.title}\n\nView this post on ${APP_BRAND_NAME}:\n${webUrl}\n${deepLink}`;

  await Share.share({
    message,
    url: webUrl,
    title: input.title,
  });
}
