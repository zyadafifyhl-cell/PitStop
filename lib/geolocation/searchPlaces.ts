export type PlaceSearchResult = {
  id: string;
  /** Place / POI name, e.g. "O1 Mall". */
  name: string;
  /** Street, district and city, e.g. "Mohamed Farid St, Heliopolis, Cairo". */
  details: string;
  latitude: number;
  longitude: number;
};

type SearchOptions = { locale?: 'en' | 'ar'; limit?: number; signal?: AbortSignal };

const CAIRO = { lat: 30.0444, lon: 31.2357 };
const LOG_TAG = '[placeSearch]';

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    locality?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    countrycode?: string;
  };
};

type NominatimRow = {
  place_id?: number | string;
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
};

function joinUnique(parts: Array<string | undefined>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const value = part?.trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out.join(', ');
}

function isAbort(error: unknown): boolean {
  return (error as { name?: string } | null)?.name === 'AbortError';
}

async function searchPhoton(query: string, options: SearchOptions): Promise<PlaceSearchResult[]> {
  const limit = options.limit ?? 6;
  const params = new URLSearchParams({
    q: query,
    lat: String(CAIRO.lat),
    lon: String(CAIRO.lon),
    // Fetch extra rows because results outside Egypt are dropped below.
    limit: String(limit * 2),
  });
  // Photon has no Arabic label set; "default" returns local (often Arabic) OSM names.
  params.set('lang', options.locale === 'ar' ? 'default' : 'en');

  const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`Photon HTTP ${response.status}`);
  const body = (await response.json()) as { features?: PhotonFeature[] };

  const results: PlaceSearchResult[] = [];
  for (const feature of body.features ?? []) {
    const p = feature.properties ?? {};
    const coords = feature.geometry?.coordinates;
    if (!coords || p.countrycode?.toUpperCase() !== 'EG') continue;
    const [longitude, latitude] = coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const street = joinUnique([p.street, p.housenumber]).replace(', ', ' ');
    const name = p.name?.trim() || street || p.district || p.city || '';
    if (!name) continue;
    results.push({
      id: `photon-${p.osm_type ?? ''}${p.osm_id ?? results.length}`,
      name,
      details: joinUnique([street !== name ? street : undefined, p.locality, p.district, p.city ?? p.county, p.state]),
      latitude,
      longitude,
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function searchNominatim(query: string, options: SearchOptions): Promise<PlaceSearchResult[]> {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    countrycodes: 'eg',
    limit: String(options.limit ?? 6),
    'accept-language': options.locale === 'ar' ? 'ar,en' : 'en,ar',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    signal: options.signal,
  });
  if (!response.ok) throw new Error(`Nominatim HTTP ${response.status}`);
  const rows = (await response.json()) as NominatimRow[];
  return rows
    .map((row, index) => {
      const parts = (row.display_name ?? '').split(',').map((part) => part.trim()).filter(Boolean);
      const name = row.name?.trim() || parts[0] || '';
      return {
        id: `nominatim-${row.place_id ?? index}`,
        name,
        details: joinUnique(parts.filter((part) => part !== name && part !== 'Egypt' && part !== 'مصر')),
        latitude: Number(row.lat),
        longitude: Number(row.lon),
      };
    })
    .filter((row) => row.name && Number.isFinite(row.latitude) && Number.isFinite(row.longitude));
}

/**
 * Place search in Egypt. Photon (biased toward Cairo) first, Nominatim when Photon fails or finds nothing.
 * Both are free OSM services with fair-use limits, so call this on submit, not per keystroke.
 * Throws only when both providers fail.
 */
export async function searchPlacesInEgypt(query: string, options: SearchOptions = {}): Promise<PlaceSearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  let photonError: unknown = null;
  try {
    const photon = await searchPhoton(q, options);
    if (photon.length) return photon;
  } catch (error) {
    if (isAbort(error)) throw error;
    photonError = error;
    console.error(`${LOG_TAG} Photon search failed for "${q}":`, error);
  }

  try {
    return await searchNominatim(q, options);
  } catch (error) {
    if (isAbort(error)) throw error;
    console.error(`${LOG_TAG} Nominatim fallback failed for "${q}":`, error);
    if (photonError) throw new Error('All place search providers failed');
    return [];
  }
}
