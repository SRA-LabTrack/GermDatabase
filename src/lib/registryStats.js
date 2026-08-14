import bundledCharacterization from '../../seed/characterization.json';
import { normalizeVarietyIdentity } from './legacyHyv';
import { listOfflineRecords } from './offlineSnapshot';

const STATS_EVENT = 'canesprout:registry-stats-changed';
const OVERRIDE_STORAGE_KEY = 'canesprout-registry-stat-overrides-v1';
const SRA_DEVELOPER = 'sugar regulatory administration';

const BUNDLED_RECORDS = Array.isArray(bundledCharacterization?.records)
  ? bundledCharacterization.records
  : [];

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value).toLowerCase().replace(/\s+/g, ' ');
}

function compactRecord(record = {}) {
  return {
    variety: text(record.variety),
    breeding_institution_developer_breeder: text(record.breeding_institution_developer_breeder),
    collection_scope: text(record.collection_scope)
  };
}

function readOverrides() {
  try {
    const parsed = JSON.parse(localStorage.getItem(OVERRIDE_STORAGE_KEY) || '{}');
    return {
      records: parsed?.records && typeof parsed.records === 'object' ? parsed.records : {},
      deleted: Array.isArray(parsed?.deleted) ? parsed.deleted : []
    };
  } catch {
    return { records: {}, deleted: [] };
  }
}

function writeOverrides(value) {
  try {
    localStorage.setItem(OVERRIDE_STORAGE_KEY, JSON.stringify({
      records: value?.records || {},
      deleted: Array.from(new Set(value?.deleted || [])),
      savedAt: Date.now()
    }));
  } catch {}
}

function notifyChanged() {
  try { window.dispatchEvent(new CustomEvent(STATS_EVENT)); } catch {}
}

function mergeRecord(existing = {}, incoming = {}) {
  const next = { ...existing };
  if ('variety' in incoming) next.variety = text(incoming.variety);
  if ('breeding_institution_developer_breeder' in incoming) {
    next.breeding_institution_developer_breeder = text(incoming.breeding_institution_developer_breeder);
  }
  if ('collection_scope' in incoming) next.collection_scope = text(incoming.collection_scope);
  return next;
}

function baselineIdentityMap() {
  const map = new Map();
  for (const source of BUNDLED_RECORDS) {
    const key = normalizeVarietyIdentity(source?.variety || '');
    if (!key) continue;
    const current = map.get(key) || {};
    // Historical duplicate observations count as one variety. When the same
    // identity appears more than once, fill missing dashboard attributes from
    // either observation instead of inflating the collection total.
    const merged = { ...current };
    const incoming = compactRecord(source);
    if (!text(merged.variety)) merged.variety = incoming.variety;
    if (!text(merged.breeding_institution_developer_breeder)) merged.breeding_institution_developer_breeder = incoming.breeding_institution_developer_breeder;
    if (!text(merged.collection_scope)) merged.collection_scope = incoming.collection_scope;
    map.set(key, merged);
  }
  return map;
}

function summarize(map) {
  let sraDeveloped = 0;
  let local = 0;

  for (const record of map.values()) {
    if (normalized(record.breeding_institution_developer_breeder) === SRA_DEVELOPER) sraDeveloped += 1;
    if (normalized(record.collection_scope) === 'local') local += 1;
  }

  // Per the dashboard definition, International Collection is every recorded
  // variety that is not classified as Local. This intentionally keeps the two
  // collection cards complementary: Local + International = Accession.
  const international = Math.max(0, map.size - local);

  return {
    accession: map.size,
    sraDeveloped,
    local,
    international,
    updatedAt: Date.now()
  };
}

export async function getRegistryStats() {
  const map = baselineIdentityMap();

  // Any live records already seen or saved on this device override the bundled
  // reference record. This adds newly registered varieties without a new cloud
  // scan and lets edits change category counts instantly.
  try {
    const snapshots = await listOfflineRecords();
    for (const record of snapshots || []) {
      const key = normalizeVarietyIdentity(record?.variety || '');
      if (!key) continue;
      map.set(key, mergeRecord(map.get(key) || {}, record));
    }
  } catch {}

  // Mutation overrides persist the dashboard effect of manual/Excel/offline
  // writes and deletes across reloads on this device. They are tiny local
  // metadata only, so the collection cards add zero Appwrite reads.
  const overrides = readOverrides();
  for (const [key, record] of Object.entries(overrides.records || {})) {
    if (!key) continue;
    map.set(key, mergeRecord(map.get(key) || {}, record));
  }
  for (const key of overrides.deleted || []) map.delete(key);

  return summarize(map);
}

export function rememberRegistryStatRecord(record, previous = null) {
  const key = normalizeVarietyIdentity(record?.variety || '');
  if (!key) return;

  const previousKey = normalizeVarietyIdentity(previous?.variety || '');
  const overrides = readOverrides();
  const deleted = new Set(overrides.deleted || []);

  if (previousKey && previousKey !== key) {
    delete overrides.records[previousKey];
    deleted.add(previousKey);
  }

  overrides.records[key] = compactRecord(record);
  deleted.delete(key);
  overrides.deleted = [...deleted];
  writeOverrides(overrides);
  notifyChanged();
}

export function rememberRegistryStatDelete(record) {
  const key = normalizeVarietyIdentity(record?.variety || '');
  if (!key) return;
  const overrides = readOverrides();
  delete overrides.records[key];
  const deleted = new Set(overrides.deleted || []);
  deleted.add(key);
  overrides.deleted = [...deleted];
  writeOverrides(overrides);
  notifyChanged();
}

export function subscribeRegistryStats(listener) {
  if (typeof window === 'undefined') return () => {};
  const handler = () => listener?.();
  window.addEventListener(STATS_EVENT, handler);
  return () => window.removeEventListener(STATS_EVENT, handler);
}
