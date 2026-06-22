import AsyncStorage from '@react-native-async-storage/async-storage';

function favoritesKey(customerId: string): string {
  return `@pitstop/favorites/${customerId}`;
}

export async function listFavoriteShopIds(customerId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(favoritesKey(customerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function isShopFavorite(customerId: string, shopId: string): Promise<boolean> {
  const ids = await listFavoriteShopIds(customerId);
  return ids.includes(shopId);
}

export async function toggleFavoriteShop(
  customerId: string,
  shopId: string,
): Promise<boolean> {
  const ids = await listFavoriteShopIds(customerId);
  const exists = ids.includes(shopId);
  const next = exists ? ids.filter((id) => id !== shopId) : [...ids, shopId];
  await AsyncStorage.setItem(favoritesKey(customerId), JSON.stringify(next));
  return !exists;
}

export async function removeFavoriteShop(customerId: string, shopId: string): Promise<void> {
  const ids = await listFavoriteShopIds(customerId);
  await AsyncStorage.setItem(
    favoritesKey(customerId),
    JSON.stringify(ids.filter((id) => id !== shopId)),
  );
}
