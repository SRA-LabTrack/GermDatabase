import { normalizeVarietyIdentity } from './legacyHyv.js';

const CACHE_KEY = 'canesprout-map-geocode-v21334';

const KNOWN_LOCATIONS = [
  // Specific localities must come before their containing country/region.
  { test: /canal point.*florida|florida.*canal point/i, lat: 26.8592, lng: -80.6328, zoom: 15, precision: 'locality', label: 'Canal Point, Florida, United States' },
  { test: /coimbatore/i, lat: 11.0168, lng: 76.9558, zoom: 13, precision: 'locality', label: 'Coimbatore, Tamil Nadu, India' },
  { test: /assam/i, lat: 26.2006, lng: 92.9376, zoom: 8, precision: 'regional', label: 'Assam, India' },
  { test: /campos dos goytacazes|campos,? brazil/i, lat: -21.7622, lng: -41.3181, zoom: 12, precision: 'locality', label: 'Campos dos Goytacazes, Rio de Janeiro, Brazil' },
  { test: /louisiana/i, lat: 30.9843, lng: -91.9623, zoom: 7, precision: 'regional', label: 'Louisiana, United States' },
  { test: /hawaii/i, lat: 19.8968, lng: -155.5828, zoom: 7, precision: 'regional', label: 'Hawaii, United States' },
  { test: /barbados/i, lat: 13.1939, lng: -59.5432, zoom: 8, precision: 'country', label: 'Barbados' },
  { test: /philippines/i, lat: 12.8797, lng: 121.7740, zoom: 5, precision: 'country', label: 'Philippines' },
  { test: /india/i, lat: 20.5937, lng: 78.9629, zoom: 5, precision: 'country', label: 'India' },
  { test: /cuba/i, lat: 21.5218, lng: -77.7812, zoom: 6, precision: 'country', label: 'Cuba' },
  { test: /brazil/i, lat: -14.2350, lng: -51.9253, zoom: 4, precision: 'country', label: 'Brazil' },
  { test: /australia/i, lat: -25.2744, lng: 133.7751, zoom: 4, precision: 'country', label: 'Australia' },
  { test: /indonesia|java/i, lat: -2.5489, lng: 118.0149, zoom: 5, precision: 'country', label: 'Indonesia' },
  { test: /united states|usa\b|u\.s\.a\.?/i, lat: 39.8283, lng: -98.5795, zoom: 4, precision: 'country', label: 'United States' },
  { test: /southeast asia|pacific region/i, lat: 8.5, lng: 119.5, zoom: 4, precision: 'regional', label: 'Southeast Asia / Pacific region' }
];

function text(value) {
  return String(value ?? '').trim();
}

function usable(value) {
  const v = text(value);
  if (!v) return '';
  if (/^(?:n\/?a|none|not recorded|not documented|unknown|not provided)$/i.test(v)) return '';
  return v;
}

function precisionForSource(source = '') {
  if (/lot planted/i.test(source)) return 'site';
  if (/nursery \/ field|germination field/i.test(source)) return 'locality';
  if (/tested location/i.test(source)) return 'locality';
  if (/recommended locations/i.test(source)) return 'regional';
  if (/other details/i.test(source)) return 'regional';
  return 'country';
}

export function mapPrecisionForEntry(entry = {}) {
  return entry?.coords?.precision || precisionForSource(entry?.locationSource || '');
}

export function mapZoomForPrecision(precision = 'country') {
  if (precision === 'site') return 17;
  if (precision === 'locality') return 15;
  if (precision === 'regional') return 11;
  return 7;
}

export function mapAccuracyRadiusMeters(precision = 'country') {
  if (precision === 'site') return 140;
  if (precision === 'locality') return 1200;
  if (precision === 'regional') return 18000;
  return 85000;
}

export function explicitLocationFromOtherDetails(value = '') {
  const details = usable(value);
  if (!details) return null;

  // Only promote phrases whose source text names a real geographic place.
  // Descriptions such as "traditional/local cultivar" remain unmapped because
  // they do not identify a defensible location.
  if (/assam,?\s*india/i.test(details)) {
    return { location: 'Assam, India', source: 'Other details (explicit geographic origin)', precision: 'regional' };
  }
  if (/\bco\s*=\s*coimbatore/i.test(details)) {
    return { location: 'Coimbatore, Tamil Nadu, India', source: 'Other details (breeding/origin locality)', precision: 'locality' };
  }
  if (/\bcb\s*=\s*campos,?\s*brazil/i.test(details)) {
    return { location: 'Campos dos Goytacazes, Rio de Janeiro, Brazil', source: 'Other details (breeding/origin locality)', precision: 'locality' };
  }
  if (/^cp\s*=\s*canal point,?\s*florida/i.test(details)) {
    return { location: 'Canal Point, Florida, United States', source: 'Other details (breeding/origin locality)', precision: 'locality' };
  }
  return null;
}

export function bestLocationForRecord(record = {}) {
  const candidates = [
    ['Lot planted in the station', record.lot_planted_station],
    ['Nursery / field location', record.germ_location],
    ['Tested location', record.tested_location],
    ['Recommended locations', record.recommended_locations]
  ];
  for (const [source, value] of candidates) {
    const location = usable(value);
    if (location) return { location, source, precision: precisionForSource(source) };
  }

  const detailLocation = explicitLocationFromOtherDetails(record.other_details);
  if (detailLocation) return detailLocation;

  // Keep country and origin separate. Using `record.origin || record.country`
  // could discard a valid country whenever origin contained a placeholder such
  // as "Not documented".
  const origin = usable(record.origin);
  if (origin) return { location: origin, source: 'Country / origin', precision: 'country' };
  const country = usable(record.country);
  if (country) return { location: country, source: 'Country', precision: 'country' };
  return { location: '', source: '', precision: 'country' };
}

export function resolveKnownLocation(location = '') {
  const typed = usable(location);
  if (!typed) return null;
  const found = KNOWN_LOCATIONS.find((item) => item.test.test(typed));
  return found ? {
    lat: found.lat,
    lng: found.lng,
    zoom: found.zoom,
    label: found.label,
    precision: found.precision || 'country',
    approximate: found.precision !== 'site'
  } : null;
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch {}
}

export async function geocodeLocation(location = '') {
  const typed = usable(location);
  if (!typed) return null;
  const key = typed.toLowerCase().replace(/\s+/g, ' ').trim();
  const cache = readCache();
  if (cache[key]?.lat != null && cache[key]?.lng != null) return cache[key];
  if (!navigator.onLine) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(typed)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Location lookup failed (${response.status})`);
  const rows = await response.json();
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first) {
    cache[key] = { missing: true, checkedAt: Date.now() };
    writeCache(cache);
    return null;
  }
  const resolved = {
    lat: Number(first.lat),
    lng: Number(first.lon),
    zoom: 15,
    label: first.display_name || typed,
    approximate: false,
    precision: 'locality',
    checkedAt: Date.now()
  };
  cache[key] = resolved;
  writeCache(cache);
  return resolved;
}

function richness(record = {}) {
  let score = 0;
  if (usable(record.lot_planted_station)) score += 10;
  if (usable(record.germ_location)) score += 8;
  if (usable(record.tested_location)) score += 7;
  if (usable(record.recommended_locations)) score += 5;
  if (explicitLocationFromOtherDetails(record.other_details)) score += 4;
  if (usable(record.origin) || usable(record.country)) score += 2;
  if (!record.__bundledSnapshot) score += 1;
  return score;
}

export function buildVarietyMapCatalog(records = []) {
  const bestByIdentity = new Map();
  for (const record of records || []) {
    const variety = text(record?.variety);
    const identity = normalizeVarietyIdentity(variety);
    if (!identity || !variety) continue;
    const existing = bestByIdentity.get(identity);
    if (!existing || richness(record) > richness(existing)) bestByIdentity.set(identity, record);
  }

  return [...bestByIdentity.entries()].map(([identity, record]) => {
    const info = bestLocationForRecord(record);
    const sourcePrecision = info.precision || precisionForSource(info.source);
    const knownBase = info.location ? resolveKnownLocation(info.location) : null;
    // A recognized place name can be more informative than the field category.
    // Example: an Origin value containing "Canal Point, Florida" is a locality,
    // not merely a country-level point.
    const precision = knownBase?.precision || sourcePrecision;
    const known = knownBase ? {
      ...knownBase,
      precision,
      zoom: mapZoomForPrecision(precision),
      approximate: precision !== 'site'
    } : null;
    return {
      identity,
      record,
      recordId: record.$id || '',
      variety: text(record.variety),
      location: info.location,
      locationSource: info.source,
      precision,
      coords: known
    };
  }).sort((a, b) => a.variety.localeCompare(b.variety));
}

export function mapSearchMatches(entries = [], query = '', limit = 40) {
  const typed = text(query).toLowerCase();
  if (!typed) return entries.slice(0, limit);
  const identity = normalizeVarietyIdentity(typed);
  return entries.filter((entry) => {
    const name = entry.variety.toLowerCase();
    const location = entry.location.toLowerCase();
    return name.includes(typed) || location.includes(typed) || (identity && entry.identity.includes(identity));
  }).slice(0, limit);
}
