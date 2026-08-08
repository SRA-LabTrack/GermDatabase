import { Account, Client, Databases, ID, Query, Storage } from 'appwrite';

const DEFAULT_REGION_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const LEGACY_GLOBAL_ENDPOINT = 'https://cloud.appwrite.io/v1';
const ENDPOINT_CACHE_KEY = 'canesprout-appwrite-endpoint-v231';
const ENDPOINT_FAILURE_COOLDOWN = 5 * 60_000;

function normalizeEndpoint(value) {
  const raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  const cleaned = raw || DEFAULT_REGION_ENDPOINT;
  try {
    const url = new URL(cleaned);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_REGION_ENDPOINT;
  }
}

const PRIMARY_ENDPOINT = normalizeEndpoint(import.meta.env.VITE_APPWRITE_ENDPOINT || DEFAULT_REGION_ENDPOINT);
const ALLOW_FALLBACK = String(import.meta.env.VITE_APPWRITE_ENABLE_FALLBACK || '').toLowerCase() === 'true';
export const APPWRITE_ENDPOINTS = Array.from(new Set([
  PRIMARY_ENDPOINT,
  ...(ALLOW_FALLBACK ? [normalizeEndpoint(import.meta.env.VITE_APPWRITE_FALLBACK_ENDPOINT || LEGACY_GLOBAL_ENDPOINT)] : [])
]));

function rememberedEndpoint() {
  try {
    const value = normalizeEndpoint(sessionStorage.getItem(ENDPOINT_CACHE_KEY));
    return APPWRITE_ENDPOINTS.includes(value) ? value : APPWRITE_ENDPOINTS[0];
  } catch {
    return APPWRITE_ENDPOINTS[0];
  }
}

let activeEndpoint = rememberedEndpoint();
const failedUntil = new Map();
export const APPWRITE_PROJECT_ID = String(import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b').trim();
export const DATABASE_ID = String(import.meta.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase').trim();
export const MEDIA_BUCKET_ID = String(import.meta.env.VITE_APPWRITE_MEDIA_BUCKET_ID || 'germ-media').trim();

export const COLLECTIONS = {
  records: 'sugarcane_registry_core',
  details: 'sugarcane_registry_details'
};

export const client = new Client().setEndpoint(activeEndpoint).setProject(APPWRITE_PROJECT_ID);
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

export function getActiveAppwriteEndpoint() {
  return activeEndpoint;
}

export function setActiveAppwriteEndpoint(endpoint) {
  activeEndpoint = normalizeEndpoint(endpoint);
  client.setEndpoint(activeEndpoint).setProject(APPWRITE_PROJECT_ID);
  try { sessionStorage.setItem(ENDPOINT_CACHE_KEY, activeEndpoint); } catch {}
  return activeEndpoint;
}

export function isNetworkFailure(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return error?.name === 'TypeError'
    || text.includes('failed to fetch')
    || text.includes('fetch failed')
    || text.includes('network')
    || text.includes('timed out')
    || text.includes('timeout')
    || text.includes('load failed');
}

/**
 * Transport failover is useful for idempotent reads. For database writes we
 * pass retryTransport:false so a timeout can never cause the same mutation to
 * be replayed against a second endpoint.
 */
export async function withAppwriteFailover(operation, { timeoutMs = 3500, retryTransport = true } = {}) {
  const now = Date.now();
  let ordered = [activeEndpoint, ...APPWRITE_ENDPOINTS.filter((endpoint) => endpoint !== activeEndpoint)];
  if (retryTransport) {
    const healthy = ordered.filter((endpoint) => (failedUntil.get(endpoint) || 0) <= now);
    if (healthy.length) ordered = healthy;
  } else {
    ordered = [activeEndpoint];
  }

  let lastError;
  for (const endpoint of ordered) {
    setActiveAppwriteEndpoint(endpoint);
    let timer;
    try {
      const work = Promise.resolve().then(() => operation(endpoint));
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Appwrite request timed out')), timeoutMs);
      });
      const result = await Promise.race([work, timeout]);
      failedUntil.delete(endpoint);
      return result;
    } catch (error) {
      lastError = error;
      if (!isNetworkFailure(error)) throw error;
      failedUntil.set(endpoint, Date.now() + ENDPOINT_FAILURE_COOLDOWN);
      if (!retryTransport) throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError || new Error('Appwrite is unreachable.');
}

export { ID, Query };
