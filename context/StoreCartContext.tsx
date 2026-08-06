import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import {
  cartItemCount,
  cartSubtotal,
  clearCartForUser,
  listCartItemsForUser,
  removeCartItem,
  removeCartItemByProductId,
  upsertCartItem,
} from '@/lib/store/cartRepository';
import {
  clearPersistedCartItems,
  loadPersistedCartItems,
  savePersistedCartItems,
} from '@/lib/store/cartStorage';
import type { StoreCartItem, StoreProduct } from '@/lib/store/types';

type StoreCartContextValue = {
  items: StoreCartItem[];
  itemCount: number;
  subtotal: number;
  loading: boolean;
  refresh: () => Promise<void>;
  addProduct: (product: StoreProduct, quantity?: number) => Promise<boolean>;
  setQuantity: (cartItemId: string, quantity: number) => Promise<boolean>;
  removeItem: (cartItemId: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
};

const StoreCartContext = createContext<StoreCartContextValue | null>(null);

function buildOptimisticCartItem(userId: string, product: StoreProduct, quantity: number): StoreCartItem {
  const now = new Date().toISOString();
  return {
    id: `pending-${product.id}`,
    userId,
    productId: product.id,
    quantity,
    product,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeOptimisticCartItem(items: StoreCartItem[], userId: string, product: StoreProduct, quantity: number): StoreCartItem[] {
  const existing = items.find((row) => row.productId === product.id);
  const now = new Date().toISOString();
  if (existing) {
    return items.map((row) =>
      row.productId === product.id
        ? { ...row, quantity, product, updatedAt: now }
        : row,
    );
  }
  return [buildOptimisticCartItem(userId, product, quantity), ...items];
}

export function StoreCartProvider({ children }: { children: React.ReactNode }) {
  const { customer } = useCustomerAuth();
  const [items, setItems] = useState<StoreCartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const syncLocal = useCallback(
    async (next: StoreCartItem[]) => {
      if (!customer?.id) return;
      await savePersistedCartItems(customer.id, next);
    },
    [customer?.id],
  );

  const refresh = useCallback(async () => {
    if (!customer?.id) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const cached = await loadPersistedCartItems(customer.id);
      if (cached.length) {
        setItems(cached);
      }

      const rows = await listCartItemsForUser(customer.id);
      setItems(rows);
      await savePersistedCartItems(customer.id, rows);
    } finally {
      setLoading(false);
    }
  }, [customer?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addProduct = useCallback(
    async (product: StoreProduct, quantity = 1) => {
      if (!customer?.id) return false;

      let nextQuantity = quantity;
      setItems((prev) => {
        const existing = prev.find((row) => row.productId === product.id);
        nextQuantity = (existing?.quantity ?? 0) + quantity;
        const next = mergeOptimisticCartItem(prev, customer.id, product, nextQuantity);
        void syncLocal(next);
        return next;
      });

      const ok = await upsertCartItem(customer.id, product.id, nextQuantity);
      if (ok) {
        await refresh();
      } else {
        await refresh();
      }
      return ok;
    },
    [customer?.id, refresh, syncLocal],
  );

  const setQuantity = useCallback(
    async (cartItemId: string, quantity: number) => {
      if (!customer?.id) return false;

      const target = items.find((row) => row.id === cartItemId);
      if (!target) return false;

      if (quantity < 1) {
        setItems((prev) => {
          const next = prev.filter((row) => row.id !== cartItemId);
          void syncLocal(next);
          return next;
        });
        const ok = cartItemId.startsWith('pending-')
          ? await removeCartItemByProductId(customer.id, target.productId)
          : await removeCartItem(customer.id, cartItemId);
        await refresh();
        return ok;
      }

      setItems((prev) => {
        const next = prev.map((row) =>
          row.id === cartItemId
            ? { ...row, quantity, updatedAt: new Date().toISOString() }
            : row,
        );
        void syncLocal(next);
        return next;
      });

      const ok = await upsertCartItem(customer.id, target.productId, quantity);
      if (ok) await refresh();
      else await refresh();
      return ok;
    },
    [customer?.id, items, refresh, syncLocal],
  );

  const removeItem = useCallback(
    async (cartItemId: string) => {
      if (!customer?.id) return false;

      setItems((prev) => {
        const next = prev.filter((row) => row.id !== cartItemId);
        void syncLocal(next);
        return next;
      });

      const target = items.find((row) => row.id === cartItemId);
      const ok = target
        ? cartItemId.startsWith('pending-')
          ? await removeCartItemByProductId(customer.id, target.productId)
          : await removeCartItem(customer.id, cartItemId)
        : false;
      await refresh();
      return ok;
    },
    [customer?.id, refresh, syncLocal],
  );

  const clear = useCallback(async () => {
    if (!customer?.id) return false;

    setItems([]);
    await clearPersistedCartItems(customer.id);
    const ok = await clearCartForUser(customer.id);
    return ok;
  }, [customer?.id]);

  const value = useMemo<StoreCartContextValue>(
    () => ({
      items,
      itemCount: cartItemCount(items),
      subtotal: cartSubtotal(items),
      loading,
      refresh,
      addProduct,
      setQuantity,
      removeItem,
      clear,
    }),
    [items, loading, refresh, addProduct, setQuantity, removeItem, clear],
  );

  return <StoreCartContext.Provider value={value}>{children}</StoreCartContext.Provider>;
}

export function useStoreCart(): StoreCartContextValue {
  const ctx = useContext(StoreCartContext);
  if (!ctx) {
    throw new Error('useStoreCart must be used within StoreCartProvider');
  }
  return ctx;
}
