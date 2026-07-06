import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useRef } from 'react';

import { isMapAlive, safeRemoveMap } from '@/components/maps/leafletMapLifecycle';

type Props = {
  initialLatitude: number;
  initialLongitude: number;
  onChange: (latitude: number, longitude: number) => void;
  height?: number;
};

const DEFAULT_HEIGHT = 320;

export function OsmLocationPicker({ initialLatitude, initialLongitude, onChange, height = DEFAULT_HEIGHT }: Props) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any | null>(null);
  const markerRef = useRef<any | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const center = useMemo(() => ({ lat: initialLatitude, lng: initialLongitude }), [initialLatitude, initialLongitude]);

  useEffect(() => {
    const node = mapNodeRef.current;
    if (!node || typeof window === 'undefined') return;

    let disposed = false;
    let localMap: any | null = null;
    let localOnMapClick: ((event: any) => void) | null = null;
    const initialCenter = { lat: center.lat, lng: center.lng };

    void (async () => {
      const leaflet = await import('leaflet');
      const L = leaflet.default;
      if (!L || disposed || !mapNodeRef.current) return;

      const map = L.map(node, {
        center: [initialCenter.lat, initialCenter.lng],
        zoom: 14,
        zoomControl: true,
        attributionControl: true,
      });
      localMap = map;
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      const marker = L.circleMarker([initialCenter.lat, initialCenter.lng], {
        radius: 8,
        color: '#F97316',
        fillColor: '#F97316',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);
      markerRef.current = marker;

      const onMapClick = (event: any) => {
        if (!isMapAlive(map)) return;
        const { lat, lng } = event.latlng;
        marker.setLatLng([lat, lng]);
        onChangeRef.current(lat, lng);
      };
      localOnMapClick = onMapClick;
      map.on('click', onMapClick);
    })();

    return () => {
      disposed = true;
      if (localMap && localOnMapClick) {
        try {
          localMap.off('click', localOnMapClick);
        } catch {
          // Ignore listener cleanup races.
        }
      }
      safeRemoveMap(localMap);
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!isMapAlive(map) || !marker) return;

    try {
      map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
      marker.setLatLng([center.lat, center.lng]);
    } catch {
      // Ignore updates if Leaflet is mid-teardown.
    }
  }, [center]);

  return (
    <div style={{ width: '100%' }}>
      <div ref={mapNodeRef} style={{ width: '100%', height, borderRadius: 10, overflow: 'hidden' }} />
    </div>
  );
}
