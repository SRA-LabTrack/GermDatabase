import { openDB } from 'idb';
import { DATABASE_ID, COLLECTIONS, MEDIA_BUCKET_ID, databases, storage, Query } from './appwrite';

const DB_NAME = 'germdatabase-offline-v1';
const STORE_RECORDS = 'records';
const STORE_OUTBOX = 'outbox';
const STORE_META = 'meta';
const STORE_MEDIA_BLOBS = 'media_blobs';
const STORAGE_PREFIX = 'appwrite-storage://';

const REMOTE_FIELDS = {
  microorganisms: new Set(['microorganism_id', 'scientific_name', 'genus', 'species', 'organism_type', 'taxonomy_id'])
};

function sanitizeRemoteData(collection, data) {
  const allowed = REMOTE_FIELDS[collection];
  if (!allowed) return data;
  return Object.fromEntries(Object.entries(data || {}).filter(([key]) => allowed.has(key)));
}

const dbPromise = openDB(DB_NAME, 2, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(STORE_RECORDS)) {
      const store = db.createObjectStore(STORE_RECORDS, { keyPath: 'key' });
      store.createIndex('collection', 'collection');
    }
    if (!db.objectStoreNames.contains(STORE_OUTBOX)) db.createObjectStore(STORE_OUTBOX, { keyPath: 'queueId', autoIncrement: true });
    if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: 'key' });
    if (!db.objectStoreNames.contains(STORE_MEDIA_BLOBS)) db.createObjectStore(STORE_MEDIA_BLOBS, { keyPath: 'mediaId' });
  }
});

export function makeId(prefix = 'rec') {
  const random = crypto.randomUUID().replaceAll('-', '').slice(0, 26);
  return `${prefix}_${random}`.slice(0, 36);
}

export function mediaStoragePath(fileId, bucketId = MEDIA_BUCKET_ID) {
  return `${STORAGE_PREFIX}${bucketId}/${fileId}`;
}

export function parseMediaStoragePath(value) {
  const text = String(value || '');
  if (!text.startsWith(STORAGE_PREFIX)) return null;
  const rest = text.slice(STORAGE_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash < 1) return null;
  return { bucketId: rest.slice(0, slash), fileId: rest.slice(slash + 1) };
}

function cleanRemoteDocument(doc) {
  const data = {};
  for (const [key, value] of Object.entries(doc || {})) if (!key.startsWith('$')) data[key] = value;
  return data;
}

export async function getLocalCollection(collection) {
  const db = await dbPromise;
  const rows = await db.getAllFromIndex(STORE_RECORDS, 'collection', collection);
  return rows.filter((row) => !row.deleted).map((row) => ({ $id: row.id, ...row.data, _local: true, _pending: Boolean(row.pending) }));
}

export async function getAllCached() {
  const result = {};
  for (const collection of Object.values(COLLECTIONS)) result[collection] = await getLocalCollection(collection);
  return result;
}

export async function saveLocal(collection, id, data, operation = 'upsert') {
  const db = await dbPromise;
  const key = `${collection}:${id}`;
  await db.put(STORE_RECORDS, { key, collection, id, data, deleted: operation === 'delete', pending: true, changedAt: Date.now() });
  await db.add(STORE_OUTBOX, { collection, id, operation, data, queuedAt: Date.now() });
}

export async function saveMediaLocal(id, data, blob, metadata = {}) {
  const db = await dbPromise;
  await db.put(STORE_MEDIA_BLOBS, { mediaId: id, blob, ...metadata, savedAt: Date.now() });
  await saveLocal(COLLECTIONS.media, id, data);
}

export async function getMediaBlob(mediaId) {
  const db = await dbPromise;
  return db.get(STORE_MEDIA_BLOBS, mediaId);
}

export async function deleteMediaBlob(mediaId) {
  const db = await dbPromise;
  await db.delete(STORE_MEDIA_BLOBS, mediaId);
}

export async function deleteLocal(collection, id) {
  const db = await dbPromise;
  const key = `${collection}:${id}`;
  const existing = await db.get(STORE_RECORDS, key);
  await db.put(STORE_RECORDS, { key, collection, id, data: existing?.data || {}, deleted: true, pending: true, changedAt: Date.now() });
  await db.add(STORE_OUTBOX, { collection, id, operation: 'delete', data: {}, queuedAt: Date.now() });
}

export async function outboxCount() {
  const db = await dbPromise;
  return db.count(STORE_OUTBOX);
}

async function remoteUpsert(collection, id, data) {
  const remoteData = sanitizeRemoteData(collection, data);
  try {
    await databases.createDocument({ databaseId: DATABASE_ID, collectionId: collection, documentId: id, data: remoteData });
  } catch (error) {
    if (Number(error?.code) === 409) {
      await databases.updateDocument({ databaseId: DATABASE_ID, collectionId: collection, documentId: id, data: remoteData });
      return;
    }
    throw error;
  }
}

async function remoteDelete(collection, id) {
  try {
    await databases.deleteDocument({ databaseId: DATABASE_ID, collectionId: collection, documentId: id });
  } catch (error) {
    if (Number(error?.code) !== 404) throw error;
  }
}

async function uploadQueuedMedia(id, data) {
  const target = parseMediaStoragePath(data?.file_path);
  if (!target) return;
  const db = await dbPromise;
  const local = await db.get(STORE_MEDIA_BLOBS, id);
  if (!local?.blob) return;
  const file = new File([local.blob], `${id}.webp`, { type: 'image/webp', lastModified: Date.now() });
  try {
    await storage.createFile({ bucketId: target.bucketId, fileId: target.fileId, file });
  } catch (error) {
    if (Number(error?.code) !== 409) throw error;
  }
}

async function deleteRemoteMediaFile(id, data = {}) {
  const target = parseMediaStoragePath(data?.file_path) || { bucketId: MEDIA_BUCKET_ID, fileId: id };
  try {
    await storage.deleteFile({ bucketId: target.bucketId, fileId: target.fileId });
  } catch (error) {
    if (![404, 400].includes(Number(error?.code))) throw error;
  }
}

async function flushOutbox(onProgress) {
  const db = await dbPromise;
  const operations = await db.getAll(STORE_OUTBOX);
  let done = 0;

  // Process each queued operation independently. Keeping an IndexedDB write
  // transaction open across network awaits can make Chromium auto-close it.
  for (const item of operations) {
    if (item.operation === 'delete') {
      const existing = await db.get(STORE_RECORDS, `${item.collection}:${item.id}`);
      await remoteDelete(item.collection, item.id);
      if (item.collection === COLLECTIONS.media) await deleteRemoteMediaFile(item.id, existing?.data);
    } else {
      if (item.collection === COLLECTIONS.media) await uploadQueuedMedia(item.id, item.data);
      await remoteUpsert(item.collection, item.id, item.data);
    }

    const key = `${item.collection}:${item.id}`;
    const record = await db.get(STORE_RECORDS, key);
    if (record) {
      if (item.operation === 'delete') {
        await db.delete(STORE_RECORDS, key);
        if (item.collection === COLLECTIONS.media) await db.delete(STORE_MEDIA_BLOBS, item.id);
      } else {
        await db.put(STORE_RECORDS, { ...record, pending: false, deleted: false });
      }
    }
    await db.delete(STORE_OUTBOX, item.queueId);
    done += 1;
    onProgress?.({ phase: 'push', done, total: operations.length });
  }
}

async function pullCollection(collection) {
  const db = await dbPromise;
  const pendingRows = await db.getAll(STORE_OUTBOX);
  const pending = new Set(pendingRows.filter((row) => row.collection === collection).map((row) => row.id));
  let offset = 0;
  const remoteIds = new Set();

  while (true) {
    const result = await databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: collection,
      queries: [Query.limit(100), Query.offset(offset)],
      total: false,
      ttl: 0
    });
    const docs = result.documents || [];
    for (const doc of docs) {
      remoteIds.add(doc.$id);
      if (pending.has(doc.$id)) continue;
      await db.put(STORE_RECORDS, {
        key: `${collection}:${doc.$id}`,
        collection,
        id: doc.$id,
        data: cleanRemoteDocument(doc),
        deleted: false,
        pending: false,
        changedAt: Date.parse(doc.$updatedAt || doc.$createdAt || new Date().toISOString())
      });
    }
    if (docs.length < 100) break;
    offset += docs.length;
  }

  const cached = await db.getAllFromIndex(STORE_RECORDS, 'collection', collection);
  for (const row of cached) {
    if (!pending.has(row.id) && !remoteIds.has(row.id)) {
      await db.delete(STORE_RECORDS, row.key);
      if (collection === COLLECTIONS.media) await db.delete(STORE_MEDIA_BLOBS, row.id);
    }
  }
}

export async function syncAll(onProgress) {
  if (!navigator.onLine) throw new Error('No internet connection');
  await flushOutbox(onProgress);
  const collections = Object.values(COLLECTIONS);
  let done = 0;
  for (const collection of collections) {
    await pullCollection(collection);
    done += 1;
    onProgress?.({ phase: 'pull', done, total: collections.length });
  }
  const db = await dbPromise;
  await db.put(STORE_META, { key: 'lastSync', value: Date.now() });
}

export async function getLastSync() {
  const db = await dbPromise;
  return (await db.get(STORE_META, 'lastSync'))?.value || 0;
}
