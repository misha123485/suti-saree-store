// ---------------------------------------------------------------------
// Free address autosuggest while typing (no API key, no cost).
// Uses Photon (photon.komoot.io) -- an OpenStreetMap search engine built
// for autocomplete. Results are limited to India. Coverage of exact house
// numbers is patchy (OSM data), but roads, localities, colonies, landmarks
// and PIN codes are good. Fair-use service: callers must debounce.
// ---------------------------------------------------------------------
export interface AutoSuggestion {
  label: string;
  line1: string;
  line2: string;
  pincode: string;
  city: string;
  state: string;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    county?: string;
    state?: string;
    postcode?: string;
    countrycode?: string;
  };
}

export async function fetchAutoSuggestions(query: string, signal?: AbortSignal): Promise<AutoSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '8');
    url.searchParams.set('lang', 'en');
    // minLon,minLat,maxLon,maxLat  (India)
    url.searchParams.set('bbox', '68.1,6.7,97.4,35.7');
    const res = await fetch(url.toString(), { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const out: AutoSuggestion[] = [];
    for (const f of data.features || []) {
      const p = f.properties;
      if (!p || (p.countrycode && p.countrycode.toUpperCase() !== 'IN')) continue;
      const road = [p.housenumber, p.street].filter(Boolean).join(' ');
      const line1 = road || p.name || '';
      if (!line1) continue;
      const area = p.district || p.locality || (road && p.name && p.name !== line1 ? p.name : '');
      const city = p.city || p.county || '';
      const pin = String(p.postcode || '').replace(/\D/g, '');
      const label = [line1, area, city, p.state, pin].filter(Boolean).join(', ');
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        label,
        line1,
        line2: area && area !== line1 ? area : '',
        pincode: pin.length === 6 ? pin : '',
        city,
        state: p.state || '',
      });
    }
    return out;
  } catch {
    return []; // aborted / offline -- just show no suggestions
  }
}
