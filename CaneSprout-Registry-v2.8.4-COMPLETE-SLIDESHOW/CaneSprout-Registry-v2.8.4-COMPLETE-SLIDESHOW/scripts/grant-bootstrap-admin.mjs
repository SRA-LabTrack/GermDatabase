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
    const value = trimmed.slice(index + 1).trim().replace(/^[\'\"]|[\'\"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

function cleanEndpoint(value) {
  let text = String(value || '').trim();
  const markdown = text.match(/^\[(https?:\/\/[^\]]+)\]\(https?:\/\/[^)]+\)$/i);
  if (markdown) text = markdown[1];
  return text.replace(/\/+$/, '');
}

const primaryEndpoint = cleanEndpoint(process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1');
const globalEndpoint = cleanEndpoint(process.env.APPWRITE_FALLBACK_ENDPOINT || process.env.VITE_APPWRITE_FALLBACK_ENDPOINT || 'https://cloud.appwrite.io/v1');
const endpoints = [...new Set([primaryEndpoint, globalEndpoint].filter(Boolean))];
const projectId = String(process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b').trim();
const databaseId = String(process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase').trim();
const bucketId = String(process.env.APPWRITE_MEDIA_BUCKET_ID || process.env.VITE_APPWRITE_MEDIA_BUCKET_ID || 'germ-media').trim();
const apiKey = String(process.env.APPWRITE_API_KEY || '').trim();
const email = String(process.env.INITIAL_ADMIN_EMAIL || 'ncrowsboosting@gmail.com').trim().toLowerCase();
const preferredUserId = String(process.env.INITIAL_ADMIN_USER_ID || '6a7534ee0022112c4500').trim();
const adminLabel = 'canesproutadmin';
const timeoutMs = Math.max(20000, Number(process.env.APPWRITE_ADMIN_GRANT_TIMEOUT_MS || 45000));

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

if (!apiKey || apiKey.includes('PASTE_TEMPORARY')) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('For this one-time migration, use a temporary Appwrite server key with Users Read/Write, Databases Read/Write, Collections Read/Write, and Storage/Buckets Read/Write. Revoke it after success.\n');
  process.exit(1);
}

class HttpError extends Error {
  constructor(message, status = 0, type = '') {
    super(message);
    this.status = status;
    this.type = type;
  }
}

function describeNetworkError(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return `timed out after ${Math.round(timeoutMs / 1000)}s`;
  return error?.cause?.code || error?.code || error?.message || 'network error';
}

async function requestAt(endpoint, method, route, body) {
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
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new HttpError(`${endpoint}: ${describeNetworkError(error)}`);
  }

  const text = await response.text();
  let parsed = {};
  if (text) {
    try { parsed = JSON.parse(text); }
    catch { parsed = { message: text }; }
  }
  if (!response.ok) throw new HttpError(parsed?.message || `Appwrite HTTP ${response.status}`, response.status, parsed?.type || '');
  return parsed;
}

async function requestWithFallback(method, route, body, { label = 'request' } = {}) {
  let lastError;
  for (let i = 0; i < endpoints.length; i += 1) {
    const endpoint = endpoints[i];
    try {
      if (i > 0) console.log(`  ↳ retrying ${label} through ${endpoint}`);
      return await requestAt(endpoint, method, route, body);
    } catch (error) {
      lastError = error;
      if (error.status >= 400 && error.status < 500 && ![408, 409, 429].includes(error.status)) throw error;
      if (error.status === 409) throw error;
      console.warn(`  ! ${label} via ${endpoint} failed: ${error.message}`);
    }
  }
  throw lastError || new Error(`${label} failed.`);
}


const requestAttrs = [
  ['request_type', 16],
  ['target_id', 36],
  ['submitted_by', 36],
  ['submitted_name', 128],
  ['submitted_email', 320],
  ['submitted_at', 32],
  ['status', 16],
  ['variety_summary', 255],
  ['payload_json', 12000],
  ['resolution_note', 500],
  ['resolved_at', 32],
  ['resolved_by', 128]
];
const requestIndexes = [
  ['idx_request_status', ['status']],
  ['idx_request_submitter', ['submitted_by']]
];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function collectionExists(collectionId) {
  try {
    await requestWithFallback('GET', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}`, undefined, { label: `${collectionId} lookup` });
    return true;
  } catch (error) {
    if (error.status === 404) return false;
    throw error;
  }
}

async function listCollectionAttributes(collectionId) {
  const result = await requestWithFallback('GET', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/attributes?total=false`, undefined, { label: `${collectionId} attribute lookup` });
  return result.attributes || [];
}

async function ensureRequestCollection() {
  const collectionId = 'registry_change_requests';
  if (!await collectionExists(collectionId)) {
    console.log(`• ${collectionId} is missing; creating the approvals collection now...`);
    try {
      await requestWithFallback('POST', `/databases/${encodeURIComponent(databaseId)}/collections`, {
        collectionId,
        name: 'REGISTRY_CHANGE_REQUESTS',
        permissions: requestPermissions,
        documentSecurity: true,
        enabled: true
      }, { label: `${collectionId} creation` });
      console.log(`✓ created ${collectionId}`);
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }

  const existing = new Set((await listCollectionAttributes(collectionId)).map((attribute) => attribute.key));
  const base = `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/attributes/string`;
  for (const [key, size] of requestAttrs) {
    if (existing.has(key)) continue;
    try {
      await requestWithFallback('POST', base, {
        key,
        size,
        required: false,
        array: false,
        encrypt: false
      }, { label: `${collectionId}.${key} creation` });
      console.log(`  ✓ ${key}`);
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }

  console.log(`• waiting for ${collectionId} fields to finish provisioning...`);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const attrs = await listCollectionAttributes(collectionId);
    const state = new Map(attrs.map((attribute) => [attribute.key, attribute.status]));
    if (requestAttrs.every(([key]) => state.get(key) === 'available')) break;
    if (attempt === 179) throw new Error(`Timed out while waiting for ${collectionId} fields. Rerun the same command; completed fields will be reused.`);
    await delay(1000);
  }

  for (const [indexKey, attributes] of requestIndexes) {
    const indexRoute = `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/indexes/${encodeURIComponent(indexKey)}`;
    try {
      await requestWithFallback('GET', indexRoute, undefined, { label: `${indexKey} lookup` });
      continue;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    try {
      await requestWithFallback('POST', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/indexes`, {
        key: indexKey,
        type: 'key',
        attributes,
        orders: ['ASC'],
        lengths: []
      }, { label: `${indexKey} creation` });
      console.log(`✓ created index ${indexKey}`);
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }

  console.log(`• waiting for ${collectionId} indexes...`);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const result = await requestWithFallback('GET', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}/indexes?total=false`, undefined, { label: `${collectionId} index status` });
    const state = new Map((result.indexes || []).map((index) => [index.key, index.status]));
    if (requestIndexes.every(([key]) => state.get(key) === 'available')) return;
    if (attempt === 179) throw new Error(`Timed out while waiting for ${collectionId} indexes. Rerun the same command; completed indexes will be reused.`);
    await delay(1000);
  }
}

async function ensureMediaBucket() {
  try {
    await requestWithFallback('GET', `/storage/buckets/${encodeURIComponent(bucketId)}`, undefined, { label: 'photo bucket lookup' });
    return;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  console.log(`• ${bucketId} is missing; creating the photo bucket now...`);
  try {
    await requestWithFallback('POST', '/storage/buckets', {
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
    }, { label: 'photo bucket creation' });
    console.log(`✓ created ${bucketId}`);
  } catch (error) {
    if (error.status !== 409) throw error;
  }
}

async function migratePermissions() {
  console.log('Migrating CaneSprout admin permissions to the valid alphanumeric label...');
  await ensureRequestCollection();
  await ensureMediaBucket();
  const collections = [
    ['sugarcane_registry_core', 'SUGARCANE_REGISTRY_CORE', livePermissions, false],
    ['sugarcane_registry_details', 'SUGARCANE_REGISTRY_DETAILS', livePermissions, false],
    ['registry_change_requests', 'REGISTRY_CHANGE_REQUESTS', requestPermissions, true]
  ];
  for (const [collectionId, name, permissions, documentSecurity] of collections) {
    await requestWithFallback('PUT', `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}`, {
      name,
      permissions,
      documentSecurity,
      enabled: true,
      purge: true
    }, { label: `${collectionId} permission migration` });
    console.log(`✓ ${collectionId} now uses label:${adminLabel}`);
  }

  await requestWithFallback('PUT', `/storage/buckets/${encodeURIComponent(bucketId)}`, {
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
  }, { label: 'photo bucket permission migration' });
  console.log(`✓ ${bucketId} now uses label:${adminLabel}`);
}

function exactEmailQuery(targetEmail) {
  const safe = targetEmail.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `equal("email", ["${safe}"])`;
}

function userLookupRoute(targetEmail) {
  const query = encodeURIComponent(exactEmailQuery(targetEmail));
  const limit = encodeURIComponent('limit(1)');
  return `/users?queries[]=${query}&queries[]=${limit}&total=false`;
}

async function directPreferredUser(targetEmail) {
  if (!preferredUserId) return null;
  try {
    const user = await requestWithFallback('GET', `/users/${encodeURIComponent(preferredUserId)}`, undefined, { label: 'known admin account lookup' });
    if (String(user?.email || '').toLowerCase() === targetEmail) return user;
  } catch (error) {
    if (error.status !== 404) console.warn(`  ! direct admin user lookup failed: ${error.message}`);
  }
  return null;
}

async function findUserByEmail(targetEmail) {
  const direct = await directPreferredUser(targetEmail);
  if (direct) return direct;

  try {
    const result = await requestWithFallback('GET', userLookupRoute(targetEmail), undefined, { label: 'exact user lookup' });
    const exact = (result.users || []).find((item) => String(item.email || '').toLowerCase() === targetEmail);
    if (exact) return exact;
  } catch (error) {
    if (error.status && error.status !== 400) throw error;
    if (error.status === 400) console.log('  ↳ exact query was rejected; using Users API search fallback');
    else throw error;
  }

  const result = await requestWithFallback('GET', `/users?total=false&search=${encodeURIComponent(targetEmail)}`, undefined, { label: 'user search' });
  return (result.users || []).find((item) => String(item.email || '').toLowerCase() === targetEmail) || null;
}

async function getUserById(userId) {
  return requestWithFallback('GET', `/users/${encodeURIComponent(userId)}`, undefined, { label: 'admin-label verification' });
}

async function ensureAdminLabel(user) {
  const labels = new Set(Array.isArray(user.labels) ? user.labels.filter(Boolean) : []);
  labels.delete('canesprout_admin'); // impossible on current Appwrite, but harmless cleanup for old/self-hosted data.
  if (labels.has(adminLabel)) return { alreadyAdmin: true, user };
  labels.add(adminLabel);
  const body = { labels: Array.from(labels) };

  try {
    const updated = await requestWithFallback('PUT', `/users/${encodeURIComponent(user.$id)}/labels`, body, { label: 'label update' });
    return { alreadyAdmin: false, user: updated };
  } catch (error) {
    if (error.status >= 400 && error.status < 500) throw error;
    console.warn('  ! label update response was uncertain; verifying before retrying any write...');
    const verified = await getUserById(user.$id);
    if (Array.isArray(verified.labels) && verified.labels.includes(adminLabel)) return { alreadyAdmin: false, user: verified, recovered: true };
    const updated = await requestWithFallback('PUT', `/users/${encodeURIComponent(user.$id)}/labels`, body, { label: 'verified label retry' });
    return { alreadyAdmin: false, user: updated };
  }
}

async function main() {
  console.log(`\nCaneSprout administrator migration for ${email}`);
  console.log(`Valid Appwrite label: ${adminLabel}`);
  console.log(`Primary endpoint: ${primaryEndpoint}`);
  if (globalEndpoint !== primaryEndpoint) console.log(`Fallback endpoint: ${globalEndpoint}`);
  console.log(`Per-attempt timeout: ${Math.round(timeoutMs / 1000)} seconds\n`);

  await migratePermissions();

  const user = await findUserByEmail(email);
  if (!user) throw new Error(`No Appwrite account exists for ${email}. Create/sign up that account first, then rerun this command.`);
  console.log(`✓ found account ${user.$id}`);

  const result = await ensureAdminLabel(user);
  if (result.alreadyAdmin) console.log(`✓ ${email} already has the ${adminLabel} label. No label write was needed.`);
  else console.log(`✓ ${email} now has the ${adminLabel} label.${result.recovered ? ' The script verified it after a lost response.' : ''}`);

  console.log('\nMigration complete. Sign out and sign back in to CaneSprout.');
  console.log('Admin Center should now show Approvals and Account Management.');
  console.log('Revoke/delete the temporary APPWRITE_API_KEY now.\n');
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}`);
  if (error.status === 401 || error.status === 403) {
    console.error('The temporary APPWRITE_API_KEY is missing one of the required Users/Database/Collection/Storage write scopes, or belongs to another project.');
  } else if (error.status === 400 && /labels/i.test(error.message || '')) {
    console.error(`Appwrite rejected the label unexpectedly. The package uses the alphanumeric label "${adminLabel}".`);
  } else if (!error.status) {
    console.error('Both Appwrite connection paths were unavailable. Retry when connectivity to Appwrite is stable.');
  }
  console.error('');
  process.exit(1);
});
