import { normalizeVarietyIdentity } from './legacyHyv';

const DB_NAME = 'canesprout-offline-workspace';
const DB_VERSION = 1;
const RECORD_STORE = 'records';
const META_STORE = 'meta';
const SNAPSHOT_EVENT = 'canesprout:offline-snapshot-changed';

let dbPromise = null;

function openDatabase() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const records = db.objectStoreNames.contains(RECORD_STORE)
        ? request.transaction.objectStore(RECORD_STORE)
        : db.createObjectStore(RECORD_STORE, { keyPath: '$id' });
      if (!records.indexNames.contains('varietyKey')) records.createIndex('varietyKey', 'varietyKey', { unique: false });
      if (!records.indexNames.contains('cachedAt')) records.createIndex('cachedAt', 'cachedAt', { unique: false });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the offline workspace database.'));
    request.onblocked = () => reject(new Error('The offline workspace database is blocked by another CaneSprout tab.'));
  });
  return dbPromise;
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline workspace request failed.'));
  });
}

function notifyChanged() {
  try { window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT)); } catch {}
}

function safeRecord(record) {
  if (!record?.$id) return null;
  const copy = { ...record };
  delete copy.__previewFailed;
  return {
    ...copy,
    varietyKey: normalizeVarietyIdentity(copy.variety || ''),
    cachedAt: Date.now(),
    __offlineSnapshot: true
  };
}

export function subscribeOfflineSnapshot(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener?.();
  window.addEventListener(SNAPSHOT_EVENT, handler);
  return () => window.removeEventListener(SNAPSHOT_EVENT, handler);
}

export async function cacheOfflineRecords(records = []) {
  const values = records.map(safeRecord).filter(Boolean);
  if (!values.length) return 0;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction([RECORD_STORE, META_STORE], 'readwrite');
    const store = transaction.objectStore(RECORD_STORE);
    values.forEach((record) => {
      const request = store.get(record.$id);
      request.onsuccess = () => {
        const existing = request.result || {};
        store.put({ ...existing, ...record, cachedAt: Date.now(), __offlineSnapshot: true });
      };
    });
    transaction.objectStore(META_STORE).put({ key: 'lastRecordCacheAt', value: Date.now() });
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not cache records for offline use.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline record caching was cancelled.'));
  });
  notifyChanged();
  return values.length;
}

export async function cacheOfflineRecord(record) {
  return cacheOfflineRecords(record ? [record] : []);
}

export async function removeOfflineRecord(recordId) {
  const id = String(recordId || '').trim();
  if (!id) return false;
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORD_STORE, 'readwrite');
    transaction.objectStore(RECORD_STORE).delete(id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('Could not remove the offline record snapshot.'));
  });
  notifyChanged();
  return true;
}

export async function getOfflineRecord(recordId) {
  const id = String(recordId || '').trim();
  if (!id) return null;
  const db = await openDatabase();
  const transaction = db.transaction(RECORD_STORE, 'readonly');
  return requestValue(transaction.objectStore(RECORD_STORE).get(id));
}

export async function findOfflineRecordByVariety(variety) {
  const key = normalizeVarietyIdentity(variety || '');
  if (!key) return null;
  const db = await openDatabase();
  const transaction = db.transaction(RECORD_STORE, 'readonly');
  const values = await requestValue(transaction.objectStore(RECORD_STORE).index('varietyKey').getAll(key));
  return (values || []).sort((a, b) => Number(b.cachedAt || 0) - Number(a.cachedAt || 0))[0] || null;
}

export async function listOfflineRecords() {
  const db = await openDatabase();
  const transaction = db.transaction(RECORD_STORE, 'readonly');
  const values = await requestValue(transaction.objectStore(RECORD_STORE).getAll());
  return (values || []).sort((a, b) => String(a.variety || '').localeCompare(String(b.variety || ''), undefined, { sensitivity: 'base', numeric: true }));
}

export async function getOfflineSnapshotSummary() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([RECORD_STORE, META_STORE], 'readonly');
    const countRequest = transaction.objectStore(RECORD_STORE).count();
    const metaRequest = transaction.objectStore(META_STORE).get('lastRecordCacheAt');
    const [count, meta] = await Promise.all([requestValue(countRequest), requestValue(metaRequest)]);
    return { count: Number(count || 0), lastRecordCacheAt: Number(meta?.value || 0) };
  } catch {
    return { count: 0, lastRecordCacheAt: 0 };
  }
}

export async function requestOfflinePersistentStorage() {
  try {
    if (navigator.storage?.persist) return Boolean(await navigator.storage.persist());
  } catch {}
  return false;
}
