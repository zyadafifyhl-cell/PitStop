import type { ShopType } from '@/lib/booking/types';

export type NativeMapShop = {
  pinId: string;
  shopId: string;
  lat: number;
  lng: number;
  label: string;
  address: string;
};

type BuildInput = {
  shops: NativeMapShop[];
  shopType: ShopType;
  locale: 'en' | 'ar';
  dark: boolean;
};

const DEFAULT_CENTER = { lat: 30.0444, lng: 31.2357 };

function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function shopMarkerSvg(type: ShopType): string {
  switch (type) {
    case 'wash':
    case 'detailing_studio':
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

/** Leaflet + OpenStreetMap document rendered inside the Expo Go WebView. */
export function buildNativeLeafletHtml({ shops, shopType, locale, dark }: BuildInput): string {
  const youLabel = locale === 'ar' ? 'أنت' : 'You';
  const tiles = dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const attribution = dark
    ? '&copy; OpenStreetMap contributors &copy; CARTO'
    : '&copy; OpenStreetMap contributors';
  const pageBg = dark ? '#000000' : '#e8eef4';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { margin: 0; height: 100%; width: 100%; background: ${pageBg}; }
    .leaflet-container { font-family: -apple-system, "Segoe UI", sans-serif; background: ${pageBg}; }
    .leaflet-control-attribution { font-size: 10px; background: rgba(255,255,255,0.82) !important; }
    .leaflet-bar a { border-radius: 0 !important; }
    .pitstop-leaflet-icon { background: transparent !important; border: none !important; }
    .pitstop-user-pin {
      width: 48px; height: 58px; position: relative;
      display: flex; flex-direction: column; align-items: center; pointer-events: none;
    }
    .pitstop-user-pin__pulse {
      position: absolute; top: 0; left: 50%; width: 44px; height: 44px; margin-left: -22px;
      border-radius: 999px; background: rgba(0, 37, 92, 0.18);
      animation: pitstop-user-pulse 1.8s ease-out infinite;
    }
    .pitstop-user-pin__core {
      width: 34px; height: 34px; border-radius: 999px; background: #00255C;
      border: 3px solid #ffffff; display: flex; align-items: center; justify-content: center;
      position: relative; z-index: 1; box-shadow: 0 2px 8px rgba(0, 37, 92, 0.35);
    }
    .pitstop-user-pin__label {
      margin-top: 4px; padding: 2px 8px; border-radius: 999px;
      background: #00255C; color: #ffffff; font-size: 10px; font-weight: 800;
      letter-spacing: 0.04em; line-height: 1.2;
    }
    .pitstop-shop-pin {
      width: 40px; height: 48px; display: flex; flex-direction: column; align-items: center;
    }
    .pitstop-shop-pin__head {
      width: 36px; height: 36px; border-radius: 12px; border: 2px solid #00255C; background: #ffffff;
      display: flex; align-items: center; justify-content: center; color: #00255C;
      box-shadow: 0 4px 10px rgba(15, 23, 42, 0.18);
    }
    .pitstop-shop-pin__tip {
      width: 0; height: 0; border-left: 8px solid transparent; border-right: 8px solid transparent;
      border-top: 10px solid #ffffff; margin-top: -1px; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.18));
    }
    @keyframes pitstop-user-pulse {
      0% { transform: scale(0.7); opacity: 0.9; }
      70% { transform: scale(1.45); opacity: 0; }
      100% { transform: scale(1.45); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const SHOPS = ${embedJson(shops)};
    const SHOP_ICON = ${embedJson(shopMarkerSvg(shopType))};
    const YOU = ${embedJson(youLabel)};
    const TILES = ${embedJson(tiles)};
    const ATTRIBUTION = ${embedJson(attribution)};
    const DEFAULT_CENTER = ${embedJson(DEFAULT_CENTER)};

    function post(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      }
    }

    if (typeof L === 'undefined') {
      post({ type: 'error' });
    } else {
      const map = L.map('map', {
        center: [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
        zoom: 12,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

      const shopIcon = L.divIcon({
        className: 'pitstop-leaflet-icon',
        html: '<div class="pitstop-shop-pin"><div class="pitstop-shop-pin__head">' + SHOP_ICON + '</div><div class="pitstop-shop-pin__tip"></div></div>',
        iconSize: [40, 48],
        iconAnchor: [20, 48],
      });

      const userIcon = L.divIcon({
        className: 'pitstop-leaflet-icon',
        html: '<div class="pitstop-user-pin"><div class="pitstop-user-pin__pulse"></div><div class="pitstop-user-pin__core"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8.5" r="3.5" fill="#ffffff"/><path d="M6 19c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/></svg></div><span class="pitstop-user-pin__label">' + YOU + '</span></div>',
        iconSize: [48, 58],
        iconAnchor: [24, 24],
      });

      const bounds = L.latLngBounds([]);
      SHOPS.forEach(function (shop) {
        const marker = L.marker([shop.lat, shop.lng], { icon: shopIcon, zIndexOffset: 100 });
        marker.on('click', function () {
          post({ type: 'select', pinId: shop.pinId });
        });
        marker.addTo(map);
        bounds.extend([shop.lat, shop.lng]);
      });

      let userMarker = null;
      let accuracyCircle = null;
      let fittedUser = false;

      window.__pitstopSetUser = function (lat, lng, accuracy, fit) {
        const next = L.latLng(lat, lng);
        if (!userMarker) {
          userMarker = L.marker(next, { icon: userIcon, zIndexOffset: 1000, interactive: false }).addTo(map);
        } else {
          userMarker.setLatLng(next);
        }
        const radius = Math.max(Number(accuracy) || 40, 24);
        if (!accuracyCircle) {
          accuracyCircle = L.circle(next, {
            radius: radius,
            color: '#00255C',
            weight: 1,
            fillColor: '#00255C',
            fillOpacity: 0.12,
            interactive: false,
          }).addTo(map);
        } else {
          accuracyCircle.setLatLng(next);
          accuracyCircle.setRadius(radius);
        }
        if (fit && !fittedUser) {
          fittedUser = true;
          const nextBounds = L.latLngBounds(bounds.isValid() ? bounds.getSouthWest() : next, bounds.isValid() ? bounds.getNorthEast() : next);
          nextBounds.extend(next);
          map.fitBounds(nextBounds, { padding: [56, 56], maxZoom: 15, animate: true });
        }
      };

      window.__pitstopRecenter = function () {
        if (!userMarker) return;
        map.setView(userMarker.getLatLng(), 15, { animate: true });
      };

      setTimeout(function () {
        map.invalidateSize();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: false });
        } else {
          map.setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 11, { animate: false });
        }
        post({ type: 'ready' });
      }, 60);
    }
  </script>
</body>
</html>`;
}
