import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import * as XLSX from 'xlsx';
import { Client, Databases, Query } from 'node-appwrite';
import { CHARACTERIZATION_FIELDS } from '../src/lib/characterizationFields.js';

const AUDIT_VERSION = '2.13.15-source-match-1';
const DEFAULT_SOURCE = 'Characterization and other attributes (1)(1).xlsx';
const CORE_COLLECTION = 'sugarcane_registry_core';
const DETAILS_COLLECTION = 'sugarcane_registry_details';

function loadDotEnv(file) {
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
loadDotEnv('.env');
loadDotEnv('.env.local');

function usage() {
  console.log(`\nCaneSprout source workbook match audit\n\nUsage:\n  npm.cmd run audit:source-match -- "C:\\path\\Characterization and other attributes.xlsx"\n  npm.cmd run audit:source-match -- "C:\\path\\Characterization and other attributes.xlsx" --live\n  npm.cmd run audit:source-match -- "C:\\path\\Characterization and other attributes.xlsx" --both\n\nModes:\n  default  Compare workbook with bundled/offline seed only\n  --live   Compare workbook with current Appwrite registry only\n  --both   Run bundled and live comparisons\n\nThis audit is READ ONLY.\n`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}
const mode = args.includes('--both') ? 'both' : args.includes('--live') ? 'live' : 'local';
const workbookArg = args.find((arg) => !arg.startsWith('--')) || DEFAULT_SOURCE;
const workbookPath = path.resolve(process.cwd(), workbookArg);
if (!fs.existsSync(workbookPath)) {
  console.error(`\nSource workbook not found:\n${workbookPath}\n`);
  usage();
  process.exit(1);
}

const PASSPORT_NON_POSITIONAL_KEYS = new Set([
  'accession_number', 'origin', 'collection_year', 'species', 'recommended_locations',
  'breeding_institution_developer_breeder', 'collection_scope', 'genetic_background',
  'other_details', 'lot_planted_station'
]);
const POSITIONAL_FIELDS = CHARACTERIZATION_FIELDS.filter((field) =>
  !PASSPORT_NON_POSITIONAL_KEYS.has(field.key) && field.key !== 'agronomic_characteristics_summary'
);
const RED_ATTRIBUTE_COLUMNS = Object.freeze([
  [79, 'origin'],
  [80, 'breeding_institution_developer_breeder'],
  [81, 'collection_scope'],
  [82, 'species'],
  [83, 'genetic_background'],
  [84, 'other_details'],
  [85, 'lot_planted_station']
]);
const FIELD_BY_KEY = new Map(CHARACTERIZATION_FIELDS.map((field) => [field.key, field]));
const COMPARABLE_KEYS = [...new Set([
  ...POSITIONAL_FIELDS.map((field) => field.key),
  ...RED_ATTRIBUTE_COLUMNS.map(([, key]) => key)
])];

function cleanText(value) {
  if (value == null) return '';
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  return String(value).normalize('NFKC').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}
function semanticText(value) {
  return cleanText(value).toUpperCase();
}
function canonicalVariety(value) {
  return cleanText(value).toUpperCase().replace(/PHILIPPINES/g, 'PHIL').replace(/[^A-Z0-9]+/g, '');
}
function numberLike(value) {
  const text = cleanText(value);
  if (!/^[-+]?\d+(?:\.\d+)?$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}
function compareValue(sourceValue, systemValue) {
  const source = cleanText(sourceValue);
  const system = cleanText(systemValue);
  if (!source && !system) return { status: 'match', source, system };
  if (source && !system) return { status: 'missing_in_system', source, system };
  if (!source && system) return { status: 'extra_in_system', source, system };
  if (source === system) return { status: 'match', source, system };
  const sn = numberLike(source);
  const tn = numberLike(system);
  if (sn != null && tn != null && Math.abs(sn - tn) <= 1e-9) {
    return { status: 'format_only', source, system };
  }
  if (semanticText(source) === semanticText(system)) {
    return { status: 'format_only', source, system };
  }
  return { status: 'mismatch', source, system };
}
function parseJsonObject(value) {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function excelColumn(index) {
  let n = index + 1;
  let output = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    output = String.fromCharCode(65 + r) + output;
    n = Math.floor((n - 1) / 26);
  }
  return output;
}

function validateWorkbookSignature(matrix) {
  const checks = [
    [1, 0, 'VARIETY'],
    [0, 60, 'PARENTAGE'],
    [1, 60, 'FEMALE'],
    [1, 61, 'MALE'],
    [0, 62, 'YIELD POTENTIAL'],
    [1, 73, 'REACTION DISEASES'],
    [0, 74, 'TESTED LOCATION'],
    [1, 79, 'COUNTRY'],
    [1, 80, 'BREEDING INSTITUTION/DEVELOPER/BREEDER'],
    [1, 81, 'LOCAL/INTERNATIONAL COLLECTION'],
    [1, 82, 'SPECIES'],
    [1, 83, 'TYPE/GENETIC BACK GROUND'],
    [1, 84, 'OTHER DETAILS']
  ];
  const failed = checks.filter(([r, c, expected]) => semanticText(matrix?.[r]?.[c]) !== expected);
  if (failed.length) {
    const message = failed.map(([r, c, expected]) => `${excelColumn(c)}${r + 1} expected "${expected}" but found "${cleanText(matrix?.[r]?.[c])}"`).join('\n  - ');
    throw new Error(`Workbook layout does not match the expected CaneSprout A:CH characterization format:\n  - ${message}`);
  }
}

function parseSourceWorkbook(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Workbook does not contain a worksheet.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  validateWorkbookSignature(matrix);

  const rows = matrix.slice(2).map((values, index) => {
    const row = { source_row: index + 3, source_name: path.basename(filePath) };
    POSITIONAL_FIELDS.forEach((field, column) => {
      row[field.key] = cleanText(values[column]);
    });
    RED_ATTRIBUTE_COLUMNS.forEach(([column, key]) => {
      row[key] = cleanText(values[column]);
    });
    return row;
  }).filter((row) => COMPARABLE_KEYS.some((key) => cleanText(row[key])));

  return { rows, sheetName, matrixRows: matrix.length, matrixColumns: Math.max(0, ...matrix.map((row) => row.length)) };
}

function loadBundledRecords() {
  const seedPath = path.resolve(process.cwd(), 'seed', 'characterization.json');
  if (!fs.existsSync(seedPath)) throw new Error(`Bundled characterization seed not found: ${seedPath}`);
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const records = Array.isArray(seed?.records) ? seed.records : [];
  return records.map((record, index) => ({
    ...record,
    $id: record.document_id || `bundled:${String(index + 1).padStart(4, '0')}`,
    __target: 'bundled'
  }));
}

function loadAppwriteConfig() {
  return {
    endpoint: String(process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1').trim().replace(/\/$/, ''),
    fallbackEndpoint: String(process.env.APPWRITE_FALLBACK_ENDPOINT || process.env.VITE_APPWRITE_FALLBACK_ENDPOINT || 'https://cloud.appwrite.io/v1').trim().replace(/\/$/, ''),
    projectId: String(process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b').trim(),
    databaseId: String(process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase').trim(),
    apiKey: String(process.env.APPWRITE_API_KEY || '').trim()
  };
}

async function loadLiveRecords() {
  const config = loadAppwriteConfig();
  if (!config.apiKey) {
    throw new Error('APPWRITE_API_KEY is required for --live/--both. Use a temporary READ-ONLY server API key, then revoke it after the audit.');
  }
  const endpoints = [...new Set([config.endpoint, config.fallbackEndpoint].filter(Boolean))];
  const databases = endpoints.map((endpoint) => ({
    endpoint,
    db: new Databases(new Client().setEndpoint(endpoint).setProject(config.projectId).setKey(config.apiKey))
  }));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const statusCode = (error) => Number(error?.code || error?.status || error?.response?.status || 0);
  const isRetryable = (error) => {
    const code = statusCode(error);
    if (code === 429 || code === 408 || code >= 500) return true;
    if (code >= 400) return false;
    const text = [error?.message, error?.cause?.message, error?.cause?.code, error?.code].filter(Boolean).join(' ').toLowerCase();
    return !text || /fetch failed|timeout|timed out|econnreset|econnrefused|enotfound|socket|network|und_err|connection/.test(text);
  };
  async function withRetry(label, operation) {
    let lastError;
    for (const { endpoint, db } of databases) {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try { return await operation(db); }
        catch (error) {
          lastError = error;
          if (!isRetryable(error)) throw error;
          if (attempt < 5) await sleep(Math.min(5000, 400 * (2 ** (attempt - 1))));
        }
      }
      console.warn(`  ↳ ${label}: switching endpoint after repeated transient errors (${endpoint})`);
    }
    throw lastError || new Error(`${label} failed`);
  }
  async function fetchAll(collectionId, select = []) {
    const docs = [];
    let cursor = '';
    while (true) {
      const queries = [Query.limit(100), Query.orderAsc('$id')];
      if (select.length) queries.push(Query.select(select));
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const page = await withRetry(`read ${collectionId}`, (db) => db.listDocuments({
        databaseId: config.databaseId,
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

  console.log(`\nReading live Appwrite registry from ${config.endpoint} ...`);
  const [cores, details] = await Promise.all([
    fetchAll(CORE_COLLECTION),
    fetchAll(DETAILS_COLLECTION, ['traits_json', 'details_json'])
  ]);
  const detailMap = new Map(details.map((detail) => [detail.$id, detail]));
  return cores.map((core) => {
    const detail = detailMap.get(core.$id) || {};
    const traits = parseJsonObject(detail.traits_json);
    return {
      ...traits,
      ...core,
      variety: core.variety || traits.variety || '',
      source_name: core.source_name || traits.source_name || '',
      source_row: core.source_row || traits.source_row || '',
      $id: core.$id,
      __target: 'live'
    };
  });
}

function buildIndexes(records) {
  const byIdentity = new Map();
  const bySourceRow = new Map();
  for (const record of records) {
    const identity = canonicalVariety(record.variety);
    if (identity) {
      const list = byIdentity.get(identity) || [];
      list.push(record);
      byIdentity.set(identity, list);
    }
    const sourceRow = Number.parseInt(cleanText(record.source_row), 10);
    if (Number.isFinite(sourceRow)) {
      const list = bySourceRow.get(sourceRow) || [];
      list.push(record);
      bySourceRow.set(sourceRow, list);
    }
  }
  return { byIdentity, bySourceRow };
}

function fieldMismatchCost(source, candidate) {
  let mismatches = 0;
  let missing = 0;
  for (const key of COMPARABLE_KEYS) {
    const result = compareValue(source[key], candidate[key]);
    if (result.status === 'mismatch') mismatches += 3;
    else if (result.status === 'missing_in_system') missing += 1;
  }
  return mismatches + missing;
}

function chooseCandidate(source, indexes) {
  const identity = canonicalVariety(source.variety);
  const sourceRow = Number.parseInt(source.source_row, 10);
  let candidates = identity ? [...(indexes.byIdentity.get(identity) || [])] : [];

  if (candidates.length > 1 && Number.isFinite(sourceRow)) {
    const exactRow = candidates.filter((record) => Number.parseInt(cleanText(record.source_row), 10) === sourceRow);
    if (exactRow.length === 1) return { candidate: exactRow[0], candidates, matchBasis: 'identity+source_row', ambiguous: false };
    if (exactRow.length > 1) candidates = exactRow;
  }

  if (candidates.length === 1) return { candidate: candidates[0], candidates, matchBasis: 'identity', ambiguous: false };

  if (!candidates.length && Number.isFinite(sourceRow)) {
    const rowCandidates = [...(indexes.bySourceRow.get(sourceRow) || [])];
    if (rowCandidates.length === 1) return { candidate: rowCandidates[0], candidates: rowCandidates, matchBasis: 'source_row', ambiguous: false };
    if (rowCandidates.length > 1) candidates = rowCandidates;
  }

  if (candidates.length > 1) {
    const ranked = candidates
      .map((candidate) => ({ candidate, cost: fieldMismatchCost(source, candidate) }))
      .sort((a, b) => a.cost - b.cost || String(a.candidate.$id).localeCompare(String(b.candidate.$id)));
    const ambiguous = ranked.length > 1 && ranked[0].cost === ranked[1].cost;
    return { candidate: ranked[0].candidate, candidates, matchBasis: 'best-field-match', ambiguous };
  }
  return { candidate: null, candidates: [], matchBasis: 'none', ambiguous: false };
}

function compareSourceToTarget(sourceInfo, targetRecords, targetName) {
  const indexes = buildIndexes(targetRecords);
  const matchedTargetIds = new Set();
  const issues = [];
  const recordResults = [];
  let exactRecords = 0;
  let recordsWithRealIssues = 0;
  let recordsWithFormatOnly = 0;

  for (const source of sourceInfo.rows) {
    const chosen = chooseCandidate(source, indexes);
    const candidate = chosen.candidate;
    const identity = canonicalVariety(source.variety);
    const sourceLabel = source.variety || `(blank variety at row ${source.source_row})`;

    if (!candidate) {
      issues.push({
        category: 'missing_record_in_system', target: targetName, identity, variety: sourceLabel,
        source_row: source.source_row, system_id: '', field: '', field_label: '', source_value: source.variety || '', system_value: '',
        match_basis: chosen.matchBasis, note: 'No system record matched this source row/identity.'
      });
      recordResults.push({ source_row: source.source_row, variety: source.variety, identity, status: 'missing_record_in_system', system_id: '' });
      recordsWithRealIssues += 1;
      continue;
    }

    matchedTargetIds.add(candidate.$id);
    let realIssues = 0;
    let formatOnly = 0;
    let extras = 0;
    for (const key of COMPARABLE_KEYS) {
      const result = compareValue(source[key], candidate[key]);
      if (result.status === 'match') continue;
      const field = FIELD_BY_KEY.get(key) || { label: key, group: '' };
      if (result.status === 'format_only') formatOnly += 1;
      else if (result.status === 'extra_in_system') extras += 1;
      else realIssues += 1;
      issues.push({
        category: result.status,
        target: targetName,
        identity,
        variety: sourceLabel,
        source_row: source.source_row,
        system_id: candidate.$id || '',
        field: key,
        field_label: `${field.group ? `${field.group} / ` : ''}${field.label || key}`,
        source_value: result.source,
        system_value: result.system,
        match_basis: chosen.matchBasis,
        note: chosen.ambiguous ? `Ambiguous among ${chosen.candidates.length} candidate records; best-field-match used for review.` : ''
      });
    }

    if (chosen.ambiguous) {
      realIssues += 1;
      issues.push({
        category: 'ambiguous_duplicate_match', target: targetName, identity, variety: sourceLabel,
        source_row: source.source_row, system_id: candidate.$id || '', field: '', field_label: '', source_value: '', system_value: '',
        match_basis: chosen.matchBasis,
        note: `Multiple equally plausible records: ${chosen.candidates.map((row) => `${row.$id}:${row.variety}`).join(' | ')}`
      });
    }

    if (realIssues > 0) recordsWithRealIssues += 1;
    else if (formatOnly > 0) recordsWithFormatOnly += 1;
    else exactRecords += 1;

    recordResults.push({
      source_row: source.source_row,
      variety: source.variety,
      identity,
      system_id: candidate.$id || '',
      system_variety: candidate.variety || '',
      match_basis: chosen.matchBasis,
      ambiguous: chosen.ambiguous,
      real_issue_count: realIssues,
      format_only_count: formatOnly,
      extra_system_value_count: extras,
      status: realIssues ? 'review_required' : formatOnly ? 'match_with_formatting_difference' : 'match'
    });
  }

  const extras = targetRecords.filter((record) => !matchedTargetIds.has(record.$id));
  for (const record of extras) {
    issues.push({
      category: 'extra_record_in_system', target: targetName, identity: canonicalVariety(record.variety), variety: record.variety || '(blank)',
      source_row: '', system_id: record.$id || '', field: '', field_label: '', source_value: '', system_value: record.variety || '',
      match_basis: '', note: `System record was not matched to a row in ${path.basename(workbookPath)}.`
    });
  }

  const issueCounts = {};
  for (const issue of issues) issueCounts[issue.category] = (issueCounts[issue.category] || 0) + 1;
  return {
    target: targetName,
    generated_at: new Date().toISOString(),
    audit_version: AUDIT_VERSION,
    source_workbook: workbookPath,
    source_sheet: sourceInfo.sheetName,
    source_data_rows: sourceInfo.rows.length,
    target_records: targetRecords.length,
    exact_record_matches: exactRecords,
    records_matching_with_formatting_only: recordsWithFormatOnly,
    records_requiring_review: recordsWithRealIssues,
    unmatched_system_records: extras.length,
    issue_counts: issueCounts,
    record_results: recordResults,
    issues
  };
}

function writeReport(report) {
  const reportsDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportsDir, { recursive: true });
  const suffix = report.target === 'live-appwrite' ? 'live' : 'local';
  const jsonPath = path.join(reportsDir, `source-workbook-match-${suffix}.json`);
  const csvPath = path.join(reportsDir, `source-workbook-match-${suffix}.csv`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n');
  const columns = [
    'category','target','identity','variety','source_row','system_id','field','field_label','source_value','system_value','match_basis','note'
  ];
  const csv = [columns.join(',')];
  for (const issue of report.issues) csv.push(columns.map((key) => csvEscape(issue[key])).join(','));
  fs.writeFileSync(csvPath, csv.join('\r\n') + '\r\n');
  return { jsonPath, csvPath };
}

function printSummary(report, paths) {
  console.log(`\n=== ${report.target.toUpperCase()} ===`);
  console.log(`Source rows compared:                 ${report.source_data_rows}`);
  console.log(`System records available:             ${report.target_records}`);
  console.log(`Exact record matches:                 ${report.exact_record_matches}`);
  console.log(`Matches with formatting differences:  ${report.records_matching_with_formatting_only}`);
  console.log(`Records requiring review:             ${report.records_requiring_review}`);
  console.log(`Unmatched system records:             ${report.unmatched_system_records}`);
  console.log('Issue counts:');
  const preferred = ['mismatch','missing_in_system','missing_record_in_system','ambiguous_duplicate_match','format_only','extra_in_system','extra_record_in_system'];
  for (const key of preferred) if (report.issue_counts[key]) console.log(`  ${key.padEnd(31)} ${report.issue_counts[key]}`);
  console.log(`JSON report: ${paths.jsonPath}`);
  console.log(`CSV report:  ${paths.csvPath}`);
}

console.log(`\nCaneSprout source workbook match audit ${AUDIT_VERSION}`);
console.log(`Workbook: ${workbookPath}`);
console.log(`Mode: ${mode.toUpperCase()}`);
console.log('READ ONLY: no record will be edited, created, merged, or deleted.');

const sourceInfo = parseSourceWorkbook(workbookPath);
console.log(`Worksheet: ${sourceInfo.sheetName} | workbook rows: ${sourceInfo.matrixRows} | parsed source records: ${sourceInfo.rows.length}`);

if (mode === 'local' || mode === 'both') {
  const localRecords = loadBundledRecords();
  const report = compareSourceToTarget(sourceInfo, localRecords, 'bundled-local');
  printSummary(report, writeReport(report));
}
if (mode === 'live' || mode === 'both') {
  const liveRecords = await loadLiveRecords();
  const report = compareSourceToTarget(sourceInfo, liveRecords, 'live-appwrite');
  printSummary(report, writeReport(report));
}

console.log('\nInterpretation:');
console.log('  mismatch / missing_in_system       = source workbook and system disagree; review these first.');
console.log('  format_only                        = same value after whitespace/case/numeric normalization.');
console.log('  extra_in_system                    = workbook is blank but system has an additional value; informational.');
console.log('  extra_record_in_system             = system record has no matched row in this workbook; may be a preserved/enriched record.');
console.log('  ambiguous_duplicate_match          = duplicate identity requires manual scientific review.');
console.log('\nAudit complete. No records were changed.\n');
