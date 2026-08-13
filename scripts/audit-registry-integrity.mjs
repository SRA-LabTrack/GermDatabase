import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client, Databases, Query } from 'node-appwrite';

function loadDotEnv(file = '.env') {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^[\'\"]|[\'\"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const endpoint = String(process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1').trim().replace(/\/$/, '');
const fallbackEndpoint = String(process.env.APPWRITE_FALLBACK_ENDPOINT || process.env.VITE_APPWRITE_FALLBACK_ENDPOINT || 'https://cloud.appwrite.io/v1').trim().replace(/\/$/, '');
const projectId = String(process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b').trim();
const databaseId = String(process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase').trim();
const apiKey = String(process.env.APPWRITE_API_KEY || '').trim();
const coreCollection = 'sugarcane_registry_core';
const detailsCollection = 'sugarcane_registry_details';

if (!apiKey) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Use a temporary Appwrite server key with database document READ access only, then revoke it after the audit.\n');
  process.exit(1);
}

const endpoints = [...new Set([endpoint, fallbackEndpoint].filter(Boolean))];
const clients = new Map(endpoints.map((ep) => [ep, new Databases(new Client().setEndpoint(ep).setProject(projectId).setKey(apiKey))]));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function statusCode(error) { return Number(error?.code || error?.status || error?.response?.status || 0); }
function isRetryable(error) {
  const code = statusCode(error);
  if (code === 429 || code === 408 || code >= 500) return true;
  if (code >= 400) return false;
  const text = [error?.message, error?.cause?.message, error?.cause?.code, error?.code].filter(Boolean).join(' ').toLowerCase();
  return !text || /fetch failed|timeout|timed out|econnreset|econnrefused|enotfound|socket|network|und_err|connection/.test(text);
}
async function readWithRetry(label, operation) {
  let lastError;
  for (const ep of endpoints) {
    const db = clients.get(ep);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try { return await operation(db); }
      catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
        if (attempt < 5) await sleep(Math.min(5000, 450 * (2 ** (attempt - 1))));
      }
    }
    console.warn(`  ↳ ${label}: switching endpoint after repeated transient errors`);
  }
  throw lastError || new Error(`${label} failed`);
}

function canonicalVariety(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase().replace(/PHILIPPINES/g, 'PHIL').replace(/[^A-Z0-9]+/g, '');
}
function displayKey(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
}
function numericTokenKey(value) {
  const normalized = String(value || '').normalize('NFKC').trim().toUpperCase().replace(/PHILIPPINES/g, 'PHIL');
  const tokens = normalized.match(/[A-Z]+|\d+/g) || [];
  return tokens.map((token) => /^\d+$/.test(token) ? String(Number.parseInt(token, 10)) : token).join('|');
}
function normalizeValue(value) {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
}
function parseObject(value) {
  if (!value) return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, value: {} };
    return { ok: true, value: parsed };
  } catch { return { ok: false, value: {} }; }
}
function addGroup(map, key, value) {
  if (!key) return;
  const rows = map.get(key) || [];
  rows.push(value);
  map.set(key, rows);
}
async function fetchAll(collectionId, select = []) {
  const docs = [];
  let cursor = '';
  while (true) {
    const queries = [Query.limit(100), Query.orderAsc('$id')];
    if (select.length) queries.push(Query.select(select));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await readWithRetry(`read ${collectionId} page after ${cursor || 'start'}`, (db) => db.listDocuments({
      databaseId,
      collectionId,
      queries,
      total: false
    }));
    const batch = page.documents || [];
    docs.push(...batch);
    if (batch.length < 100) break;
    cursor = batch.at(-1)?.$id || '';
    if (!cursor) break;
  }
  return docs;
}

function compareDuplicateGroup(rows, detailMap) {
  const traitValues = new Map();
  const coreFields = ['stool_plant_habit', 'leaf_color', 'stalk_exposed_color', 'bud_shape', 'germ_trial_code', 'germ_location', 'germ_status', 'germination_pct'];
  const coreConflicts = [];
  const traitConflicts = [];
  const invalidDetails = [];

  for (const field of coreFields) {
    const values = [...new Set(rows.map((row) => normalizeValue(row[field])).filter(Boolean))];
    if (values.length > 1) coreConflicts.push({ field, values });
  }

  for (const row of rows) {
    const detail = detailMap.get(row.$id);
    if (!detail) continue;
    const parsed = parseObject(detail.traits_json);
    if (!parsed.ok) {
      invalidDetails.push(row.$id);
      continue;
    }
    for (const [key, raw] of Object.entries(parsed.value)) {
      const value = normalizeValue(raw);
      if (!value || key === 'variety') continue;
      const values = traitValues.get(key) || new Set();
      values.add(value);
      traitValues.set(key, values);
    }
  }
  for (const [field, values] of traitValues.entries()) {
    if (values.size > 1) traitConflicts.push({ field, values: [...values] });
  }

  const variants = [...new Set(rows.map((row) => String(row.variety || '').trim()))];
  const sourceNames = [...new Set(rows.map((row) => String(row.source_name || '').trim()).filter(Boolean))];
  const hasConflicts = coreConflicts.length > 0 || traitConflicts.length > 0;
  const classification = hasConflicts
    ? 'SAME_IDENTITY_CONFLICTING_OBSERVATIONS'
    : (variants.length > 1 ? 'FORMAT_EQUIVALENT_NO_DATA_CONFLICT' : 'SAME_DISPLAY_NO_DATA_CONFLICT');
  return { classification, variants, sourceNames, coreConflicts, traitConflicts, invalidDetails };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

console.log('\nCaneSprout FULL registry integrity audit v2.7.8');
console.log(`Endpoint: ${endpoint}`);
console.log(`Project:  ${projectId}`);
console.log(`Database: ${databaseId}`);
console.log('Mode: READ ONLY. This command cannot edit, merge, rename, or delete records.\n');

const [cores, details] = await Promise.all([
  fetchAll(coreCollection),
  fetchAll(detailsCollection, ['traits_json', 'details_json'])
]);
const detailMap = new Map(details.map((doc) => [doc.$id, doc]));
const coreMap = new Map(cores.map((doc) => [doc.$id, doc]));

const canonicalGroups = new Map();
const displayGroups = new Map();
const numericGroups = new Map();
const trialGroups = new Map();
const sourceRowGroups = new Map();
const blankVarieties = [];
for (const core of cores) {
  const variety = String(core.variety || '').trim();
  if (!variety) blankVarieties.push(core);
  addGroup(canonicalGroups, canonicalVariety(variety), core);
  addGroup(displayGroups, displayKey(variety), core);
  addGroup(numericGroups, numericTokenKey(variety), core);
  const trial = normalizeValue(core.germ_trial_code);
  if (trial) addGroup(trialGroups, trial, core);
  const sourceName = normalizeValue(core.source_name);
  const sourceRow = normalizeValue(core.source_row);
  if (sourceName && sourceRow) addGroup(sourceRowGroups, `${sourceName}|${sourceRow}`, core);
}

const canonicalDuplicates = [...canonicalGroups.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([canonical, rows]) => ({ canonical, records: rows, ...compareDuplicateGroup(rows, detailMap) }))
  .sort((a, b) => b.records.length - a.records.length || a.canonical.localeCompare(b.canonical));

const exactDisplayDuplicates = [...displayGroups.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([key, rows]) => ({ key, records: rows }))
  .sort((a, b) => b.records.length - a.records.length || a.key.localeCompare(b.key));

// This catches only conservative numeric formatting variants such as 01 vs 1
// when the token boundaries are otherwise the same. It does NOT treat one-digit
// spelling differences as duplicates, because many legitimate cultivar codes differ by one digit.
const numericEquivalent = [...numericGroups.entries()]
  .filter(([, rows]) => rows.length > 1 && new Set(rows.map((row) => canonicalVariety(row.variety))).size > 1)
  .map(([key, rows]) => ({ key, records: rows }))
  .sort((a, b) => b.records.length - a.records.length || a.key.localeCompare(b.key));

const repeatedTrialCodes = [...trialGroups.entries()]
  .filter(([, rows]) => new Set(rows.map((row) => canonicalVariety(row.variety))).size > 1)
  .map(([trialCode, rows]) => ({ trialCode, records: rows }))
  .sort((a, b) => b.records.length - a.records.length || a.trialCode.localeCompare(b.trialCode));

const repeatedSourceRows = [...sourceRowGroups.entries()]
  .filter(([, rows]) => rows.length > 1)
  .map(([sourceRowKey, rows]) => ({ sourceRowKey, records: rows }))
  .sort((a, b) => b.records.length - a.records.length || a.sourceRowKey.localeCompare(b.sourceRowKey));

const missingDetails = cores.filter((core) => !detailMap.has(core.$id));
const orphanDetails = details.filter((detail) => !coreMap.has(detail.$id));
const invalidTraitsJson = [];
const invalidDetailsJson = [];
const detailVarietyMismatch = [];
for (const detail of details) {
  const traits = parseObject(detail.traits_json);
  const metadata = parseObject(detail.details_json);
  if (!traits.ok) invalidTraitsJson.push(detail.$id);
  if (!metadata.ok) invalidDetailsJson.push(detail.$id);
  const core = coreMap.get(detail.$id);
  if (core && traits.ok && traits.value.variety) {
    const coreKey = canonicalVariety(core.variety);
    const detailKey = canonicalVariety(traits.value.variety);
    if (coreKey !== detailKey) detailVarietyMismatch.push({ id: detail.$id, coreVariety: core.variety || '', detailVariety: traits.value.variety || '' });
  }
}

const issueRows = [];
function pushRecordIssues(issueType, severity, groupKey, records, note = '') {
  for (const row of records) {
    issueRows.push({ issueType, severity, groupKey, id: row.$id || '', variety: row.variety || '', sourceName: row.source_name || '', sourceRow: row.source_row || '', createdAt: row.$createdAt || '', updatedAt: row.$updatedAt || '', note });
  }
}
for (const group of canonicalDuplicates) pushRecordIssues('CANONICAL_DUPLICATE', group.classification.includes('CONFLICTING') ? 'REVIEW' : 'HIGH', group.canonical, group.records, group.classification);
for (const group of numericEquivalent) pushRecordIssues('NUMERIC_FORMAT_EQUIVALENT', 'REVIEW', group.key, group.records, 'Leading-zero/numeric-token equivalent; review only.');
for (const group of repeatedTrialCodes) pushRecordIssues('TRIAL_CODE_REUSED', 'REVIEW', group.trialCode, group.records, 'Same nonblank trial code is used by different canonical variety names.');
for (const group of repeatedSourceRows) pushRecordIssues('SOURCE_ROW_REUSED', 'REVIEW', group.sourceRowKey, group.records, 'Same source workbook row points to multiple records.');
for (const row of missingDetails) pushRecordIssues('MISSING_DETAILS_DOCUMENT', 'HIGH', row.$id, [row]);
for (const row of orphanDetails) issueRows.push({ issueType: 'ORPHAN_DETAILS_DOCUMENT', severity: 'HIGH', groupKey: row.$id, id: row.$id, variety: '', sourceName: '', sourceRow: '', createdAt: row.$createdAt || '', updatedAt: row.$updatedAt || '', note: 'Details document has no matching core record.' });
for (const row of blankVarieties) pushRecordIssues('BLANK_VARIETY', 'HIGH', row.$id, [row]);
for (const id of invalidTraitsJson) issueRows.push({ issueType: 'INVALID_TRAITS_JSON', severity: 'HIGH', groupKey: id, id, variety: coreMap.get(id)?.variety || '', sourceName: coreMap.get(id)?.source_name || '', sourceRow: coreMap.get(id)?.source_row || '', createdAt: '', updatedAt: '', note: 'traits_json is not a valid JSON object.' });
for (const id of invalidDetailsJson) issueRows.push({ issueType: 'INVALID_DETAILS_JSON', severity: 'HIGH', groupKey: id, id, variety: coreMap.get(id)?.variety || '', sourceName: coreMap.get(id)?.source_name || '', sourceRow: coreMap.get(id)?.source_row || '', createdAt: '', updatedAt: '', note: 'details_json is not a valid JSON object.' });
for (const row of detailVarietyMismatch) issueRows.push({ issueType: 'CORE_DETAIL_VARIETY_MISMATCH', severity: 'HIGH', groupKey: row.id, id: row.id, variety: row.coreVariety, sourceName: coreMap.get(row.id)?.source_name || '', sourceRow: coreMap.get(row.id)?.source_row || '', createdAt: '', updatedAt: '', note: `traits_json variety: ${row.detailVariety}` });

const report = {
  generated_at: new Date().toISOString(),
  mode: 'read-only',
  scanned: { core_records: cores.length, detail_records: details.length },
  summary: {
    canonical_duplicate_groups: canonicalDuplicates.length,
    canonical_duplicate_records: canonicalDuplicates.reduce((sum, group) => sum + group.records.length, 0),
    exact_display_duplicate_groups: exactDisplayDuplicates.length,
    numeric_format_equivalent_groups: numericEquivalent.length,
    repeated_trial_code_groups: repeatedTrialCodes.length,
    repeated_source_row_groups: repeatedSourceRows.length,
    blank_varieties: blankVarieties.length,
    missing_details_documents: missingDetails.length,
    orphan_details_documents: orphanDetails.length,
    invalid_traits_json: invalidTraitsJson.length,
    invalid_details_json: invalidDetailsJson.length,
    core_detail_variety_mismatches: detailVarietyMismatch.length,
    total_issue_rows: issueRows.length
  },
  canonical_duplicates: canonicalDuplicates.map((group) => ({
    canonical: group.canonical,
    classification: group.classification,
    variants: group.variants,
    source_names: group.sourceNames,
    core_conflicts: group.coreConflicts,
    trait_conflicts: group.traitConflicts,
    invalid_detail_ids: group.invalidDetails,
    records: group.records.map((row) => ({ id: row.$id, variety: row.variety || '', source_name: row.source_name || '', source_row: row.source_row || '', trial_code: row.germ_trial_code || '', location: row.germ_location || '', status: row.germ_status || '', created_at: row.$createdAt || '', updated_at: row.$updatedAt || '' }))
  })),
  numeric_format_equivalent: numericEquivalent.map((group) => ({ key: group.key, records: group.records.map((row) => ({ id: row.$id, variety: row.variety || '', source_name: row.source_name || '', source_row: row.source_row || '' })) })),
  repeated_trial_codes: repeatedTrialCodes.map((group) => ({ trial_code: group.trialCode, records: group.records.map((row) => ({ id: row.$id, variety: row.variety || '' })) })),
  repeated_source_rows: repeatedSourceRows.map((group) => ({ source_row_key: group.sourceRowKey, records: group.records.map((row) => ({ id: row.$id, variety: row.variety || '' })) })),
  blank_varieties: blankVarieties.map((row) => ({ id: row.$id, source_name: row.source_name || '', source_row: row.source_row || '' })),
  missing_details_ids: missingDetails.map((row) => row.$id),
  orphan_details_ids: orphanDetails.map((row) => row.$id),
  invalid_traits_json_ids: invalidTraitsJson,
  invalid_details_json_ids: invalidDetailsJson,
  core_detail_variety_mismatches: detailVarietyMismatch,
  creation_path_review: {
    protected: [
      'SRA HYV migration v2.7.5+ uses a complete canonical identity index and refuses multi-match conflicts.',
      'Excel bulk upsert v2.7.6+ uses a complete canonical identity index and refuses multi-match conflicts.',
      'General saveRecord v2.7.8+ enforces canonical identity uniqueness for manual admin creates, approved normal-user CREATE publication, offline CREATE sync, and variety renames.',
      'Legacy bulkCreateRecords is redirected to the duplicate-safe bulk upsert path.'
    ],
    still_requires_duplicate_guard: [],
    note: 'All known registry creation paths now share canonical duplicate protection. Existing conflicting-observation groups are intentionally reported for scientific review rather than auto-merged.'
  }
};

console.log(`Scanned ${cores.length} core record(s) and ${details.length} details record(s).`);
console.log(`Canonical duplicate groups:       ${report.summary.canonical_duplicate_groups}`);
console.log(`Numeric-format review groups:     ${report.summary.numeric_format_equivalent_groups}`);
console.log(`Repeated trial-code groups:       ${report.summary.repeated_trial_code_groups}`);
console.log(`Repeated source-row groups:       ${report.summary.repeated_source_row_groups}`);
console.log(`Blank varieties:                  ${report.summary.blank_varieties}`);
console.log(`Missing details documents:        ${report.summary.missing_details_documents}`);
console.log(`Orphan details documents:         ${report.summary.orphan_details_documents}`);
console.log(`Invalid traits/details JSON:      ${report.summary.invalid_traits_json}/${report.summary.invalid_details_json}`);
console.log(`Core/detail variety mismatches:   ${report.summary.core_detail_variety_mismatches}\n`);

if (canonicalDuplicates.length) {
  console.log('CANONICAL DUPLICATE IDENTITY GROUPS');
  for (const group of canonicalDuplicates) {
    console.log(`! ${group.canonical}  [${group.classification}]  ${group.records.length} record(s)`);
    for (const row of group.records) console.log(`    ${row.$id} | ${row.variety || '(blank)'} | ${row.source_name || ''} | ${row.$createdAt || ''}`);
    if (group.coreConflicts.length || group.traitConflicts.length) console.log(`    conflicts: ${group.coreConflicts.length} core field(s), ${group.traitConflicts.length} trait field(s)`);
  }
  console.log('');
}

const reportsDir = path.resolve(process.cwd(), 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
const jsonPath = path.join(reportsDir, 'registry-integrity-v2.7.7.json');
const csvPath = path.join(reportsDir, 'registry-integrity-v2.7.7.csv');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
const csvHeaders = ['issue_type','severity','group_key','id','variety','source_name','source_row','created_at','updated_at','note'];
const csvLines = [csvHeaders.join(',')];
for (const row of issueRows) {
  csvLines.push([row.issueType,row.severity,row.groupKey,row.id,row.variety,row.sourceName,row.sourceRow,row.createdAt,row.updatedAt,row.note].map(csvEscape).join(','));
}
fs.writeFileSync(csvPath, csvLines.join('\r\n') + '\r\n');

console.log(`JSON report: ${jsonPath}`);
console.log(`CSV report:  ${csvPath}`);
console.log('\nNo records were changed. Near-looking codes that differ by an actual digit are intentionally NOT called duplicates automatically, because they may be legitimate separate cultivars.\n');
