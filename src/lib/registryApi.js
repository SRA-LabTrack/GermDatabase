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

export const PAGE_SIZE = 25;
export const SEARCH_MIN = 3;
export const SEARCH_DEBOUNCE_MS = 400;
export const LIST_FIELDS = [
  'variety',
  'stool_plant_habit',
  'leaf_color',
  'stalk_exposed_color',
  'bud_shape',
  'germ_trial_code',
  'germ_status',
  'germ_location',
  'germination_pct',
  'thumbnail_file_id'
];

const memoryCache = new Map();
const inflightCache = new Map();
const detailCache = new Map();
const coreCache = new Map();
const CACHE_TTL = 5 * 60_000;
const DETAIL_TTL = 15 * 60_000;
const PERSISTENT_BROWSE_TTL = 10 * 60_000;
const APPWRITE_BROWSE_TTL_SECONDS = 300;
const APPWRITE_SEARCH_TTL_SECONDS = 180;
const BACKUP_PAGE_SIZE = 100;
const CACHE_NAMESPACE = 'sugarcane-v220';
const LAST_PAGE_KEY = `${CACHE_NAMESPACE}:last-page`;
const CORE_KEY_PREFIX = `${CACHE_NAMESPACE}:core:`;
const DETAIL_KEY_PREFIX = `${CACHE_NAMESPACE}:detail:`;

function cacheKey(search, scope, cursor, strategy = 'auto') {
  const term = String(search || '').trim().toLowerCase();
  return `${term ? (scope || 'variety') : 'browse'}::${term}::${strategy}::${cursor || 'first'}`;
}

export const SEARCH_SCOPES = Object.freeze({
  variety: { label: 'Variety', attribute: 'variety', mode: 'smart' },
  trial: { label: 'Trial code', attribute: 'germ_trial_code', mode: 'smart' },
  location: { label: 'Location', attribute: 'germ_location', mode: 'smart' },
  status: { label: 'Status', attribute: 'germ_status', mode: 'smart' },
  all: { label: 'All traits & keywords', attribute: 'search_text', mode: 'fulltext' }
});

function normalizeScope(scope) {
  return SEARCH_SCOPES[scope] ? scope : 'variety';
}

function readTimedStorage(storageObject, key, ttl) {
  try {
    const raw = storageObject.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > ttl) {
      storageObject.removeItem(key);
      return null;
    }
    return parsed.value;
  } catch {
    return null;
  }
}

function writeTimedStorage(storageObject, key, value) {
  try {
    storageObject.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch {}
}

function readSessionCache(key) {
  return readTimedStorage(sessionStorage, `${CACHE_NAMESPACE}:q:${key}`, CACHE_TTL);
}

function writeSessionCache(key, value) {
  writeTimedStorage(sessionStorage, `${CACHE_NAMESPACE}:q:${key}`, value);
}

function writePersistentBrowse(value) {
  writeTimedStorage(localStorage, LAST_PAGE_KEY, value);
}

function getPersistentBrowse({ allowExpired = false } = {}) {
  if (!allowExpired) return readTimedStorage(localStorage, LAST_PAGE_KEY, PERSISTENT_BROWSE_TTL);
  try {
    const raw = localStorage.getItem(LAST_PAGE_KEY);
    return raw ? JSON.parse(raw)?.value || null : null;
  } catch {
    return null;
  }
}

export function getOfflineLastPage() {
  return getPersistentBrowse({ allowExpired: true });
}

function readCoreSession(recordId) {
  return readTimedStorage(sessionStorage, `${CORE_KEY_PREFIX}${recordId}`, DETAIL_TTL);
}

function writeCoreSession(record) {
  if (record?.$id) writeTimedStorage(sessionStorage, `${CORE_KEY_PREFIX}${record.$id}`, record);
}

function readDetailSession(recordId) {
  return readTimedStorage(sessionStorage, `${DETAIL_KEY_PREFIX}${recordId}`, DETAIL_TTL);
}

function writeDetailSession(recordId, value) {
  writeTimedStorage(sessionStorage, `${DETAIL_KEY_PREFIX}${recordId}`, value);
}

export function clearQueryCache() {
  memoryCache.clear();
  inflightCache.clear();
  detailCache.clear();
  coreCache.clear();
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(`${CACHE_NAMESPACE}:`))
      .forEach((key) => sessionStorage.removeItem(key));
    localStorage.removeItem(LAST_PAGE_KEY);
  } catch {}
}

function rememberCore(documents = []) {
  documents.forEach((document) => {
    if (!document?.$id) return;
    coreCache.set(document.$id, document);
    writeCoreSession(document);
  });
}

async function fetchList(queries, { ttl = APPWRITE_SEARCH_TTL_SECONDS, bypassCache = false } = {}) {
  return withAppwriteFailover(() => databases.listDocuments({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.records,
    queries,
    total: false,
    ttl: bypassCache ? 0 : ttl
  }), { timeoutMs: 6500 });
}

function buildLeanQueries(limit = PAGE_SIZE) {
  return [Query.limit(limit), Query.select(LIST_FIELDS)];
}

async function smartFieldFirstPage(term, scopeConfig, bypassCache) {
  const attribute = scopeConfig.attribute;
  const ttl = APPWRITE_SEARCH_TTL_SECONDS;

  // 1) Exact probe first. A successful precise lookup costs only one returned
  // row instead of reading a whole 25-row contains page.
  const exactResult = await fetchList([
    Query.limit(1),
    Query.select(LIST_FIELDS),
    Query.equal(attribute, term)
  ], { ttl, bypassCache });
  const exactDocuments = exactResult.documents || [];
  if (exactDocuments.length) {
    return { rawDocuments: exactDocuments, documents: exactDocuments, matchMode: 'exact', hasMore: false, nextCursor: '' };
  }

  // 2) Prefer prefix matches. This is usually more precise than arbitrary
  // substring matching while still supporting partial variety/trial searches.
  const prefixResult = await fetchList([
    ...buildLeanQueries(),
    Query.startsWith(attribute, term),
    Query.orderAsc(attribute)
  ], { ttl, bypassCache });
  const prefixDocuments = prefixResult.documents || [];
  if (prefixDocuments.length) {
    return {
      rawDocuments: prefixDocuments,
      documents: prefixDocuments,
      matchMode: 'prefix',
      hasMore: prefixDocuments.length === PAGE_SIZE,
      nextCursor: prefixDocuments.at(-1)?.$id || ''
    };
  }

  // 3) Fall back to contains only when exact and prefix both returned nothing.
  // Searching "5001" can therefore still find "Phil 5001" without making
  // every ordinary exact lookup pay for a broad page of results.
  const containsResult = await fetchList([
    ...buildLeanQueries(),
    Query.contains(attribute, term),
    Query.orderAsc(attribute)
  ], { ttl, bypassCache });
  const containsDocuments = containsResult.documents || [];
  return {
    rawDocuments: containsDocuments,
    documents: containsDocuments,
    matchMode: 'contains',
    hasMore: containsDocuments.length === PAGE_SIZE,
    nextCursor: containsDocuments.at(-1)?.$id || ''
  };
}

async function strategyPage(term, scopeConfig, cursor, strategy, bypassCache) {
  const queries = buildLeanQueries();
  if (strategy === 'keywords') {
    const appwriteTerm = term.includes('-') ? `"${term.replace(/"/g, '')}"` : term;
    queries.push(Query.search(scopeConfig.attribute, appwriteTerm));
  } else if (strategy === 'prefix') {
    queries.push(Query.startsWith(scopeConfig.attribute, term), Query.orderAsc(scopeConfig.attribute));
  } else {
    queries.push(Query.contains(scopeConfig.attribute, term), Query.orderAsc(scopeConfig.attribute));
  }
  if (cursor) queries.push(Query.cursorAfter(cursor));
  const result = await fetchList(queries, { ttl: APPWRITE_SEARCH_TTL_SECONDS, bypassCache });
  const documents = result.documents || [];
  return {
    documents,
    rawDocuments: documents,
    matchMode: strategy,
    hasMore: documents.length === PAGE_SIZE,
    nextCursor: documents.at(-1)?.$id || ''
  };
}

export async function listRecords({ search = '', scope = 'variety', cursor = '', strategy = 'auto', bypassCache = false } = {}) {
  const term = String(search || '').trim();
  const normalizedScope = normalizeScope(scope);
  const scopeConfig = SEARCH_SCOPES[normalizedScope];
  if (term && term.length < SEARCH_MIN) {
    return { documents: [], nextCursor: '', hasMore: false, skippedForShortSearch: true, fromCache: false, matchMode: '' };
  }

  const requestedStrategy = cursor && strategy !== 'auto' ? strategy : 'auto';
  const key = cacheKey(term, normalizedScope, cursor, requestedStrategy);
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
    if (!term && !cursor) {
      const persistent = getPersistentBrowse();
      if (persistent?.documents?.length) {
        memoryCache.set(key, { savedAt: Date.now(), value: persistent });
        rememberCore(persistent.documents);
        return { ...persistent, fromCache: true, persistentCache: true };
      }
    }
  }

  if (!bypassCache && inflightCache.has(key)) return inflightCache.get(key);

  const execute = async () => {
    try {
      let page;
      if (!term) {
        const queries = [...buildLeanQueries(), Query.orderAsc('variety')];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const result = await fetchList(queries, { ttl: APPWRITE_BROWSE_TTL_SECONDS, bypassCache });
        const documents = result.documents || [];
        page = {
          documents,
          rawDocuments: documents,
          matchMode: 'browse',
          nextCursor: documents.at(-1)?.$id || '',
          hasMore: documents.length === PAGE_SIZE
        };
      } else if (scopeConfig.mode === 'fulltext') {
        page = await strategyPage(term, scopeConfig, cursor, 'keywords', bypassCache);
      } else if (cursor && ['prefix', 'contains'].includes(strategy)) {
        page = await strategyPage(term, scopeConfig, cursor, strategy, bypassCache);
      } else {
        page = await smartFieldFirstPage(term, scopeConfig, bypassCache);
      }

      const value = {
        documents: page.documents,
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        skippedForShortSearch: false,
        matchMode: page.matchMode
      };
      rememberCore(value.documents);
      memoryCache.set(key, { savedAt: Date.now(), value });
      writeSessionCache(key, value);
      if (!term && !cursor) writePersistentBrowse(value);
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
  };

  const pending = execute();
  if (!bypassCache) inflightCache.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inflightCache.get(key) === pending) inflightCache.delete(key);
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
    const queries = [Query.limit(BACKUP_PAGE_SIZE)];
    if (orderByVariety) queries.push(Query.orderAsc('variety'));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const result = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId,
      queries,
      total: false,
      ttl: 0
    }), { timeoutMs: 12_000 });
    const docs = result.documents || [];
    all.push(...docs);
    page += 1;
    onProgress?.({ pages: page, records: all.length });
    if (docs.length < BACKUP_PAGE_SIZE) break;
    cursor = docs.at(-1)?.$id || '';
    if (!cursor) break;
  }
  return all;
}

export async function exportAllRecords(onProgress) {
  // Backup is explicit and rare. 100-row pages minimize API request overhead
  // while preserving a complete export. Reads still count per returned row.
  const cores = await listAllCollection(COLLECTIONS.records, { orderByVariety: true, onProgress });
  const details = await listAllCollection(COLLECTIONS.details);
  const detailMap = new Map(details.map((document) => [document.$id, document]));
  return cores.map((core) => expandRecord(core, detailMap.get(core.$id)));
}

export async function getRecord(recordId, { bypassCache = false } = {}) {
  const hit = detailCache.get(recordId);
  if (!bypassCache && hit && Date.now() - hit.savedAt < DETAIL_TTL) return hit.value;
  if (!bypassCache) {
    const sessionHit = readDetailSession(recordId);
    if (sessionHit) {
      detailCache.set(recordId, { savedAt: Date.now(), value: sessionHit });
      return sessionHit;
    }
  }

  // Registry pages remember their lean core rows in sessionStorage, so opening
  // a cached card usually costs only the one heavy detail-document read.
  let core = bypassCache ? null : (coreCache.get(recordId) || readCoreSession(recordId));
  if (core) coreCache.set(recordId, core);

  const detailPromise = withAppwriteFailover(() => databases.getDocument({
    databaseId: DATABASE_ID,
    collectionId: COLLECTIONS.details,
    documentId: recordId
  }), { timeoutMs: 6500 });

  if (!core) {
    core = await withAppwriteFailover(() => databases.getDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.records,
      documentId: recordId,
      queries: [Query.select([...LIST_FIELDS, 'source_name', 'source_row'])]
    }), { timeoutMs: 6500 });
    coreCache.set(recordId, core);
    writeCoreSession(core);
  }

  const detail = await detailPromise;
  const value = expandRecord(core, detail);
  detailCache.set(recordId, { savedAt: Date.now(), value });
  writeDetailSession(recordId, value);
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
      }), { retryTransport: false, timeoutMs: 7000 });
    } catch (error) {
      if (error?.code !== 404 && error?.status !== 404) throw error;
    }
  }
  return withAppwriteFailover(() => databases.createDocument({
    databaseId: DATABASE_ID,
    collectionId,
    documentId,
    data
  }), { retryTransport: false, timeoutMs: 7000 });
}

export async function saveRecord(data, recordId = '') {
  const { core: corePayload, detail: detailPayload } = splitPayload(data);
  const id = recordId || ID.unique();
  const exists = Boolean(recordId);

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
  writeCoreSession(core);
  writeDetailSession(id, value);
  return value;
}

async function deleteDocumentIfPresent(collectionId, documentId) {
  try {
    await withAppwriteFailover(() => databases.deleteDocument({
      databaseId: DATABASE_ID,
      collectionId,
      documentId
    }), { retryTransport: false, timeoutMs: 7000 });
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
        }), { retryTransport: false, timeoutMs: 9000 });
        try {
          await withAppwriteFailover(() => databases.createDocument({
            databaseId: DATABASE_ID,
            collectionId: COLLECTIONS.records,
            documentId: id,
            data: core
          }), { retryTransport: false, timeoutMs: 9000 });
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
  // Two workers stay comfortably below the Web SDK write-rate ceiling while
  // still making large workbook imports reasonably quick.
  await Promise.all(Array.from({ length: Math.min(2, rows.length) }, worker));
  clearQueryCache();
  return { imported: rows.length - errors.length, errors };
}
