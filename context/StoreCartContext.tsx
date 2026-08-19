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
import type { StoreCartItem, StoreProduct } from '@/lib/store/types';
import { availableStock, clampRequestedCartQuantity } from '@/lib/store/stockLimits';

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

  const refresh = useCallback(async () => {
    if (!customer?.id) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const rows = await listCartItemsForUser(customer.id);
      setItems(rows);
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

      const stock = availableStock(product);
      if (stock <= 0) return false;

      const current = items.find((row) => row.productId === product.id)?.quantity ?? 0;
      const nextQuantity = clampRequestedCartQuantity({
        requested: current + Math.max(1, Math.floor(quantity)),
        current,
        stock,
      });
      if (nextQuantity < 1) return false;
      if (nextQuantity === current) return true;

      setItems((prev) => mergeOptimisticCartItem(prev, customer.id, product, nextQuantity));
      const ok = await upsertCartItem(customer.id, product.id, nextQuantity);
      await refresh();
      return ok;
    },
    [customer?.id, items, refresh],
  );

  const setQuantity = useCallback(
    async (cartItemId: string, quantity: number) => {
      if (!customer?.id) return false;

      const target = items.find((row) => row.id === cartItemId);
      if (!target) return false;

      const stock = availableStock(target.product);
      const nextQuantity = clampRequestedCartQuantity({
        requested: quantity,
        current: target.quantity,
        stock,
      });

      if (nextQuantity < 1) {
        setItems((prev) => prev.filter((row) => row.id !== cartItemId));
        const ok = cartItemId.startsWith('pending-')
          ? await removeCartItemByProductId(customer.id, target.productId)
          : await removeCartItem(customer.id, cartItemId);
        await refresh();
        return ok;
      }

      if (nextQuantity === target.quantity) return true;

      setItems((prev) =>
        prev.map((row) =>
          row.id === cartItemId
            ? { ...row, quantity: nextQuantity, updatedAt: new Date().toISOString() }
            : row,
        ),
      );

      const ok = await upsertCartItem(customer.id, target.productId, nextQuantity);
      await refresh();
      return ok;
    },
    [customer?.id, items, refresh],
  );

  const removeItem = useCallback(
    async (cartItemId: string) => {
      if (!customer?.id) return false;

      setItems((prev) => {
        return prev.filter((row) => row.id !== cartItemId);
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
    [customer?.id, items, refresh],
  );

  const clear = useCallback(async () => {
    if (!customer?.id) return false;

    setItems([]);
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
