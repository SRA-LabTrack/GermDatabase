import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { listLocalPedigreeRecords } from '../lib/registryApi.js';
import { buildVarietyMapCatalog, geocodeLocation, mapAccuracyRadiusMeters, mapPrecisionForEntry, mapSearchMatches, mapZoomForPrecision } from '../lib/varietyMap.js';

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';

let leafletPromise = null;
function ensureLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.L), { once: true });
      existing.addEventListener('error', () => reject(new Error('Map library failed to load.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error('Map library failed to load.'));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function markerStyle(precision, selected = false) {
  const approximate = precision !== 'site';
  return {
    radius: selected ? 8 : 5,
    color: '#ffffff',
    weight: selected ? 3 : 2,
    opacity: 1,
    fillColor: approximate ? '#c18a18' : '#208a4d',
    fillOpacity: selected ? 1 : .92
  };
}

function selectedPinIcon(L, { approximate = false } = {}) {
  return L.divIcon({
    className: 'canesprout-brand-map-pin-wrap',
    html: `<span class="canesprout-brand-map-pin${approximate ? ' approximate' : ''}">
      <span class="canesprout-brand-map-pin-face">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7.8 21V8.3M12 21V5.6M16.2 21V9.1M6.6 12h2.4M6.6 16h2.4M6.6 19h2.4M10.7 9.4h2.6M10.7 13.3h2.6M10.7 17.2h2.6M15 12.3h2.4M15 16h2.4M15 19h2.4M12 7.1C9.3 6.8 6.3 5 4.1 2.1c3.8.1 6.7 1.4 8 4.7M12.3 7C14.2 4.4 17 2.8 20.2 2.4c-.7 3.1-3 5.4-7.8 6M16.2 10.6c1.9-1.9 3.7-2.5 5.5-2.1-.7 2.3-2.4 3.9-5.5 4.4M7.8 10.4C6 9.3 4.4 9.1 2.7 9.7c1 2 2.6 3.1 5.1 3.2M4.8 21h14.4" />
        </svg>
      </span>
    </span>`,
    iconSize: [40, 46],
    iconAnchor: [20, 43],
    popupAnchor: [0, -41]
  });
}

function tileOptions(extra = {}) {
  return {
    maxZoom: 19,
    // Keep manual zoom light, but request tiles while the map is panning/flying.
    // Waiting for moveend caused a visible blank frame on long variety redirects.
    updateWhenZooming: false,
    updateWhenIdle: false,
    updateInterval: 140,
    keepBuffer: 6,
    ...extra
  };
}

function webMercatorTile(lat, lng, zoom) {
  const z = Math.max(0, Math.round(zoom));
  const n = 2 ** z;
  const safeLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
  const x = Math.floor(((Number(lng) + 180) / 360) * n);
  const latRad = safeLat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x, y, z, n };
}

function warmDestinationTiles(coords, zoom) {
  if (!Number.isFinite(coords?.lat) || !Number.isFinite(coords?.lng)) return;
  const { x, y, z, n } = webMercatorTile(coords.lat, coords.lng, zoom);
  const urls = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const tx = ((x + dx) % n + n) % n;
      const ty = Math.max(0, Math.min(n - 1, y + dy));
      urls.push(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`);
      urls.push(`https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/${z}/${ty}/${tx}`);
    }
  }
  for (const url of urls) {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
  }
}

export default function VarietyMapModal({ onClose, onOpenProfile }) {
  const mapHostRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const accuracyLayerRef = useRef(null);
  const markerRefs = useRef(new Map());
  const selectedOverlayRef = useRef(null);
  const selectedBaseRef = useRef(null);
  const selectedPrecisionRef = useRef('country');
  const onOpenProfileRef = useRef(onOpenProfile);
  const popupTimerRef = useRef(null);
  const popupMoveEndRef = useRef(null);
  const popupMoveTokenRef = useRef(0);
  const initialMapFitDoneRef = useRef(false);
  const firstRedirectVisualRef = useRef(true);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [resolvingIdentity, setResolvingIdentity] = useState('');
  const [dynamicCoords, setDynamicCoords] = useState({});

  useEffect(() => { onOpenProfileRef.current = onOpenProfile; }, [onOpenProfile]);

  useEffect(() => {
    let live = true;
    listLocalPedigreeRecords().then((rows) => {
      if (live) setRecords(Array.isArray(rows) ? rows : []);
    }).catch((err) => {
      if (live) setError(err?.message || 'Unable to load local registry records.');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const catalog = useMemo(() => buildVarietyMapCatalog(records).map((entry) => ({
    ...entry,
    coords: dynamicCoords[entry.identity] || entry.coords
  })), [records, dynamicCoords]);
  const matches = useMemo(() => mapSearchMatches(catalog, query), [catalog, query]);
  const mappedCount = useMemo(() => catalog.filter((entry) => entry.coords).length, [catalog]);
  const locatedCount = useMemo(() => catalog.filter((entry) => entry.location).length, [catalog]);
  const selectedEntry = useMemo(() => catalog.find((entry) => entry.identity === selectedIdentity) || null, [catalog, selectedIdentity]);

  useEffect(() => {
    if (!mapHostRef.current || mapRef.current) return undefined;
    let cancelled = false;
    ensureLeaflet().then((L) => {
      if (cancelled || !mapHostRef.current) return;
      const canvasRenderer = L.canvas({ padding: .35, tolerance: 5 });
      const map = L.map(mapHostRef.current, {
        zoomControl: true,
        preferCanvas: true,
        renderer: canvasRenderer,
        zoomSnap: .5,
        zoomDelta: .5,
        wheelPxPerZoomLevel: 90,
        wheelDebounceTime: 45,
        zoomAnimation: true,
        fadeAnimation: false,
        markerZoomAnimation: false
      }).setView([12.8797, 121.7740], 5);
      const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', tileOptions({
        attribution: 'Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community'
      }));
      const labels = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', tileOptions({
        attribution: 'Labels &copy; Esri'
      }));
      const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', tileOptions({
        attribution: '&copy; OpenStreetMap contributors'
      }));
      satellite.addTo(map);
      labels.addTo(map);
      L.control.layers({ Satellite: satellite, Streets: streets }, { 'Place labels': labels }, { position: 'topright', collapsed: true }).addTo(map);
      L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      accuracyLayerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
      window.setTimeout(() => map.invalidateSize({ animate: false }), 60);
    }).catch((err) => {
      if (!cancelled) setError(err?.message || 'Unable to load the interactive map.');
    });
    return () => {
      cancelled = true;
      if (popupTimerRef.current) window.clearTimeout(popupTimerRef.current);
      if (mapRef.current) {
        if (popupMoveEndRef.current) mapRef.current.off('moveend', popupMoveEndRef.current);
        popupMoveEndRef.current = null;
        popupMoveTokenRef.current += 1;
        initialMapFitDoneRef.current = false;
        mapRef.current.stop();
        mapRef.current.remove();
        mapRef.current = null;
        layerRef.current = null;
        accuracyLayerRef.current = null;
        markerRefs.current.clear();
        selectedOverlayRef.current = null;
        selectedBaseRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !layerRef.current || !window.L) return;
    const L = window.L;
    layerRef.current.clearLayers();
    markerRefs.current.clear();
    selectedBaseRef.current = null;
    const bounds = [];

    for (const entry of catalog) {
      if (!entry.coords) continue;
      const precision = mapPrecisionForEntry(entry);
      const marker = L.circleMarker([entry.coords.lat, entry.coords.lng], {
        ...markerStyle(precision, false),
        renderer: mapRef.current.options.renderer,
        bubblingMouseEvents: false
      });
      const popup = document.createElement('div');
      popup.className = 'canesprout-map-popup';
      const title = document.createElement('strong');
      title.textContent = entry.variety;
      const location = document.createElement('span');
      location.textContent = entry.coords.label || entry.location || 'Location';
      const source = document.createElement('small');
      source.textContent = `${entry.locationSource || 'Location'} · ${precision === 'site' ? 'site-level' : precision === 'locality' ? 'locality-level' : precision === 'regional' ? 'regional' : 'country-level'} position`;
      popup.append(title, location, source);
      if (entry.recordId) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'View profile';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenProfileRef.current?.(entry.recordId);
        });
        popup.append(button);
      }
      marker.bindPopup(popup, {
        maxWidth: 320,
        closeButton: true,
        autoPan: true,
        autoPanPadding: [28, 28],
        keepInView: false
      });
      marker.on('popupopen', (event) => {
        const element = event.popup?.getElement?.();
        if (element) {
          L.DomEvent.disableClickPropagation(element);
          L.DomEvent.disableScrollPropagation(element);
        }
      });
      marker.addTo(layerRef.current);
      markerRefs.current.set(entry.identity, marker);
      bounds.push([entry.coords.lat, entry.coords.lng]);
    }

    if (!initialMapFitDoneRef.current) {
      if (bounds.length > 1) mapRef.current.fitBounds(bounds, { padding: [42, 42], maxZoom: 6, animate: false });
      else if (bounds.length === 1) mapRef.current.setView(bounds[0], 8, { animate: false });
      initialMapFitDoneRef.current = true;
    }
  }, [catalog, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !accuracyLayerRef.current || !window.L) return;
    const L = window.L;

    if (selectedBaseRef.current) {
      selectedBaseRef.current.setStyle(markerStyle(selectedPrecisionRef.current, false));
      selectedBaseRef.current = null;
    }
    accuracyLayerRef.current.clearLayers();
    if (selectedOverlayRef.current) {
      mapRef.current.removeLayer(selectedOverlayRef.current);
      selectedOverlayRef.current = null;
    }
    if (!selectedEntry?.coords) return;

    const precision = selectedEntry.coords.precision || selectedEntry.precision || mapPrecisionForEntry(selectedEntry);
    const approximate = precision !== 'site';
    const baseMarker = markerRefs.current.get(selectedEntry.identity);
    if (baseMarker?.setStyle) {
      baseMarker.setStyle(markerStyle(precision, true));
      selectedBaseRef.current = baseMarker;
      selectedPrecisionRef.current = precision;
    }

    selectedOverlayRef.current = L.marker([selectedEntry.coords.lat, selectedEntry.coords.lng], {
      icon: selectedPinIcon(L, { approximate }),
      interactive: true,
      keyboard: true,
      title: `${selectedEntry.variety} — reopen location details`,
      alt: `${selectedEntry.variety} map pin`,
      zIndexOffset: 1800,
      riseOnHover: true
    }).addTo(mapRef.current);

    // The branded selected pin sits above the lightweight canvas marker.
    // Make it explicitly reopen the underlying variety popup after the user
    // closes that popup instead of leaving a visually clickable but inert logo.
    selectedOverlayRef.current.on('click', (event) => {
      L.DomEvent.stopPropagation(event);
      const marker = markerRefs.current.get(selectedEntry.identity);
      marker?.openPopup?.();
    });
    selectedOverlayRef.current.on('keypress', (event) => {
      if (event?.originalEvent?.key !== 'Enter' && event?.originalEvent?.key !== ' ') return;
      L.DomEvent.stopPropagation(event);
      const marker = markerRefs.current.get(selectedEntry.identity);
      marker?.openPopup?.();
    });

    L.circle([selectedEntry.coords.lat, selectedEntry.coords.lng], {
      radius: mapAccuracyRadiusMeters(precision),
      color: '#18a05a',
      weight: 2,
      opacity: approximate ? .68 : .82,
      fillColor: '#18a05a',
      fillOpacity: approximate ? .055 : .075,
      dashArray: approximate ? '7 7' : null,
      interactive: false,
      renderer: mapRef.current.options.renderer
    }).addTo(accuracyLayerRef.current);
  }, [mapReady, selectedEntry]);

  function openPopupAfterMovement(identity) {
    const map = mapRef.current;
    if (!map) return;
    if (popupTimerRef.current) window.clearTimeout(popupTimerRef.current);
    if (popupMoveEndRef.current) map.off('moveend', popupMoveEndRef.current);
    const token = ++popupMoveTokenRef.current;
    let opened = false;
    const open = () => {
      if (opened || token !== popupMoveTokenRef.current) return;
      opened = true;
      if (popupMoveEndRef.current) map.off('moveend', popupMoveEndRef.current);
      popupMoveEndRef.current = null;
      const marker = markerRefs.current.get(identity);
      marker?.openPopup?.();
    };
    popupMoveEndRef.current = open;
    map.once('moveend', open);
    popupTimerRef.current = window.setTimeout(open, 780);
  }

  function smoothFocusMap(coords, targetZoom, identity) {
    const map = mapRef.current;
    const L = window.L;
    if (!map || !L) return;
    map.stop();
    map.closePopup();
    const target = L.latLng(coords.lat, coords.lng);
    const currentZoom = map.getZoom();
    const zoomDifference = Math.abs(currentZoom - targetZoom);
    const distance = map.getCenter().distanceTo(target);

    // Start warming the destination satellite/label tiles before the camera arrives.
    // This runs in parallel so the click still responds immediately.
    // v2.13.59 multi-level destination prewarm
    warmDestinationTiles(coords, Math.max(2, targetZoom - 2));
    warmDestinationTiles(coords, Math.max(2, targetZoom - 1));
    warmDestinationTiles(coords, targetZoom);
    openPopupAfterMovement(identity);

    if (distance < 180000 && zoomDifference <= 2.5) {
      map.setView(target, targetZoom, { animate: true, duration: .72 });
    } else {
      map.flyTo(target, targetZoom, { animate: true, duration: 1.55, easeLinearity: .28 });
    }
  }

  // v2.13.74 first redirect visual guard
  useEffect(() => {
    if (!selectedIdentity || !firstRedirectVisualRef.current) return undefined;

    const canvas = document.querySelector('.variety-map-canvas');
    if (!canvas) return undefined;

    // Mark immediately so rapid subsequent selections cannot start another
    // "first" transition. The class itself remains until imagery has had time
    // to settle after the existing 1.55 second fly animation.
    firstRedirectVisualRef.current = false;
    canvas.classList.add('variety-map-first-redirect');

    const FIRST_REDIRECT_GUARD_MS = 2150;
    const timer = window.setTimeout(() => {
      canvas.classList.remove('variety-map-first-redirect');
    }, FIRST_REDIRECT_GUARD_MS);

    return () => {
      window.clearTimeout(timer);
      canvas.classList.remove('variety-map-first-redirect');
    };
  }, [selectedIdentity]);

  async function focusEntry(entry) {
    if (!entry) return;
    setSelectedIdentity(entry.identity);
    let coords = entry.coords;
    if (!coords && entry.location) {
      setResolvingIdentity(entry.identity);
      setError('');
      try {
        const resolved = await geocodeLocation(entry.location);
        if (resolved) {
          const precision = entry.precision || mapPrecisionForEntry(entry);
          coords = { ...resolved, precision, zoom: mapZoomForPrecision(precision), approximate: precision !== 'site' };
          setDynamicCoords((current) => ({ ...current, [entry.identity]: coords }));
        } else setError(`No map location could be resolved for “${entry.location}”.`);
      } catch (err) {
        setError(err?.message || 'Unable to resolve this location.');
      } finally {
        setResolvingIdentity('');
      }
    }
    if (!coords || !mapRef.current) return;
    const precision = coords.precision || entry.precision || mapPrecisionForEntry(entry);
    const targetZoom = Math.max(coords.zoom || 0, mapZoomForPrecision(precision));
    smoothFocusMap(coords, targetZoom, entry.identity);
  }

  return (
    <div className="modal-backdrop variety-map-backdrop">
      <section className="variety-map-modal" role="dialog" aria-modal="true" aria-labelledby="variety-map-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="variety-map-header">
          <div>
            <span className="eyebrow"><MapPin size={15} /> Germplasm location explorer</span>
            <h2 id="variety-map-title">Variety Map</h2>
            <p>Select a variety and CaneSprout smoothly moves to its best available recorded location.</p>
          </div>
          <button type="button" className="icon-button bordered" onClick={onClose} aria-label="Close map"><X size={20} /></button>
        </header>

        <div className="variety-map-layout">
          <aside className="variety-map-sidebar">
            <label className="variety-map-search">
              <Search size={18} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a variety or location…" autoFocus />
            </label>
            <div className="variety-map-stats">
              <span><b>{mappedCount}</b> mapped now</span>
              <span><b>{locatedCount}</b> with recorded location</span>
            </div>
            <div className="variety-map-results" role="listbox" aria-label="Variety map search results">
              {loading && <div className="variety-map-empty"><LoaderCircle className="spin" size={18} /> Loading registry…</div>}
              {!loading && matches.map((entry) => (
                <button
                  key={entry.identity}
                  type="button"
                  className={`variety-map-result ${selectedIdentity === entry.identity ? 'selected' : ''}`}
                  onClick={() => focusEntry(entry)}
                >
                  <span className="variety-map-result-icon">{resolvingIdentity === entry.identity ? <LoaderCircle className="spin" size={17} /> : <LocateFixed size={17} />}</span>
                  <span>
                    <strong>{entry.variety}</strong>
                    <small>{entry.location || 'No recorded location'}</small>
                  </span>
                  <em className={entry.coords ? 'mapped' : entry.location ? 'lookup' : 'missing'}>{entry.coords ? 'Mapped' : entry.location ? 'Locate' : 'N/A'}</em>
                </button>
              ))}
              {!loading && !matches.length && <div className="variety-map-empty">No matching varieties.</div>}
            </div>
          </aside>

          <div className="variety-map-canvas-wrap" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <div ref={mapHostRef} className="variety-map-canvas" aria-label="Interactive sugarcane variety map" />
            {!mapReady && !error && <div className="variety-map-loading"><LoaderCircle className="spin" size={22} /> Loading interactive map…</div>}
            {error && <div className="variety-map-notice">{error}</div>}
            <div className="variety-map-footnote">Satellite imagery is shown by default. CaneSprout zooms to the most specific recorded location available; broad regional/country records display an accuracy area instead of pretending to be exact field coordinates.</div>
          </div>
        </div>
      </section>
    </div>
  );
}
