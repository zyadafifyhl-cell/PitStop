import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useRef } from 'react';

import { isMapAlive, safeRemoveMap } from '@/components/maps/leafletMapLifecycle';
import type { ShopMapPin } from '@/lib/booking/shopMapDiscovery';
import type { ShopType } from '@/lib/booking/types';

type Props = {
  shops: ShopMapPin[];
  shopType: ShopType;
  locale: 'en' | 'ar';
  onShopPress: (shopId: string) => void;
  height?: number;
};

const DEFAULT_HEIGHT = 420;
const DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 };
const USER_ZOOM = 13;
const MARKER_STYLE_ID = 'pitstop-category-map-marker-styles';

type LatLng = { lat: number; lng: number };

type LeafletStatic = typeof import('leaflet');

const SHOP_MARKER_THEME: Record<
  ShopType,
  { bg: string; border: string; glow: string; label: string }
> = {
  wash: { bg: '#080D1A', border: '#00D4FF', glow: 'rgba(0, 212, 255, 0.35)', label: 'Wash' },
  maintenance: { bg: '#0B1422', border: '#0052FF', glow: 'rgba(0, 82, 255, 0.35)', label: 'Service' },
  parts: { bg: '#102018', border: '#34D399', glow: 'rgba(52, 211, 153, 0.32)', label: 'Parts' },
  accessories: { bg: '#101828', border: '#38BDF8', glow: 'rgba(56, 189, 248, 0.32)', label: 'Store' },
  winch: { bg: '#15181F', border: '#94A3B8', glow: 'rgba(148, 163, 184, 0.32)', label: 'Winch' },
};

function shopMarkerSvg(type: ShopType): string {
  switch (type) {
    case 'wash':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 16h14l-1.2 4H6.2L5 16Z" fill="currentColor"/>
        <path d="M7 11h10l-1.4 5H8.4L7 11Z" fill="currentColor" opacity="0.55"/>
        <circle cx="8" cy="20.5" r="1.5" fill="#ffffff"/>
        <circle cx="16" cy="20.5" r="1.5" fill="#ffffff"/>
      </svg>`;
    case 'maintenance':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a1 1 0 0 0 0-1.4l-1.6-1.6a1 1 0 0 0-1.4 0l-3.8 3.8Z" fill="currentColor"/>
        <path d="M3 21l6.5-6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
      </svg>`;
    case 'parts':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5L12 3Z" fill="currentColor"/>
      </svg>`;
    case 'accessories':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 7h10v10H7V7Z" stroke="currentColor" stroke-width="2"/>
        <path d="M9 11h6M9 14h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
      </svg>`;
    case 'winch':
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 15h12l2 4H6l-2-4Z" fill="currentColor"/>
        <path d="M7 11h8l1.5 4H8.5L7 11Z" fill="currentColor" opacity="0.55"/>
        <path d="M18 8v8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>`;
  }
}

/** User location — pulsing avatar pin anchored at dot center. */
export function buildUserLocationDivIcon(L: LeafletStatic, locale: 'en' | 'ar') {
  const label = locale === 'ar' ? 'أنت' : 'You';
  return L.divIcon({
    className: 'pitstop-leaflet-icon pitstop-leaflet-icon--user',
    html: `
      <div class="pitstop-user-pin" role="img" aria-label="${label}">
        <div class="pitstop-user-pin__pulse"></div>
        <div class="pitstop-user-pin__core">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="8.5" r="3.5" fill="#ffffff"/>
            <path d="M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/>
          </svg>
        </div>
        <span class="pitstop-user-pin__label">${label}</span>
      </div>`,
    iconSize: [48, 58],
    iconAnchor: [24, 24],
    popupAnchor: [0, -20],
  });
}

/** Merchant pin — category icon inside branded pin, anchor at tip. */
export function buildShopDivIcon(L: LeafletStatic, shopType: ShopType) {
  const theme = SHOP_MARKER_THEME[shopType];
  return L.divIcon({
    className: 'pitstop-leaflet-icon pitstop-leaflet-icon--shop',
    html: `
      <div class="pitstop-shop-pin pitstop-shop-pin--${shopType}" role="img" aria-label="${theme.label}">
        <div class="pitstop-shop-pin__head" style="background:${theme.bg};border-color:${theme.border};box-shadow:0 0 0 4px ${theme.glow};">
          <span class="pitstop-shop-pin__glyph" style="color:${theme.border};">
            ${shopMarkerSvg(shopType)}
          </span>
        </div>
        <div class="pitstop-shop-pin__tip" style="border-top-color:${theme.bg};"></div>
      </div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 48],
    popupAnchor: [0, -44],
  });
}

function ensureMarkerStyles(): void {
  if (typeof document === 'undefined' || document.getElementById(MARKER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = MARKER_STYLE_ID;
  style.textContent = `
    .pitstop-leaflet-icon {
      background: transparent !important;
      border: none !important;
    }
    .pitstop-user-pin {
      width: 48px;
      height: 58px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .pitstop-user-pin__pulse {
      position: absolute;
      top: 0;
      left: 50%;
      width: 36px;
      height: 36px;
      margin-left: -18px;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.22);
      animation: pitstop-user-pulse 1.8s ease-out infinite;
    }
    .pitstop-user-pin__core {
      width: 32px;
      height: 32px;
      border-radius: 999px;
      background: linear-gradient(145deg, #3B82F6 0%, #2563EB 100%);
      border: 2px solid #ffffff;
      box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 1;
    }
    .pitstop-user-pin__label {
      margin-top: 4px;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.92);
      color: #ffffff;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.2;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
    }
    .pitstop-shop-pin {
      width: 40px;
      height: 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .pitstop-shop-pin__head {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      border: 2px solid;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pitstop-shop-pin__glyph {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pitstop-shop-pin__tip {
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 10px solid;
      margin-top: -1px;
      filter: drop-shadow(0 3px 4px rgba(0, 0, 0, 0.28));
    }
    @keyframes pitstop-user-pulse {
      0% { transform: scale(0.72); opacity: 0.85; }
      70% { transform: scale(1.35); opacity: 0; }
      100% { transform: scale(1.35); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readUserLocation(): Promise<LatLng | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function CategoryShopsMap({
  shops,
  shopType,
  locale,
  onShopPress,
  height = DEFAULT_HEIGHT,
}: Props) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const layerGroupRef = useRef<any | null>(null);
  const onShopPressRef = useRef(onShopPress);
  onShopPressRef.current = onShopPress;

  const markerData = useMemo(
    () =>
      shops.map((shop) => ({
        pinId: shop.pinId,
        shopId: shop.id,
        lat: shop.latitude,
        lng: shop.longitude,
        label: locale === 'ar' ? shop.nameAr || shop.name : shop.name,
        address: locale === 'ar' ? shop.addressAr || shop.address : shop.address,
        profilePath: `/shop-profile/${encodeURIComponent(shop.id)}`,
      })),
    [shops, locale],
  );

  useEffect(() => {
    const node = mapNodeRef.current;
    if (!node || typeof window === 'undefined') return;

    ensureMarkerStyles();
    let disposed = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    void (async () => {
      const leaflet = await import('leaflet');
      const L = leaflet.default;
      if (!L || disposed || !mapNodeRef.current) return;

      if (!mapRef.current) {
        const map = L.map(node, {
          center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
          zoom: USER_ZOOM,
          zoomControl: true,
          attributionControl: true,
        });
        mapRef.current = map;

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        layerGroupRef.current = L.layerGroup().addTo(map);
      }

      const map = mapRef.current;
      const layerGroup = layerGroupRef.current;
      if (!isMapAlive(map) || !layerGroup) return;

      layerGroup.clearLayers();

      const userLocation = await readUserLocation();
      if (disposed || !isMapAlive(map) || !layerGroupRef.current) return;

      const bounds = L.latLngBounds([]);
      const userIcon = buildUserLocationDivIcon(L, locale);
      const shopIcon = buildShopDivIcon(L, shopType);

      if (userLocation) {
        const userMarker = L.marker([userLocation.lat, userLocation.lng], {
          icon: userIcon,
          zIndexOffset: 1000,
        });
        userMarker.bindTooltip(locale === 'ar' ? 'موقعك الحالي' : 'Your location', {
          permanent: false,
          direction: 'top',
          offset: [0, -8],
        });
        userMarker.addTo(layerGroup);
        bounds.extend([userLocation.lat, userLocation.lng]);
      }

      for (const shop of markerData) {
        const marker = L.marker([shop.lat, shop.lng], { icon: shopIcon });

        const popupHtml = `
          <div style="min-width:180px;line-height:1.45;">
            <strong>${escapeHtml(shop.label)}</strong><br/>
            <span style="opacity:0.85;">${escapeHtml(shop.address)}</span><br/>
            <a href="${shop.profilePath}" style="display:inline-block;margin-top:8px;font-weight:700;color:#0052FF;">
              ${locale === 'ar' ? 'عرض الملف' : 'View profile'}
            </a>
          </div>`;

        marker.bindPopup(popupHtml);
        marker.on('click', () => onShopPressRef.current(shop.shopId));
        marker.addTo(layerGroup);
        bounds.extend([shop.lat, shop.lng]);
      }

      timeoutId = window.setTimeout(() => {
        const activeMap = mapRef.current;
        if (disposed || !isMapAlive(activeMap)) return;

        try {
          activeMap.invalidateSize();

          if (bounds.isValid() && (markerData.length > 0 || userLocation)) {
            if (markerData.length > 0) {
              activeMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 15, animate: false });
            } else if (userLocation) {
              activeMap.setView([userLocation.lat, userLocation.lng], USER_ZOOM, { animate: false });
            }
            return;
          }

          activeMap.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 11, { animate: false });
        } catch {
          // Ignore map updates if Leaflet is mid-teardown.
        }
      }, 120);
    })();

    return () => {
      disposed = true;
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [markerData, locale, height, shopType]);

  useEffect(() => {
    return () => {
      if (layerGroupRef.current) {
        try {
          layerGroupRef.current.clearLayers();
        } catch {
          // Ignore layer cleanup races.
        }
        layerGroupRef.current = null;
      }
      safeRemoveMap(mapRef.current);
      mapRef.current = null;
    };
  }, []);

  return (
    <div style={{ width: '100%' }}>
      <div
        ref={mapNodeRef}
        style={{
          width: '100%',
          height,
          borderRadius: 0,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
    </div>
  );
};
