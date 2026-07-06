type LeafletMapLike = {
  getContainer?: () => HTMLElement | undefined;
  stop?: () => void;
  remove?: () => void;
  _removed?: boolean;
};

export function isMapAlive(map: unknown): boolean {
  if (!map || typeof map !== 'object') return false;
  const leafletMap = map as LeafletMapLike;
  try {
    if (leafletMap._removed) return false;
    const container = leafletMap.getContainer?.();
    return !!container && container.isConnected;
  } catch {
    return false;
  }
}

export function safeRemoveMap(map: unknown): void {
  if (!map || typeof map !== 'object') return;
  const leafletMap = map as LeafletMapLike;
  try {
    leafletMap.stop?.();
  } catch {
    // Map may already be partially torn down.
  }
  try {
    leafletMap.remove?.();
  } catch {
    // Ignore remove races during React unmount.
  }
}
