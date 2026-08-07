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
const coreCache = new Map();
const CACHE_TTL = 90_000;
const DETAIL_TTL = 300_000;
const LAST_PAGE_KEY = 'sugarcane-registry:last-page-v212';

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
    const raw = localStorage.getItem(LAST_PAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.value || null;
  } catch {
    return null;
  }
}

export function clearQueryCache() {
  memoryCache.clear();
  detailCache.clear();
  coreCache.clear();
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith('sugarcane:q:'))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {}
}

function rememberCore(documents = []) {
  documents.forEach((document) => {
    if (document?.$id) coreCache.set(document.$id, document);
  });
}

export async function listRecords({ search = '', cursor = '', bypassCache = false } = {}) {
  const term = String(search || '').trim();
  if (term && term.length < SEARCH_MIN) {
    return { documents: [], nextCursor: '', hasMore: false, skippedForShortSearch: true, fromCache: false };
  }

  const key = cacheKey(term, cursor);
  if (!bypassCache) {
    const hit = memoryCache.get(key);
    if (hit && Date.now() - hit.savedAt < CACHE_TTL) {
      rememberCore(hit.value.documents);
      return { ...hit.value, fromCache: true };
    }
    const sessionHit = readSessionCache(key);
    if (sessionHit) {
      memoryCache.set(key, { savedAt: Date.now(), value: sessionHit });
      rememberCore(sessionHit.documents);
      return { ...sessionHit, fromCache: true };
    }
  }

  const queries = [Query.limit(PAGE_SIZE), Query.select(LIST_FIELDS)];
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
    rememberCore(documents);
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
      if (offline?.documents?.length) {
        rememberCore(offline.documents);
        return { ...offline, offlineFallback: true, fromCache: true };
      }
    }
    throw error;
  }
}

function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function expandRecord(core, detail) {
  if (!core && !detail) return null;
  const traits = parseJsonObject(detail?.traits_json);
  const extra = parseJsonObject(detail?.details_json);
  return { ...traits, ...extra, ...(core || {}), $id: core?.$id || detail?.$id };
}

async function listAllCollection(collectionId, { orderByVariety = false, onProgress } = {}) {
  const all = [];
  let cursor = '';
  let page = 0;
  while (true) {
    const queries = [Query.limit(PAGE_SIZE)];
    if (orderByVariety) queries.push(Query.orderAsc('variety'));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const result = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId,
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

export async function exportAllRecords(onProgress) {
  // Backup is explicit and rare. Fetch each collection in cursor pages instead
  // of doing one detail read per row.
  const cores = await listAllCollection(COLLECTIONS.records, { orderByVariety: true, onProgress });
  const details = await listAllCollection(COLLECTIONS.details);
  const detailMap = new Map(details.map((document) => [document.$id, document]));
  return cores.map((core) => expandRecord(core, detailMap.get(core.$id)));
}

export async function getRecord(recordId, { bypassCache = false } = {}) {
  const hit = detailCache.get(recordId);
  if (!bypassCache && hit && Date.now() - hit.savedAt < DETAIL_TTL) return hit.value;

  // A record opened from the registry already has its lean core document cached,
  // so normal detail opens cost only one extra Appwrite document read.
  let core = coreCache.get(recordId);
  const detailPromise = withAppwriteFailover(() => databases.getDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.details,
    documentId: recordId
  }));
  if (!core || bypassCache) {
    [core] = await Promise.all([
      withAppwriteFailover(() => databases.getDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTIONS.records,
        documentId: recordId
      }))
    ]);
    coreCache.set(recordId, core);
  }
  const detail = await detailPromise;
  const value = expandRecord(core, detail);
  detailCache.set(recordId, { savedAt: Date.now(), value });
  return value;
}

function makeTraits(data) {
  return Object.fromEntries(
    CHARACTERIZATION_FIELDS.map((field) => [field.key, String(data[field.key] ?? '').trim()])
  );
}

function makeSearchText(data, traits) {
  const traitText = CHARACTERIZATION_FIELDS.map((field) => traits[field.key]).filter(Boolean);
  const extra = [
    data.germ_trial_code,
    data.germ_location,
    data.germ_status,
    data.germ_material_type,
    data.germ_notes
  ].filter(Boolean);
  return [...traitText, ...extra].join(' ').replace(/\s+/g, ' ').trim().slice(0, 4096);
}

function splitPayload(data) {
  const traits = makeTraits(data);
  const plantedText = String(data.germ_buds_planted ?? '').trim();
  const germinatedText = String(data.germ_germinated_count ?? '').trim();
  const planted = Number(plantedText);
  const germinated = Number(germinatedText);
  const germinationPct = plantedText !== '' && Number.isFinite(planted) && planted > 0 && germinatedText !== '' && Number.isFinite(germinated)
    ? String(Math.max(0, Math.min(100, (germinated / planted) * 100)))
    : '';

  const core = {
    variety: traits.variety || '',
    stool_plant_habit: traits.stool_plant_habit || '',
    leaf_color: traits.leaf_color || '',
    stalk_exposed_color: traits.stalk_exposed_color || '',
    bud_shape: traits.bud_shape || '',
    germ_trial_code: String(data.germ_trial_code ?? '').trim(),
    germ_location: String(data.germ_location ?? '').trim(),
    germ_status: String(data.germ_status ?? '').trim(),
    germination_pct: germinationPct,
    thumbnail_file_id: String(data.thumbnail_file_id || data.thumb_file_ids?.[0] || ''),
    source_name: String(data.source_name || 'Manual entry'),
    source_row: data.source_row == null ? '' : String(data.source_row).trim(),
    search_text: makeSearchText(data, traits)
  };

  const details = {
    germ_planting_date: String(data.germ_planting_date ?? '').trim(),
    germ_material_type: String(data.germ_material_type ?? '').trim(),
    germ_buds_planted: plantedText,
    germ_germinated_count: germinatedText,
    germ_observation_date: String(data.germ_observation_date ?? '').trim(),
    germ_notes: String(data.germ_notes ?? '').trim(),
    photo_file_ids: Array.isArray(data.photo_file_ids) ? data.photo_file_ids : [],
    thumb_file_ids: Array.isArray(data.thumb_file_ids) ? data.thumb_file_ids : [],
    photo_names: Array.isArray(data.photo_names) ? data.photo_names : [],
    primary_file_id: String(data.primary_file_id || data.photo_file_ids?.[0] || '')
  };

  const traitsJson = JSON.stringify(traits);
  const detailsJson = JSON.stringify(details);
  if (traitsJson.length > 4096) throw new Error('Characterization traits are too large to save. Shorten unusually long trait values.');
  if (detailsJson.length > 4096) throw new Error('Record details are too large to save. Shorten notes or remove some attached photo metadata.');
  return { core, detail: { traits_json: traitsJson, details_json: detailsJson } };
}

async function upsertDocument(collectionId, documentId, data, exists) {
  if (exists) {
    try {
      return await withAppwriteFailover(() => databases.updateDocument({
        databaseId: DATABASE_ID,
        collectionId,
        documentId,
        data
      }));
    } catch (error) {
      if (error?.code !== 404 && error?.status !== 404) throw error;
    }
  }
  return withAppwriteFailover(() => databases.createDocument({
    databaseId: DATABASE_ID,
    collectionId,
    documentId,
    data
  }));
}

export async function saveRecord(data, recordId = '') {
  const { core: corePayload, detail: detailPayload } = splitPayload(data);
  const id = recordId || ID.unique();
  const exists = Boolean(recordId);

  // Save heavy details first. If a brand-new core create fails, clean up its
  // detail document so no orphan remains.
  const detail = await upsertDocument(COLLECTIONS.details, id, detailPayload, exists);
  let core;
  try {
    core = await upsertDocument(COLLECTIONS.records, id, corePayload, exists);
  } catch (error) {
    if (!exists) {
      await Promise.allSettled([
        databases.deleteDocument({ databaseId: DATABASE_ID, collectionId: COLLECTIONS.details, documentId: id })
      ]);
    }
    throw error;
  }

  const value = expandRecord(core, detail);
  clearQueryCache();
  coreCache.set(id, core);
  detailCache.set(id, { savedAt: Date.now(), value });
  return value;
}

async function deleteDocumentIfPresent(collectionId, documentId) {
  try {
    await withAppwriteFailover(() => databases.deleteDocument({ databaseId: DATABASE_ID, collectionId, documentId }));
  } catch (error) {
    if (error?.code !== 404 && error?.status !== 404) throw error;
  }
}

export async function deleteRecord(record) {
  const ids = [...(record.photo_file_ids || []), ...(record.thumb_file_ids || [])];
  await Promise.allSettled(ids.map((fileId) => storage.deleteFile({ bucketId: MEDIA_BUCKET_ID, fileId })));
  await deleteDocumentIfPresent(COLLECTIONS.details, record.$id);
  await deleteDocumentIfPresent(COLLECTIONS.records, record.$id);
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
      const index = next++;
      if (index >= rows.length) return;
      const id = ID.unique();
      try {
        const { core, detail } = splitPayload({ ...rows[index], source_name: rows[index].source_name || 'Excel import' });
        await withAppwriteFailover(() => databases.createDocument({
          databaseId: DATABASE_ID,
          collectionId: COLLECTIONS.details,
          documentId: id,
          data: detail
        }), { timeoutMs: 9000 });
        try {
          await withAppwriteFailover(() => databases.createDocument({
            databaseId: DATABASE_ID,
            collectionId: COLLECTIONS.records,
            documentId: id,
            data: core
          }), { timeoutMs: 9000 });
        } catch (error) {
          await Promise.allSettled([
            databases.deleteDocument({ databaseId: DATABASE_ID, collectionId: COLLECTIONS.details, documentId: id })
          ]);
          throw error;
        }
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
