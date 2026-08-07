import {
  COLLECTIONS,
  DATABASE_ID,
  ID,
  MEDIA_BUCKET_ID,
  Query,
  databases,
  storage,
  withAppwriteFailover
} from './appwrite';
import { CHARACTERIZATION_FIELDS } from './characterizationFields';

export const PAGE_SIZE = 30;
export const SEARCH_MIN = 3;
export const SEARCH_DEBOUNCE_MS = 400;
export const LIST_FIELDS = [
  'variety',
  'stool_plant_habit',
  'leaf_color',
  'stalk_exposed_color',
  'bud_shape',
  'germ_status',
  'germ_location',
  'germination_pct',
  'thumbnail_file_id'
];

const memoryCache = new Map();
const detailCache = new Map();
const CACHE_TTL = 90_000;
const DETAIL_TTL = 300_000;
const LAST_PAGE_KEY = 'sugarcane-registry:last-page-v210';

function cacheKey(search, cursor) {
  return `${String(search || '').trim().toLowerCase()}::${cursor || 'first'}`;
}

function readSessionCache(key) {
  try {
    const raw = sessionStorage.getItem(`sugarcane:q:${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.savedAt > CACHE_TTL) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeSessionCache(key, value) {
  try {
    sessionStorage.setItem(`sugarcane:q:${key}`, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {}
}

function writeOfflineLastPage(value) {
  try {
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {}
}

export function getOfflineLastPage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_PAGE_KEY) || 'null');
    return parsed?.value || null;
  } catch {
    return null;
  }
}

export function clearQueryCache() {
  memoryCache.clear();
  detailCache.clear();
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('sugarcane:q:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {}
}

export async function listRecords({ search = '', cursor = '', bypassCache = false } = {}) {
  const term = String(search || '').trim();
  if (term && term.length < SEARCH_MIN) {
    return { documents: [], nextCursor: '', hasMore: false, skippedForShortSearch: true, fromCache: false };
  }

  const key = cacheKey(term, cursor);
  if (!bypassCache) {
    const hit = memoryCache.get(key);
    if (hit && Date.now() - hit.savedAt < CACHE_TTL) return { ...hit.value, fromCache: true };
    const sessionHit = readSessionCache(key);
    if (sessionHit) {
      memoryCache.set(key, { savedAt: Date.now(), value: sessionHit });
      return { ...sessionHit, fromCache: true };
    }
  }

  const queries = [
    Query.limit(PAGE_SIZE),
    Query.select(LIST_FIELDS)
  ];
  if (term.length >= SEARCH_MIN) queries.push(Query.search('search_text', term));
  else queries.push(Query.orderAsc('variety'));
  if (cursor) queries.push(Query.cursorAfter(cursor));

  try {
    const result = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.records,
      queries,
      total: false
    }));
    const documents = result.documents || [];
    const value = {
      documents,
      nextCursor: documents.at(-1)?.$id || '',
      hasMore: documents.length === PAGE_SIZE,
      skippedForShortSearch: false
    };
    memoryCache.set(key, { savedAt: Date.now(), value });
    writeSessionCache(key, value);
    if (!term && !cursor) writeOfflineLastPage(value);
    return { ...value, fromCache: false };
  } catch (error) {
    if (!term && !cursor) {
      const offline = getOfflineLastPage();
      if (offline?.documents?.length) return { ...offline, offlineFallback: true, fromCache: true };
    }
    throw error;
  }
}


export async function exportAllRecords(onProgress) {
  const all = [];
  let cursor = '';
  let page = 0;
  while (true) {
    const queries = [Query.limit(PAGE_SIZE), Query.orderAsc('variety')];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const result = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.records,
      queries,
      total: false
    }), { timeoutMs: 9000 });
    const docs = result.documents || [];
    all.push(...docs);
    page += 1;
    onProgress?.({ pages: page, records: all.length });
    if (docs.length < PAGE_SIZE) break;
    cursor = docs.at(-1)?.$id || '';
    if (!cursor) break;
  }
  return all;
}

export async function getRecord(recordId, { bypassCache = false } = {}) {
  const hit = detailCache.get(recordId);
  if (!bypassCache && hit && Date.now() - hit.savedAt < DETAIL_TTL) return hit.value;
  const value = await withAppwriteFailover(() => databases.getDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.records,
    documentId: recordId
  }));
  detailCache.set(recordId, { savedAt: Date.now(), value });
  return value;
}

function makeSearchText(data) {
  const traitText = CHARACTERIZATION_FIELDS.map((field) => data[field.key]).filter(Boolean);
  const extra = [
    data.germ_trial_code,
    data.germ_location,
    data.germ_status,
    data.germ_material_type,
    data.germ_notes
  ].filter(Boolean);
  return [...traitText, ...extra].join(' ').replace(/\s+/g, ' ').trim().slice(0, 12000);
}

function normalizePayload(data) {
  const payload = {};
  for (const field of CHARACTERIZATION_FIELDS) payload[field.key] = String(data[field.key] ?? '').trim();
  payload.germ_trial_code = String(data.germ_trial_code ?? '').trim();
  payload.germ_location = String(data.germ_location ?? '').trim();
  payload.germ_planting_date = String(data.germ_planting_date ?? '').trim();
  payload.germ_material_type = String(data.germ_material_type ?? '').trim();
  payload.germ_observation_date = String(data.germ_observation_date ?? '').trim();
  payload.germ_status = String(data.germ_status ?? '').trim();
  payload.germ_notes = String(data.germ_notes ?? '').trim();
  payload.germ_buds_planted = data.germ_buds_planted === '' || data.germ_buds_planted == null ? null : Number(data.germ_buds_planted);
  payload.germ_germinated_count = data.germ_germinated_count === '' || data.germ_germinated_count == null ? null : Number(data.germ_germinated_count);
  const planted = payload.germ_buds_planted;
  const germinated = payload.germ_germinated_count;
  payload.germination_pct = Number.isFinite(planted) && planted > 0 && Number.isFinite(germinated)
    ? Math.max(0, Math.min(100, (germinated / planted) * 100))
    : null;
  payload.photo_file_ids = Array.isArray(data.photo_file_ids) ? data.photo_file_ids : [];
  payload.thumb_file_ids = Array.isArray(data.thumb_file_ids) ? data.thumb_file_ids : [];
  payload.photo_names = Array.isArray(data.photo_names) ? data.photo_names : [];
  payload.thumbnail_file_id = String(data.thumbnail_file_id || payload.thumb_file_ids[0] || '');
  payload.primary_file_id = String(data.primary_file_id || payload.photo_file_ids[0] || '');
  payload.source_name = String(data.source_name || 'Manual entry');
  payload.source_row = Number.isFinite(Number(data.source_row)) ? Number(data.source_row) : null;
  payload.search_text = makeSearchText(payload);
  return payload;
}

export async function saveRecord(data, recordId = '') {
  const payload = normalizePayload(data);
  const id = recordId || ID.unique();
  const value = recordId
    ? await withAppwriteFailover(() => databases.updateDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTIONS.records,
        documentId: id,
        data: payload
      }))
    : await withAppwriteFailover(() => databases.createDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTIONS.records,
        documentId: id,
        data: payload
      }));
  clearQueryCache();
  detailCache.set(id, { savedAt: Date.now(), value });
  return value;
}

export async function deleteRecord(record) {
  const ids = [...(record.photo_file_ids || []), ...(record.thumb_file_ids || [])];
  await Promise.allSettled(ids.map((fileId) => storage.deleteFile({ bucketId: MEDIA_BUCKET_ID, fileId })));
  await withAppwriteFailover(() => databases.deleteDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.records,
    documentId: record.$id
  }));
  clearQueryCache();
}

export function fileViewUrl(fileId) {
  if (!fileId) return '';
  try {
    return String(storage.getFileView({ bucketId: MEDIA_BUCKET_ID, fileId }));
  } catch {
    return '';
  }
}

export async function uploadPreparedPhotos(variants, onProgress) {
  const uploaded = [];
  try {
    for (let index = 0; index < variants.length; index += 1) {
      const item = variants[index];
      const fullId = ID.unique();
      const thumbId = ID.unique();
      const fullFile = new File([item.full.blob], `${fullId}.webp`, { type: 'image/webp' });
      const thumbFile = new File([item.thumb.blob], `${thumbId}.webp`, { type: 'image/webp' });
      await storage.createFile({ bucketId: MEDIA_BUCKET_ID, fileId: fullId, file: fullFile });
      await storage.createFile({ bucketId: MEDIA_BUCKET_ID, fileId: thumbId, file: thumbFile });
      uploaded.push({ fullId, thumbId, name: item.originalName });
      onProgress?.({ done: index + 1, total: variants.length });
    }
    return uploaded;
  } catch (error) {
    await Promise.allSettled(uploaded.flatMap((item) => [item.fullId, item.thumbId]).map((fileId) => storage.deleteFile({ bucketId: MEDIA_BUCKET_ID, fileId })));
    throw error;
  }
}


export async function deleteStoredFiles(fileIds = []) {
  await Promise.allSettled(fileIds.filter(Boolean).map((fileId) => storage.deleteFile({ bucketId: MEDIA_BUCKET_ID, fileId })));
}

export async function bulkCreateRecords(rows, onProgress) {
  let next = 0;
  let completed = 0;
  const errors = [];
  const worker = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= rows.length) return;
      try {
        const payload = normalizePayload({ ...rows[index], source_name: rows[index].source_name || 'Excel import' });
        await withAppwriteFailover(() => databases.createDocument({
          databaseId: DATABASE_ID,
          collectionId: COLLECTIONS.records,
          documentId: ID.unique(),
          data: payload
        }), { timeoutMs: 9000 });
      } catch (error) {
        errors.push({ index, message: error?.message || String(error) });
      }
      completed += 1;
      onProgress?.({ done: completed, total: rows.length, errors: errors.length });
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, rows.length) }, worker));
  clearQueryCache();
  return { imported: rows.length - errors.length, errors };
}
