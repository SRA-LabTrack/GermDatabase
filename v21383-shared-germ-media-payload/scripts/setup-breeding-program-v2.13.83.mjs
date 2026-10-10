import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function readEnvFile(filename) {
  const full = path.join(root, filename);
  if (!fs.existsSync(full)) return {};
  const out = {};
  const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    out[match[1].trim()] = value;
  }
  return out;
}

const envFile = {
  ...readEnvFile('.env'),
  ...readEnvFile('.env.local')
};

const endpoint = String(
  process.env.APPWRITE_ENDPOINT
  || process.env.VITE_APPWRITE_ENDPOINT
  || envFile.APPWRITE_ENDPOINT
  || envFile.VITE_APPWRITE_ENDPOINT
  || 'https://cloud.appwrite.io/v1'
).replace(/\/+$/, '');

const projectId = String(
  process.env.APPWRITE_PROJECT_ID
  || process.env.VITE_APPWRITE_PROJECT_ID
  || envFile.APPWRITE_PROJECT_ID
  || envFile.VITE_APPWRITE_PROJECT_ID
  || ''
).trim();

const databaseId = String(
  process.env.APPWRITE_DATABASE_ID
  || process.env.VITE_APPWRITE_DATABASE_ID
  || envFile.APPWRITE_DATABASE_ID
  || envFile.VITE_APPWRITE_DATABASE_ID
  || 'sra-db'
).trim();

const apiKey = String(
  process.env.APPWRITE_API_KEY
  || envFile.APPWRITE_API_KEY
  || ''
).trim();

const COLLECTION_ID = 'breeding_program_documents';
const SHARED_BUCKET_ID = 'germ-media';

if (!projectId) {
  throw new Error(
    'Missing Appwrite project ID. Set VITE_APPWRITE_PROJECT_ID in .env/.env.local.'
  );
}

async function request(method, pathname, body, { optional404 = false } = {}) {
  const headers = {
    'X-Appwrite-Project': projectId,
    'Content-Type': 'application/json'
  };
  if (apiKey) headers['X-Appwrite-Key'] = apiKey;

  const response = await fetch(`${endpoint}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (optional404 && response.status === 404) return null;

  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch {}

  if (!response.ok) {
    const error = new Error(
      parsed?.message || `${response.status} ${response.statusText}`
    );
    error.status = response.status;
    error.type = parsed?.type;
    throw error;
  }

  return parsed;
}

console.log('');
console.log('CaneSprout v2.13.83 Breeding Program Storage Verification');
console.log('----------------------------------------------------------');
console.log(`Project:  ${projectId}`);
console.log(`Database: ${databaseId}`);
console.log(`Bucket:   ${SHARED_BUCKET_ID} (shared with Sugarcane Photos)`);
console.log('');

/* Verify collection created by the earlier v2.13.77 setup. */
const collection = await request(
  'GET',
  `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(COLLECTION_ID)}`,
  undefined,
  { optional404: true }
);

if (!collection) {
  console.error('FAIL  breeding_program_documents collection was not found.');
  console.error('');
  console.error('The previous setup did not finish creating the Breeding Program collection.');
  console.error('Restore/apply the v2.13.77 collection setup first, but do NOT create a second bucket.');
  process.exit(1);
}

console.log('PASS  breeding_program_documents collection exists');

/* Verify the one existing bucket instead of creating another one. */
const bucket = await request(
  'GET',
  `/storage/buckets/${encodeURIComponent(SHARED_BUCKET_ID)}`,
  undefined,
  { optional404: true }
);

if (!bucket) {
  throw new Error(
    'The existing germ-media bucket was not found. CaneSprout needs its Sugarcane Photos bucket before Breeding Program documents can share it.'
  );
}

console.log(`PASS  existing storage bucket found: ${bucket.name || SHARED_BUCKET_ID}`);

const allowed = Array.isArray(bucket.allowedFileExtensions)
  ? bucket.allowedFileExtensions.map((item) => String(item).toLowerCase())
  : [];

const needed = ['pdf', 'doc', 'docx', 'xls', 'xlsx'];
const missing = needed.filter((ext) => !allowed.includes(ext));

if (allowed.length === 0) {
  console.log('PASS  bucket file extensions are unrestricted');
} else if (missing.length === 0) {
  console.log(`PASS  document extensions allowed: ${needed.join(', ')}`);
} else {
  console.error(`FAIL  germ-media is missing required extensions: ${missing.join(', ')}`);
  console.error('');
  console.error('Open Appwrite > Storage > Sugarcane Photos > Settings and add the missing extension(s).');
  process.exit(1);
}

if (!allowed.includes('csv')) {
  console.log('INFO  CSV is not allowed in germ-media; CaneSprout v2.13.83 disables CSV uploads in Breeding Program.');
}

console.log('');
console.log('Breeding Program shared storage is ready.');
console.log('No new Appwrite bucket is required.');
console.log('');
