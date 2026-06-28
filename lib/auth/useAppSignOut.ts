import { router } from 'expo-router';
import { useCallback, useState } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopAuth } from '@/context/ShopAuthContext';

type SignOutOptions = {
  /** Which login mode to show on the welcome screen after sign-out. */
  welcomeFocus?: 'customer' | 'owner';
};

/** Sign out customer/guest and shop owner session, then return to welcome. */
export function useAppSignOut() {
  const { logout: logoutCustomer } = useCustomerAuth();
  const { logout: logoutShop, shop, staff } = useShopAuth();
  const [busy, setBusy] = useState(false);

  const signOut = useCallback(
    async (options?: SignOutOptions) => {
      if (busy) return;
      setBusy(true);
      try {
        if (shop || staff) await logoutShop();
        await logoutCustomer();
        const focus =
          options?.welcomeFocus === 'owner'
            ? '?focus=owner'
            : options?.welcomeFocus === 'customer'
              ? '?focus=login'
              : '';
        router.replace(`/welcome${focus}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, shop, staff, logoutShop, logoutCustomer],
  );

  return { signOut, busy };
}
