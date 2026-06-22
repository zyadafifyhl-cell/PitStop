import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useShopAuth } from '@/context/ShopAuthContext';

/** Shop owners who sign in should land on the shop tab, not customer home. */
export function ShopAuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { ready, shop } = useShopAuth();

  useEffect(() => {
    if (!ready || !shop) return;
    const onShopTab = pathname === '/shop';
    if (!onShopTab) router.replace('/shop');
  }, [ready, shop, pathname, router]);

  return null;
}
