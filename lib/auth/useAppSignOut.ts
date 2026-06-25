import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';

/** Sign out customer/guest and shop owner session, then return to welcome. */
export function useAppSignOut() {
  const { logout: logoutCustomer } = useCustomerAuth();
  const { logout: logoutShop, shop } = useShopAuth();
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (shop) await logoutShop();
      await logoutCustomer();
      router.replace('/welcome');
    } finally {
      setBusy(false);
    }
  }, [busy, shop, logoutShop, logoutCustomer]);

  return { signOut, busy };
}
