import bundledRegistryVarieties from '../../seed/registry_varieties.json';
import bundledCombinationData from '../../seed/combination_runtime.json';
import bundledCharacterization from '../../seed/characterization.json';
import {
  COLLECTIONS,
  DATABASE_ID,
  Query,
  databases,
  withAppwriteFailover
} from './appwrite';
import { canonicalLegacyVariety, normalizeVarietyIdentity } from './legacyHyv';

const COMBINATION_PAGE_SIZE = 75;
const CATALOG_CACHE_MS = 60 * 60_000;
const HISTORY_CACHE_MS = 15 * 60_000;
const LIVE_TTL_SECONDS = 120;
const LOCAL_STORE_KEY = 'canesprout:combination-manual:v2';
const SYNC_BLOCK_KEY = 'canesprout:combination-sync-block:v1';
const SYNC_BLOCK_MS = 10 * 60_000;
const LOCAL_RECORD_LIMIT = 500;

let registryCatalogCache = { savedAt: 0, values: [] };
let searchCatalogCache = { savedAt: 0, values: [] };
const historyCache = new Map();

function text(value) {
  return String(value ?? '').trim();
}

function hasLocalStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function readJson(key, fallback) {
  if (!hasLocalStorage()) return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // The live Appwrite path still works if browser storage is unavailable.
  }
}

function oldCombinationKey(value) {
  const raw = text(value);
  if (!raw) return '';
  return normalizeVarietyIdentity(canonicalLegacyVariety(raw));
}

export function combinationVarietyKey(value) {
  const raw = text(value);
  if (!raw) return '';

  let canonical = canonicalLegacyVariety(raw);
  const rawNormalized = normalizeVarietyIdentity(raw);

  if (canonical === raw && rawNormalized && /^\d/.test(rawNormalized)) {
    const withPhil = `Phil ${raw}`;
    const legacyWithPhil = canonicalLegacyVariety(withPhil);
    if (legacyWithPhil !== withPhil) canonical = legacyWithPhil;
  }

  return normalizeVarietyIdentity(canonical).replace(/PHIL/g, '');
}

function combinationQueryKeys(value) {
  return [...new Set([
    combinationVarietyKey(value),
    oldCombinationKey(value)
  ].filter(Boolean))];
}

function setupError(error) {
  const code = Number(error?.code || error?.status || 0);
  const type = String(error?.type || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (code === 404 || type.includes('collection_not_found') || (message.includes('collection') && message.includes('not found'))) {
    const next = new Error('Combination Registry cloud storage is not set up yet. The record was kept locally. Run npm.cmd run setup:combinations once, then use Sync pending.');
    next.code = 'combination_setup_required';
    return next;
  }
  if (code === 401 || code === 403 || type.includes('unauthorized')) {
    const next = new Error('Appwrite rejected the Combination Registry write for this account. The record was kept locally. Verify the administrator label/collection permissions, then use Sync pending.');
    next.code = 'combination_permission_required';
    return next;
  }
  return error;
}

function sourceSeedRows() {
  return Array.isArray(bundledCombinationData?.records) ? bundledCombinationData.records : [];
}

function asBundledDocument(row) {
  return {
    ...row,
    $id: row.document_id || `seed:${row.source_hash || 'unknown'}`,
    $createdAt: '',
    $updatedAt: '',
    bundled_source: true,
    sync_state: 'bundled'
  };
}

function normalizedEventDate(row) {
  const date = text(row?.combination_date);
  if (date) return `date:${date}`;
  const raw = text(row?.source_date_text).replace(/\s+/g, ' ').toLocaleLowerCase();
  return `raw:${raw}`;
}

export function combinationEventIdentity(row, role = '') {
  const femaleKey = text(row?.female_key) || combinationVarietyKey(row?.female_variety);
  const maleKey = text(row?.male_key) || combinationVarietyKey(row?.male_variety);
  if (!femaleKey || !maleKey) return '';
  return `${femaleKey}|${maleKey}|${normalizedEventDate(row)}|${role}`;
}

function sourceCellRank(value) {
  const match = text(value).toLocaleUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let column = 0;
  for (const char of match[1]) column = (column * 26) + (char.charCodeAt(0) - 64);
  return (Number(match[2]) * 1000) + column;
}

function preferredDuplicateRow(current, candidate) {
  if (!current) return candidate;
  const currentSource = Boolean(text(current.source_hash));
  const candidateSource = Boolean(text(candidate.source_hash));

  // Workbook history is the audited source of truth when the same event also
  // appears in a stale cloud/manual mirror.
  if (candidateSource !== currentSource) return candidateSource ? candidate : current;

  // Prefer a local manual row over a generic cloud mirror for manual records so
  // pending/sync state and notes remain visible.
  if (!candidateSource) {
    if (candidate.local_manual && !current.local_manual) return candidate;
    if (current.local_manual && !candidate.local_manual) return current;
  }

  // For duplicated workbook cells, keep the earliest workbook position.
  if (candidateSource && currentSource) {
    const candidateRank = sourceCellRank(candidate.source_cell);
    const currentRank = sourceCellRank(current.source_cell);
    if (candidateRank < currentRank) return candidate;
    if (candidateRank > currentRank) return current;
  }

  // Prefer live/cloud over bundled when both represent the same canonical event.
  if (!candidate.bundled_source && current.bundled_source) return candidate;
  return current;
}

function mergeRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const role = row.query_role || '';
    const eventKey = combinationEventIdentity(row, role);
    if (!eventKey) continue;
    map.set(eventKey, preferredDuplicateRow(map.get(eventKey), row));
  }
  return [...map.values()];
}

function bundledCatalog() {
  const source = Array.isArray(bundledRegistryVarieties?.varieties) ? bundledRegistryVarieties.varieties : [];
  const map = new Map();
  for (const raw of source) {
    const variety = text(raw);
    const key = combinationVarietyKey(variety);
    if (variety && key && !map.has(key)) map.set(key, variety);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

function readLocalManualRecords() {
  const rows = readJson(LOCAL_STORE_KEY, []);
  return Array.isArray(rows) ? rows.filter((row) => row && row.$id) : [];
}

function writeLocalManualRecords(rows) {
  const cleaned = [...rows]
    .filter((row) => row && row.$id)
    .sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)));
  // Never discard unsynced creates or pending deletions. Only old synced browser mirrors are pruned.
  const pending = cleaned.filter((row) => row.sync_state === 'pending' || row.sync_state === 'delete_pending');
  const synced = cleaned.filter((row) => row.sync_state !== 'pending' && row.sync_state !== 'delete_pending');
  const keepSynced = Math.max(0, LOCAL_RECORD_LIMIT - pending.length);
  writeJson(LOCAL_STORE_KEY, [...pending, ...synced.slice(0, keepSynced)]);
}

function upsertLocalManualRecord(record) {
  const rows = readLocalManualRecords();
  const next = rows.filter((row) => row.$id !== record.$id);
  next.unshift(record);
  writeLocalManualRecords(next);
  historyCache.clear();
  return record;
}

function removeLocalManualRecord(recordId) {
  const id = text(recordId);
  if (!id) return;
  writeLocalManualRecords(readLocalManualRecords().filter((row) => row.$id !== id));
  historyCache.clear();
}

function currentSyncBlock() {
  const block = readJson(SYNC_BLOCK_KEY, null);
  if (!block || !block.savedAt || Date.now() - Number(block.savedAt) > SYNC_BLOCK_MS) return null;
  return block;
}

function setSyncBlock(error) {
  writeJson(SYNC_BLOCK_KEY, {
    savedAt: Date.now(),
    message: text(setupError(error)?.message || error?.message || 'Appwrite sync unavailable')
  });
}

function clearSyncBlock() {
  if (!hasLocalStorage()) return;
  try { window.localStorage.removeItem(SYNC_BLOCK_KEY); } catch {}
}

export function getPendingCombinationCount() {
  return readLocalManualRecords().filter((row) => row.sync_state === 'pending' || row.sync_state === 'delete_pending').length;
}

export function getPendingCombinationDeleteCount() {
  return readLocalManualRecords().filter((row) => row.sync_state === 'delete_pending').length;
}

export function getCombinationSyncStatus() {
  return {
    pending: getPendingCombinationCount(),
    blocked: currentSyncBlock()
  };
}

async function listRegistryVarieties({ force = false } = {}) {
  if (!force && registryCatalogCache.values.length && Date.now() - registryCatalogCache.savedAt < CATALOG_CACHE_MS) {
    return registryCatalogCache.values;
  }

  const values = [];
  let cursor = '';
  while (true) {
    const queries = [Query.limit(100), Query.orderAsc('$id'), Query.select(['variety'])];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.records,
      queries,
      total: false,
      ttl: 600
    }), { timeoutMs: 8000 });
    const batch = page.documents || [];
    values.push(...batch.map((item) => text(item.variety)).filter(Boolean));
    if (batch.length < 100) break;
    cursor = batch.at(-1)?.$id || '';
    if (!cursor) break;
  }

  const map = new Map();
  for (const variety of values) {
    const key = combinationVarietyKey(variety);
    if (key && !map.has(key)) map.set(key, variety);
  }
  const sorted = [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  registryCatalogCache = { savedAt: Date.now(), values: sorted };
  return sorted;
}

export async function refreshCombinationVarietiesFromLive() {
  const live = await listRegistryVarieties({ force: true });
  searchCatalogCache = { savedAt: 0, values: [] };
  const merged = await listCombinationVarieties({ force: true });
  return { liveCount: live.length, values: merged };
}

export async function listCombinationVarieties({ force = false } = {}) {
  if (!force && searchCatalogCache.values.length && Date.now() - searchCatalogCache.savedAt < CATALOG_CACHE_MS) {
    return searchCatalogCache.values;
  }

  const source = Array.isArray(bundledCombinationData?.search_catalog) ? bundledCombinationData.search_catalog : [];
  const registry = [...bundledCatalog(), ...registryCatalogCache.values];
  const seen = new Set();
  const values = [];
  for (const variety of [...registry, ...source]) {
    const label = text(variety);
    const exact = label.toLocaleUpperCase();
    if (!label || seen.has(exact)) continue;
    seen.add(exact);
    values.push(label);
  }
  values.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  searchCatalogCache = { savedAt: Date.now(), values };
  return values;
}

export function combinationSuggestions(catalog, value, limit = 12) {
  const raw = text(value);
  if (raw.length < 2) return [];
  const needle = raw.toLocaleLowerCase();
  const keyNeedle = combinationVarietyKey(raw);
  const starts = [];
  const contains = [];
  for (const item of Array.isArray(catalog) ? catalog : []) {
    const label = text(item);
    const lower = label.toLocaleLowerCase();
    const key = combinationVarietyKey(label);
    if (lower === needle || key === keyNeedle) starts.unshift(label);
    else if (lower.startsWith(needle) || (keyNeedle && key.startsWith(keyNeedle))) starts.push(label);
    else if (lower.includes(needle) || (keyNeedle && key.includes(keyNeedle))) contains.push(label);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}


const BREEDING_REUSE_YEARS = 5;
const BREEDING_PEDIGREE_DEPTH = 3;

let breedingPedigreeIndexCache = null;

function recordedParent(value) {
  const raw = text(value);
  if (!raw) return '';

  const normalized = raw
    .toLocaleLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (
    !normalized ||
    normalized === 'unknown' ||
    normalized === 'not recorded' ||
    normalized === 'not available' ||
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized === 'none' ||
    normalized === 'nil' ||
    normalized === '?' ||
    normalized === '0'
  ) return '';

  return raw;
}

function pedigreeRecordScore(record) {
  return (
    (recordedParent(record?.parentage_female) ? 2 : 0) +
    (recordedParent(record?.parentage_male) ? 2 : 0)
  );
}

function breedingPedigreeIndex() {
  if (breedingPedigreeIndexCache) return breedingPedigreeIndexCache;

  const index = new Map();
  const records = Array.isArray(bundledCharacterization?.records)
    ? bundledCharacterization.records
    : [];

  for (const record of records) {
    const variety = text(record?.variety);
    const key = combinationVarietyKey(variety);
    if (!key || !variety) continue;

    const candidate = {
      key,
      variety,
      femaleParent: recordedParent(record?.parentage_female),
      maleParent: recordedParent(record?.parentage_male),
      score: pedigreeRecordScore(record)
    };

    const current = index.get(key);
    if (!current || candidate.score > current.score) index.set(key, candidate);
  }

  breedingPedigreeIndexCache = index;
  return index;
}

function recordedAncestors(index, startKey, maxDepth = BREEDING_PEDIGREE_DEPTH) {
  const ancestors = new Map();
  const queue = [{ key: startKey, depth: 0 }];
  const expandedDepth = new Map();

  while (queue.length) {
    const current = queue.shift();
    if (!current?.key || current.depth >= maxDepth) continue;

    const previousExpandedDepth = expandedDepth.get(current.key);
    if (previousExpandedDepth != null && previousExpandedDepth <= current.depth) continue;
    expandedDepth.set(current.key, current.depth);

    const record = index.get(current.key);
    if (!record) continue;

    for (const parentLabel of [record.femaleParent, record.maleParent]) {
      const label = recordedParent(parentLabel);
      const parentKey = combinationVarietyKey(label);
      if (!parentKey || parentKey === current.key) continue;

      const depth = current.depth + 1;
      const known = ancestors.get(parentKey);

      if (!known || depth < known.depth) {
        ancestors.set(parentKey, {
          key: parentKey,
          variety: label,
          depth
        });
      }

      if (depth < maxDepth) queue.push({ key: parentKey, depth });
    }
  }

  return ancestors;
}

function sharedRecordedAncestor(left, right) {
  for (const [key, leftMeta] of left.entries()) {
    const rightMeta = right.get(key);
    if (!rightMeta) continue;

    return {
      key,
      leftDepth: leftMeta.depth,
      rightDepth: rightMeta.depth
    };
  }

  return null;
}

function validDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  if (!Number.isInteger(y) || y < 1800 || y > 2100) return null;
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;

  const value = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  if (
    value.getUTCFullYear() !== y ||
    value.getUTCMonth() !== m - 1 ||
    value.getUTCDate() !== d
  ) return null;

  return value;
}

function sourceTextDate(value) {
  const raw = text(value);
  if (!raw) return null;

  const normalized = raw
    .replace(/\./g, '')
    .replace(/(\d),(\d)/g, '$1, $2')
    .replace(/\s+/g, ' ')
    .trim();

  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed)) {
    const value = new Date(parsed);
    if (
      Number.isFinite(value.getTime()) &&
      value.getUTCFullYear() >= 1800 &&
      value.getUTCFullYear() <= 2100
    ) {
      return value;
    }
  }

  const numeric = normalized.match(/\b((?:18|19|20)\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (numeric) return validDateParts(numeric[1], numeric[2], numeric[3]);

  const yearOnly = normalized.match(/\b((?:18|19|20)\d{2})\b/);
  if (yearOnly) {
    // Conservative fallback: an imprecise year is treated as Dec 31 so the
    // system does not declare the full 5-year interval complete too early.
    return new Date(Date.UTC(Number(yearOnly[1]), 11, 31, 12, 0, 0));
  }

  return null;
}

function recordedCombinationDate(row) {
  // Workbook source text is preferred because historical imports may have a
  // normalized combination_date that does not preserve the original year.
  const sourceDate = sourceTextDate(row?.source_date_text);
  if (sourceDate) return sourceDate;

  const iso = text(row?.combination_date);
  const match = iso.match(/^((?:18|19|20)\d{2})-(\d{2})-(\d{2})$/);
  if (match) return validDateParts(match[1], match[2], match[3]);

  return sourceTextDate(iso);
}

function roleAwarePairHistory(selectedKey, selectedRole) {
  const role = selectedRole === 'female' ? 'female' : 'male';
  const pairs = new Map();

  const sourceRows = sourceSeedRows();
  const localRows = readLocalManualRecords()
    .filter((row) => !row.deleted_local && row.sync_state !== 'delete_pending');

  for (const row of [...sourceRows, ...localRows]) {
    const maleKey = text(row?.male_key) || combinationVarietyKey(row?.male_variety);
    const femaleKey = text(row?.female_key) || combinationVarietyKey(row?.female_variety);

    let counterpartKey = '';

    if (role === 'male' && maleKey === selectedKey) counterpartKey = femaleKey;
    if (role === 'female' && femaleKey === selectedKey) counterpartKey = maleKey;

    if (!counterpartKey || counterpartKey === selectedKey) continue;

    const current = pairs.get(counterpartKey) || {
      hasRecordedCross: false,
      hasUndatedCross: false,
      latestDate: null
    };

    current.hasRecordedCross = true;

    const date = recordedCombinationDate(row);
    if (!date) {
      current.hasUndatedCross = true;
    } else if (!current.latestDate || date > current.latestDate) {
      current.latestDate = date;
    }

    pairs.set(counterpartKey, current);
  }

  return pairs;
}

function subtractCalendarYears(date, years) {
  const value = new Date(date.getTime());
  const originalMonth = value.getUTCMonth();

  value.setUTCFullYear(value.getUTCFullYear() - years);

  // Feb 29 -> Feb 28 when the target year is not leap.
  if (value.getUTCMonth() !== originalMonth) {
    value.setUTCDate(0);
  }

  return value;
}

function fullYearsSince(earlier, later = new Date()) {
  if (!(earlier instanceof Date) || !Number.isFinite(earlier.getTime())) return 0;

  let years = later.getUTCFullYear() - earlier.getUTCFullYear();
  const anniversary = new Date(earlier.getTime());
  anniversary.setUTCFullYear(later.getUTCFullYear());

  if (anniversary > later) years -= 1;
  return Math.max(0, years);
}

function shortCombinationDate(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return '';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

export function breedingPartnerSuggestions(selectedVariety, selectedRole = 'male') {
  const query = text(selectedVariety);
  const role = selectedRole === 'female' ? 'female' : 'male';
  const counterpartRole = role === 'male' ? 'female' : 'male';

  if (!query) {
    return {
      query: '',
      selectedRole: role,
      counterpartRole,
      suggestions: [],
      total: 0
    };
  }

  const selectedKey = combinationVarietyKey(query);
  const catalogMap = new Map();

  for (const variety of [...bundledCatalog(), ...registryCatalogCache.values]) {
    const label = text(variety);
    const key = combinationVarietyKey(label);
    if (label && key && !catalogMap.has(key)) catalogMap.set(key, label);
  }

  const selectedLabel = catalogMap.get(selectedKey) || query;
  const pedigreeIndex = breedingPedigreeIndex();
  const selectedAncestors = recordedAncestors(pedigreeIndex, selectedKey);
  const pairHistoryByCandidate = roleAwarePairHistory(selectedKey, role);

  const now = new Date();
  const cutoff = subtractCalendarYears(now, BREEDING_REUSE_YEARS);
  const suggestions = [];

  for (const [candidateKey, candidateLabel] of catalogMap.entries()) {
    if (!candidateKey || candidateKey === selectedKey) continue;

    const candidateAncestors = recordedAncestors(pedigreeIndex, candidateKey);

    // Exclude every known direct relationship that can be traced in the
    // current registry through three generations.
    if (selectedAncestors.has(candidateKey)) continue;
    if (candidateAncestors.has(selectedKey)) continue;
    if (sharedRecordedAncestor(selectedAncestors, candidateAncestors)) continue;

    const pairHistory = pairHistoryByCandidate.get(candidateKey);

    // A recorded cross with no verifiable date cannot prove the requested
    // five-year gap, so it is conservatively excluded.
    if (pairHistory?.hasUndatedCross) continue;

    // Exact same role pairing must be at least five calendar years old.
    if (pairHistory?.latestDate && pairHistory.latestDate > cutoff) continue;

    const neverCombined = !pairHistory?.hasRecordedCross;
    const yearsSinceCross = pairHistory?.latestDate
      ? fullYearsSince(pairHistory.latestDate, now)
      : 0;

    const pedigreeEvidenceCount =
      selectedAncestors.size + candidateAncestors.size;

    suggestions.push({
      key: candidateKey,
      variety: candidateLabel,
      neverCombined,
      lastCrossDate: pairHistory?.latestDate
        ? pairHistory.latestDate.toISOString().slice(0, 10)
        : '',
      lastCrossLabel: pairHistory?.latestDate
        ? shortCombinationDate(pairHistory.latestDate)
        : '',
      yearsSinceCross,
      pedigreeEvidence:
        selectedAncestors.size > 0 && candidateAncestors.size > 0
          ? 'recorded'
          : 'limited',
      pedigreeEvidenceCount
    });
  }

  suggestions.sort((a, b) => {
    // Prefer combinations that have never been recorded in this role.
    if (a.neverCombined !== b.neverCombined) return a.neverCombined ? -1 : 1;

    // Then prefer candidates with more recorded pedigree evidence.
    const byPedigree = b.pedigreeEvidenceCount - a.pedigreeEvidenceCount;
    if (byPedigree) return byPedigree;

    // For previously used pairings, older last crosses come first.
    const byGap = b.yearsSinceCross - a.yearsSinceCross;
    if (byGap) return byGap;

    return a.variety.localeCompare(
      b.variety,
      undefined,
      { sensitivity: 'base', numeric: true }
    );
  });

  return {
    query,
    selectedKey,
    selectedVariety: selectedLabel,
    selectedRole: role,
    counterpartRole,
    reuseYears: BREEDING_REUSE_YEARS,
    pedigreeDepth: BREEDING_PEDIGREE_DEPTH,
    suggestions,
    total: suggestions.length
  };
}


async function listLiveDocuments(attribute, keyVariants) {
  if (!keyVariants.length) return [];
  const documents = [];
  let cursor = '';
  while (true) {
    const queries = [
      Query.limit(COMBINATION_PAGE_SIZE),
      Query.orderAsc('$id'),
      Query.equal(attribute, keyVariants),
      Query.select([
        'male_variety', 'male_key',
        'female_variety', 'female_key',
        'combination_date', 'source_date_text',
        'notes', 'source_workbook', 'source_sheet',
        'source_row', 'source_column', 'source_cell', 'source_hash',
        'date_status', 'created_by', 'created_by_name', 'created_at'
      ])
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.combinations,
      queries,
      total: false,
      ttl: LIVE_TTL_SECONDS
    }), { timeoutMs: 8000 });
    const batch = page.documents || [];
    documents.push(...batch);
    if (batch.length < COMBINATION_PAGE_SIZE) break;
    cursor = batch.at(-1)?.$id || '';
    if (!cursor) break;
  }
  return documents;
}

function bundledHistoryForKey(keyVariants, role) {
  const keys = new Set(keyVariants);
  const rows = [];
  for (const sourceRow of sourceSeedRows()) {
    if ((role === 'both' || role === 'male') && keys.has(text(sourceRow.male_key))) {
      rows.push({
        ...asBundledDocument(sourceRow),
        query_role: 'male',
        counterpart_role: 'female',
        counterpart_variety: sourceRow.female_variety
      });
    }
    if ((role === 'both' || role === 'female') && keys.has(text(sourceRow.female_key))) {
      rows.push({
        ...asBundledDocument(sourceRow),
        query_role: 'female',
        counterpart_role: 'male',
        counterpart_variety: sourceRow.male_variety
      });
    }
  }
  return rows;
}

function localHistoryForKey(keyVariants, role) {
  const keys = new Set(keyVariants);
  const rows = [];
  for (const row of readLocalManualRecords()) {
    if (row.deleted_local || row.sync_state === 'delete_pending') continue;
    if ((role === 'both' || role === 'male') && keys.has(text(row.male_key))) {
      rows.push({
        ...row,
        query_role: 'male',
        counterpart_role: 'female',
        counterpart_variety: row.female_variety
      });
    }
    if ((role === 'both' || role === 'female') && keys.has(text(row.female_key))) {
      rows.push({
        ...row,
        query_role: 'female',
        counterpart_role: 'male',
        counterpart_variety: row.male_variety
      });
    }
  }
  return rows;
}

function dateSortValue(row) {
  const iso = text(row?.combination_date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const created = text(row?.created_at || row?.$createdAt);
  return /^\d{4}-\d{2}-\d{2}/.test(created) ? created.slice(0, 10) : '0000-00-00';
}

function mapLiveRows(rows, queryRole) {
  return rows.map((row) => ({
    ...row,
    query_role: queryRole,
    counterpart_role: queryRole === 'male' ? 'female' : 'male',
    counterpart_variety: queryRole === 'male' ? row.female_variety : row.male_variety,
    sync_state: 'synced'
  }));
}

export async function listCombinationHistory(variety, { role = 'both', force = false, includeLive = false } = {}) {
  const keyVariants = combinationQueryKeys(variety);
  if (!keyVariants.length) return [];

  const cacheKey = `${includeLive ? 'live' : 'local'}:${role}:${keyVariants.join('|')}`;
  const cached = historyCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.savedAt < HISTORY_CACHE_MS) return cached.rows;

  const localRows = localHistoryForKey(keyVariants, role);
  const bundledRows = bundledHistoryForKey(keyVariants, role);
  let liveRows = [];

  if (includeLive) {
    const liveTasks = [];
    if (role === 'both' || role === 'male') {
      liveTasks.push(listLiveDocuments('male_key', keyVariants).then((rows) => mapLiveRows(rows, 'male')));
    }
    if (role === 'both' || role === 'female') {
      liveTasks.push(listLiveDocuments('female_key', keyVariants).then((rows) => mapLiveRows(rows, 'female')));
    }
    try {
      liveRows = (await Promise.all(liveTasks)).flat();
      clearSyncBlock();
    } catch {
      // Local + audited workbook history intentionally remains usable if Appwrite is unavailable.
    }
  }

  const deletedManualIds = new Set(
    readLocalManualRecords()
      .filter((row) => row.deleted_local || row.sync_state === 'delete_pending')
      .map((row) => row.$id)
      .filter(Boolean)
  );
  const visibleLiveRows = liveRows.filter((row) => !deletedManualIds.has(row.$id));

  const rows = mergeRows([...bundledRows, ...localRows, ...visibleLiveRows]).sort((a, b) => {
    const byDate = dateSortValue(b).localeCompare(dateSortValue(a));
    if (byDate) return byDate;
    const bySheet = text(a.source_sheet).localeCompare(text(b.source_sheet), undefined, { sensitivity: 'base', numeric: true });
    if (bySheet) return bySheet;
    return text(a.counterpart_variety).localeCompare(text(b.counterpart_variety), undefined, { sensitivity: 'base', numeric: true });
  });
  historyCache.set(cacheKey, { savedAt: Date.now(), rows });
  return rows;
}

async function resolveSearchVariety(value) {
  const requested = text(value);
  if (!requested) return '';

  const catalog = await listCombinationVarieties();
  const requestedKey = combinationVarietyKey(requested);
  if (!requestedKey) return requested;

  const exactKeyMatches = catalog.filter((item) => combinationVarietyKey(item) === requestedKey);
  if (exactKeyMatches.length) {
    const exactText = exactKeyMatches.find((item) => item.localeCompare(requested, undefined, { sensitivity: 'base' }) === 0);
    return exactText || exactKeyMatches[0];
  }

  if (requestedKey.length >= 4) {
    const partial = catalog.filter((item) => {
      const key = combinationVarietyKey(item);
      return key && (key.includes(requestedKey) || requestedKey.includes(key));
    });
    if (partial.length === 1) return partial[0];
  }

  return requested;
}

export async function buildCombinationSearchResults(variety, { role = 'both', includeLive = false, force = false } = {}) {
  const selected = await resolveSearchVariety(variety);
  const selectedKey = combinationVarietyKey(selected);
  if (!selectedKey) return { selectedVariety: '', history: [], combinedKeys: new Set(), notCombined: [], catalog: [], includeLive };

  const history = await listCombinationHistory(selected, { role, includeLive, force });
  const registryMap = new Map();
  for (const candidate of [...bundledCatalog(), ...registryCatalogCache.values]) {
    const key = combinationVarietyKey(candidate);
    if (key && !registryMap.has(key)) registryMap.set(key, candidate);
  }
  const registryCatalog = [...registryMap.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));

  const combinedKeys = new Set(history.map((row) => combinationVarietyKey(row.counterpart_variety)).filter(Boolean));
  const notCombined = registryCatalog.filter((candidate) => {
    const key = combinationVarietyKey(candidate);
    return key && key !== selectedKey && !combinedKeys.has(key);
  });

  return {
    selectedVariety: selected,
    history,
    combinedKeys,
    notCombined,
    catalog: registryCatalog,
    includeLive
  };
}

function resolveRegistryVarietyLocal(value) {
  const requested = text(value);
  if (!requested) throw new Error('Select a sugarcane variety from the registry.');
  const requestedKey = combinationVarietyKey(requested);
  const catalog = [...bundledCatalog(), ...registryCatalogCache.values];
  const matches = catalog.filter((candidate) => combinationVarietyKey(candidate) === requestedKey);
  if (!matches.length) {
    throw new Error(`“${requested}” is not in the local germplasm catalog. If it was added recently, click Refresh latest varieties once, then record the combination again.`);
  }
  const exactText = matches.find((item) => item.localeCompare(requested, undefined, { sensitivity: 'base' }) === 0);
  return exactText || matches[0];
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function manualDocumentId(maleKey, femaleKey, date) {
  const identity = `${maleKey}|${femaleKey}|${date}`;
  return `cmbm_${fnv1a(identity)}${fnv1a([...identity].reverse().join(''))}`;
}

function schemaPayload(record) {
  return {
    male_variety: text(record.male_variety).slice(0, 255),
    male_key: text(record.male_key).slice(0, 255),
    female_variety: text(record.female_variety).slice(0, 255),
    female_key: text(record.female_key).slice(0, 255),
    combination_date: text(record.combination_date).slice(0, 32),
    source_date_text: '',
    date_status: 'manual',
    notes: text(record.notes).slice(0, 1000),
    created_by: text(record.created_by).slice(0, 36),
    created_by_name: text(record.created_by_name).slice(0, 128),
    created_at: text(record.created_at).slice(0, 32),
    source_workbook: '',
    source_sheet: '',
    source_row: '',
    source_column: '',
    source_cell: '',
    source_hash: '',
    search_text: `${record.male_variety} ${record.female_variety} ${record.combination_date} ${text(record.notes)}`.replace(/\s+/g, ' ').trim().slice(0, 1024)
  };
}

function isConflict(error) {
  return Number(error?.code || error?.status || 0) === 409;
}

async function writeManualToAppwrite(record) {
  try {
    const created = await databases.createDocument({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.combinations,
      documentId: record.$id,
      data: schemaPayload(record)
    });
    clearSyncBlock();
    return created;
  } catch (error) {
    if (isConflict(error)) {
      clearSyncBlock();
      return { ...record, sync_state: 'synced', already_exists: true };
    }
    throw setupError(error);
  }
}

function duplicateInBundled(maleKey, femaleKey, date) {
  return sourceSeedRows().some((row) =>
    text(row.male_key) === maleKey &&
    text(row.female_key) === femaleKey &&
    text(row.combination_date) === date
  );
}

export async function createCombination({ maleVariety, femaleVariety, combinationDate, notes = '' }, actor = {}) {
  const male = resolveRegistryVarietyLocal(maleVariety);
  const female = resolveRegistryVarietyLocal(femaleVariety);
  const maleKey = combinationVarietyKey(male);
  const femaleKey = combinationVarietyKey(female);
  if (!maleKey || !femaleKey) throw new Error('Both male and female varieties are required.');
  if (maleKey === femaleKey) throw new Error('Male and female varieties must be different registry varieties.');

  const date = text(combinationDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('A valid combination date is required.');

  const documentId = manualDocumentId(maleKey, femaleKey, date);
  if (readLocalManualRecords().some((row) => row.$id === documentId) || duplicateInBundled(maleKey, femaleKey, date)) {
    throw new Error(`${male} × ${female} is already recorded for ${date}.`);
  }

  const record = {
    $id: documentId,
    male_variety: male,
    male_key: maleKey,
    female_variety: female,
    female_key: femaleKey,
    combination_date: date,
    source_date_text: '',
    date_status: 'manual',
    notes: text(notes).slice(0, 1000),
    created_by: text(actor?.id || actor?.$id),
    created_by_name: text(actor?.name || actor?.email || 'Administrator'),
    created_at: new Date().toISOString().slice(0, 32),
    source_workbook: '',
    source_sheet: '',
    source_row: '',
    source_column: '',
    source_cell: '',
    source_hash: '',
    local_manual: true,
    sync_state: 'pending'
  };

  // Local-first: the operator gets an immediate successful record even if Appwrite
  // is temporarily offline or the combination collection has not been migrated yet.
  upsertLocalManualRecord(record);

  const block = currentSyncBlock();
  if (block) {
    return { ...record, sync_pending: true, sync_attempted: false, sync_error: block.message };
  }

  try {
    const created = await writeManualToAppwrite(record);
    const synced = upsertLocalManualRecord({ ...record, ...created, $id: documentId, local_manual: true, sync_state: 'synced' });
    return { ...synced, sync_pending: false, sync_attempted: true };
  } catch (error) {
    setSyncBlock(error);
    upsertLocalManualRecord({ ...record, sync_state: 'pending', sync_error: text(error?.message) });
    return { ...record, sync_pending: true, sync_attempted: true, sync_error: text(error?.message) };
  }
}

export async function syncPendingCombinations({ limit = 5 } = {}) {
  const pending = readLocalManualRecords().filter((row) => row.sync_state === 'pending' || row.sync_state === 'delete_pending');
  const batch = pending.slice(0, Math.max(1, Math.min(10, Number(limit) || 5)));
  let synced = 0;
  let deleted = 0;
  let failed = 0;
  let lastError = '';

  // Explicit sync bypasses the temporary failure block, but stops after the first
  // backend failure so one bad configuration never produces a request storm.
  clearSyncBlock();
  for (const record of batch) {
    try {
      if (record.sync_state === 'delete_pending') {
        try {
          await databases.deleteDocument({
            databaseId: DATABASE_ID,
            collectionId: COLLECTIONS.combinations,
            documentId: record.$id
          });
        } catch (error) {
          if (Number(error?.code || error?.status || 0) !== 404) throw error;
        }
        removeLocalManualRecord(record.$id);
        deleted += 1;
      } else {
        const created = await writeManualToAppwrite(record);
        upsertLocalManualRecord({ ...record, ...created, $id: record.$id, local_manual: true, sync_state: 'synced', sync_error: '' });
        synced += 1;
      }
    } catch (error) {
      failed += 1;
      lastError = text(setupError(error)?.message || error?.message || error);
      setSyncBlock(error);
      upsertLocalManualRecord({ ...record, sync_error: lastError });
      break;
    }
  }

  return {
    attempted: synced + deleted + failed,
    synced,
    deleted,
    failed,
    pending: getPendingCombinationCount(),
    lastError
  };
}

export async function listRegisteredManualCombinations({ includeCloud = false, limit = 50 } = {}) {
  const localRows = readLocalManualRecords().map((row) => ({
    ...row,
    local_manual: true
  }));

  if (!includeCloud) {
    return localRows.sort((a, b) => dateSortValue(b).localeCompare(dateSortValue(a)));
  }

  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  let cloudRows = [];
  try {
    const page = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.combinations,
      queries: [
        Query.equal('source_hash', ['']),
        Query.orderDesc('$createdAt'),
        Query.limit(safeLimit),
        Query.select([
          'male_variety', 'male_key',
          'female_variety', 'female_key',
          'combination_date', 'source_date_text',
          'notes', 'created_by', 'created_by_name', 'created_at',
          'source_hash'
        ])
      ],
      total: false,
      ttl: LIVE_TTL_SECONDS
    }), { timeoutMs: 8000 });
    cloudRows = (page.documents || []).map((row) => ({
      ...row,
      local_manual: true,
      sync_state: 'synced'
    }));
  } catch (error) {
    throw setupError(error);
  }

  const merged = new Map();
  for (const row of cloudRows) merged.set(row.$id, row);
  for (const row of localRows) merged.set(row.$id, { ...merged.get(row.$id), ...row });

  return [...merged.values()]
    .sort((a, b) => dateSortValue(b).localeCompare(dateSortValue(a)))
    .slice(0, Math.max(safeLimit, localRows.length));
}

export async function deleteCombination(recordOrId) {
  const record = typeof recordOrId === 'object' && recordOrId ? recordOrId : null;
  const id = text(record?.$id || recordOrId);
  if (!id) return { deleted: false };

  const local = readLocalManualRecords().find((row) => row.$id === id);
  const source = local || record || { $id: id };

  // Never delete audited workbook history through the UI.
  if (text(source.source_hash)) {
    const error = new Error('Workbook-source combination records are protected and cannot be deleted from CaneSprout.');
    error.code = 'combination_source_protected';
    throw error;
  }

  // A create that never reached Appwrite can be removed locally with zero backend requests.
  if (source.sync_state === 'pending') {
    removeLocalManualRecord(id);
    return { deleted: true, localOnly: true, deletePending: false };
  }

  // Local-first tombstone prevents the record from reappearing while a cloud delete is pending.
  const tombstone = upsertLocalManualRecord({
    ...source,
    $id: id,
    local_manual: true,
    deleted_local: true,
    sync_state: 'delete_pending',
    delete_requested_at: new Date().toISOString().slice(0, 32)
  });

  const block = currentSyncBlock();
  if (block) {
    return { deleted: true, localOnly: false, deletePending: true, sync_error: block.message };
  }

  try {
    try {
      await databases.deleteDocument({
        databaseId: DATABASE_ID,
        collectionId: COLLECTIONS.combinations,
        documentId: id
      });
    } catch (error) {
      if (Number(error?.code || error?.status || 0) !== 404) throw error;
    }
    removeLocalManualRecord(id);
    historyCache.clear();
    clearSyncBlock();
    return { deleted: true, localOnly: false, deletePending: false };
  } catch (error) {
    const nextError = setupError(error);
    setSyncBlock(nextError);
    upsertLocalManualRecord({ ...tombstone, sync_error: text(nextError?.message || error?.message) });
    return { deleted: true, localOnly: false, deletePending: true, sync_error: text(nextError?.message || error?.message) };
  }
}

export function combinationSourceSummary() {
  return bundledCombinationData?.metadata || {};
}
