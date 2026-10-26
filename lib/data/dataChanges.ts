import { useEffect, useRef } from 'react';

/** Screens that show this data should refresh when a write succeeds. */
export type DataScope =
  | 'bookings'
  | 'finance'
  | 'admin'
  | 'orders'
  | 'catalog'
  | 'offers'
  | 'reviews'
  | 'community';

type Listener = (scopes: DataScope[]) => void;

const listeners = new Set<Listener>();
let emitDepth = 0;

export function emitDataChange(...scopes: DataScope[]) {
  const unique = [...new Set(scopes)];
  if (unique.length === 0 || emitDepth > 2) return;
  emitDepth += 1;
  try {
    for (const listener of listeners) listener(unique);
  } finally {
    emitDepth -= 1;
  }
}

export function subscribeDataChanges(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Refetch mounted screens after a successful create, update, or delete. */
export function useDataChanges(
  scopes: readonly DataScope[],
  onChange: (scopes: DataScope[]) => void,
) {
  const scopesKey = scopes.join('|');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const wanted = new Set(scopesKey.split('|'));
    return subscribeDataChanges((changed) => {
      const hit = changed.filter((scope) => wanted.has(scope));
      if (hit.length > 0) onChangeRef.current(hit);
    });
  }, [scopesKey]);
}
