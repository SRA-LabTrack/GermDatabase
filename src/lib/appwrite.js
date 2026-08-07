import { Account, Client, Databases, ID, Query, Storage } from 'appwrite';

const DEFAULT_REGION_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const LEGACY_GLOBAL_ENDPOINT = 'https://cloud.appwrite.io/v1';

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

export const APPWRITE_ENDPOINTS = Array.from(new Set([
  import.meta.env.VITE_APPWRITE_ENDPOINT || DEFAULT_REGION_ENDPOINT,
  DEFAULT_REGION_ENDPOINT,
  import.meta.env.VITE_APPWRITE_FALLBACK_ENDPOINT || LEGACY_GLOBAL_ENDPOINT
].map(normalizeEndpoint)));

let activeEndpoint = APPWRITE_ENDPOINTS[0];
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

/** Fail over only for transport failures. Auth/schema errors should surface immediately. */
export async function withAppwriteFailover(operation, { timeoutMs = 4500 } = {}) {
  const ordered = [activeEndpoint, ...APPWRITE_ENDPOINTS.filter((endpoint) => endpoint !== activeEndpoint)];
  let lastError;
  for (const endpoint of ordered) {
    setActiveAppwriteEndpoint(endpoint);
    let timer;
    try {
      const work = Promise.resolve().then(() => operation(endpoint));
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Appwrite request timed out')), timeoutMs); });
      return await Promise.race([work, timeout]);
    } catch (error) {
      lastError = error;
      if (!isNetworkFailure(error)) throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError || new Error('Appwrite is unreachable.');
}

export { ID, Query };
