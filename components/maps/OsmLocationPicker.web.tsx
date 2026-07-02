import 'leaflet/dist/leaflet.css';
import React, { useEffect, useMemo, useRef } from 'react';

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

  const center = useMemo(() => ({ lat: initialLatitude, lng: initialLongitude }), [initialLatitude, initialLongitude]);

  useEffect(() => {
    const node = mapNodeRef.current;
    if (!node || mapRef.current || typeof window === 'undefined') return;

    let disposed = false;
    let localMap: any | null = null;
    let localOnMapClick: ((event: any) => void) | null = null;

    void (async () => {
      const leaflet = await import('leaflet');
      const L = leaflet.default;
      if (!L || disposed) return;

      const map = L.map(node, {
        center,
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

      const marker = L.circleMarker(center, {
        radius: 8,
        color: '#F97316',
        fillColor: '#F97316',
        fillOpacity: 0.9,
        weight: 2,
      }).addTo(map);
      markerRef.current = marker;

      const onMapClick = (event: any) => {
        const { lat, lng } = event.latlng;
        marker.setLatLng([lat, lng]);
        onChange(lat, lng);
      };
      localOnMapClick = onMapClick;
      map.on('click', onMapClick);
    })();

    return () => {
      disposed = true;
      if (localMap && localOnMapClick) {
        localMap.off('click', localOnMapClick);
      }
      if (localMap) {
        localMap.remove();
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [center, onChange]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    mapRef.current.setView([center.lat, center.lng], mapRef.current.getZoom(), { animate: false });
    markerRef.current.setLatLng([center.lat, center.lng]);
  }, [center]);

  return (
    <div style={{ width: '100%' }}>
      <div ref={mapNodeRef} style={{ width: '100%', height, borderRadius: 10, overflow: 'hidden' }} />
    </div>
  );
}
