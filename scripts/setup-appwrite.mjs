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
const bucketId = process.env.APPWRITE_MEDIA_BUCKET_ID || process.env.VITE_APPWRITE_MEDIA_BUCKET_ID || 'germ-media';
const apiKey = process.env.APPWRITE_API_KEY;
const recordsCollection = 'sugarcane_characterizations';
const metaCollection = 'registry_meta';
const seedPath = path.resolve(process.cwd(), 'seed', 'characterization.json');

if (!apiKey || apiKey.includes('PASTE_TEMPORARY')) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Create a temporary Appwrite server API key with database + storage management scopes, put it in .env, run setup once, then revoke it.\n');
  process.exit(1);
}
if (!fs.existsSync(seedPath)) {
  console.error(`Seed file not found: ${seedPath}`);
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const permissions = ['read("users")', 'create("users")', 'update("users")', 'delete("users")'];

async function request(method, route, body) {
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
    throw new Error(`Could not connect to Appwrite at ${endpoint}: ${error?.cause?.message || error?.message || error}`);
  }
  const text = await response.text();
  const parsed = text ? (() => { try { return JSON.parse(text); } catch { return { message: text }; } })() : {};
  if (!response.ok) {
    const error = new Error(parsed?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.type = parsed?.type;
    throw error;
  }
  return parsed;
}

async function ensure(label, checkRoute, createRoute, body) {
  try {
    await request('GET', checkRoute);
    console.log(`• ${label} already exists`);
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await request('POST', createRoute, body);
  console.log(`✓ created ${label}`);
}

async function ensurePlatforms() {
  const wanted = [
    { platformId: 'sugarcane-localhost', name: 'Sugarcane Registry Localhost', hostname: 'localhost' },
    { platformId: 'sugarcane-loopback', name: 'Sugarcane Registry Loopback', hostname: '127.0.0.1' }
  ];
  try {
    const result = await request('GET', '/project/platforms?total=false');
    for (const platform of wanted) {
      if ((result.platforms || []).some((item) => item?.type === 'web' && item?.hostname === platform.hostname)) continue;
      try { await request('POST', '/project/platforms/web', platform); } catch (error) { if (error.status !== 409) throw error; }
    }
  } catch (error) {
    console.warn(`! Could not register localhost automatically: ${error.message}`);
  }
}

const textAttr = (key, size = 1024, array = false) => ({ key, type: 'string', size, required: false, array });
const floatAttr = (key) => ({ key, type: 'float', required: false, array: false });

const characterizationAttrs = [
  ...seed.fields.map((field) => textAttr(field.key, field.key === 'variety' ? 255 : 2048)),
  textAttr('germ_trial_code', 255),
  textAttr('germ_location', 512),
  textAttr('germ_planting_date', 32),
  textAttr('germ_material_type', 128),
  floatAttr('germ_buds_planted'),
  floatAttr('germ_germinated_count'),
  floatAttr('germination_pct'),
  textAttr('germ_observation_date', 32),
  textAttr('germ_status', 64),
  textAttr('germ_notes', 4096),
  textAttr('photo_file_ids', 36, true),
  textAttr('thumb_file_ids', 36, true),
  textAttr('photo_names', 255, true),
  textAttr('thumbnail_file_id', 36),
  textAttr('primary_file_id', 36),
  textAttr('source_name', 255),
  floatAttr('source_row'),
  textAttr('search_text', 12000)
];

async function listAttributes(collectionId) {
  return (await request('GET', `/databases/${databaseId}/collections/${collectionId}/attributes?total=false`)).attributes || [];
}

async function ensureAttributes(collectionId, attributes) {
  const existing = new Set((await listAttributes(collectionId)).map((attribute) => attribute.key));
  const base = `/databases/${databaseId}/collections/${collectionId}/attributes`;
  for (const attribute of attributes) {
    if (existing.has(attribute.key)) continue;
    try {
      if (attribute.type === 'string') {
        await request('POST', `${base}/string`, {
          key: attribute.key,
          size: attribute.size,
          required: false,
          array: Boolean(attribute.array),
          encrypt: false
        });
      } else {
        await request('POST', `${base}/float`, {
          key: attribute.key,
          required: false,
          array: false
        });
      }
      console.log(`  ✓ ${attribute.key}`);
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }
}

async function waitForAttributes(collectionId, keys) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const attrs = await listAttributes(collectionId);
    const map = new Map(attrs.map((attribute) => [attribute.key, attribute.status]));
    if (keys.every((key) => map.get(key) === 'available')) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Timed out while waiting for Appwrite attributes to become available. Run setup again if needed.');
}

async function ensureIndex(collectionId, key, type, attributes, orders = []) {
  const route = `/databases/${databaseId}/collections/${collectionId}/indexes/${key}`;
  try {
    await request('GET', route);
    console.log(`• index ${key} already exists`);
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await request('POST', `/databases/${databaseId}/collections/${collectionId}/indexes`, {
    key,
    type,
    attributes,
    orders,
    lengths: []
  });
  console.log(`✓ created index ${key}`);
}

async function hasSeedSentinel() {
  try {
    await request('GET', `/databases/${databaseId}/collections/${metaCollection}/documents/characterization_seed_v1`);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function seedRecords() {
  if (await hasSeedSentinel()) {
    console.log(`• ${seed.recordCount} characterization rows were already seeded; skipping bulk writes`);
    return;
  }

  console.log(`\nSeeding ${seed.recordCount} spreadsheet rows (one-time operation)…`);
  let next = 0;
  let completed = 0;
  let created = 0;
  const failures = [];

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= seed.records.length) return;
      const source = seed.records[index];
      const data = { ...source };
      const documentId = data.document_id;
      delete data.document_id;
      try {
        await request('POST', `/databases/${databaseId}/collections/${recordsCollection}/documents`, { documentId, data });
        created += 1;
      } catch (error) {
        if (error.status !== 409) failures.push({ index, id: documentId, message: error.message });
      }
      completed += 1;
      if (completed % 50 === 0 || completed === seed.records.length) {
        console.log(`  ${completed}/${seed.records.length} processed (${created} new)`);
      }
    }
  };

  await Promise.all(Array.from({ length: 4 }, worker));
  if (failures.length) {
    console.error(`Seed encountered ${failures.length} failures. First failure:`, failures[0]);
    throw new Error('Characterization seed did not finish cleanly. Run setup again; existing deterministic rows will be skipped.');
  }

  await request('POST', `/databases/${databaseId}/collections/${metaCollection}/documents`, {
    documentId: 'characterization_seed_v1',
    data: { key: 'characterization_seed_v1', value: `${seed.recordCount} rows from ${seed.source}` }
  });
  console.log(`✓ seeded all ${seed.recordCount} spreadsheet rows`);
}

async function main() {
  console.log('\nSugarcane Germination & Characterization Registry setup');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project:  ${projectId}`);
  console.log(`Database: ${databaseId}\n`);

  await ensurePlatforms();
  await ensure(`database ${databaseId}`, `/databases/${databaseId}`, '/databases', { databaseId, name: 'Sugarcane Registry', enabled: true });

  await ensure(`collection ${recordsCollection}`,
    `/databases/${databaseId}/collections/${recordsCollection}`,
    `/databases/${databaseId}/collections`,
    { collectionId: recordsCollection, name: 'SUGARCANE_CHARACTERIZATIONS', permissions, documentSecurity: false, enabled: true });
  await ensureAttributes(recordsCollection, characterizationAttrs);

  await ensure(`collection ${metaCollection}`,
    `/databases/${databaseId}/collections/${metaCollection}`,
    `/databases/${databaseId}/collections`,
    { collectionId: metaCollection, name: 'REGISTRY_META', permissions: [], documentSecurity: false, enabled: true });
  await ensureAttributes(metaCollection, [textAttr('key', 128), textAttr('value', 1024)]);

  console.log('\nWaiting for all record fields to finish provisioning…');
  await waitForAttributes(recordsCollection, characterizationAttrs.map((attribute) => attribute.key));
  await waitForAttributes(metaCollection, ['key', 'value']);

  await ensureIndex(recordsCollection, 'idx_variety', 'key', ['variety'], ['ASC']);
  await ensureIndex(recordsCollection, 'fts_search', 'fulltext', ['search_text']);

  try {
    await ensure(`storage bucket ${bucketId}`, `/storage/buckets/${bucketId}`, '/storage/buckets', {
      bucketId,
      name: 'Sugarcane Photos',
      permissions,
      fileSecurity: false,
      enabled: true,
      maximumFileSize: 15728640,
      allowedFileExtensions: ['webp'],
      compression: 'none',
      encryption: true,
      antivirus: true,
      transformations: true
    });
  } catch (error) {
    console.warn(`! Storage bucket setup skipped: ${error.message}`);
  }

  await seedRecords();

  console.log('\nDone.');
  console.log('• All spreadsheet traits are optional in the UI and Appwrite schema.');
  console.log('• All Characterization.xlsx rows are seeded once using deterministic IDs.');
  console.log('• Registry searches use full-text indexes, 30-row cursor pages, and lean field selection.');
  console.log('• Old GermDatabase/germination collections were not deleted.');
  console.log('Revoke/delete the temporary APPWRITE_API_KEY now.\n');
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error.message}`);
  if (error.type) console.error(`Appwrite type: ${error.type}`);
  process.exit(1);
});
