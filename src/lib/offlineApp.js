import { requestOfflinePersistentStorage } from './offlineSnapshot';

const OFFLINE_VERSION = '2.13.17';
const PREWARM_KEY = `canesprout:offline-prewarm:${OFFLINE_VERSION}`;
const PREWARM_DELAY_MS = 2200;

const lazySectionLoaders = [
  () => import('../components/DetailModal.jsx'),
  () => import('../components/RecordFormModal.jsx'),
  () => import('../components/ImportModal.jsx'),
  () => import('../components/ExportExcelModal.jsx'),
  () => import('../components/OfflineQueueModal.jsx'),
  () => import('../components/AdminCenterModal.jsx'),
  () => import('../components/SpreadsheetEditorModal.jsx'),
  () => import('../components/CombinationRegistryModal.jsx')
];

function oncePerVersion() {
  try {
    if (localStorage.getItem(PREWARM_KEY) === '1') return false;
    localStorage.setItem(PREWARM_KEY, 'pending');
    return true;
  } catch {
    return true;
  }
}

function markPrewarmed() {
  try { localStorage.setItem(PREWARM_KEY, '1'); } catch {}
}

async function waitForServiceWorkerControl() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (!registrations.length) return null;
    const registration = await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return registration;
    await new Promise((resolve) => {
      const timer = window.setTimeout(resolve, 2500);
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    return navigator.serviceWorker.controller ? registration : null;
  } catch {
    return null;
  }
}

function currentStaticResourceUrls() {
  if (typeof performance === 'undefined') return [];
  const allowed = /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|webp|gif|svg|json)(?:\?|$)/i;
  const urls = [];
  try {
    for (const entry of performance.getEntriesByType('resource')) {
      const url = new URL(entry.name, window.location.href);
      if (url.origin !== window.location.origin || !allowed.test(url.pathname)) continue;
      urls.push(url.href);
    }
  } catch {}
  return Array.from(new Set(urls)).slice(0, 80);
}

function askWorkerToCacheCurrentAssets() {
  try {
    const worker = navigator.serviceWorker.controller;
    if (!worker) return false;
    worker.postMessage({ type: 'CACHE_URLS', urls: currentStaticResourceUrls() });
    return true;
  } catch {
    return false;
  }
}

export async function registerCaneSproutOfflineWorker() {
  if (typeof window === 'undefined' || window.germDesktop || !('serviceWorker' in navigator) || !import.meta.env.PROD) return null;
  try {
    return await navigator.serviceWorker.register(`/sw.js?v=${OFFLINE_VERSION}`, { scope: '/', updateViaCache: 'none' });
  } catch (error) {
    console.warn('CaneSprout offline worker registration failed:', error);
    return null;
  }
}

export async function prepareOfflineWorkspace() {
  if (typeof window === 'undefined') return { prepared: false };
  requestOfflinePersistentStorage().catch(() => {});

  // Vite dev intentionally avoids a service worker because caching dev-module
  // URLs causes stale HMR behavior. The actual offline shell is tested through
  // npm.cmd run build + npm.cmd run preview or on the deployed Vercel site.
  if (!import.meta.env.PROD || window.germDesktop) return { prepared: false, development: true };
  if (!navigator.onLine || !oncePerVersion()) return { prepared: false };

  const registration = await waitForServiceWorkerControl();
  if (!registration || !navigator.serviceWorker.controller) return { prepared: false, reason: 'worker-not-controlling' };

  await new Promise((resolve) => window.setTimeout(resolve, PREWARM_DELAY_MS));
  const outcomes = await Promise.allSettled(lazySectionLoaders.map((load) => load()));
  const loaded = outcomes.filter((outcome) => outcome.status === 'fulfilled').length;
  const controlled = Boolean(navigator.serviceWorker.controller);

  // Dynamic imports above are intercepted and cached. This second pass also
  // captures main JS/CSS/background resources that may have loaded a fraction
  // of a second before the newly-installed worker took control.
  if (controlled) askWorkerToCacheCurrentAssets();

  const prepared = loaded === lazySectionLoaders.length && controlled;
  if (prepared) {
    markPrewarmed();
    try { navigator.serviceWorker.controller?.postMessage({ type: 'PRUNE_OLD_CACHES' }); } catch {}
  }
  return { prepared, loaded, total: lazySectionLoaders.length };
}

export function offlineVersion() {
  return OFFLINE_VERSION;
}
