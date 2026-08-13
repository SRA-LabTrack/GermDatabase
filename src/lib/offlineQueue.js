import { ID, isNetworkFailure } from './appwrite';
import { submitChangeRequest } from './approvalApi';
import { clearListCache, deleteRecord, deleteRecordByVariety, deleteStoredFiles, saveRecord, upsertRecordByVariety, uploadPreparedPhotos, validateRecordPayload } from './registryApi';

const DB_NAME = 'canesprout-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const QUEUE_EVENT = 'canesprout:offline-queue-changed';
const AUTO_SYNC_GAP_MS = 700;
const AUTO_SYNC_DEFAULT_LIMIT = 6;
const NETWORK_BACKOFF_MS = 60_000;

let databasePromise = null;
let activeSyncPromise = null;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is not available in this browser.'));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('ownerId')) store.createIndex('ownerId', 'ownerId', { unique: false });
      if (!store.indexNames.contains('updatedAt')) store.createIndex('updatedAt', 'updatedAt', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the offline queue.'));
    request.onblocked = () => reject(new Error('The offline queue database is blocked by another tab. Close other CaneSprout tabs and try again.'));
  });
  return databasePromise;
}

async function transact(mode, task) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let value;
    try {
      value = task(store, transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(transaction.error || new Error('Offline queue transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Offline queue transaction was cancelled.'));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Offline queue request failed.'));
  });
}

function notifyQueueChanged() {
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT));
}

function safeClone(value) {
  if (!value || typeof value !== 'object') return value || null;
  try { return structuredClone(value); } catch {}
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function ownerKey(value) {
  return String(value || '').trim().toLowerCase() || 'local-user';
}

function localMutationKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return key || ID.unique();
}

function recordSearchText(record, scope = 'variety') {
  const value = record || {};
  if (scope === 'trial') return String(value.germ_trial_code || '').toLowerCase();
  if (scope === 'location') return String(value.germ_location || '').toLowerCase();
  if (scope === 'status') return String(value.germ_status || '').toLowerCase();
  if (scope === 'all') return Object.values(value).filter((item) => typeof item === 'string' || typeof item === 'number').join(' ').toLowerCase();
  return String(value.variety || '').toLowerCase();
}

export function offlineEntryToRecord(entry) {
  if (!entry || entry.operation === 'delete' || entry.operation === 'deleteByVariety') return null;
  const base = entry.previous && typeof entry.previous === 'object' ? entry.previous : {};
  return {
    ...base,
    ...(entry.form || {}),
    $id: entry.operation === 'upsert' && entry.previous?.$id ? entry.previous.$id : entry.id,
    __offlinePending: true,
    __offlineOperation: entry.operation || 'update'
  };
}

export async function overlayOfflineQueueRecords({ ownerId, documents = [], search = '', scope = 'variety', limit = 0 } = {}) {
  const entries = await listOfflineEntries(ownerId).catch(() => []);
  if (!entries.length) return documents;
  const deleted = new Set(entries.filter((entry) => entry.operation === 'delete').map((entry) => entry.id));
  const deletedVarieties = new Set(entries.filter((entry) => entry.operation === 'deleteByVariety').map((entry) => localMutationKey(entry.targetVariety || entry.form?.variety)));
  const map = new Map((documents || []).filter((record) => !deleted.has(record.$id) && !deletedVarieties.has(localMutationKey(record.variety))).map((record) => [record.$id, record]));
  const needle = String(search || '').trim().toLowerCase();
  const pendingCreates = [];
  for (const entry of entries) {
    if (entry.operation === 'delete' || entry.operation === 'deleteByVariety') continue;
    const record = offlineEntryToRecord(entry);
    if (!record) continue;
    if (needle && !recordSearchText(record, scope).includes(needle)) {
      // Replace an already-visible edited record only when it still matches the
      // current local search. Otherwise remove the old version from the view.
      if (map.has(record.$id)) map.delete(record.$id);
      continue;
    }
    if (map.has(record.$id)) map.set(record.$id, record);
    else pendingCreates.push(record);
  }
  const merged = [...pendingCreates, ...map.values()];
  return limit > 0 ? merged.slice(0, limit) : merged;
}

function blobBytes(photos = []) {
  return photos.reduce((sum, photo) => sum + Number(photo?.full?.blob?.size || 0) + Number(photo?.thumb?.blob?.size || 0), 0);
}

function queuedPhoto(variant) {
  return {
    fullId: variant.fullId || ID.unique(),
    thumbId: variant.thumbId || ID.unique(),
    originalName: variant.originalName || 'field-photo',
    category: variant.category || 'overview',
    originalSize: Number(variant.originalSize || 0),
    full: {
      blob: variant.full.blob,
      width: Number(variant.full.width || 0),
      height: Number(variant.full.height || 0)
    },
    thumb: {
      blob: variant.thumb.blob,
      width: Number(variant.thumb.width || 0),
      height: Number(variant.thumb.height || 0)
    }
  };
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {}
}

export function subscribeOfflineQueue(listener) {
  const handler = () => listener?.();
  window.addEventListener(QUEUE_EVENT, handler);
  return () => window.removeEventListener(QUEUE_EVENT, handler);
}

export async function listOfflineEntries(ownerId) {
  const owner = ownerKey(ownerId);
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('ownerId');
    const request = index.getAll(owner);
    request.onsuccess = () => {
      const entries = (request.result || []).sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      resolve(entries);
    };
    request.onerror = () => reject(request.error || new Error('Could not read the offline queue.'));
  });
}

export async function getOfflineQueueSummary(ownerId) {
  const entries = await listOfflineEntries(ownerId);
  return {
    count: entries.length,
    pending: entries.filter((entry) => entry.status !== 'error').length,
    errors: entries.filter((entry) => entry.status === 'error').length,
    photoCount: entries.reduce((sum, entry) => sum + (entry.photos?.length || 0), 0),
    bytes: entries.reduce((sum, entry) => sum + blobBytes(entry.photos), 0)
  };
}

export async function queueOfflineRecord({ ownerId, actor = null, form, recordId = '', previous = null, removedFileIds = [], variants = [], operationOverride = '', syncOptions = null }) {
  await requestPersistentStorage();
  validateRecordPayload(form);
  const owner = ownerKey(ownerId);
  const existingId = String(recordId || '').trim();
  const useVarietyUpsert = operationOverride === 'upsert' || Boolean(previous?.__bundledSnapshot);
  const id = useVarietyUpsert ? `upsert-${localMutationKey(form?.variety)}` : (existingId || ID.unique());
  const existing = await getOfflineEntry(id);
  if (existing && Number(existing.attempts || 0) > 0) {
    throw new Error('This record already has a queued sync attempt. Open Offline queue and retry it before replacing the queued copy.');
  }

  const now = Date.now();
  const entry = {
    id,
    ownerId: owner,
    actor: safeClone(actor) || { id: String(ownerId || ''), name: '', email: '', isAdmin: false },
    syncMode: actor?.isAdmin ? 'direct' : 'approval',
    requestId: existing?.requestId || ID.unique(),
    operation: useVarietyUpsert ? 'upsert' : (existingId ? 'update' : 'create'),
    targetVariety: useVarietyUpsert ? String(form?.variety || previous?.variety || '').trim() : '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    lastError: '',
    form: safeClone(form) || {},
    previous: safeClone(previous),
    removedFileIds: Array.from(new Set((removedFileIds || []).filter(Boolean))),
    syncOptions: safeClone(syncOptions) || {},
    photos: variants.map(queuedPhoto)
  };

  await transact('readwrite', (store) => { store.put(entry); });
  notifyQueueChanged();
  return entry;
}

export async function queueOfflineDelete({ ownerId, actor = null, record }) {
  await requestPersistentStorage();
  const owner = ownerKey(ownerId);
  const rawId = String(record?.$id || '').trim();
  const byVariety = Boolean(record?.__bundledSnapshot) || rawId.startsWith('bundled-record:');
  const targetVariety = String(record?.variety || '').trim();
  const id = byVariety ? `delete-${localMutationKey(targetVariety)}` : rawId;
  if (!id) throw new Error('A record ID or variety is required for an offline deletion.');
  const existing = await getOfflineEntry(id);

  // If a brand-new offline create has never attempted cloud sync, deleting it
  // simply cancels that local create. No Appwrite delete is necessary.
  if (existing?.operation === 'create' && Number(existing.attempts || 0) === 0) {
    await removeEntry(id);
    return { ...existing, operation: 'cancelled-create', cancelled: true };
  }

  const now = Date.now();
  const entry = {
    id,
    ownerId: owner,
    actor: safeClone(actor) || { id: String(ownerId || ''), name: '', email: '', isAdmin: false },
    syncMode: 'direct',
    requestId: existing?.requestId || ID.unique(),
    operation: byVariety ? 'deleteByVariety' : 'delete',
    targetVariety: byVariety ? targetVariety : '',
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    lastError: '',
    form: { variety: String(record?.variety || '').trim() },
    previous: safeClone(record),
    removedFileIds: [],
    photos: []
  };
  await transact('readwrite', (store) => { store.put(entry); });
  notifyQueueChanged();
  return entry;
}

export async function getOfflineEntry(id) {
  const db = await openDatabase();
  const transaction = db.transaction(STORE_NAME, 'readonly');
  return requestValue(transaction.objectStore(STORE_NAME).get(id));
}

async function putEntry(entry) {
  await transact('readwrite', (store) => { store.put(entry); });
  notifyQueueChanged();
}

async function removeEntry(id) {
  await transact('readwrite', (store) => { store.delete(id); });
  notifyQueueChanged();
}

export async function discardPendingOfflineEntry(id, ownerId) {
  const entry = await getOfflineEntry(id);
  if (!entry || entry.ownerId !== ownerKey(ownerId)) return false;
  if (Number(entry.attempts || 0) > 0) {
    throw new Error('This entry has already attempted cloud sync. Keep it and retry when online so CaneSprout can safely finish without leaving remote files behind.');
  }
  await removeEntry(id);
  return true;
}

function buildSyncRecord(entry, uploaded) {
  const form = safeClone(entry.form) || {};
  const existingFull = Array.isArray(form.photo_file_ids) ? form.photo_file_ids : [];
  const existingThumbs = Array.isArray(form.thumb_file_ids) ? form.thumb_file_ids : [];
  const existingNames = Array.isArray(form.photo_names) ? form.photo_names : [];
  const existingCategories = Array.isArray(form.photo_categories) ? form.photo_categories : [];
  const next = {
    ...form,
    photo_file_ids: [...existingFull, ...uploaded.map((item) => item.fullId)],
    thumb_file_ids: [...existingThumbs, ...uploaded.map((item) => item.thumbId)],
    photo_names: [...existingNames, ...uploaded.map((item) => item.name)],
    photo_categories: [...existingCategories, ...uploaded.map((item) => item.category || 'overview')]
  };
  const overview = next.photo_categories.findIndex((value) => value === 'overview');
  const primaryIndex = overview >= 0 ? overview : 0;
  next.primary_file_id = next.photo_file_ids[primaryIndex] || next.photo_file_ids[0] || '';
  next.thumbnail_file_id = next.thumb_file_ids[primaryIndex] || next.thumb_file_ids[0] || '';
  return next;
}

function queueErrorMessage(error) {
  const code = Number(error?.code || error?.status || 0);
  if (code === 401) return 'Sign in again before syncing this offline entry.';
  if (isNetworkFailure(error)) return 'Appwrite is unreachable. The entry remains safely stored on this device.';
  return error?.message || String(error || 'Could not sync this offline entry.');
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function syncOneEntry(entry, onProgress, currentActor = null) {
  const working = {
    ...entry,
    actor: entry.actor || currentActor || { id: entry.ownerId || '', name: '', email: '', isAdmin: false },
    syncMode: entry.syncMode || (currentActor?.isAdmin ? 'direct' : 'approval'),
    status: 'syncing',
    attempts: Number(entry.attempts || 0) + 1,
    lastError: '',
    updatedAt: Date.now()
  };
  await putEntry(working);

  const isAdmin = working.syncMode === 'direct' || Boolean(working.actor?.isAdmin);
  if (working.operation === 'delete' || working.operation === 'deleteByVariety') {
    if (!isAdmin) throw new Error('Only administrators can sync queued record deletions.');
    onProgress?.({ phase: 'delete', entry: working });
    if (working.operation === 'deleteByVariety') await deleteRecordByVariety(working.targetVariety || working.form?.variety || working.previous?.variety);
    else await deleteRecord(working.previous || { $id: working.id, ...(working.form || {}) });
    await removeEntry(working.id);
    clearListCache();
    return { deletedRecordId: working.id, variety: working.form?.variety || working.previous?.variety || 'Sugarcane record' };
  }

  if (working.operation === 'upsert') {
    if (!isAdmin) throw new Error('This offline variety update needs an administrator session before it can sync safely.');
    onProgress?.({ phase: 'record', entry: working });
    const outcome = await upsertRecordByVariety(working.form || {}, working.previous || null, working.syncOptions || {});
    await removeEntry(working.id);
    clearListCache();
    return { savedRecord: outcome.record, variety: outcome.record?.variety || working.form?.variety || 'Sugarcane record' };
  }

  const uploaded = await uploadPreparedPhotos(working.photos || [], ({ done, total }) => {
    onProgress?.({ phase: 'photos', entry: working, done, total });
  }, {
    preserveOnFailure: true,
    ownerUserId: working.actor?.id || '',
    finalAccess: isAdmin
  });

  const next = buildSyncRecord(working, uploaded);
  onProgress?.({ phase: isAdmin ? 'record' : 'request', entry: working });
  let savedRecord = null;
  if (isAdmin) {
    savedRecord = await saveRecord(next, working.id, working.previous || null, { knownNew: working.operation === 'create' });
    if (working.removedFileIds?.length) {
      onProgress?.({ phase: 'cleanup', entry: working });
      await deleteStoredFiles(working.removedFileIds);
    }
  } else {
    await submitChangeRequest({
      record: next,
      recordId: working.operation === 'update' ? working.id : '',
      targetId: working.operation === 'create' ? working.id : '',
      actor: working.actor,
      uploadedFileIds: uploaded.flatMap((item) => [item.fullId, item.thumbId]),
      removedFileIds: working.removedFileIds || [],
      requestId: working.requestId
    });
  }

  await removeEntry(working.id);
  clearListCache();
  return { savedRecord, submittedForApproval: !isAdmin, variety: next.variety || 'Sugarcane record' };
}

export async function syncOfflineQueue({ ownerId, actor = null, entryId = '', onProgress, ignoreBackoff = false, limit = 0 } = {}) {
  if (activeSyncPromise) return activeSyncPromise;
  const owner = ownerKey(ownerId);

  activeSyncPromise = (async () => {
    if (!navigator.onLine) return { synced: 0, failed: 0, remaining: (await listOfflineEntries(owner)).length, offline: true };
    let entries = await listOfflineEntries(owner);
    if (entryId) entries = entries.filter((entry) => entry.id === entryId);
    const now = Date.now();
    if (!ignoreBackoff) entries = entries.filter((entry) => Number(entry.nextAttemptAt || 0) <= now);
    const requestedLimit = Number(limit || AUTO_SYNC_DEFAULT_LIMIT);
    if (!entryId && requestedLimit > 0) entries = entries.slice(0, Math.max(1, Math.floor(requestedLimit)));

    let synced = 0;
    let failed = 0;
    const syncedRecords = [];
    const deletedRecordIds = [];
    let approvalRequests = 0;
    let stoppedForNetwork = false;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      onProgress?.({ phase: 'entry', entry, index: index + 1, total: entries.length });
      try {
        const outcome = await syncOneEntry(entry, onProgress, actor);
        if (outcome?.savedRecord) syncedRecords.push(outcome.savedRecord);
        if (outcome?.deletedRecordId) deletedRecordIds.push(outcome.deletedRecordId);
        if (outcome?.submittedForApproval) approvalRequests = (approvalRequests || 0) + 1;
        synced += 1;
      } catch (error) {
        failed += 1;
        const code = Number(error?.code || error?.status || 0);
        const network = isNetworkFailure(error) || code === 401;
        const latest = await getOfflineEntry(entry.id);
        if (latest) {
          await putEntry({
            ...latest,
            status: 'error',
            lastError: queueErrorMessage(error),
            updatedAt: Date.now(),
            nextAttemptAt: network ? Date.now() + NETWORK_BACKOFF_MS : 0
          });
        }
        onProgress?.({ phase: 'error', entry, error });
        if (network) {
          stoppedForNetwork = true;
          break;
        }
      }
      if (index < entries.length - 1) await delay(AUTO_SYNC_GAP_MS);
    }

    const remaining = (await listOfflineEntries(owner)).length;
    return { synced, failed, remaining, stoppedForNetwork, records: syncedRecords, deletedRecordIds, approvalRequests };
  })();

  try {
    return await activeSyncPromise;
  } finally {
    activeSyncPromise = null;
  }
}

export async function getOfflineStorageEstimate() {
  try {
    if (!navigator.storage?.estimate) return null;
    const estimate = await navigator.storage.estimate();
    return { usage: Number(estimate.usage || 0), quota: Number(estimate.quota || 0) };
  } catch {
    return null;
  }
}
