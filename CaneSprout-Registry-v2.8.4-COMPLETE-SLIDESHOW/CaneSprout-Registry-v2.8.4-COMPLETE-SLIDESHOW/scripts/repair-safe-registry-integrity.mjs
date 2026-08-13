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

const APPLY = process.argv.includes('--apply');
const endpoint = String(process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1').trim().replace(/\/$/, '');
const fallbackEndpoint = String(process.env.APPWRITE_FALLBACK_ENDPOINT || process.env.VITE_APPWRITE_FALLBACK_ENDPOINT || 'https://cloud.appwrite.io/v1').trim().replace(/\/$/, '');
const projectId = String(process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b').trim();
const databaseId = String(process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase').trim();
const apiKey = String(process.env.APPWRITE_API_KEY || '').trim();
const coreCollection = 'sugarcane_registry_core';
const detailsCollection = 'sugarcane_registry_details';

if (!apiKey) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error(`Use a temporary Appwrite server key with database document READ${APPLY ? '/WRITE' : ''} access, then revoke it afterward.\n`);
  process.exit(1);
}

const aliases = Object.freeze({
  PHIL031389: 'Phil 03-154-1389',
  PHIL001419: 'Phil 00-185-1419',
  PHIL001893: 'Phil 00-278-1893',
  PHIL980255: 'Phil 98-37-0255',
  PHIL933155: 'Phil 93-227-3155',
  PHIL932349: 'Phil 93-190-2349'
});
function normalizeVariety(value) {
  return String(value || '').normalize('NFKC').trim().toUpperCase().replace(/PHILIPPINES/g, 'PHIL').replace(/[^A-Z0-9]+/g, '');
}
function canonicalLegacy(value) {
  const original = String(value || '').trim();
  return aliases[normalizeVariety(original)] || original;
}
function sameVerifiedIdentity(a, b) {
  const ak = normalizeVariety(canonicalLegacy(a));
  const bk = normalizeVariety(canonicalLegacy(b));
  return Boolean(ak && bk && ak === bk);
}
function parseObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
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
async function withRetry(label, operation) {
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
async function fetchAll(collectionId, select = []) {
  const docs = [];
  let cursor = '';
  while (true) {
    const queries = [Query.limit(100), Query.orderAsc('$id')];
    if (select.length) queries.push(Query.select(select));
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await withRetry(`read ${collectionId}`, (db) => db.listDocuments({ databaseId, collectionId, queries, total: false }));
    const batch = page.documents || [];
    docs.push(...batch);
    if (batch.length < 100) break;
    cursor = batch.at(-1)?.$id || '';
    if (!cursor) break;
  }
  return docs;
}

console.log(`\nCaneSprout safe registry-integrity repair v2.7.8`);
console.log(`Endpoint: ${endpoint}`);
console.log(`Project:  ${projectId}`);
console.log(`Database: ${databaseId}`);
console.log(`Mode: ${APPLY ? 'APPLY SAFE REPAIRS' : 'DRY RUN / READ ONLY'}\n`);

const [cores, details] = await Promise.all([
  fetchAll(coreCollection, ['variety', 'source_name', 'source_row']),
  fetchAll(detailsCollection, ['traits_json'])
]);
const coreMap = new Map(cores.map((row) => [row.$id, row]));
const detailMap = new Map(details.map((row) => [row.$id, row]));
const safeMismatchRepairs = [];
const unsafeMismatches = [];
const blankVarieties = [];

for (const core of cores) {
  const coreVariety = String(core.variety || '').trim();
  if (!coreVariety) {
    blankVarieties.push({ id: core.$id, source_name: core.source_name || '', source_row: core.source_row || '' });
    continue;
  }
  const detail = detailMap.get(core.$id);
  if (!detail) continue;
  const traits = parseObject(detail.traits_json);
  if (!traits) continue;
  const detailVariety = String(traits.variety || '').trim();
  if (!detailVariety || detailVariety === coreVariety) continue;
  if (sameVerifiedIdentity(coreVariety, detailVariety)) {
    safeMismatchRepairs.push({ id: core.$id, coreVariety, detailVariety, traits });
  } else {
    unsafeMismatches.push({ id: core.$id, coreVariety, detailVariety });
  }
}

console.log(`Safe verified core/detail variety repairs: ${safeMismatchRepairs.length}`);
for (const row of safeMismatchRepairs) console.log(`  ✓ ${row.id}: ${row.detailVariety}  ->  ${row.coreVariety}`);

if (unsafeMismatches.length) {
  console.log(`\nUnverified mismatches left untouched: ${unsafeMismatches.length}`);
  for (const row of unsafeMismatches) console.log(`  ! ${row.id}: core=${row.coreVariety} | detail=${row.detailVariety}`);
}

console.log(`\nBlank variety records quarantined for manual source review: ${blankVarieties.length}`);
for (const row of blankVarieties) console.log(`  ? ${row.id} | ${row.source_name || 'unknown source'} | row ${row.source_row || '?'}`);
console.log('  No cultivar name is invented and no blank record is deleted by this command.');

const reportsDir = path.resolve(process.cwd(), 'reports');
fs.mkdirSync(reportsDir, { recursive: true });
const reportPath = path.join(reportsDir, 'safe-registry-repair-v2.7.8.json');
fs.writeFileSync(reportPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  mode: APPLY ? 'apply' : 'dry-run',
  safe_mismatch_repairs: safeMismatchRepairs.map(({ traits, ...row }) => row),
  unsafe_mismatches: unsafeMismatches,
  blank_varieties: blankVarieties
}, null, 2));

if (!APPLY) {
  console.log(`\nDRY RUN complete. Report: ${reportPath}`);
  console.log('No records were changed. Re-run with -- --apply only after reviewing the plan.\n');
  process.exit(0);
}

let updated = 0;
for (const row of safeMismatchRepairs) {
  const nextTraits = { ...row.traits, variety: row.coreVariety };
  await withRetry(`repair ${row.id}`, (db) => db.updateDocument({
    databaseId,
    collectionId: detailsCollection,
    documentId: row.id,
    data: { traits_json: JSON.stringify(nextTraits) }
  }));
  updated += 1;
  console.log(`  repaired ${updated}/${safeMismatchRepairs.length}: ${row.id}`);
  await sleep(120);
}

console.log(`\nApplied ${updated} safe core/detail variety repair(s).`);
console.log(`Blank records changed: 0. Unverified mismatches changed: 0.`);
console.log(`Report: ${reportPath}`);
console.log('Run npm.cmd run audit:registry-full again to verify the live registry.\n');
