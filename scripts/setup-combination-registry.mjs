import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function loadDotEnv(file = '.env') {
  const full = path.resolve(process.cwd(), file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

const endpoint = String(process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1').replace(/\/$/, '');
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b';
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase';
const apiKey = process.env.APPWRITE_API_KEY;
const adminLabel = 'canesproutadmin';
const collectionId = 'sugarcane_combination_registry';
const seedPath = path.resolve(process.cwd(), 'seed/combination_registry_canonical.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const permissions = [
  'read("users")',
  `create("label:${adminLabel}")`,
  `update("label:${adminLabel}")`,
  `delete("label:${adminLabel}")`
];

const attrs = [
  ['male_variety', 255],
  ['male_key', 255],
  ['female_variety', 255],
  ['female_key', 255],
  ['combination_date', 32],
  ['source_date_text', 64],
  ['date_status', 16],
  ['notes', 1000],
  ['created_by', 36],
  ['created_by_name', 128],
  ['created_at', 32],
  ['source_workbook', 128],
  ['source_sheet', 255],
  ['source_row', 16],
  ['source_column', 8],
  ['source_cell', 16],
  ['source_hash', 64],
  ['search_text', 1024]
];

const indexes = [
  ['idx_combo_male', 'key', ['male_key'], ['ASC']],
  ['idx_combo_female', 'key', ['female_key'], ['ASC']],
  ['idx_combo_date', 'key', ['combination_date'], ['DESC']],
  ['idx_combo_source_hash', 'key', ['source_hash'], ['ASC']],
  ['fts_combo_search', 'fulltext', ['search_text'], []]
];

if (!apiKey || apiKey.includes('PASTE_TEMPORARY')) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Create a temporary Appwrite API key with database/collection/attribute/index/document read-write scopes, put it in .env as APPWRITE_API_KEY, run this setup once, then revoke the key.\n');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(method, route, body, attempt = 0) {
  let response;
  try {
    response = await fetch(`${endpoint}${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        'X-Appwrite-Response-Format': '1.9.5'
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
  } catch (error) {
    if (attempt < 4) {
      await sleep(800 * (attempt + 1));
      return request(method, route, body, attempt + 1);
    }
    throw new Error(`Could not connect to Appwrite at ${endpoint}: ${error?.cause?.message || error?.message || error}`);
  }

  const raw = await response.text();
  const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return { message: raw }; } })() : {};

  if (!response.ok) {
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 4) {
      await sleep(1000 * (attempt + 1));
      return request(method, route, body, attempt + 1);
    }
    const error = new Error(parsed?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.type = parsed?.type;
    error.payload = parsed;
    throw error;
  }
  return parsed;
}

async function exists(route) {
  try {
    await request('GET', route);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function listAttributes() {
  return (await request('GET', `/databases/${databaseId}/collections/${collectionId}/attributes?total=false`)).attributes || [];
}

async function waitForAttributes() {
  const keys = attrs.map(([key]) => key);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const map = new Map((await listAttributes()).map((item) => [item.key, item.status]));
    if (keys.every((key) => map.get(key) === 'available')) return;
    await sleep(1000);
  }
  throw new Error('Timed out while waiting for Combination Registry attributes. Run the command again.');
}

async function waitForIndexes() {
  const keys = indexes.map(([key]) => key);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const result = await request('GET', `/databases/${databaseId}/collections/${collectionId}/indexes?total=false`);
    const map = new Map((result.indexes || []).map((item) => [item.key, item.status]));
    if (keys.every((key) => map.get(key) === 'available')) return;
    await sleep(1000);
  }
  throw new Error('Timed out while waiting for Combination Registry indexes. Run the command again.');
}

function documentPayload(record) {
  const payload = {
    male_variety: String(record.male_variety || '').slice(0, 255),
    male_key: String(record.male_key || '').slice(0, 255),
    female_variety: String(record.female_variety || '').slice(0, 255),
    female_key: String(record.female_key || '').slice(0, 255),
    combination_date: String(record.combination_date || '').slice(0, 32),
    source_date_text: String(record.source_date_text || '').slice(0, 64),
    date_status: String(record.date_status || '').slice(0, 16),
    notes: '',
    created_by: 'source-import',
    created_by_name: 'Cross combination.xlsx',
    created_at: new Date().toISOString().slice(0, 32),
    source_workbook: String(record.source_workbook || 'Cross combination.xlsx').slice(0, 128),
    source_sheet: String(record.source_sheet || '').slice(0, 255),
    source_row: String(record.source_row || '').slice(0, 16),
    source_column: String(record.source_column || '').slice(0, 8),
    source_cell: String(record.source_cell || '').slice(0, 16),
    source_hash: String(record.source_hash || '').slice(0, 64)
  };
  payload.search_text = `${payload.female_variety} ${payload.male_variety} ${payload.source_date_text} ${payload.combination_date} ${payload.source_sheet} ${payload.source_cell}`
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1024);
  return payload;
}

async function seedOne(record) {
  const id = String(record.document_id);
  const payload = documentPayload(record);

  try {
    await request('POST', `/databases/${databaseId}/collections/${collectionId}/documents`, {
      documentId: id,
      data: payload
    });
    return 'created';
  } catch (error) {
    if (error.status !== 409) throw error;
  }

  const existing = await request('GET', `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(id)}`);
  if (String(existing?.source_hash || '') === payload.source_hash) return 'unchanged';

  await request('PATCH', `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(id)}`, {
    data: payload
  });
  return 'updated';
}

async function seedWorkbookData() {
  const records = Array.isArray(seed?.records) ? seed.records : [];
  const stats = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  let nextIndex = 0;
  let completed = 0;
  const failures = [];

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= records.length) return;
      const record = records[index];

      try {
        const status = await seedOne(record);
        stats[status] += 1;
      } catch (error) {
        stats.failed += 1;
        failures.push(`${record.source_sheet}!${record.source_cell}: ${error.message}`);
      } finally {
        completed += 1;
        if (completed % 100 === 0 || completed === records.length) {
          console.log(`  ${completed}/${records.length} source records processed`);
        }
      }
    }
  }

  const workers = Array.from({ length: 6 }, () => worker());
  await Promise.all(workers);

  if (failures.length) {
    console.error('\nImport failures:');
    for (const item of failures.slice(0, 30)) console.error(`  - ${item}`);
    if (failures.length > 30) console.error(`  ...and ${failures.length - 30} more`);
    throw new Error(`${failures.length} combination records failed to import.`);
  }

  return stats;
}

async function cleanupKnownSourceDuplicates() {
  const groups = Array.isArray(seed?.duplicate_cleanup) ? seed.duplicate_cleanup : [];
  const stats = { checked: 0, deleted: 0, alreadyAbsent: 0, skipped: 0 };

  for (const group of groups) {
    const keepId = String(group?.keep_document_id || '');
    if (!keepId) continue;

    let keeper;
    try {
      keeper = await request('GET', `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(keepId)}`);
    } catch (error) {
      if (error.status === 404) {
        stats.skipped += (group?.removed || []).length;
        continue;
      }
      throw error;
    }

    for (const duplicate of group?.removed || []) {
      const removeId = String(duplicate?.document_id || '');
      if (!removeId) continue;
      stats.checked += 1;

      let current;
      try {
        current = await request('GET', `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(removeId)}`);
      } catch (error) {
        if (error.status === 404) {
          stats.alreadyAbsent += 1;
          continue;
        }
        throw error;
      }

      const sameEvent =
        String(current?.female_key || '') === String(keeper?.female_key || '') &&
        String(current?.male_key || '') === String(keeper?.male_key || '') &&
        String(current?.combination_date || '') === String(keeper?.combination_date || '') &&
        String(current?.source_date_text || '') === String(keeper?.source_date_text || '');

      if (!sameEvent) {
        stats.skipped += 1;
        console.warn(`  ! skipped ${removeId}: cloud document no longer matches its audited duplicate keeper`);
        continue;
      }

      await request('DELETE', `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(removeId)}`);
      stats.deleted += 1;
    }
  }

  return stats;
}

console.log('\nCaneSprout Combination Registry setup + canonical workbook import v2.12.2');
console.log(`Endpoint: ${endpoint}`);
console.log(`Project:  ${projectId}`);
console.log(`Database: ${databaseId}`);
console.log(`Source:   ${seed?.metadata?.source_workbook || 'Cross combination.xlsx'}`);
console.log(`SHA-256:  ${seed?.metadata?.source_sha256 || 'not recorded'}`);
console.log(`Unique events: ${seed?.metadata?.combination_records || 0}`);
console.log(`Raw source entries checked: ${seed?.metadata?.source_combination_records_raw || seed?.metadata?.combination_records || 0}`);
console.log(`Duplicate source entries excluded: ${seed?.metadata?.duplicate_extra_records_removed || 0}\n`);

if (!(await exists(`/databases/${databaseId}/collections/${collectionId}`))) {
  await request('POST', `/databases/${databaseId}/collections`, {
    collectionId,
    name: 'SUGARCANE_COMBINATION_REGISTRY',
    permissions,
    documentSecurity: false,
    enabled: true
  });
  console.log(`✓ created ${collectionId}`);
} else {
  console.log(`• ${collectionId} already exists`);
}

const currentAttrs = new Set((await listAttributes()).map((item) => item.key));
for (const [key, size] of attrs) {
  if (currentAttrs.has(key)) continue;
  await request('POST', `/databases/${databaseId}/collections/${collectionId}/attributes/string`, {
    key, size, required: false, array: false, encrypt: false
  });
  console.log(`  ✓ attribute ${key}`);
}

console.log('Waiting for attributes…');
await waitForAttributes();

await request('PUT', `/databases/${databaseId}/collections/${collectionId}`, {
  name: 'SUGARCANE_COMBINATION_REGISTRY',
  permissions,
  documentSecurity: false,
  enabled: true,
  purge: true
});
console.log('✓ permissions enforced');

for (const [key, type, attributes, orders] of indexes) {
  if (await exists(`/databases/${databaseId}/collections/${collectionId}/indexes/${key}`)) {
    console.log(`• index ${key} already exists`);
    continue;
  }
  await request('POST', `/databases/${databaseId}/collections/${collectionId}/indexes`, {
    key, type, attributes, orders, lengths: []
  });
  console.log(`✓ created index ${key}`);
}

console.log('Waiting for indexes…');
await waitForIndexes();

console.log('\nImporting the verified canonical workbook combination history…');
const result = await seedWorkbookData();

console.log('\nRemoving known duplicate source documents from older imports…');
const duplicateCleanup = await cleanupKnownSourceDuplicates();

console.log('\n✓ Combination Registry canonical import complete.');
console.log(`  Created:   ${result.created}`);
console.log(`  Updated:   ${result.updated}`);
console.log(`  Unchanged: ${result.unchanged}`);
console.log(`  Unique events: ${seed?.metadata?.combination_records || 0}`);
console.log(`  Raw source entries: ${seed?.metadata?.source_combination_records_raw || seed?.metadata?.combination_records || 0}`);
console.log(`  Duplicate groups removed: ${seed?.metadata?.duplicate_groups_removed || 0}`);
console.log(`  Cloud duplicate documents deleted now: ${duplicateCleanup.deleted}`);
console.log(`  Cloud duplicate documents already absent: ${duplicateCleanup.alreadyAbsent}`);
console.log(`  Sheets:    ${seed?.metadata?.sheet_count || 0}`);
console.log(`  Missing source-date records preserved: ${seed?.metadata?.missing_date_records || 0}`);
console.log(`  Invalid source-date records preserved exactly: ${seed?.metadata?.invalid_date_records || 0}`);
console.log('\nHistorical data is now searchable in both directions.');
console.log('Revoke the temporary APPWRITE_API_KEY now.\n');
