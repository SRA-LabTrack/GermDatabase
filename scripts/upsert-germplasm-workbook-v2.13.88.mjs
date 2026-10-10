import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const PATCH_VERSION = '2.13.88';
const BASE_VERSION = '2.13.87';
const ROOT = process.cwd();
const PATCH_DIR = path.join(ROOT, 'patch-data');
const PAYLOAD_PATH = path.join(PATCH_DIR, 'germplasm-workbook-v2.13.88.json');
const WORKBOOK_PATH = path.join(PATCH_DIR, 'Characterization.xlsx');
const REPORT_DIR = path.join(ROOT, 'reports');
const BACKUP_DIR = path.join(ROOT, 'backups', `germplasm-workbook-v${PATCH_VERSION}`);
const SOURCE_NAME = 'Characterization.xlsx';
const args = new Set(process.argv.slice(2));
const ANALYZE_ONLY = args.has('--analyze-only');
const DRY_RUN = args.has('--dry-run');
const NO_LOCAL = args.has('--no-local');

function fail(message, code = 1) {
  console.error(`\nERROR: ${message}`);
  process.exit(code);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseDotEnv(file) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function canonical(value) {
  return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function clean(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function stableId(row) {
  const seed = `${SOURCE_NAME}|${row.source_row}|${row.variety}`;
  return `sc_${crypto.createHash('sha256').update(seed).digest('hex').slice(0, 24)}`;
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function mergeNonBlank(base, patch) {
  const out = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (clean(value) !== '') out[key] = value;
  }
  return out;
}

function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function displaySummary(payload) {
  const w = payload.workbook;
  console.log(`CaneSprout Germplasm Workbook Update v${PATCH_VERSION}`);
  console.log(`Base version: v${BASE_VERSION}`);
  console.log(`Named workbook rows: ${w.named_rows}`);
  console.log(`Unique canonical varieties: ${w.unique_canonical_varieties}`);
  console.log(`Blank variety rows skipped: ${w.blank_variety_rows.join(', ') || 'none'}`);
  console.log(`Duplicate canonical groups preserved: ${Object.keys(w.duplicate_canonical_groups || {}).length}`);
  for (const [id, members] of Object.entries(w.duplicate_canonical_groups || {})) {
    console.log(`  - ${id}: ${members.map((m) => `${m.variety} [row ${m.source_row}]`).join(' | ')}`);
  }
  console.log('Policy: upsert only; no database record is deleted; incoming blanks never erase existing values.');
}

if (!fs.existsSync(PAYLOAD_PATH)) fail(`Missing ${path.relative(ROOT, PAYLOAD_PATH)}. Extract the complete patch into the CaneSprout project root.`);
if (!fs.existsSync(WORKBOOK_PATH)) fail(`Missing ${path.relative(ROOT, WORKBOOK_PATH)}.`);
const payload = readJson(PAYLOAD_PATH);
displaySummary(payload);
if (ANALYZE_ONLY) process.exit(0);

parseDotEnv(path.join(ROOT, '.env'));
parseDotEnv(path.join(ROOT, '.env.local'));

const endpoint = (process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1').replace(/\/$/, '');
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b';
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase';
const apiKey = process.env.APPWRITE_API_KEY || process.env.CANESPROUT_APPWRITE_API_KEY || '';

if (!apiKey || /PASTE_|CHANGE_ME|YOUR_/i.test(apiKey)) {
  fail('APPWRITE_API_KEY is missing. Put a temporary Appwrite server API key in .env, then run the patch again. The key needs database/document read + create + update access.');
}

async function request(method, route, body = undefined) {
  const response = await fetch(`${endpoint}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = typeof data === 'object' ? (data?.message || JSON.stringify(data)) : String(data);
    const error = new Error(`${method} ${route} -> ${response.status}: ${message}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function q(values) {
  const sp = new URLSearchParams();
  for (const value of values) sp.append('queries[]', value);
  return `?${sp.toString()}`;
}

async function listCollections() {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const data = await request('GET', `/databases/${encodeURIComponent(databaseId)}/collections${q([JSON.stringify({ method: 'limit', values: [100] }), JSON.stringify({ method: 'offset', values: [offset] })])}`);
    const batch = data?.collections || [];
    all.push(...batch);
    if (batch.length < 100 || all.length >= Number(data?.total || 0)) break;
  }
  return all;
}

async function listAttributes(collectionId) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const data = await request('GET', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/attributes${q([JSON.stringify({ method: 'limit', values: [100] }), JSON.stringify({ method: 'offset', values: [offset] })])}`);
    const batch = data?.attributes || [];
    all.push(...batch);
    if (batch.length < 100 || all.length >= Number(data?.total || 0)) break;
  }
  return all;
}

async function listDocuments(collectionId) {
  const all = [];
  for (let offset = 0; ; offset += 100) {
    const data = await request('GET', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/documents${q([JSON.stringify({ method: 'limit', values: [100] }), JSON.stringify({ method: 'offset', values: [offset] })])}`);
    const batch = data?.documents || [];
    all.push(...batch);
    if (batch.length < 100 || all.length >= Number(data?.total || 0)) break;
  }
  return all;
}

function attrKeySet(attributes) {
  return new Set(attributes.map((a) => a?.key).filter(Boolean));
}

function scoreCollections(collectionInfo) {
  const explicitCore = ['sugarcane_registry_core', 'registry_core', 'germplasm_core'];
  const explicitDetails = ['sugarcane_registry_details', 'registry_details', 'germplasm_details'];
  const byId = new Map(collectionInfo.map((c) => [c.collection.$id, c]));
  const exactCore = explicitCore.map((id) => byId.get(id)).find(Boolean);
  const exactDetails = explicitDetails.map((id) => byId.get(id)).find(Boolean);
  if (exactCore && exactDetails) return { core: exactCore, details: exactDetails };

  const coreRanked = [...collectionInfo].map((x) => {
    const k = attrKeySet(x.attributes);
    let score = 0;
    if (k.has('variety')) score += 8;
    if (k.has('source_name')) score += 5;
    if (k.has('source_row')) score += 5;
    if (k.has('trial_code')) score += 2;
    if (k.has('location')) score += 2;
    if (k.has('traits_json')) score -= 4;
    if (/sugarcane|registry|germplasm/i.test(`${x.collection.$id} ${x.collection.name}`)) score += 3;
    return { x, score };
  }).sort((a,b) => b.score-a.score);

  const detailsRanked = [...collectionInfo].map((x) => {
    const k = attrKeySet(x.attributes);
    let score = 0;
    if (k.has('variety')) score += 4;
    if (k.has('traits_json')) score += 8;
    if (k.has('details_json')) score += 8;
    if (/detail/i.test(`${x.collection.$id} ${x.collection.name}`)) score += 4;
    return { x, score };
  }).sort((a,b) => b.score-a.score);

  const core = exactCore || coreRanked[0]?.x;
  const details = exactDetails || detailsRanked.find((r) => r.x.collection.$id !== core?.collection.$id)?.x;
  if (!core || !details || coreRanked[0]?.score < 8 || detailsRanked.find((r)=>r.x===details)?.score < 8) {
    throw new Error('Could not safely identify the germplasm core/details collections from their schemas. No records were changed.');
  }
  return { core, details };
}

function castForAttribute(value, attribute) {
  if (value === undefined || value === null || value === '') return undefined;
  const type = String(attribute?.type || '').toLowerCase();
  if (['integer','int'].includes(type)) {
    const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : undefined;
  }
  if (['double','float'].includes(type)) {
    const n = Number(value); return Number.isFinite(n) ? n : undefined;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (/^(true|yes|1)$/i.test(String(value))) return true;
    if (/^(false|no|0)$/i.test(String(value))) return false;
    return undefined;
  }
  return String(value);
}

const DIRECT_ALIASES = {
  parentage_female: ['parentage_female','female_parent','female'],
  parentage_male: ['parentage_male','male_parent','male'],
  agronomic_millable_stalk: ['agronomic_millable_stalk','average_millable_stalks','millable_stalk'],
  agronomic_maturity: ['agronomic_maturity','maturity_months','maturity'],
  disease_reaction: ['disease_reaction','reaction_diseases'],
  pest_disease_incidence: ['pest_disease_incidence','pests_diseases_incidence'],
  origin_country: ['origin_country','country'],
  breeding_institution: ['breeding_institution','breeding_institution_developer_breeder','breeder'],
  local_international_collection: ['local_international_collection','collection_scope'],
  genetic_background: ['genetic_background','type_genetic_background'],
  origin_other_details: ['origin_other_details','other_details'],
  lot_planted_in_station: ['lot_planted_in_station','lot_planted'],
};

function assignRecognized(target, attributes, key, value) {
  if (clean(value) === '') return;
  const byKey = new Map(attributes.map((a) => [a.key, a]));
  const aliases = DIRECT_ALIASES[key] || [key];
  for (const alias of aliases) {
    const attribute = byKey.get(alias);
    if (!attribute) continue;
    const casted = castForAttribute(value, attribute);
    if (casted !== undefined) target[alias] = casted;
  }
}

function buildIncomingFlat(row) {
  return { ...(row.traits || {}), ...(row.origin || {}) };
}

function buildDetailsMerge(existing, row) {
  const current = parseJsonObject(existing?.details_json);
  const patch = {
    origin: mergeNonBlank(parseJsonObject(current.origin), row.origin || {}),
    photo_and_documentation: mergeNonBlank(parseJsonObject(current.photo_and_documentation), row.photos || {}),
    workbook_source: {
      ...(parseJsonObject(current.workbook_source)),
      source_name: SOURCE_NAME,
      uploaded_source_name: row.uploaded_source_name,
      source_row: row.source_row,
      patch_version: PATCH_VERSION,
    },
  };
  return { ...current, ...patch };
}

function buildWriteData(existing, row, attributes, { details = false, isNew = false, documentId = '' } = {}) {
  const keys = attrKeySet(attributes);
  const data = {};
  assignRecognized(data, attributes, 'variety', row.variety);
  assignRecognized(data, attributes, 'source_name', SOURCE_NAME);
  assignRecognized(data, attributes, 'source_row', String(row.source_row));
  const flat = buildIncomingFlat(row);
  for (const [key, value] of Object.entries(flat)) assignRecognized(data, attributes, key, value);
  for (const [key, value] of Object.entries(row.photos || {})) assignRecognized(data, attributes, key, value);

  if (keys.has('traits_json')) {
    const currentTraits = parseJsonObject(existing?.traits_json);
    data.traits_json = JSON.stringify(mergeNonBlank(currentTraits, flat));
  }
  if (keys.has('details_json')) {
    data.details_json = JSON.stringify(buildDetailsMerge(existing, row));
  }
  const now = new Date().toISOString();
  if (keys.has('updated_at')) data.updated_at = now;
  if (isNew && keys.has('created_at')) data.created_at = now;
  for (const idKey of ['document_id','record_id','registry_id','core_id']) {
    if (isNew && keys.has(idKey) && !data[idKey]) data[idKey] = documentId;
  }
  return data;
}

function validateDataAgainstSchema(data, attributes, label, { isNew = false } = {}) {
  const errors = [];
  const byKey = new Map(attributes.map((a) => [a.key, a]));
  if (isNew) {
    for (const a of attributes) {
      if (a?.required && data[a.key] === undefined && a?.default === undefined) {
        errors.push(`${label}: required attribute ${a.key} has no value`);
      }
    }
  }
  for (const [key, value] of Object.entries(data)) {
    const a = byKey.get(key);
    if (!a) continue;
    if (typeof value === 'string' && Number(a.size || 0) > 0 && value.length > Number(a.size)) {
      errors.push(`${label}: ${key} length ${value.length} exceeds Appwrite size ${a.size}`);
    }
  }
  return errors;
}

function buildPlan(incomingRows, existingCore) {
  const byCanonical = groupBy(existingCore, (d) => canonical(d.variety));
  const bySourceRow = groupBy(existingCore, (d) => {
    const src = clean(d.source_name).toLowerCase();
    return src.includes('characterization') && clean(d.source_row) ? `${canonical(d.variety)}|${clean(d.source_row)}` : '';
  });
  const incomingGroups = groupBy(incomingRows, (r) => r.canonical);
  const used = new Set();
  const plan = [];

  for (const row of incomingRows) {
    let match = null;
    const srKey = `${row.canonical}|${row.source_row}`;
    const sourceMatches = (bySourceRow.get(srKey) || []).filter((d) => !used.has(d.$id));
    if (sourceMatches.length === 1) match = sourceMatches[0];

    if (!match) {
      const candidates = (byCanonical.get(row.canonical) || []).filter((d) => !used.has(d.$id));
      const incomingCount = (incomingGroups.get(row.canonical) || []).length;
      if (incomingCount === 1 && candidates.length === 1) match = candidates[0];
      else if (incomingCount > 1 && candidates.length === 1 && sourceMatches.length === 0) {
        // Preserve multiple workbook observations: never reuse one existing document for two source rows.
        match = null;
      } else if (incomingCount > 1 && candidates.length > 1) {
        const exactDisplay = candidates.filter((d) => clean(d.variety) === clean(row.variety));
        if (exactDisplay.length === 1) match = exactDisplay[0];
      }
    }

    if (match) {
      used.add(match.$id);
      plan.push({ action: 'update', row, document: match, documentId: match.$id });
      continue;
    }

    const allCandidates = byCanonical.get(row.canonical) || [];
    const incomingCount = (incomingGroups.get(row.canonical) || []).length;
    const sourceExistsForRow = (bySourceRow.get(srKey) || []).length;
    if (allCandidates.length > 1 && !sourceExistsForRow && incomingCount === 1) {
      plan.push({ action: 'conflict', row, reason: `Multiple existing records share canonical identity ${row.canonical}; no unique source-row match.` });
      continue;
    }
    plan.push({ action: 'create', row, documentId: stableId(row) });
  }
  return plan;
}

async function createDocument(collectionId, documentId, data, permissions = undefined) {
  const body = { documentId, data };
  if (Array.isArray(permissions)) body.permissions = permissions;
  return request('POST', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/documents`, body);
}

async function updateDocument(collectionId, documentId, data) {
  return request('PATCH', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`, { data });
}

async function deleteDocument(collectionId, documentId) {
  try { await request('DELETE', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/documents/${encodeURIComponent(documentId)}`); } catch {}
}

function backupFile(file) {
  if (!fs.existsSync(file)) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, path.basename(file));
  fs.copyFileSync(file, dest);
  return dest;
}

function updateStaticSeed(rows) {
  const seedPath = path.join(ROOT, 'seed', 'characterization.json');
  if (!fs.existsSync(seedPath)) return { skipped: true, reason: 'seed/characterization.json not present' };
  backupFile(seedPath);
  let root = readJson(seedPath);
  let records = Array.isArray(root) ? root : Array.isArray(root?.records) ? root.records : null;
  if (!records) return { skipped: true, reason: 'unrecognized seed JSON shape' };

  const byCanonical = groupBy(records, (r) => canonical(r.variety));
  const bySource = groupBy(records, (r) => clean(r.source_row) ? `${canonical(r.variety)}|${clean(r.source_row)}` : '');
  const used = new Set();
  let updated = 0, created = 0, conflicts = 0;
  const incomingGroups = groupBy(rows, (r) => r.canonical);

  for (const row of rows) {
    const sk = `${row.canonical}|${row.source_row}`;
    let candidates = (bySource.get(sk) || []).filter((r) => !used.has(r));
    let rec = candidates.length === 1 ? candidates[0] : null;
    if (!rec) {
      const can = (byCanonical.get(row.canonical) || []).filter((r) => !used.has(r));
      if ((incomingGroups.get(row.canonical) || []).length === 1 && can.length === 1) rec = can[0];
    }
    if (!rec) {
      const canAll = byCanonical.get(row.canonical) || [];
      if (canAll.length > 1 && (incomingGroups.get(row.canonical) || []).length === 1) { conflicts++; continue; }
      rec = { document_id: stableId(row) };
      records.push(rec);
      if (!byCanonical.has(row.canonical)) byCanonical.set(row.canonical, []);
      byCanonical.get(row.canonical).push(rec);
      created++;
    } else updated++;
    used.add(rec);
    rec.variety = row.variety;
    rec.source_name = SOURCE_NAME;
    rec.source_row = String(row.source_row);
    const flat = buildIncomingFlat(row);
    for (const [k,v] of Object.entries(flat)) if (clean(v) !== '') rec[k] = v;
    const traits = mergeNonBlank(parseJsonObject(rec.traits_json), flat);
    rec.traits_json = JSON.stringify(traits);
    rec.details_json = JSON.stringify(buildDetailsMerge(rec, row));
  }
  fs.writeFileSync(seedPath, JSON.stringify(root, null, 2) + '\n', 'utf8');
  return { skipped:false, updated, created, conflicts, total:records.length };
}

function updateLocalFiles(rows) {
  const changes = {};
  const canonicalWorkbook = path.join(ROOT, 'Characterization.xlsx');
  const exampleWorkbook = path.join(ROOT, 'examples', 'Characterization.xlsx');
  if (fs.existsSync(canonicalWorkbook)) backupFile(canonicalWorkbook);
  fs.copyFileSync(WORKBOOK_PATH, canonicalWorkbook);
  changes.characterization = path.relative(ROOT, canonicalWorkbook);
  if (fs.existsSync(path.dirname(exampleWorkbook))) {
    if (fs.existsSync(exampleWorkbook)) backupFile(exampleWorkbook);
    fs.copyFileSync(WORKBOOK_PATH, exampleWorkbook);
    changes.example_characterization = path.relative(ROOT, exampleWorkbook);
  }
  changes.seed = updateStaticSeed(rows);

  const pkgPath = path.join(ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    backupFile(pkgPath);
    const pkg = readJson(pkgPath);
    pkg.version = PATCH_VERSION;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    changes.package_version = PATCH_VERSION;
  }
  const versionPath = path.join(ROOT, 'public', 'version.json');
  if (fs.existsSync(path.dirname(versionPath))) {
    let versionObj = {};
    if (fs.existsSync(versionPath)) {
      backupFile(versionPath);
      try { versionObj = readJson(versionPath); } catch { versionObj = {}; }
    }
    versionObj.version = PATCH_VERSION;
    versionObj.updatedAt = new Date().toISOString();
    fs.writeFileSync(versionPath, JSON.stringify(versionObj, null, 2) + '\n', 'utf8');
    changes.public_version = PATCH_VERSION;
  }
  return changes;
}

async function main() {
  console.log(`\nConnecting to Appwrite ${endpoint}`);
  console.log(`Project: ${projectId}`);
  console.log(`Database: ${databaseId}`);
  const collections = await listCollections();
  const infos = [];
  for (const collection of collections) infos.push({ collection, attributes: await listAttributes(collection.$id) });
  const selected = scoreCollections(infos);
  const coreId = selected.core.collection.$id;
  const detailsId = selected.details.collection.$id;
  console.log(`Core collection: ${coreId}`);
  console.log(`Details collection: ${detailsId}`);

  const [coreDocs, detailsDocs] = await Promise.all([listDocuments(coreId), listDocuments(detailsId)]);
  console.log(`Existing records: ${coreDocs.length} core / ${detailsDocs.length} details`);
  const detailsById = new Map(detailsDocs.map((d) => [d.$id, d]));
  const detailsByCanonical = groupBy(detailsDocs, (d) => canonical(d.variety));
  const plan = buildPlan(payload.rows, coreDocs);
  const counts = plan.reduce((a,p) => (a[p.action]=(a[p.action]||0)+1,a),{});
  console.log(`Plan: ${counts.update||0} update, ${counts.create||0} create, ${counts.conflict||0} conflict.`);
  if (counts.conflict) {
    for (const p of plan.filter((x)=>x.action==='conflict').slice(0,20)) console.log(`  CONFLICT row ${p.row.source_row} ${p.row.variety}: ${p.reason}`);
    fail('Preflight found ambiguous existing identities. No records were changed. Resolve the listed conflicts before rerunning.', 2);
  }

  const schemaErrors = [];
  for (const item of plan) {
    const row = item.row;
    const docId = item.documentId;
    const existingDetails = detailsById.get(docId) || null;
    const coreData = buildWriteData(item.document || null, row, selected.core.attributes, { isNew:item.action==='create', documentId:docId });
    const detailsData = buildWriteData(existingDetails, row, selected.details.attributes, { details:true, isNew:!existingDetails, documentId:docId });
    schemaErrors.push(...validateDataAgainstSchema(coreData, selected.core.attributes, `core row ${row.source_row}`, { isNew:item.action==='create' }));
    schemaErrors.push(...validateDataAgainstSchema(detailsData, selected.details.attributes, `details row ${row.source_row}`, { isNew:!existingDetails }));
    if (schemaErrors.length >= 20) break;
  }
  if (schemaErrors.length) {
    for (const error of schemaErrors.slice(0,20)) console.log(`  SCHEMA: ${error}`);
    fail('Preflight found schema/size requirements that this patch cannot safely satisfy. No records were changed.', 2);
  }
  console.log('Preflight schema validation passed.');

  if (DRY_RUN) {
    console.log('\nDry run complete. No database or local files were changed.');
    return;
  }

  const report = {
    patch_version: PATCH_VERSION,
    started_at: new Date().toISOString(),
    endpoint, project_id: projectId, database_id: databaseId,
    collections: { core: coreId, details: detailsId },
    before: { core: coreDocs.length, details: detailsDocs.length },
    planned: counts,
    results: { updated:[], created:[], errors:[] },
    workbook: payload.workbook,
  };

  for (let i=0;i<plan.length;i++) {
    const item = plan[i];
    const row = item.row;
    const docId = item.documentId;
    try {
      const existingCore = item.document || null;
      let existingDetails = detailsById.get(docId) || null;
      if (!existingDetails) {
        const dc = detailsByCanonical.get(row.canonical) || [];
        if (dc.length === 1) existingDetails = dc[0];
      }
      const coreData = buildWriteData(existingCore, row, selected.core.attributes, { isNew:item.action==='create', documentId:docId });
      const detailsData = buildWriteData(existingDetails, row, selected.details.attributes, { details:true, isNew:!existingDetails, documentId:docId });

      if (item.action === 'update') await updateDocument(coreId, docId, coreData);
      else await createDocument(coreId, docId, coreData, coreDocs[0]?.$permissions);

      try {
        if (existingDetails) await updateDocument(detailsId, existingDetails.$id, detailsData);
        else await createDocument(detailsId, docId, detailsData, detailsDocs[0]?.$permissions);
      } catch (detailError) {
        if (item.action === 'create') await deleteDocument(coreId, docId);
        throw detailError;
      }

      const bucket = item.action === 'create' ? report.results.created : report.results.updated;
      bucket.push({ source_row:row.source_row, variety:row.variety, document_id:docId });
      if ((i+1)%50===0 || i===plan.length-1) console.log(`Applied ${i+1}/${plan.length} rows...`);
    } catch (error) {
      report.results.errors.push({ source_row:row.source_row, variety:row.variety, document_id:docId, message:error.message });
      console.error(`FAILED row ${row.source_row} ${row.variety}: ${error.message}`);
      break;
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive:true });
  report.finished_at = new Date().toISOString();
  const reportPath = path.join(REPORT_DIR, `germplasm-workbook-update-v${PATCH_VERSION}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  if (report.results.errors.length) {
    fail(`Stopped after an Appwrite error. The operation is idempotent, so fix the error and rerun. See ${path.relative(ROOT, reportPath)}. Local workbook/version files were NOT changed.`, 3);
  }

  if (!NO_LOCAL) report.local = updateLocalFiles(payload.rows);
  report.completed_at = new Date().toISOString();
  report.after = {
    core: (await listDocuments(coreId)).length,
    details: (await listDocuments(detailsId)).length,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(`\nSUCCESS: ${report.results.updated.length} existing records updated, ${report.results.created.length} missing records added.`);
  console.log(`No records were deleted. Blank workbook cells did not erase existing values.`);
  console.log(`Blank variety rows ${payload.workbook.blank_variety_rows.join(', ')} were intentionally skipped.`);
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);
  if (!NO_LOCAL) console.log(`Local canonical workbook/seed/version moved to v${PATCH_VERSION}.`);
}

main().catch((error) => fail(error?.message || String(error), 1));


