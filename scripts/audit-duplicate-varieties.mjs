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
if (!apiKey) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Use a temporary Appwrite server API key with database document READ access only for this audit, then revoke it.\n');
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
function simpleDisplay(value) { return String(value || '').normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' '); }

async function fetchAllCore() {
  const docs = [];
  let cursor = '';
  while (true) {
    const queries = [Query.limit(100), Query.orderAsc('$id')];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await readWithRetry(`read core page after ${cursor || 'start'}`, (db) => db.listDocuments({ databaseId, collectionId: coreCollection, queries, total: false }));
    const batch = page.documents || [];
    docs.push(...batch);
    if (batch.length < 100) break;
    cursor = batch.at(-1).$id;
  }
  return docs;
}

console.log('\nCaneSprout duplicate-variety audit v2.7.5');
console.log(`Endpoint: ${endpoint}`);
console.log(`Project:  ${projectId}`);
console.log(`Database: ${databaseId}`);
console.log('Mode: READ ONLY. No records will be edited or deleted.\n');
const docs = await fetchAllCore();
const groups = new Map();
for (const doc of docs) {
  const key = canonicalVariety(doc.variety);
  if (!key) continue;
  const list = groups.get(key) || [];
  list.push(doc); groups.set(key, list);
}
const duplicates = [...groups.entries()].filter(([, rows]) => rows.length > 1).sort((a,b) => b[1].length-a[1].length || a[0].localeCompare(b[0]));
const report = {
  generated_at: new Date().toISOString(), scanned_records: docs.length,
  canonical_duplicate_groups: duplicates.length,
  duplicate_records: duplicates.reduce((sum,[,rows]) => sum+rows.length,0),
  groups: duplicates.map(([canonical, rows]) => ({ canonical, formatting_variant: new Set(rows.map((r)=>simpleDisplay(r.variety))).size > 1,
    records: rows.map((r)=>({ id:r.$id, variety:r.variety||'', created_at:r.$createdAt||'', updated_at:r.$updatedAt||'', trial_code:r.germ_trial_code||'', location:r.germ_location||'', status:r.germ_status||'', source_name:r.source_name||'' })) }))
};
if (!duplicates.length) console.log(`✓ Scanned ${docs.length} registry records. No canonical-name duplicates found.`);
else {
  console.log(`Scanned ${docs.length} registry records.`);
  console.log(`FOUND ${duplicates.length} duplicate identity group(s), containing ${report.duplicate_records} records.\n`);
  for (const [canonical, rows] of duplicates) {
    const variants=[...new Set(rows.map((r)=>String(r.variety||'').trim()))];
    console.log(`! ${canonical}  [${variants.length>1?'FORMAT VARIANT':'SAME DISPLAY NAME'}]  ${rows.length} records`);
    for (const row of rows) console.log(`    ${row.$id}  |  ${row.variety || '(blank)'}  |  ${row.$createdAt || ''}`);
  }
}
const reportsDir=path.resolve(process.cwd(),'reports'); fs.mkdirSync(reportsDir,{recursive:true});
const reportPath=path.join(reportsDir,'duplicate-varieties-v2.7.5.json'); fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(`\nReport written to: ${reportPath}`);
console.log('No records were changed. Review duplicate groups before any merge/delete action.\n');
