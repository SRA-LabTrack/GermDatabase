import {
  ADMIN_LABEL,
  COLLECTIONS,
  DATABASE_ID,
  ID,
  MEDIA_BUCKET_ID,
  Permission,
  Query,
  Role,
  databases,
  storage,
  withAppwriteFailover,
  isNetworkFailure
} from './appwrite';
import { CHARACTERIZATION_FIELDS } from './characterizationFields';
import { normalizedPhotoCategories, primaryPhotoIndex } from './photoSections';
import { canonicalLegacyVariety, normalizeVarietyIdentity } from './legacyHyv';
import bundledCharacterization from '../../seed/characterization.json';
import bundledHyvCharacteristics from '../../seed/sra_hyv_characteristics_v273.json';

export const PAGE_SIZE = 25;
export const RECENT_LIMIT = 20;
export const SHEET_PAGE_SIZE = 20;
export const SEARCH_MIN = 3;
export const SEARCH_DEBOUNCE_MS = 250;
export const LIST_FIELDS = [
  'variety',
  'stool_plant_habit',
  'leaf_color',
  'germ_trial_code',
  'germ_status',
  'germ_location',
  'germination_pct',
  'thumbnail_file_id'
];


const BUNDLED_RECORD_ID_PREFIX = 'bundled-record:';
const BUNDLED_CURSOR_PREFIX = 'bundled-offset:';
const BUNDLED_SOURCE_RECORDS = Array.isArray(bundledCharacterization?.records)
  ? bundledCharacterization.records
  : [];
const BUNDLED_HYV_RECORDS = Array.isArray(bundledHyvCharacteristics?.records)
  ? bundledHyvCharacteristics.records
  : [];
const BUNDLED_HYV_MAP = new Map(
  BUNDLED_HYV_RECORDS.map((record) => [normalizeVarietyIdentity(record.variety), record])
);
const BUNDLED_RECORDS = BUNDLED_SOURCE_RECORDS.map((record, index) => ({
  ...(BUNDLED_HYV_MAP.get(normalizeVarietyIdentity(record.variety)) || {}),
  ...record,
  $id: `${BUNDLED_RECORD_ID_PREFIX}${String(index + 1).padStart(4, '0')}`,
  __bundledSnapshot: true,
  __bundledIndex: index
}));
const BUNDLED_RECORD_MAP = new Map(BUNDLED_RECORDS.map((record) => [record.$id, record]));

function bundledText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function bundledMatches(record, term, scope) {
  if (!term) return true;
  const needle = bundledText(term);
  if (!needle) return true;
  const config = SEARCH_SCOPES[scope] || SEARCH_SCOPES.variety;
  if (config.mode !== 'fulltext') return bundledText(record?.[config.attribute]).includes(needle);
  return Object.values(record || {}).some((value) =>
    (typeof value === 'string' || typeof value === 'number') && bundledText(value).includes(needle)
  );
}

function bundledOffset(cursor) {
  if (!String(cursor || '').startsWith(BUNDLED_CURSOR_PREFIX)) return 0;
  const value = Number(String(cursor).slice(BUNDLED_CURSOR_PREFIX.length));
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function bundledPage({ search = '', scope = 'variety', cursor = '', limit = PAGE_SIZE, recent = false } = {}) {
  const normalizedScope = normalizeScope(scope);
  const filtered = BUNDLED_RECORDS
    .filter((record) => bundledMatches(record, search, normalizedScope))
    .sort((a, b) => bundledText(a.variety).localeCompare(bundledText(b.variety)));
  const source = recent ? filtered.slice(0, RECENT_LIMIT) : filtered;
  const offset = recent ? 0 : bundledOffset(cursor);
  const documents = source.slice(offset, offset + limit);
  const nextOffset = offset + documents.length;
  const hasMore = !recent && nextOffset < source.length;
  return {
    documents,
    nextCursor: hasMore ? `${BUNDLED_CURSOR_PREFIX}${nextOffset}` : '',
    hasMore,
    skippedForShortSearch: false,
    matchMode: recent ? 'bundled-recent' : (search ? 'bundled-search' : 'bundled-browse'),
    bundledSnapshot: true,
    offlineFallback: true,
    bundledTotal: filtered.length,
    fromCache: true
  };
}

const memoryCache = new Map();
const inflightCache = new Map();
const detailCache = new Map();
const detailInflight = new Map();
const coreCache = new Map();
let identityGuardCache = { savedAt: 0, index: null };
const IDENTITY_GUARD_TTL = 2 * 60_000;
const CACHE_TTL = 15 * 60_000;
const DETAIL_TTL = 45 * 60_000;
const PERSISTENT_BROWSE_TTL = 45 * 60_000;
const APPWRITE_BROWSE_TTL_SECONDS = 900;
const APPWRITE_SEARCH_TTL_SECONDS = 300;
const BACKUP_PAGE_SIZE = 100;
const CACHE_NAMESPACE = 'sugarcane-v230';
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


const OPTIONAL_TRAIT_DEFAULTS = Object.freeze(
  Object.fromEntries(CHARACTERIZATION_FIELDS.map((field) => [field.key, '']))
);

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

export function clearListCache() {
  memoryCache.clear();
  inflightCache.clear();
  identityGuardCache = { savedAt: 0, index: null };
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(`${CACHE_NAMESPACE}:q:`))
      .forEach((key) => sessionStorage.removeItem(key));
    localStorage.removeItem(LAST_PAGE_KEY);
  } catch {}
}

function clearRecordCache(recordId) {
  if (!recordId) return;
  detailCache.delete(recordId);
  detailInflight.delete(recordId);
  coreCache.delete(recordId);
  try {
    sessionStorage.removeItem(`${CORE_KEY_PREFIX}${recordId}`);
    sessionStorage.removeItem(`${DETAIL_KEY_PREFIX}${recordId}`);
  } catch {}
}

export function clearQueryCache() {
  clearListCache();
  detailCache.clear();
  detailInflight.clear();
  coreCache.clear();
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(`${CACHE_NAMESPACE}:`))
      .forEach((key) => sessionStorage.removeItem(key));
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
  }), { timeoutMs: 8000 });
}

function buildLeanQueries(limit = PAGE_SIZE) {
  return [Query.limit(limit), Query.select(LIST_FIELDS)];
}

async function smartFieldFirstPage(term, scopeConfig, bypassCache) {
  const attribute = scopeConfig.attribute;
  const ttl = APPWRITE_SEARCH_TTL_SECONDS;

  // Numeric fragments such as "5001" are normally intended to match a code
  // inside a variety name (for example Phil 5001). Skip exact + prefix probes
  // in that common case so one user search does not make three API requests.
  if (attribute === 'variety' && /^\d/.test(term)) {
    const result = await fetchList([
      ...buildLeanQueries(),
      Query.contains(attribute, term),
      Query.orderAsc(attribute)
    ], { ttl, bypassCache });
    const documents = result.documents || [];
    return {
      rawDocuments: documents,
      documents,
      matchMode: 'contains',
      hasMore: documents.length === PAGE_SIZE,
      nextCursor: documents.at(-1)?.$id || ''
    };
  }

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


export async function listRecentRecords({ bypassCache = false } = {}) {
  const key = `recent::${RECENT_LIMIT}::first`;
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

  if (!bypassCache && inflightCache.has(key)) return inflightCache.get(key);

  const execute = async () => {
    try {
      const result = await fetchList([
        ...buildLeanQueries(RECENT_LIMIT),
        Query.orderDesc('$sequence')
      ], { ttl: APPWRITE_BROWSE_TTL_SECONDS, bypassCache });
      const documents = result.documents || [];
      const value = {
        documents,
        nextCursor: '',
        hasMore: false,
        skippedForShortSearch: false,
        matchMode: 'recent'
      };
      rememberCore(documents);
      memoryCache.set(key, { savedAt: Date.now(), value });
      writeSessionCache(key, value);
      return { ...value, fromCache: false };
    } catch (error) {
      if (isNetworkFailure(error)) return bundledPage({ recent: true, limit: RECENT_LIMIT });
      throw error;
    }
  };

  const promise = execute().finally(() => inflightCache.delete(key));
  if (!bypassCache) inflightCache.set(key, promise);
  return promise;
}

export async function listRecords({ search = '', scope = 'variety', cursor = '', strategy = 'auto', bypassCache = false } = {}) {
  const term = String(search || '').trim();
  const normalizedScope = normalizeScope(scope);
  const scopeConfig = SEARCH_SCOPES[normalizedScope];
  if (String(cursor || '').startsWith(BUNDLED_CURSOR_PREFIX)) {
    return bundledPage({ search: term, scope: normalizedScope, cursor });
  }
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
      if (isNetworkFailure(error)) {
        return bundledPage({ search: term, scope: normalizedScope, cursor });
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

let spreadsheetBatchIdQuerySupported = true;

function sheetPhaseError(error, phase) {
  try { error.spreadsheetPhase = phase; return error; } catch {
    const wrapped = new Error(error?.message || String(error));
    wrapped.spreadsheetPhase = phase;
    wrapped.cause = error;
    return wrapped;
  }
}

async function getSpreadsheetDetailsIndividually(ids = []) {
  const detailMap = new Map();
  const failures = [];
  const queue = [...ids];
  const workerCount = Math.min(4, queue.length);

  async function worker() {
    while (queue.length) {
      const id = queue.shift();
      try {
        const detail = await withAppwriteFailover(() => databases.getDocument({
          databaseId: DATABASE_ID,
          collectionId: COLLECTIONS.details,
          documentId: id,
          queries: [Query.select(['traits_json', 'details_json'])]
        }), { timeoutMs: 9000 });
        detailMap.set(id, detail);
      } catch (error) {
        const code = Number(error?.code || error?.status || 0);
        // Older imported rows can legitimately predate the split details
        // collection. Treat a missing details document as an empty detail row.
        if (code === 404) detailMap.set(id, { $id: id, traits_json: '{}', details_json: '{}' });
        else failures.push({ id, error });
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failures.length) throw failures[0].error;
  return detailMap;
}

async function fetchSpreadsheetDetails(ids = []) {
  if (!ids.length) return new Map();
  const detailMap = new Map();
  const batches = [];
  for (let index = 0; index < ids.length; index += 5) batches.push(ids.slice(index, index + 5));

  async function fetchBatch(batch) {
    if (!spreadsheetBatchIdQuerySupported) {
      const fallback = await getSpreadsheetDetailsIndividually(batch);
      fallback.forEach((value, key) => detailMap.set(key, value));
      return;
    }
    try {
      const result = await withAppwriteFailover(() => databases.listDocuments({
        databaseId: DATABASE_ID,
        collectionId: COLLECTIONS.details,
        queries: [
          Query.equal('$id', batch),
          Query.limit(batch.length),
          Query.select(['traits_json', 'details_json'])
        ],
        total: false,
        ttl: 0
      }), { timeoutMs: 9000 });
      const found = new Map((result.documents || []).map((item) => [item.$id, item]));
      batch.forEach((id) => {
        if (found.has(id)) detailMap.set(id, found.get(id));
        else detailMap.set(id, { $id: id, traits_json: '{}', details_json: '{}' });
      });
      return;
    } catch (error) {
      const code = Number(error?.code || error?.status || 0);
      const type = String(error?.type || '').toLowerCase();
      const message = String(error?.message || '').toLowerCase();
      if (code === 400 || type.includes('query') || message.includes('invalid query')) spreadsheetBatchIdQuerySupported = false;
      const fallback = await getSpreadsheetDetailsIndividually(batch);
      fallback.forEach((value, key) => detailMap.set(key, value));
    }
  }

  // Keep the burst deliberately small. Four five-ID requests are far less
  // likely to time out than one large full-detail query, while still avoiding
  // twenty individual reads in the normal path.
  await Promise.all(batches.map((batch) => fetchBatch(batch)));
  return detailMap;
}

export async function listSpreadsheetRecords({ cursor = '', search = '', scope = 'variety' } = {}) {
  const term = String(search || '').trim();
  const normalizedScope = normalizeScope(scope);
  const scopeConfig = SEARCH_SCOPES[normalizedScope];
  if (term && term.length < SEARCH_MIN) {
    return { documents: [], nextCursor: '', hasMore: false, skippedForShortSearch: true };
  }

  const coreQueries = [
    Query.limit(SHEET_PAGE_SIZE),
    Query.select([...LIST_FIELDS, 'source_name', 'source_row'])
  ];

  if (term) {
    if (scopeConfig.mode === 'fulltext') {
      const appwriteTerm = term.includes('-') ? `"${term.replace(/"/g, '')}"` : term;
      coreQueries.push(Query.search(scopeConfig.attribute, appwriteTerm));
    } else {
      coreQueries.push(Query.contains(scopeConfig.attribute, term));
    }
  } else {
    coreQueries.push(Query.orderAsc('variety'));
  }
  if (cursor) coreQueries.push(Query.cursorAfter(cursor));

  let coreResult;
  try {
    coreResult = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.records,
      queries: coreQueries,
      total: false,
      // A short cache makes repeated spreadsheet searches cheaper without
      // leaving bulk-edit data stale for long periods.
      ttl: term ? 60 : 120
    }), { timeoutMs: 9000 });
  } catch (error) {
    throw sheetPhaseError(error, 'core');
  }

  const cores = coreResult.documents || [];
  if (!cores.length) return { documents: [], nextCursor: '', hasMore: false, skippedForShortSearch: false };

  const ids = cores.map((item) => item.$id);
  let detailMap;
  try {
    detailMap = await fetchSpreadsheetDetails(ids);
  } catch (error) {
    throw sheetPhaseError(error, 'details');
  }

  const documents = cores.map((core) => expandRecord(core, detailMap.get(core.$id)));
  documents.forEach((document) => {
    if (!document?.$id) return;
    detailCache.set(document.$id, { savedAt: Date.now(), value: document });
    writeDetailSession(document.$id, document);
  });

  return {
    documents,
    nextCursor: cores.at(-1)?.$id || '',
    hasMore: cores.length === SHEET_PAGE_SIZE,
    skippedForShortSearch: false
  };
}

export async function saveSpreadsheetRecords(changes = [], onProgress) {
  const saved = [];
  const errors = [];
  // Explicit Apply is the only write point. Sequential rows avoid write bursts
  // against Appwrite while splitPayload still skips unchanged core/detail halves.
  for (let index = 0; index < changes.length; index += 1) {
    const item = changes[index];
    try {
      const value = await saveRecord(item.record, item.record.$id, item.previous || null);
      saved.push(value);
    } catch (error) {
      errors.push({ id: item.record?.$id, variety: item.record?.variety || '', message: error?.message || String(error) });
    }
    onProgress?.({ done: index + 1, total: changes.length, errors: errors.length });
  }
  return { saved, errors };
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
  // Hydrate every canonical optional trait locally. Older records therefore
  // gain the red-font template fields immediately without spending hundreds
  // of Appwrite writes just to persist empty strings. When a user enters a
  // value, splitPayload stores only that populated trait as before.
  return { ...OPTIONAL_TRAIT_DEFAULTS, ...traits, ...extra, ...(core || {}), $id: core?.$id || detail?.$id };
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
  // Full Excel/backup exports read the two independent collections concurrently.
  // This keeps the same number of returned documents but removes the old
  // records-then-details serial wait.
  let coreProgress = { pages: 0, records: 0 };
  let detailProgress = { pages: 0, records: 0 };

  const [cores, details] = await Promise.all([
    listAllCollection(COLLECTIONS.records, {
      orderByVariety: true,
      onProgress: (progress) => {
        coreProgress = progress;
        onProgress?.({
          stage: 'core',
          pages: progress.pages,
          records: progress.records,
          detailPages: detailProgress.pages,
          detailRecords: detailProgress.records
        });
      }
    }),
    listAllCollection(COLLECTIONS.details, {
      onProgress: (progress) => {
        detailProgress = progress;
        onProgress?.({
          stage: 'details',
          pages: coreProgress.pages,
          records: coreProgress.records,
          detailPages: progress.pages,
          detailRecords: progress.records
        });
      }
    })
  ]);

  const detailMap = new Map(details.map((document) => [document.$id, document]));
  return cores.map((core) => expandRecord(core, detailMap.get(core.$id)));
}

export async function getRecord(recordId, { bypassCache = false } = {}) {
  if (String(recordId || '').startsWith(BUNDLED_RECORD_ID_PREFIX)) {
    const snapshot = BUNDLED_RECORD_MAP.get(recordId);
    if (!snapshot) throw new Error('Bundled registry snapshot record was not found.');
    return { ...OPTIONAL_TRAIT_DEFAULTS, ...snapshot };
  }
  const hit = detailCache.get(recordId);
  if (!bypassCache && hit && Date.now() - hit.savedAt < DETAIL_TTL) return hit.value;
  if (!bypassCache) {
    const sessionHit = readDetailSession(recordId);
    if (sessionHit) {
      detailCache.set(recordId, { savedAt: Date.now(), value: sessionHit });
      return sessionHit;
    }
    if (detailInflight.has(recordId)) return detailInflight.get(recordId);
  }

  const execute = async () => {
    // Registry pages remember their lean core rows in sessionStorage, so opening
    // a cached card normally costs only the one heavy detail-document read.
    let core = bypassCache ? null : (coreCache.get(recordId) || readCoreSession(recordId));
    if (core) coreCache.set(recordId, core);

    const detailPromise = withAppwriteFailover(() => databases.getDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.details,
      documentId: recordId,
      queries: [Query.select(['traits_json', 'details_json'])]
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
  };

  const pending = execute();
  if (!bypassCache) detailInflight.set(recordId, pending);
  try {
    return await pending;
  } finally {
    if (detailInflight.get(recordId) === pending) detailInflight.delete(recordId);
  }
}

function makeTraits(data) {
  // Store only populated optional traits. This leaves room for the extra red-font
  // attributes without inflating traits_json with dozens of empty strings.
  return Object.fromEntries(
    CHARACTERIZATION_FIELDS
      .map((field) => [field.key, String(data[field.key] ?? '').trim()])
      .filter(([, value]) => value !== '')
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

  const photoIds = Array.isArray(data.photo_file_ids) ? data.photo_file_ids : [];
  const thumbIds = Array.isArray(data.thumb_file_ids) ? data.thumb_file_ids : [];
  const photoCategories = normalizedPhotoCategories(data.photo_categories, photoIds.length);
  const preferredPhotoIndex = primaryPhotoIndex(photoCategories, photoIds.length);

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
    thumbnail_file_id: String(thumbIds[preferredPhotoIndex] || data.thumbnail_file_id || thumbIds[0] || ''),
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
    photo_file_ids: photoIds,
    thumb_file_ids: thumbIds,
    photo_names: Array.isArray(data.photo_names) ? data.photo_names : [],
    photo_categories: photoCategories,
    primary_file_id: String(photoIds[preferredPhotoIndex] || data.primary_file_id || photoIds[0] || '')
  };

  const traitsJson = JSON.stringify(traits);
  const detailsJson = JSON.stringify(details);
  if (traitsJson.length > 4096) throw new Error('Characterization traits are too large to save. Shorten unusually long trait values.');
  if (detailsJson.length > 4096) throw new Error('Record details are too large to save. Shorten notes or remove some attached photo metadata.');
  return { core, detail: { traits_json: traitsJson, details_json: detailsJson } };
}

export function validateRecordPayload(data) {
  splitPayload(data);
  return true;
}

async function upsertDocument(collectionId, documentId, data, exists, { idempotentCreate = false } = {}) {
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
  try {
    return await withAppwriteFailover(() => databases.createDocument({
      databaseId: DATABASE_ID,
      collectionId,
      documentId,
      data
    }), { retryTransport: false, timeoutMs: 7000 });
  } catch (error) {
    // Offline queue entries reserve their Appwrite document ID before the
    // device reconnects. If a previous sync timed out after the server had
    // actually accepted the create, the deterministic retry receives 409.
    // Update that same document instead of creating a duplicate record.
    const code = Number(error?.code || error?.status || 0);
    if (!idempotentCreate || code !== 409) throw error;
    return withAppwriteFailover(() => databases.updateDocument({
      databaseId: DATABASE_ID,
      collectionId,
      documentId,
      data
    }), { retryTransport: false, timeoutMs: 7000 });
  }
}

export async function saveRecord(data, recordId = '', previous = null, { knownNew = false, skipDuplicateGuard = false } = {}) {
  const { core: corePayload, detail: detailPayload } = splitPayload(data);
  const id = recordId || ID.unique();
  const exists = Boolean(recordId) && !knownNew;

  // Every normal creation path now shares one canonical identity gate. This
  // protects manual admin creates, approved user CREATE requests, offline
  // CREATE sync, and renames. The comparison ignores punctuation/case and also
  // understands the verified legacy SRA shorthand aliases.
  const previousKeys = new Set(varietyIdentityKeys(previous?.variety));
  const nextKeys = varietyIdentityKeys(corePayload.variety);
  const sameIdentity = nextKeys.some((key) => previousKeys.has(key));
  const identityMayChange = !exists || !previous || !sameIdentity;
  if (!skipDuplicateGuard && identityMayChange) {
    await assertUniqueVarietyIdentity(corePayload.variety, { excludeId: id, force: true });
  }

  // Editing should not spend two Appwrite writes when only one half of the
  // split document changed. The already-open full record is compared locally,
  // so this optimization adds zero reads.
  const previousPayload = exists && previous ? splitPayload(previous) : null;
  const coreChanged = !previousPayload || JSON.stringify(previousPayload.core) !== JSON.stringify(corePayload);
  const detailChanged = !previousPayload || JSON.stringify(previousPayload.detail) !== JSON.stringify(detailPayload);

  if (exists && !coreChanged && !detailChanged) return previous;

  let detail = { $id: id, ...detailPayload };
  if (detailChanged) detail = await upsertDocument(COLLECTIONS.details, id, detailPayload, exists, { idempotentCreate: knownNew });

  let core = { $id: id, ...corePayload };
  try {
    if (coreChanged) core = await upsertDocument(COLLECTIONS.records, id, corePayload, exists, { idempotentCreate: knownNew });
  } catch (error) {
    if (!exists && !knownNew && detailChanged) {
      await Promise.allSettled([
        databases.deleteDocument({ databaseId: DATABASE_ID, collectionId: COLLECTIONS.details, documentId: id })
      ]);
    }
    throw error;
  }

  const value = expandRecord(core, detail);
  clearListCache();
  clearRecordCache(id);
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

async function deleteStoredFileIfPresent(fileId) {
  if (!fileId) return;
  try {
    await storage.deleteFile({ bucketId: MEDIA_BUCKET_ID, fileId });
  } catch (error) {
    const code = Number(error?.code || error?.status || 0);
    if (code !== 404) throw error;
  }
}

export async function deleteRecord(record) {
  const ids = [...(record.photo_file_ids || []), ...(record.thumb_file_ids || [])];
  // Delete media first. If Storage is unreachable, keep the database metadata
  // intact so the user can retry instead of creating unreachable orphan files.
  for (const fileId of Array.from(new Set(ids.filter(Boolean)))) await deleteStoredFileIfPresent(fileId);
  await deleteDocumentIfPresent(COLLECTIONS.details, record.$id);
  await deleteDocumentIfPresent(COLLECTIONS.records, record.$id);
  clearListCache();
  clearRecordCache(record.$id);
}

export function fileViewUrl(fileId) {
  if (!fileId) return '';
  try {
    return String(storage.getFileView({ bucketId: MEDIA_BUCKET_ID, fileId }));
  } catch {
    return '';
  }
}

export async function uploadPreparedPhotos(variants, onProgress, { preserveOnFailure = false, ownerUserId = '', finalAccess = false } = {}) {
  const uploaded = [];
  const touchedIds = [];
  const owner = String(ownerUserId || '').trim();
  const permissions = finalAccess
    ? [Permission.read(Role.users()), Permission.update(Role.label(ADMIN_LABEL)), Permission.delete(Role.label(ADMIN_LABEL))]
    : owner
      ? [Permission.read(Role.users()), Permission.update(Role.user(owner)), Permission.delete(Role.user(owner))]
      : undefined;

  async function createFileIdempotent(fileId, file) {
    try {
      await storage.createFile({ bucketId: MEDIA_BUCKET_ID, fileId, file, permissions });
    } catch (error) {
      // Queued photos have deterministic IDs. A 409 means a previous sync
      // likely completed this upload before the device lost the response.
      // Treat it as success so retrying never duplicates Storage files.
      const code = Number(error?.code || error?.status || 0);
      if (code !== 409) throw error;
    }
  }

  try {
    for (let index = 0; index < variants.length; index += 1) {
      const item = variants[index];
      const fullId = item.fullId || ID.unique();
      const thumbId = item.thumbId || ID.unique();
      const fullFile = new File([item.full.blob], `${fullId}.webp`, { type: 'image/webp' });
      const thumbFile = new File([item.thumb.blob], `${thumbId}.webp`, { type: 'image/webp' });
      touchedIds.push(fullId);
      await createFileIdempotent(fullId, fullFile);
      touchedIds.push(thumbId);
      await createFileIdempotent(thumbId, thumbFile);
      uploaded.push({ fullId, thumbId, name: item.originalName, category: item.category || 'overview' });
      onProgress?.({ done: index + 1, total: variants.length });
    }
    return uploaded;
  } catch (error) {
    // Online one-shot saves clean up immediately. Offline queue sync keeps the
    // deterministic files because the next reconnect can safely reuse them;
    // deleting and re-uploading would waste Storage requests and bandwidth.
    if (!preserveOnFailure) {
      await Promise.allSettled(touchedIds.map((fileId) => storage.deleteFile({ bucketId: MEDIA_BUCKET_ID, fileId })));
    }
    throw error;
  }
}



export async function verifyPendingFiles(fileIds = [], ownerUserId = '', { allowMissing = false } = {}) {
  const owner = String(ownerUserId || '').trim();
  if (!owner) throw new Error('Pending photo ownership cannot be verified without a submitter ID.');
  const verified = [];
  for (const fileId of Array.from(new Set(fileIds.filter(Boolean)))) {
    let file;
    try {
      file = await withAppwriteFailover(() => storage.getFile({
        bucketId: MEDIA_BUCKET_ID,
        fileId
      }), { timeoutMs: 5000 });
    } catch (error) {
      const code = Number(error?.code || error?.status || 0);
      if (allowMissing && code === 404) continue;
      throw error;
    }
    const permissions = Array.isArray(file?.$permissions) ? file.$permissions : [];
    const owned = permissions.some((permission) => String(permission).includes(`user:${owner}`));
    if (!owned) throw new Error('A pending photo could not be verified as belonging to the submitting user.');
    verified.push(fileId);
  }
  return verified;
}

export async function lockStoredFiles(fileIds = []) {
  const permissions = [
    Permission.read(Role.users()),
    Permission.update(Role.label(ADMIN_LABEL)),
    Permission.delete(Role.label(ADMIN_LABEL))
  ];
  for (const fileId of Array.from(new Set(fileIds.filter(Boolean)))) {
    await withAppwriteFailover(() => storage.updateFile({
      bucketId: MEDIA_BUCKET_ID,
      fileId,
      permissions
    }), { retryTransport: false, timeoutMs: 7000 });
  }
}

export async function deleteStoredFiles(fileIds = []) {
  // Explicit cleanup is sequential to avoid short request bursts against the
  // free-plan Storage API. The total number of deletes is unchanged.
  for (const fileId of Array.from(new Set(fileIds.filter(Boolean)))) await deleteStoredFileIfPresent(fileId);
}


function varietyIdentityKeys(value) {
  const original = String(value || '').trim();
  if (!original) return [];
  const canonical = canonicalLegacyVariety(original);
  return Array.from(new Set([
    normalizeVarietyIdentity(original),
    normalizeVarietyIdentity(canonical)
  ].filter(Boolean)));
}

function addCoreToIdentityIndex(index, core) {
  if (!core?.$id) return;
  for (const key of varietyIdentityKeys(core.variety)) {
    const rows = index.get(key) || [];
    if (!rows.some((row) => row.$id === core.$id)) rows.push(core);
    index.set(key, rows);
  }
}

async function loadCanonicalIdentityIndex({ force = false } = {}) {
  if (!force && identityGuardCache.index && Date.now() - identityGuardCache.savedAt < IDENTITY_GUARD_TTL) {
    return identityGuardCache.index;
  }
  const index = new Map();
  let cursor = '';
  while (true) {
    const queries = [Query.limit(100), Query.orderAsc('$id'), Query.select(['variety'])];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.records,
      queries,
      total: false,
      ttl: 0
    }), { timeoutMs: 7000 });
    const batch = page.documents || [];
    batch.forEach((document) => addCoreToIdentityIndex(index, document));
    if (batch.length < 100) break;
    cursor = batch.at(-1)?.$id || '';
    if (!cursor) break;
  }
  identityGuardCache = { savedAt: Date.now(), index };
  return index;
}

export async function findCanonicalVarietyMatches(variety, { excludeId = '', force = false } = {}) {
  const index = await loadCanonicalIdentityIndex({ force });
  const found = new Map();
  for (const key of varietyIdentityKeys(variety)) {
    for (const document of index.get(key) || []) {
      if (excludeId && document.$id === excludeId) continue;
      found.set(document.$id, document);
    }
  }
  return [...found.values()];
}

export async function assertUniqueVarietyIdentity(variety, { excludeId = '', force = false } = {}) {
  const display = String(variety || '').trim();
  if (!display) throw new Error('Variety is required before creating or renaming a registry record.');
  const matches = await findCanonicalVarietyMatches(display, { excludeId, force });
  if (!matches.length) return true;
  const examples = matches.slice(0, 3).map((item) => item.variety || item.$id).join(', ');
  throw new Error(`Duplicate variety blocked: “${display}” matches ${matches.length} existing record${matches.length === 1 ? '' : 's'} (${examples}). Formatting differences such as spaces, hyphens, and capitalization are treated as the same variety.`);
}


async function loadImportIdentityIndex() {
  // Reuse the canonical duplicate-guard index. It selects only `variety`
  // (plus Appwrite system metadata such as $id), which is dramatically smaller
  // than the old import scan that downloaded every list-card field and provenance
  // column. Force a fresh read for import safety, then all workbook matching is local.
  return loadCanonicalIdentityIndex({ force: true });
}

function indexImportedCore(identityIndex, core) {
  addCoreToIdentityIndex(identityIndex, core);
}

function findImportMatches(variety, identityIndex) {
  const found = new Map();
  for (const key of varietyIdentityKeys(variety)) {
    for (const document of identityIndex.get(key) || []) found.set(document.$id, document);
  }
  return [...found.values()];
}

function mergeImportedValues(existing, incoming, { clearBlankCells = false } = {}) {
  const next = { ...existing };
  CHARACTERIZATION_FIELDS.forEach((field) => {
    if (!(field.key in incoming)) return;
    const value = String(incoming[field.key] ?? '').trim();
    if (value !== '' || clearBlankCells) next[field.key] = value;
  });
  // Keep the original live record provenance when updating. New records still
  // carry the workbook source metadata through bulkUpsertRecords below.
  return next;
}

export async function bulkUpsertRecords(rows, onProgress, { clearBlankCells = false } = {}) {
  let completed = 0;
  let created = 0;
  let updated = 0;
  const errors = [];

  const identityIndex = await loadImportIdentityIndex();

  // Sequential writes keep the import deterministic. Duplicate matching is now
  // local against the complete lean canonical identity index, so formatting
  // differences cannot accidentally create a second variety record.
  for (let index = 0; index < rows.length; index += 1) {
    const incoming = rows[index];
    try {
      const variety = String(incoming?.variety || '').trim();
      if (!variety) throw new Error('Variety is blank.');
      const matches = findImportMatches(variety, identityIndex);
      if (!matches.length) {
        const createdRecord = await saveRecord({ ...incoming, source_name: incoming.source_name || 'Excel import' }, '', null, { knownNew: true, skipDuplicateGuard: true });
        indexImportedCore(identityIndex, createdRecord);
        created += 1;
      } else if (matches.length === 1) {
        const core = matches[0];
        const previous = await getRecord(core.$id, { bypassCache: true });
        const merged = mergeImportedValues(previous, incoming, { clearBlankCells });
        const saved = await saveRecord(merged, core.$id, previous);
        indexImportedCore(identityIndex, saved);
        updated += 1;
      } else {
        throw new Error(`Duplicate conflict: ${matches.length} existing records already normalize to this variety. Run the duplicate audit before importing this row.`);
      }
    } catch (error) {
      errors.push({ index, variety: incoming?.variety || '', message: error?.message || String(error) });
    }
    completed += 1;
    onProgress?.({ done: completed, total: rows.length, errors: errors.length, created, updated });
  }
  clearListCache();
  return { imported: rows.length - errors.length, created, updated, errors };
}

export async function bulkCreateRecords(rows, onProgress) {
  // Backward-compatible alias. Older callers now inherit the duplicate-safe
  // canonical upsert behavior instead of blindly creating every workbook row.
  return bulkUpsertRecords(rows, onProgress);
}
