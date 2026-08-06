export type StoreGridLayout = {
  columns: number;
  compact: boolean;
  horizontalPadding: number;
  gap: number;
};

/** Responsive store catalog grid — mirrors Tailwind `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`. */
export function getStoreGridLayout(screenWidth: number): StoreGridLayout {
  if (screenWidth >= 1024) {
    return { columns: 4, compact: false, horizontalPadding: 20, gap: 14 };
  }
  if (screenWidth >= 768) {
    return { columns: 3, compact: false, horizontalPadding: 16, gap: 12 };
  }
  return { columns: 2, compact: true, horizontalPadding: 10, gap: 8 };
}
