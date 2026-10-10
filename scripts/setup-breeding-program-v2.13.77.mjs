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
const collectionId = 'breeding_program_documents';
const bucketId = process.env.APPWRITE_BREEDING_BUCKET_ID || process.env.VITE_APPWRITE_BREEDING_BUCKET_ID || 'breeding-program';

if (!apiKey || apiKey.includes('PASTE_TEMPORARY')) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Create a temporary Appwrite API key with database/collection/attribute/index/storage read-write scopes, add APPWRITE_API_KEY to .env, run this setup once, then revoke the key.\n');
  process.exit(1);
}

const documentPermissions = [
  'read("users")',
  `create("label:${adminLabel}")`,
  `update("label:${adminLabel}")`,
  `delete("label:${adminLabel}")`
];

const bucketPermissions = [
  'read("users")',
  `create("label:${adminLabel}")`,
  `update("label:${adminLabel}")`,
  `delete("label:${adminLabel}")`
];

const attrs = [
  ['category', 32],
  ['title', 255],
  ['code', 64],
  ['year', 16],
  ['authors', 1000],
  ['description', 2000],
  ['file_id', 36],
  ['file_name', 255],
  ['mime_type', 128],
  ['size_bytes', 32],
  ['uploaded_by', 36],
  ['uploaded_by_name', 128],
  ['created_at', 32],
  ['search_text', 4096]
];

const indexes = [
  ['idx_breeding_category', 'key', ['category'], ['ASC']],
  ['idx_breeding_year', 'key', ['year'], ['DESC']],
  ['idx_breeding_created', 'key', ['created_at'], ['DESC']],
  ['fts_breeding_search', 'fulltext', ['search_text'], []]
];

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
    if (attempt < 3) {
      await sleep(700 * (attempt + 1));
      return request(method, route, body, attempt + 1);
    }
    throw error;
  }

  const raw = await response.text();
  const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return { message: raw }; } })() : {};

  if (!response.ok) {
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 3) {
      await sleep(900 * (attempt + 1));
      return request(method, route, body, attempt + 1);
    }
    const error = new Error(parsed?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.type = parsed?.type;
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
  throw new Error('Timed out while waiting for Breeding Program attributes.');
}

async function waitForIndexes() {
  const keys = indexes.map(([key]) => key);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const result = await request('GET', `/databases/${databaseId}/collections/${collectionId}/indexes?total=false`);
    const map = new Map((result.indexes || []).map((item) => [item.key, item.status]));
    if (keys.every((key) => map.get(key) === 'available')) return;
    await sleep(1000);
  }
  throw new Error('Timed out while waiting for Breeding Program indexes.');
}

console.log('\nCaneSprout Breeding Program shared-library setup v2.13.77');
console.log(`Endpoint: ${endpoint}`);
console.log(`Project:  ${projectId}`);
console.log(`Database: ${databaseId}`);
console.log(`Collection: ${collectionId}`);
console.log(`Bucket: ${bucketId}\n`);

if (!(await exists(`/databases/${databaseId}/collections/${collectionId}`))) {
  await request('POST', `/databases/${databaseId}/collections`, {
    collectionId,
    name: 'BREEDING_PROGRAM_DOCUMENTS',
    permissions: documentPermissions,
    documentSecurity: false,
    enabled: true
  });
  console.log(`✓ created collection ${collectionId}`);
} else {
  console.log(`• collection ${collectionId} already exists`);
}

const currentAttrs = new Set((await listAttributes()).map((item) => item.key));
for (const [key, size] of attrs) {
  if (currentAttrs.has(key)) continue;
  await request('POST', `/databases/${databaseId}/collections/${collectionId}/attributes/string`, {
    key,
    size,
    required: false,
    array: false,
    encrypt: false
  });
  console.log(`  ✓ attribute ${key}`);
}

await waitForAttributes();

await request('PUT', `/databases/${databaseId}/collections/${collectionId}`, {
  name: 'BREEDING_PROGRAM_DOCUMENTS',
  permissions: documentPermissions,
  documentSecurity: false,
  enabled: true,
  purge: true
});

for (const [key, type, attributes, orders] of indexes) {
  if (await exists(`/databases/${databaseId}/collections/${collectionId}/indexes/${key}`)) {
    console.log(`• index ${key} already exists`);
    continue;
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
await waitForIndexes();

const bucketBody = {
  name: 'Breeding Program Documents',
  permissions: bucketPermissions,
  fileSecurity: true,
  enabled: true,
  maximumFileSize: 52428800,
  allowedFileExtensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'],
  compression: 'none',
  encryption: true,
  antivirus: true,
  transformations: false
};

if (!(await exists(`/storage/buckets/${bucketId}`))) {
  await request('POST', '/storage/buckets', { bucketId, ...bucketBody });
  console.log(`✓ created storage bucket ${bucketId}`);
} else {
  await request('PUT', `/storage/buckets/${bucketId}`, bucketBody);
  console.log(`✓ enforced storage bucket ${bucketId}`);
}

console.log('\n✓ Breeding Program shared library is ready.');
console.log('  All signed-in users can read documents.');
console.log(`  Only users carrying the ${adminLabel} label can upload/update/delete.`);
console.log('  Revoke the temporary APPWRITE_API_KEY now.\n');
