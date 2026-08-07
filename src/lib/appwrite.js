import { Account, Client, Databases, ID, Query, Storage } from 'appwrite';

const DEFAULT_REGION_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
const LEGACY_GLOBAL_ENDPOINT = 'https://cloud.appwrite.io/v1';

function normalizeEndpoint(value) {
  const raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
  const markdown = raw.match(/^\[([^\]]+)\]\([^)]+\)$/);
  const cleaned = (markdown?.[1] || raw || DEFAULT_REGION_ENDPOINT).replace(/\/$/, '');
  try {
    const url = new URL(cleaned);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol');
    return url.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_REGION_ENDPOINT;
  }
}

function uniqueEndpoints(values) {
  return Array.from(new Set(values.map(normalizeEndpoint).filter(Boolean)));
}

export const APPWRITE_ENDPOINTS = uniqueEndpoints([
  import.meta.env.VITE_APPWRITE_ENDPOINT || DEFAULT_REGION_ENDPOINT,
  DEFAULT_REGION_ENDPOINT,
  import.meta.env.VITE_APPWRITE_FALLBACK_ENDPOINT || LEGACY_GLOBAL_ENDPOINT
]);

let activeEndpoint = APPWRITE_ENDPOINTS[0];
export let APPWRITE_ENDPOINT = activeEndpoint;
export const APPWRITE_PROJECT_ID = String(import.meta.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b').trim();
export const DATABASE_ID = String(import.meta.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase').trim();
export const MEDIA_BUCKET_ID = String(import.meta.env.VITE_APPWRITE_MEDIA_BUCKET_ID || 'germ-media').trim();

export const COLLECTIONS = {
  microorganisms: 'microorganisms',
  microorganism_traits: 'microorganism_traits',
  strains: 'strains',
  samples: 'samples',
  observations: 'observations',
  lab_tests: 'lab_tests',
  antimicrobial_results: 'antimicrobial_results',
  sequences: 'sequences',
  media: 'media'
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
  APPWRITE_ENDPOINT = activeEndpoint;
  client.setEndpoint(activeEndpoint).setProject(APPWRITE_PROJECT_ID);
  return activeEndpoint;
}

function isNetworkFailure(error) {
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
 * Retry only true transport failures on the alternate Appwrite endpoint.
 * Authentication/permissions/validation errors are returned immediately and
 * are never hidden behind a fallback retry.
 */
export async function withAppwriteFailover(operation) {
  const ordered = [activeEndpoint, ...APPWRITE_ENDPOINTS.filter((endpoint) => endpoint !== activeEndpoint)];
  let lastError;

  for (const endpoint of ordered) {
    setActiveAppwriteEndpoint(endpoint);
    try {
      return await operation(endpoint);
    } catch (error) {
      lastError = error;
      if (!isNetworkFailure(error)) throw error;
    }
  }

  throw lastError || new Error('Appwrite is unreachable.');
}

export { ID, Query };
