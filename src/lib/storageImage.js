import {
  account,
  APPWRITE_PROJECT_ID,
  MEDIA_BUCKET_ID,
  getActiveAppwriteEndpoint
} from './appwrite';

const OBJECT_URL_LIMIT = 72;
const objectUrlCache = new Map();
const dataUrlCache = new Map();

let jwtValue = '';
let jwtExpiresAt = 0;
let jwtPromise = null;

function clean(value) {
  return String(value ?? '').trim();
}

export function directStorageFileUrl(fileId) {
  const id = clean(fileId);
  if (!id) return '';

  const endpoint = String(getActiveAppwriteEndpoint() || '').replace(/\/$/, '');
  if (!endpoint) return '';

  return `${endpoint}/storage/buckets/${encodeURIComponent(MEDIA_BUCKET_ID)}/files/${encodeURIComponent(id)}/view?project=${encodeURIComponent(APPWRITE_PROJECT_ID)}`;
}

async function getFreshJwt() {
  const now = Date.now();
  if (jwtValue && jwtExpiresAt > now + 30_000) return jwtValue;
  if (jwtPromise) return jwtPromise;

  jwtPromise = account.createJWT()
    .then((result) => {
      const value = clean(result?.jwt);
      if (!value) throw new Error('Appwrite did not return a session JWT.');
      jwtValue = value;
      // Appwrite account JWTs are short-lived. Keep our cache shorter than the
      // server lifetime so image recovery never reuses a near-expired token.
      jwtExpiresAt = Date.now() + 10 * 60_000;
      return value;
    })
    .finally(() => {
      jwtPromise = null;
    });

  return jwtPromise;
}

async function fetchStorageBlob(fileId) {
  const id = clean(fileId);
  if (!id) throw new Error('A storage file ID is required.');

  const url = directStorageFileUrl(id);
  if (!url) throw new Error('The Appwrite file URL could not be created.');

  // First try the normal browser session. This is cheap and works when the
  // Appwrite session cookie is available to the regional endpoint.
  try {
    const direct = await fetch(url, {
      credentials: 'include',
      cache: 'force-cache'
    });
    if (direct.ok) return await direct.blob();
  } catch {
    // Cross-site cookie/privacy rules can block the direct browser request.
  }

  // Recovery path for deployed Vercel/browser sessions: request one Appwrite
  // JWT through the authenticated SDK, then fetch the private file with the
  // explicit project + JWT headers. This keeps germplasm images private while
  // allowing normal <img> rendering through a local blob URL.
  const jwt = await getFreshJwt();
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'force-cache',
    headers: {
      'X-Appwrite-Project': APPWRITE_PROJECT_ID,
      'X-Appwrite-JWT': jwt
    }
  });

  if (!response.ok) {
    throw new Error(`Appwrite Storage returned HTTP ${response.status} for file ${id}.`);
  }

  return response.blob();
}

function rememberObjectUrl(fileId, url) {
  const id = clean(fileId);
  if (!id || !url) return url;

  if (objectUrlCache.has(id)) {
    const old = objectUrlCache.get(id);
    objectUrlCache.delete(id);
    objectUrlCache.set(id, old);
    return old;
  }

  objectUrlCache.set(id, url);

  while (objectUrlCache.size > OBJECT_URL_LIMIT) {
    const oldestKey = objectUrlCache.keys().next().value;
    const oldestUrl = objectUrlCache.get(oldestKey);
    objectUrlCache.delete(oldestKey);
    try { URL.revokeObjectURL(oldestUrl); } catch {}
  }

  return url;
}

export async function authenticatedStorageObjectUrl(fileId) {
  const id = clean(fileId);
  if (!id) return '';

  const cached = objectUrlCache.get(id);
  if (cached) return cached;

  const blob = await fetchStorageBlob(id);
  return rememberObjectUrl(id, URL.createObjectURL(blob));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read the image blob.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(blob);
  });
}

export async function authenticatedStorageDataUrl(fileId) {
  const id = clean(fileId);
  if (!id) return '';

  if (dataUrlCache.has(id)) return dataUrlCache.get(id);

  const blob = await fetchStorageBlob(id);
  const value = await blobToDataUrl(blob);
  dataUrlCache.set(id, value);

  // Printed brochures only need a few photos. Prevent long sessions from
  // retaining a large number of base64 images.
  while (dataUrlCache.size > 12) {
    const oldestKey = dataUrlCache.keys().next().value;
    dataUrlCache.delete(oldestKey);
  }

  return value;
}

export function resetStorageImageSession() {
  jwtValue = '';
  jwtExpiresAt = 0;
  for (const url of objectUrlCache.values()) {
    try { URL.revokeObjectURL(url); } catch {}
  }
  objectUrlCache.clear();
  dataUrlCache.clear();
}
