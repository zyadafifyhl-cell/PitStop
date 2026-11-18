import 'leaflet/dist/leaflet.css';
import React, { useEffect, useRef } from 'react';

import { isMapAlive, safeRemoveMap } from '@/components/maps/leafletMapLifecycle';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  latitude: number;
  longitude: number;
  onChange: (latitude: number, longitude: number) => void;
  height?: number;
};

const DEFAULT_HEIGHT = 320;
const FOCUS_ZOOM = 16;

const PIN_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 34 44">
  <path d="M17 1C8.2 1 1 8.1 1 16.9 1 28.8 17 43 17 43s16-14.2 16-26.1C33 8.1 25.8 1 17 1z"
    fill="#00255C" stroke="#FFFFFF" stroke-width="2"/>
  <circle cx="17" cy="17" r="6" fill="#FFFFFF"/>
</svg>`;

function sameCoords(a: { lat: number; lng: number } | null, lat: number, lng: number): boolean {
  return !!a && Math.abs(a.lat - lat) < 1e-9 && Math.abs(a.lng - lng) < 1e-9;
}

export function OsmLocationPicker({ latitude, longitude, onChange, height = DEFAULT_HEIGHT }: Props) {
  const appTheme = useAppTheme();
  const darkMap = appTheme.bg === '#000000';
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  /** Last position the user picked on the map; echoing it back through props must not re-pan. */
  const lastPickedRef = useRef<{ lat: number; lng: number } | null>(null);
  const latestCoordsRef = useRef({ lat: latitude, lng: longitude });
  latestCoordsRef.current = { lat: latitude, lng: longitude };

  useEffect(() => {
    const node = mapNodeRef.current;
    if (!node || typeof window === 'undefined') return;

    let disposed = false;
    let localMap: any | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const sizeTimers: ReturnType<typeof setTimeout>[] = [];

    void (async () => {
      const leaflet = await import('leaflet');
      const L = leaflet.default;
      if (!L || disposed || !mapNodeRef.current) return;

      const start = latestCoordsRef.current;
      const map = L.map(node, {
        center: [start.lat, start.lng],
        zoom: FOCUS_ZOOM - 1,
        zoomControl: true,
        attributionControl: true,
      });
      localMap = map;
      mapRef.current = map;

      L.tileLayer(
        darkMap
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          maxZoom: 19,
          attribution: darkMap
            ? '&copy; OpenStreetMap contributors &copy; CARTO'
            : '&copy; OpenStreetMap contributors',
        },
      ).addTo(map);

      const icon = L.divIcon({
        className: 'pitstop-picker-pin',
        html: PIN_SVG,
        iconSize: [34, 44],
        iconAnchor: [17, 43],
      });
      const marker = L.marker([start.lat, start.lng], { icon, draggable: true, autoPan: true }).addTo(map);
      markerRef.current = marker;

      const pick = (lat: number, lng: number) => {
        lastPickedRef.current = { lat, lng };
        onChangeRef.current(lat, lng);
      };

      map.on('click', (event: any) => {
        if (!isMapAlive(map)) return;
        const { lat, lng } = event.latlng;
        marker.setLatLng([lat, lng]);
        map.panTo([lat, lng], { animate: true, duration: 0.35 });
        pick(lat, lng);
      });
      marker.on('dragend', () => {
        const { lat, lng } = marker.getLatLng();
        pick(lat, lng);
      });

      // The modal fades in, so Leaflet first measures a zero-size box and leaves grey tiles.
      const refreshSize = () => {
        if (isMapAlive(map)) map.invalidateSize();
      };
      sizeTimers.push(setTimeout(refreshSize, 60), setTimeout(refreshSize, 320));
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(refreshSize);
        resizeObserver.observe(node);
      }
    })();

    return () => {
      disposed = true;
      sizeTimers.forEach(clearTimeout);
      resizeObserver?.disconnect();
      safeRemoveMap(localMap);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [darkMap]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!isMapAlive(map) || !marker) return;
    if (sameCoords(lastPickedRef.current, latitude, longitude)) return;
    lastPickedRef.current = null;
    try {
      marker.setLatLng([latitude, longitude]);
      map.flyTo([latitude, longitude], Math.max(map.getZoom(), FOCUS_ZOOM), { duration: 0.8 });
    } catch {
      // Ignore updates if Leaflet is mid-teardown.
    }
  }, [latitude, longitude]);

  return (
    <div style={{ width: '100%' }}>
      <div
        ref={mapNodeRef}
        style={{ width: '100%', height, borderRadius: 10, overflow: 'hidden', cursor: 'crosshair' }}
      />
    </div>
  );
}
