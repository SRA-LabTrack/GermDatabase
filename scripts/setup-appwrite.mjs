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
const initialAdminEmail = String(process.env.INITIAL_ADMIN_EMAIL || 'ncrowsboosting@gmail.com').trim().toLowerCase();
const initialAdminPassword = String(process.env.INITIAL_ADMIN_PASSWORD || '');
const initialAdminUserId = String(process.env.INITIAL_ADMIN_USER_ID || '6a7534ee0022112c4500').trim();
const initialAdminName = String(process.env.INITIAL_ADMIN_NAME || 'CaneSprout Administrator').trim();
const adminLabel = 'canesproutadmin';

// v2.1.2 splits the record into two deliberately small collections.
// This avoids Appwrite's collection row/schema size budget while keeping list
// requests lean. Failed v2.1.0/v2.1.1 collections are left untouched.
const coreCollection = 'sugarcane_registry_core';
const detailsCollection = 'sugarcane_registry_details';
const requestsCollection = 'registry_change_requests';
const legacyCollections = ['sugarcane_characterizations', 'sugarcane_registry'];
const metaCollection = 'registry_meta';
const seedSentinel = 'characterization_seed_v212_split';
const seedPath = path.resolve(process.cwd(), 'seed', 'characterization.json');

if (!apiKey || apiKey.includes('PASTE_TEMPORARY')) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Create a temporary Appwrite server API key with database, row, column, index, storage, and users read/write scopes, put it in .env, run setup once, then revoke it.\n');
  process.exit(1);
}
if (!fs.existsSync(seedPath)) {
  console.error(`Seed file not found: ${seedPath}`);
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const livePermissions = [
  'read("users")',
  `create("label:${adminLabel}")`,
  `update("label:${adminLabel}")`,
  `delete("label:${adminLabel}")`
];
const requestPermissions = [
  'create("users")',
  `read("label:${adminLabel}")`,
  `update("label:${adminLabel}")`,
  `delete("label:${adminLabel}")`
];
const mediaPermissions = [
  'read("users")',
  'create("users")',
  `update("label:${adminLabel}")`,
  `delete("label:${adminLabel}")`
];
const traitKeys = seed.fields.map((field) => field.key);

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

const textAttr = (key, size = 255) => ({ key, size });

// Core stays intentionally tiny because every registry page reads it.
const coreAttrs = [
  textAttr('variety', 255),
  textAttr('stool_plant_habit', 128),
  textAttr('leaf_color', 128),
  textAttr('stalk_exposed_color', 128),
  textAttr('bud_shape', 128),
  textAttr('germ_trial_code', 128),
  textAttr('germ_location', 256),
  textAttr('germ_status', 64),
  textAttr('germination_pct', 32),
  textAttr('thumbnail_file_id', 36),
  textAttr('source_name', 255),
  textAttr('source_row', 32),
  textAttr('search_text', 4096)
];

// Heavy traits live in a separate document fetched only when a card is opened.
// 4096 + 4096 is comfortably below the failed schema's reserved string budget.
const detailAttrs = [
  textAttr('traits_json', 4096),
  textAttr('details_json', 4096)
];

const requestAttrs = [
  textAttr('request_type', 16),
  textAttr('target_id', 36),
  textAttr('submitted_by', 36),
  textAttr('submitted_name', 128),
  textAttr('submitted_email', 320),
  textAttr('submitted_at', 32),
  textAttr('status', 16),
  textAttr('variety_summary', 255),
  textAttr('payload_json', 12000),
  textAttr('resolution_note', 500),
  textAttr('resolved_at', 32),
  textAttr('resolved_by', 128)
];

async function enforceCollectionPolicy(collectionId, name, permissions, documentSecurity = false) {
  await request('PUT', `/databases/${databaseId}/collections/${collectionId}`, {
    name, permissions, documentSecurity, enabled: true, purge: true
  });
  console.log(`✓ enforced permissions for ${collectionId}`);
}

async function bootstrapAdministrator() {
  try {
    let chosen = null;
    if (initialAdminEmail) {
      if (initialAdminUserId) {
        try {
          const direct = await request('GET', `/users/${encodeURIComponent(initialAdminUserId)}`);
          if (String(direct?.email || '').toLowerCase() === initialAdminEmail) chosen = direct;
        } catch (error) {
          if (error.status !== 404) console.warn(`! Direct bootstrap-admin lookup was unavailable: ${error.message}`);
        }
      }
      if (!chosen) {
        const result = await request('GET', `/users?total=false&search=${encodeURIComponent(initialAdminEmail)}`);
        chosen = (result.users || []).find((user) => String(user.email || '').toLowerCase() === initialAdminEmail) || null;
      }
      if (!chosen && initialAdminPassword.length >= 8) {
        chosen = await request('POST', '/users', {
          userId: `admin_${Date.now().toString(36)}`,
          email: initialAdminEmail,
          password: initialAdminPassword,
          name: initialAdminName || initialAdminEmail.split('@')[0]
        });
        console.log(`✓ created initial administrator account ${initialAdminEmail}`);
      }
    } else {
      const result = await request('GET', '/users?total=false');
      if ((result.users || []).length === 1) chosen = result.users[0];
    }

    if (!chosen) {
      console.warn(`! Administrator ${initialAdminEmail} was not assigned. Run npm.cmd run grant:bootstrap-admin after setup.`);
      return;
    }
    const labels = new Set(Array.isArray(chosen.labels) ? chosen.labels.filter(Boolean) : []);
    labels.delete('canesprout_admin');
    labels.add(adminLabel);
    await request('PUT', `/users/${chosen.$id}/labels`, { labels: Array.from(labels) });
    console.log(`✓ administrator authority granted to ${chosen.email || chosen.$id}`);
  } catch (error) {
    console.warn(`! Bootstrap administrator assignment was skipped: ${error.message}`);
    console.warn('  Run npm.cmd run grant:bootstrap-admin after setup; the registry schema can still finish safely.');
  }
}

async function listAttributes(collectionId) {
  return (await request('GET', `/databases/${databaseId}/collections/${collectionId}/attributes?total=false`)).attributes || [];
}

async function ensureAttributes(collectionId, attributes) {
  const existing = new Set((await listAttributes(collectionId)).map((attribute) => attribute.key));
  const base = `/databases/${databaseId}/collections/${collectionId}/attributes`;
  for (const attribute of attributes) {
    if (existing.has(attribute.key)) continue;
    try {
      await request('POST', `${base}/string`, {
        key: attribute.key,
        size: attribute.size,
        required: false,
        array: false,
        encrypt: false
      });
      console.log(`  ✓ ${attribute.key}`);
    } catch (error) {
      if (error.status === 409) continue;
      if (error.type === 'attribute_limit_exceeded') {
        throw new Error(`Appwrite rejected ${collectionId}.${attribute.key} because of its schema size budget. This v2.1.2 split schema should stay below that limit; if this collection was manually altered, delete only ${collectionId} and rerun setup.`);
      }
      throw error;
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
  throw new Error(`Timed out while waiting for ${collectionId} attributes. Run setup again if needed.`);
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

async function waitForIndexes(collectionId, keys) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const result = await request('GET', `/databases/${databaseId}/collections/${collectionId}/indexes?total=false`);
    const map = new Map((result.indexes || []).map((index) => [index.key, index.status]));
    if (keys.every((key) => map.get(key) === 'available')) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out while waiting for ${collectionId} search indexes. Run setup again if needed.`);
}

function seedParts(source) {
  const traits = Object.fromEntries(traitKeys.map((key) => [key, String(source[key] ?? '')]));
  const searchText = String(source.search_text || Object.values(traits).filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 4096);
  const core = {
    variety: traits.variety || '',
    stool_plant_habit: traits.stool_plant_habit || '',
    leaf_color: traits.leaf_color || '',
    stalk_exposed_color: traits.stalk_exposed_color || '',
    bud_shape: traits.bud_shape || '',
    germ_trial_code: '',
    germ_location: '',
    germ_status: '',
    germination_pct: '',
    thumbnail_file_id: '',
    source_name: String(source.source_name || seed.source || 'Characterization.xlsx'),
    source_row: source.source_row == null ? '' : String(source.source_row),
    search_text: searchText
  };
  const details = {
    germ_planting_date: '',
    germ_material_type: '',
    germ_buds_planted: '',
    germ_germinated_count: '',
    germ_observation_date: '',
    germ_notes: '',
    photo_file_ids: [],
    thumb_file_ids: [],
    photo_names: [],
    primary_file_id: ''
  };
  const traitsJson = JSON.stringify(traits);
  const detailsJson = JSON.stringify(details);
  if (traitsJson.length > 4096) throw new Error(`Seed row ${source.source_row} traits_json exceeds 4096 characters.`);
  if (detailsJson.length > 4096) throw new Error(`Seed row ${source.source_row} details_json exceeds 4096 characters.`);
  return { core, detail: { traits_json: traitsJson, details_json: detailsJson } };
}

async function hasSeedSentinel() {
  try {
    await request('GET', `/databases/${databaseId}/collections/${metaCollection}/documents/${seedSentinel}`);
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function createIfMissing(collectionId, documentId, data) {
  try {
    await request('POST', `/databases/${databaseId}/collections/${collectionId}/documents`, { documentId, data });
    return true;
  } catch (error) {
    if (error.status === 409) return false;
    throw error;
  }
}

async function seedRecords() {
  if (await hasSeedSentinel()) {
    console.log(`• ${seed.recordCount} characterization rows were already seeded into the v2.1.2 split schema; skipping bulk writes`);
    return;
  }

  console.log(`\nSeeding ${seed.recordCount} spreadsheet rows into split core/detail records (one-time operation)…`);
  let next = 0;
  let completed = 0;
  let coreCreated = 0;
  let detailsCreated = 0;
  const failures = [];

  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= seed.records.length) return;
      const source = seed.records[index];
      const documentId = source.document_id;
      try {
        const { core, detail } = seedParts(source);
        if (await createIfMissing(detailsCollection, documentId, detail)) detailsCreated += 1;
        if (await createIfMissing(coreCollection, documentId, core)) coreCreated += 1;
      } catch (error) {
        failures.push({ index, id: documentId, message: error.message });
      }
      completed += 1;
      if (completed % 50 === 0 || completed === seed.records.length) {
        console.log(`  ${completed}/${seed.records.length} processed (${coreCreated} core + ${detailsCreated} detail new)`);
      }
    }
  };

  await Promise.all(Array.from({ length: 4 }, worker));
  if (failures.length) {
    console.error(`Seed encountered ${failures.length} failures. First failure:`, failures[0]);
    throw new Error('Characterization seed did not finish cleanly. Run setup again; deterministic existing rows will be skipped.');
  }

  await request('POST', `/databases/${databaseId}/collections/${metaCollection}/documents`, {
    documentId: seedSentinel,
    data: { key: seedSentinel, value: `${seed.recordCount} split core/detail rows from ${seed.source}` }
  });
  console.log(`✓ seeded all ${seed.recordCount} spreadsheet rows`);
}

async function main() {
  console.log('\nSugarcane Germination & Characterization Registry setup v2.5.0');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project:  ${projectId}`);
  console.log(`Database: ${databaseId}\n`);

  await ensurePlatforms();
  await ensure(`database ${databaseId}`, `/databases/${databaseId}`, '/databases', { databaseId, name: 'Sugarcane Registry', enabled: true });

  await ensure(`collection ${coreCollection}`,
    `/databases/${databaseId}/collections/${coreCollection}`,
    `/databases/${databaseId}/collections`,
    { collectionId: coreCollection, name: 'SUGARCANE_REGISTRY_CORE', permissions: livePermissions, documentSecurity: false, enabled: true });
  await ensureAttributes(coreCollection, coreAttrs);

  await ensure(`collection ${detailsCollection}`,
    `/databases/${databaseId}/collections/${detailsCollection}`,
    `/databases/${databaseId}/collections`,
    { collectionId: detailsCollection, name: 'SUGARCANE_REGISTRY_DETAILS', permissions: livePermissions, documentSecurity: false, enabled: true });
  await ensureAttributes(detailsCollection, detailAttrs);

  await ensure(`collection ${requestsCollection}`,
    `/databases/${databaseId}/collections/${requestsCollection}`,
    `/databases/${databaseId}/collections`,
    { collectionId: requestsCollection, name: 'REGISTRY_CHANGE_REQUESTS', permissions: requestPermissions, documentSecurity: true, enabled: true });
  await ensureAttributes(requestsCollection, requestAttrs);

  await ensure(`collection ${metaCollection}`,
    `/databases/${databaseId}/collections/${metaCollection}`,
    `/databases/${databaseId}/collections`,
    { collectionId: metaCollection, name: 'REGISTRY_META', permissions: [], documentSecurity: false, enabled: true });
  await ensureAttributes(metaCollection, [textAttr('key', 128), textAttr('value', 1024)]);

  console.log('\nWaiting for split schema fields to finish provisioning…');
  await waitForAttributes(coreCollection, coreAttrs.map((attribute) => attribute.key));
  await waitForAttributes(detailsCollection, detailAttrs.map((attribute) => attribute.key));
  await waitForAttributes(requestsCollection, requestAttrs.map((attribute) => attribute.key));
  await waitForAttributes(metaCollection, ['key', 'value']);

  await enforceCollectionPolicy(coreCollection, 'SUGARCANE_REGISTRY_CORE', livePermissions, false);
  await enforceCollectionPolicy(detailsCollection, 'SUGARCANE_REGISTRY_DETAILS', livePermissions, false);
  await enforceCollectionPolicy(requestsCollection, 'REGISTRY_CHANGE_REQUESTS', requestPermissions, true);

  // Key indexes power exact/prefix/contains field filters without full-text token
  // broadening. Fresh installs need these lean field indexes plus one keyword index.
  await ensureIndex(coreCollection, 'idx_variety', 'key', ['variety'], ['ASC']);
  await ensureIndex(coreCollection, 'idx_trial', 'key', ['germ_trial_code'], ['ASC']);
  await ensureIndex(coreCollection, 'idx_location', 'key', ['germ_location'], ['ASC']);
  await ensureIndex(coreCollection, 'idx_status', 'key', ['germ_status'], ['ASC']);
  await ensureIndex(coreCollection, 'fts_search', 'fulltext', ['search_text']);
  await ensureIndex(requestsCollection, 'idx_request_status', 'key', ['status'], ['ASC']);
  await ensureIndex(requestsCollection, 'idx_request_submitter', 'key', ['submitted_by'], ['ASC']);

  console.log('Waiting for registry search indexes to finish provisioning…');
  await waitForIndexes(coreCollection, ['idx_variety', 'idx_trial', 'idx_location', 'idx_status', 'fts_search']);
  await waitForIndexes(requestsCollection, ['idx_request_status', 'idx_request_submitter']);

  try {
    await ensure(`storage bucket ${bucketId}`, `/storage/buckets/${bucketId}`, '/storage/buckets', {
      bucketId,
      name: 'Sugarcane Photos',
      permissions: mediaPermissions,
      fileSecurity: true,
      enabled: true,
      maximumFileSize: 15728640,
      allowedFileExtensions: ['webp'],
      compression: 'none',
      encryption: true,
      antivirus: true,
      transformations: true
    });
    await request('PUT', `/storage/buckets/${bucketId}`, {
      name: 'Sugarcane Photos',
      permissions: mediaPermissions,
      fileSecurity: true,
      enabled: true,
      maximumFileSize: 15728640,
      allowedFileExtensions: ['webp'],
      compression: 'none',
      encryption: true,
      antivirus: true,
      transformations: true
    });
    console.log('✓ enforced photo bucket permissions');
  } catch (error) {
    console.warn(`! Storage bucket setup skipped: ${error.message}`);
  }

  await bootstrapAdministrator();
  await seedRecords();

  console.log('\nDone.');
  console.log(`• Lean list/search collection: ${coreCollection}`);
  console.log(`• On-demand trait/photo collection: ${detailsCollection}`);
  console.log('• All 60 Characterization.xlsx traits remain optional and are preserved in traits_json.');
  console.log('• Registry pages read only 25 lean core rows; the heavy detail document is fetched only when a record is opened.');
  console.log('• Variety, trial code, location, and status use exact/prefix/contains key indexes; all-trait keywords use one full-text index.');
  console.log(`• Failed legacy collections (${legacyCollections.join(', ')}) are ignored and were not modified.`);
  console.log('• Users can read live records but cannot directly create, update, or delete them.');
  console.log('• User registrations/edits are stored in registry_change_requests until an administrator approves them.');
  console.log(`• Administrator authority is enforced with the Appwrite user label ${adminLabel}.`);
  console.log('• Old GermDatabase/germination collections were not deleted.');
  console.log('Revoke/delete the temporary APPWRITE_API_KEY used for setup now. For Vercel account management, create a separate least-privilege server key and store it only as APPWRITE_ADMIN_API_KEY.\n');
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error.message}`);
  if (error.type) console.error(`Appwrite type: ${error.type}`);
  process.exit(1);
});
