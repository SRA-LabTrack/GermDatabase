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
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

function normalizeEndpoint(value) {
  let raw = String(value || '').trim();

  // Be forgiving if a URL was copied from rendered Markdown, for example:
  // [https://fra.cloud.appwrite.io/v1](https://fra.cloud.appwrite.io/v1)
  const markdownLink = raw.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/i);
  if (markdownLink) raw = markdownLink[2];

  // Also accept angle-bracket wrapped URLs copied from some terminals/docs.
  if (/^<https?:\/\/[^>]+>$/i.test(raw)) raw = raw.slice(1, -1);

  raw = raw.replace(/\/$/, '');

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol');
    return parsed.toString().replace(/\/$/, '');
  } catch {
    console.error(`\nInvalid Appwrite endpoint: ${raw || '(empty)'}`);
    console.error('Use a plain URL such as: APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1\n');
    process.exit(1);
  }
}

const endpoint = normalizeEndpoint(process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://fra.cloud.appwrite.io/v1');
const projectId = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b';
const databaseId = process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase';
const bucketId = process.env.APPWRITE_MEDIA_BUCKET_ID || process.env.VITE_APPWRITE_MEDIA_BUCKET_ID || 'germ-media';
const apiKey = process.env.APPWRITE_API_KEY;

if (!apiKey || apiKey.includes('PASTE_TEMPORARY')) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Create a temporary Appwrite server API key with database and storage management scopes, put it in .env, run this script, then delete the key.\n');
  process.exit(1);
}

const permissions = ['read("users")', 'create("users")', 'update("users")', 'delete("users")'];
const s = (key, size = 255, required = false) => ({ key, type: 'string', size, required, array: false });
const f = (key, required = false) => ({ key, type: 'float', required, array: false });
const idx = (key, attributes, type = 'key') => ({ key, type, attributes, orders: attributes.map(() => 'ASC') });

const collections = {
  microorganisms: {
    name: 'MICROORGANISMS',
    attributes: [
      s('microorganism_id', 36), s('scientific_name', 255), s('genus', 128), s('species', 128),
      s('organism_type', 64), s('taxonomy_id', 128)
    ],
    indexes: [idx('idx_microorganism_id', ['microorganism_id'], 'unique'), idx('idx_scientific_name', ['scientific_name']), idx('idx_organism_type', ['organism_type'])]
  },
  microorganism_traits: {
    name: 'MICROORGANISM_TRAITS',
    attributes: [
      s('trait_id', 36), s('microorganism_id', 36), s('category', 96), s('trait_key', 128), s('trait_label', 255), s('trait_value', 4096)
    ],
    indexes: [idx('idx_trait_id', ['trait_id'], 'unique'), idx('idx_trait_microorganism', ['microorganism_id']), idx('idx_trait_key', ['trait_key'])]
  },
  strains: {
    name: 'STRAINS',
    attributes: [
      s('strain_id', 36), s('microorganism_id', 36), s('strain_name', 255), s('pathogenic_status', 64), s('biosafety_level', 32)
    ],
    indexes: [idx('idx_strain_id', ['strain_id'], 'unique'), idx('idx_microorganism', ['microorganism_id'])]
  },
  samples: {
    name: 'SAMPLES',
    attributes: [
      s('sample_id', 36), s('strain_id', 36), s('source', 255), s('collection_date', 32), s('location', 512), s('host_id', 128), s('specimen_type', 255)
    ],
    indexes: [idx('idx_sample_id', ['sample_id'], 'unique'), idx('idx_strain', ['strain_id']), idx('idx_collection_date', ['collection_date'])]
  },
  observations: {
    name: 'OBSERVATIONS',
    attributes: [
      s('observation_id', 36), s('sample_id', 36), s('trait_name', 255), s('observed_value', 1024), s('unit', 64), s('method', 512), s('observation_date', 32), s('observer', 255)
    ],
    indexes: [idx('idx_observation_id', ['observation_id'], 'unique'), idx('idx_sample', ['sample_id']), idx('idx_trait', ['trait_name'])]
  },
  lab_tests: {
    name: 'LAB_TESTS',
    attributes: [
      s('test_id', 36), s('sample_id', 36), s('test_type', 255), s('test_name', 255), s('result', 4096), s('unit', 64), s('method', 512)
    ],
    indexes: [idx('idx_test_id', ['test_id'], 'unique'), idx('idx_sample', ['sample_id']), idx('idx_test_name', ['test_name'])]
  },
  antimicrobial_results: {
    name: 'ANTIMICROBIAL_RESULTS',
    attributes: [
      s('susceptibility_id', 36), s('sample_id', 36), s('antimicrobial', 255), f('mic_value'), f('zone_diameter'), s('interpretation', 64), s('standard_used', 255)
    ],
    indexes: [idx('idx_susceptibility_id', ['susceptibility_id'], 'unique'), idx('idx_sample', ['sample_id']), idx('idx_antimicrobial', ['antimicrobial']), idx('idx_interpretation', ['interpretation'])]
  },
  sequences: {
    name: 'SEQUENCES',
    attributes: [
      s('sequence_id', 36), s('strain_id', 36), s('marker', 255), s('accession_number', 255), s('sequence_file', 4096)
    ],
    indexes: [idx('idx_sequence_id', ['sequence_id'], 'unique'), idx('idx_strain', ['strain_id']), idx('idx_accession', ['accession_number'])]
  },
  media: {
    name: 'MEDIA',
    attributes: [
      s('media_id', 36), s('sample_id', 36), s('media_type', 128), s('file_path', 4096), s('caption', 4096)
    ],
    indexes: [idx('idx_media_id', ['media_id'], 'unique'), idx('idx_sample', ['sample_id']), idx('idx_media_type', ['media_type'])]
  }
};
async function request(method, route, body) {
  const url = `${endpoint}${route}`;
  let response;
  try {
    response = await fetch(url, {
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
    const cause = error?.cause || {};
    const code = cause.code || cause.errno || '';
    const detail = cause.message || error?.message || 'Unknown network error';
    const suffix = code ? ` (${code})` : '';
    const wrapped = new Error(`Could not connect to Appwrite at ${endpoint}${suffix}: ${detail}`);
    wrapped.type = 'network_fetch_failed';
    wrapped.cause = error;
    throw wrapped;
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

async function ensure(label, checkRoute, createRoute, createBody) {
  try {
    await request('GET', checkRoute);
    console.log(`• ${label} already exists`);
    return false;
  } catch (error) {
    if (error.status !== 404) throw error;
  }
  await request('POST', createRoute, createBody);
  console.log(`✓ created ${label}`);
  return true;
}

function encodeQuery(query) {
  return encodeURIComponent(JSON.stringify(query));
}

async function listCollectionAttributes(collectionPath) {
  // Appwrite REST queries are JSON strings, e.g. {"method":"limit","values":[100]}.
  // Older limit(100) syntax causes general_argument_invalid on current Appwrite Cloud.
  const limit100 = encodeQuery({ method: 'limit', values: [100] });
  try {
    return await request('GET', `${collectionPath}/attributes?queries[]=${limit100}&total=false`);
  } catch (error) {
    if (error.type !== 'general_argument_invalid') throw error;
    console.warn('  ! Appwrite rejected attribute pagination; retrying without a query');
    return await request('GET', `${collectionPath}/attributes?total=false`);
  }
}

async function ensureCollectionAttributes(collectionId, schema) {
  const collectionPath = `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}`;
  const result = await listCollectionAttributes(collectionPath);
  const existing = new Set((result.attributes || []).map((attribute) => attribute.key));

  for (const attribute of schema.attributes) {
    if (existing.has(attribute.key)) continue;

    try {
      if (attribute.type === 'string') {
        await request('POST', `${collectionPath}/attributes/string`, {
          key: attribute.key,
          size: attribute.size,
          required: Boolean(attribute.required),
          array: Boolean(attribute.array),
          encrypt: false
        });
      } else if (attribute.type === 'float') {
        await request('POST', `${collectionPath}/attributes/float`, {
          key: attribute.key,
          required: Boolean(attribute.required),
          array: Boolean(attribute.array)
        });
      } else {
        console.warn(`  ! skipped unsupported attribute type ${attribute.type} for ${collectionId}.${attribute.key}`);
        continue;
      }
      console.log(`  ✓ added attribute ${collectionId}.${attribute.key}`);
      existing.add(attribute.key);
    } catch (error) {
      if (error.status === 409) {
        console.log(`  • attribute ${collectionId}.${attribute.key} already exists`);
        existing.add(attribute.key);
        continue;
      }
      throw error;
    }
  }
}

async function ensureLocalWebPlatforms() {
  const desired = [
    { platformId: 'germdb-localhost', name: 'GermDatabase Localhost', hostname: 'localhost' },
    { platformId: 'germdb-loopback', name: 'GermDatabase Loopback', hostname: '127.0.0.1' }
  ];

  try {
    const result = await request('GET', '/project/platforms?total=false');
    const existing = Array.isArray(result.platforms) ? result.platforms : [];

    for (const platform of desired) {
      if (existing.some((item) => item?.type === 'web' && item?.hostname === platform.hostname)) {
        console.log(`• web platform ${platform.hostname} already exists`);
        continue;
      }

      try {
        await request('POST', '/project/platforms/web', platform);
        console.log(`✓ created web platform ${platform.hostname}`);
      } catch (error) {
        if (error.status === 409) {
          console.log(`• web platform ${platform.hostname} already exists`);
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    console.warn(`! Could not verify/create local Appwrite Web platforms: ${error.message}`);
    console.warn('  This does not block database setup. In Appwrite Console > Project > Platforms, add a Web app with hostname "localhost".');
  }
}

async function main() {
  console.log('\nGermDatabase Appwrite setup');
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Project:  ${projectId}`);
  console.log(`Database: ${databaseId}\n`);

  await ensureLocalWebPlatforms();

  await ensure(
    `database ${databaseId}`,
    `/databases/${encodeURIComponent(databaseId)}`,
    '/databases',
    { databaseId, name: 'GermDatabase', enabled: true }
  );

  for (const [collectionId, schema] of Object.entries(collections)) {
    await ensure(
      `collection ${collectionId}`,
      `/databases/${encodeURIComponent(databaseId)}/collections/${encodeURIComponent(collectionId)}`,
      `/databases/${encodeURIComponent(databaseId)}/collections`,
      {
        collectionId,
        name: schema.name,
        permissions,
        documentSecurity: false,
        enabled: true,
        attributes: schema.attributes,
        indexes: schema.indexes
      }
    );
    await ensureCollectionAttributes(collectionId, schema);
  }

  try {
    await ensure(
      `storage bucket ${bucketId}`,
      `/storage/buckets/${encodeURIComponent(bucketId)}`,
      '/storage/buckets',
      {
        bucketId,
        name: 'GermDatabase Media',
        permissions,
        fileSecurity: false,
        enabled: true,
        maximumFileSize: 104857600,
        allowedFileExtensions: [],
        compression: 'gzip',
        encryption: true,
        antivirus: true,
        transformations: true
      }
    );
  } catch (error) {
    console.warn(`! Media bucket was not created: ${error.message}`);
    console.warn('  The core database is still usable. Add Storage scopes to the temporary key and re-run if you want the bucket.');
  }

  console.log('\nDone. Flexible microorganism traits now use the MICROORGANISM_TRAITS collection.');
  console.log('Any extra attributes already created in MICROORGANISMS can remain; they are no longer required.');
  console.log('Delete the temporary Appwrite API key now.');
  console.log('Your React client never needs or receives that server key.\n');
}

main().catch((error) => {
  console.error(`\nSetup failed: ${error.message}`);
  if (error.type) console.error(`Appwrite type: ${error.type}`);
  if (error.type === 'network_fetch_failed') {
    console.error('\nNetwork checks:');
    console.error(`  1. Open ${endpoint} in a browser. A JSON response means the host is reachable.`);
    console.error(`  2. Run: nslookup ${new URL(endpoint).hostname}`);
    console.error(`  3. Run: powershell -Command "Test-NetConnection ${new URL(endpoint).hostname} -Port 443"`);
    console.error('  4. Check VPN/proxy/antivirus HTTPS inspection if the browser works but Node does not.');
  }
  process.exit(1);
});
