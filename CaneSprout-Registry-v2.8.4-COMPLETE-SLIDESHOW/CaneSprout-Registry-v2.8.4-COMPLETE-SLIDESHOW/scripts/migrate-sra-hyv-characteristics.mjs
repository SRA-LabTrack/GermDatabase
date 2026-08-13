import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client, Databases, ID, Query } from 'node-appwrite';

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
const projectId = String(process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT_ID || '6a744cda00030236187b').trim();
const databaseId = String(process.env.APPWRITE_DATABASE_ID || process.env.VITE_APPWRITE_DATABASE_ID || 'germdatabase').trim();
const apiKey = String(process.env.APPWRITE_API_KEY || '').trim();
const coreCollection = 'sugarcane_registry_core';
const detailsCollection = 'sugarcane_registry_details';
const sourcePath = path.resolve(process.cwd(), 'seed', 'sra_hyv_characteristics_v273.json');

if (!apiKey) {
  console.error('\nMissing APPWRITE_API_KEY.');
  console.error('Use a temporary Appwrite server API key with Databases/Documents read + write permission, run this migration once, then revoke the key.\n');
  process.exit(1);
}
if (!fs.existsSync(sourcePath)) {
  console.error(`\nMigration source not found: ${sourcePath}\n`);
  process.exit(1);
}

const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const aliases = source.safeAliases || {};
const records = source.records || [];

const fallbackEndpoint = String(
  process.env.APPWRITE_FALLBACK_ENDPOINT ||
  process.env.VITE_APPWRITE_FALLBACK_ENDPOINT ||
  'https://cloud.appwrite.io/v1'
).trim().replace(/\/$/, '');

const endpoints = Array.from(new Set([endpoint, fallbackEndpoint].filter(Boolean)));
const databaseClients = new Map(
  endpoints.map((value) => {
    const client = new Client().setEndpoint(value).setProject(projectId).setKey(apiKey);
    return [value, new Databases(client)];
  })
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function statusCode(error) {
  return Number(error?.code || error?.status || error?.response?.status || 0);
}

function isRetryable(error) {
  const code = statusCode(error);
  if (code === 429 || code === 408 || code >= 500) return true;
  if (code >= 400) return false;
  const text = [error?.message, error?.cause?.message, error?.cause?.code, error?.code]
    .filter(Boolean).join(' ').toLowerCase();
  return !text || /fetch failed|timeout|timed out|econnreset|econnrefused|enotfound|socket|network|und_err|connection/.test(text);
}

async function appwriteRead(label, operation) {
  let lastError;
  for (let endpointIndex = 0; endpointIndex < endpoints.length; endpointIndex += 1) {
    const currentEndpoint = endpoints[endpointIndex];
    const db = databaseClients.get(currentEndpoint);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        return await operation(db);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;
        if (attempt < 5) {
          const waitMs = Math.min(5000, 450 * (2 ** (attempt - 1)));
          console.warn(`  ↳ ${label}: transient connection error; retry ${attempt}/4 in ${waitMs}ms`);
          await sleep(waitMs);
        }
      }
    }
    if (endpointIndex < endpoints.length - 1) {
      console.warn(`  ↳ ${label}: switching Appwrite endpoint to ${endpoints[endpointIndex + 1]}`);
    }
  }
  throw lastError || new Error(`${label} failed`);
}

async function appwriteWrite(label, operation, verify = null) {
  let lastError;
  for (let endpointIndex = 0; endpointIndex < endpoints.length; endpointIndex += 1) {
    const currentEndpoint = endpoints[endpointIndex];
    const db = databaseClients.get(currentEndpoint);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        return await operation(db);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error)) throw error;

        // A network failure can happen after Appwrite committed the write but before
        // the response reached this script. Verify before replaying the mutation.
        if (typeof verify === 'function') {
          try {
            const verified = await verify();
            if (verified) return verified;
          } catch {
            // Verification itself can be transient. Continue with bounded retries.
          }
        }

        if (attempt < 4) {
          const waitMs = Math.min(5000, 650 * (2 ** (attempt - 1)));
          console.warn(`  ↳ ${label}: transient write error; retry ${attempt}/3 in ${waitMs}ms`);
          await sleep(waitMs);
        }
      }
    }
    if (endpointIndex < endpoints.length - 1) {
      console.warn(`  ↳ ${label}: switching Appwrite endpoint to ${endpoints[endpointIndex + 1]}`);
    }
  }
  throw lastError || new Error(`${label} failed`);
}

function normalizeVariety(value) {
  return String(value || '').trim().toUpperCase().replace(/PHILIPPINES/g, 'PHIL').replace(/[^A-Z0-9]+/g, '');
}

function parseObject(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function importedTraits(record) {
  return Object.fromEntries([
    ['variety', record.variety],
    ['parentage_female', record.parentage_female],
    ['parentage_male', record.parentage_male],
    ['yield_lkg_tc', record.yield_lkg_tc],
    ['yield_tc_ha', record.yield_tc_ha],
    ['agronomic_characteristics_summary', record.agronomic_characteristics_summary],
    ['agronomic_millable_stalk', record.agronomic_millable_stalk],
    ['agronomic_maturity', record.agronomic_maturity],
    ['disease_reaction', record.disease_reaction]
  ].map(([key, value]) => [key, String(value ?? '').trim()]).filter(([, value]) => value !== ''));
}

function searchText(traits, core = {}) {
  return [
    ...Object.values(traits),
    core.germ_trial_code,
    core.germ_location,
    core.germ_status
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 4096);
}

async function loadCanonicalCoreIndex() {
  const index = new Map();
  let cursor = '';
  let count = 0;
  while (true) {
    const queries = [Query.limit(100), Query.orderAsc('$id')];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const page = await appwriteRead(`load core index after ${cursor || 'start'}`, (databases) => databases.listDocuments({
      databaseId,
      collectionId: coreCollection,
      queries,
      total: false
    }));
    const batch = page.documents || [];
    for (const doc of batch) {
      const key = normalizeVariety(doc.variety);
      if (!key) continue;
      const rows = index.get(key) || [];
      rows.push(doc);
      index.set(key, rows);
      count += 1;
    }
    if (batch.length < 100) break;
    cursor = batch.at(-1).$id;
  }
  console.log(`Loaded ${count} existing core records into duplicate-safe canonical index.`);
  return index;
}

let canonicalCoreIndex;

async function findMatches(record) {
  const original = String(record.variety || '').trim();
  const normalized = normalizeVariety(original);
  const alias = aliases[normalized] || '';
  const candidateKeys = Array.from(new Set([normalized, normalizeVariety(alias)].filter(Boolean)));
  const found = new Map();
  for (const key of candidateKeys) {
    for (const doc of canonicalCoreIndex.get(key) || []) found.set(doc.$id, doc);
  }
  return [...found.values()];
}

async function getDetail(id) {
  try {
    return await appwriteRead(`read details ${id}`, (databases) => databases.getDocument({ databaseId, collectionId: detailsCollection, documentId: id }));
  } catch (error) {
    const code = Number(error?.code || error?.status || 0);
    if (code === 404) return { $id: id, traits_json: '{}', details_json: '{}' };
    throw error;
  }
}

async function updateExisting(core, record) {
  const detail = await getDetail(core.$id);
  const traits = { ...parseObject(detail.traits_json), ...importedTraits(record) };
  const traitsJson = JSON.stringify(traits);
  if (traitsJson.length > 4096) throw new Error(`traits_json exceeds 4096 characters for ${core.variety}`);

  const detailPayload = {
    traits_json: traitsJson,
    details_json: detail.details_json || '{}'
  };
  if (detail?.$createdAt) {
    await appwriteWrite(`update details ${core.$id}`, (databases) => databases.updateDocument({
      databaseId, collectionId: detailsCollection, documentId: core.$id, data: detailPayload
    }));
  } else {
    await appwriteWrite(
      `create details ${core.$id}`,
      (databases) => databases.createDocument({ databaseId, collectionId: detailsCollection, documentId: core.$id, data: detailPayload }),
      async () => appwriteRead(`verify details ${core.$id}`, (databases) => databases.getDocument({ databaseId, collectionId: detailsCollection, documentId: core.$id }))
    );
  }

  await appwriteWrite(`update core ${core.$id}`, (databases) => databases.updateDocument({
    databaseId,
    collectionId: coreCollection,
    documentId: core.$id,
    data: { search_text: searchText(traits, core) }
  }));
}

async function createNew(record) {
  const id = ID.unique();
  const traits = importedTraits(record);
  const traitsJson = JSON.stringify(traits);
  const detailsJson = JSON.stringify({
    germ_planting_date: '', germ_material_type: '', germ_buds_planted: '', germ_germinated_count: '',
    germ_observation_date: '', germ_notes: '', photo_file_ids: [], thumb_file_ids: [], photo_names: [],
    photo_categories: [], primary_file_id: ''
  });

  await appwriteWrite(
    `create new details ${record.variety}`,
    (databases) => databases.createDocument({
      databaseId, collectionId: detailsCollection, documentId: id,
      data: { traits_json: traitsJson, details_json: detailsJson }
    }),
    async () => appwriteRead(`verify new details ${record.variety}`, (databases) => databases.getDocument({
      databaseId, collectionId: detailsCollection, documentId: id
    }))
  );

  try {
    const createdCore = await appwriteWrite(
      `create new core ${record.variety}`,
      (databases) => databases.createDocument({
        databaseId,
        collectionId: coreCollection,
        documentId: id,
        data: {
          variety: record.variety || '',
          stool_plant_habit: '', leaf_color: '', stalk_exposed_color: '', bud_shape: '',
          germ_trial_code: '', germ_location: '', germ_status: '', germination_pct: '', thumbnail_file_id: '',
          source_name: record.source_name || 'SRA HYV legacy workbook',
          source_row: record.source_row == null ? '' : String(record.source_row),
          search_text: searchText(traits)
        }
      }),
      async () => appwriteRead(`verify new core ${record.variety}`, (databases) => databases.getDocument({
        databaseId, collectionId: coreCollection, documentId: id
      }))
    );
    return createdCore;
  } catch (error) {
    // Only remove the detail document when the core truly did not make it.
    const coreExists = await appwriteRead(`check core after create failure ${record.variety}`, async (databases) => {
      try {
        return await databases.getDocument({ databaseId, collectionId: coreCollection, documentId: id });
      } catch (verifyError) {
        if (statusCode(verifyError) === 404) return null;
        throw verifyError;
      }
    }).catch(() => null);
    if (!coreExists) {
      await appwriteWrite(`rollback details ${record.variety}`, (databases) => databases.deleteDocument({
        databaseId, collectionId: detailsCollection, documentId: id
      })).catch(() => {});
      throw error;
    }
  }
}


console.log('\nCaneSprout SRA HYV characteristics migration v2.7.5');
console.log(`Endpoint: ${endpoint}`);
if (fallbackEndpoint && fallbackEndpoint !== endpoint) console.log(`Fallback: ${fallbackEndpoint}`);
console.log(`Project:  ${projectId}`);
console.log(`Database: ${databaseId}`);
console.log(`Source rows: ${records.length}`);
console.log('Matching policy: canonical alphanumeric identity + six verified shorthand aliases; formatting differences cannot create a new record.\n');

canonicalCoreIndex = await loadCanonicalCoreIndex();
const preexistingDuplicateGroups = [...canonicalCoreIndex.entries()].filter(([, rows]) => rows.length > 1);
if (preexistingDuplicateGroups.length) {
  console.warn(`WARNING: ${preexistingDuplicateGroups.length} canonical duplicate group(s) already exist in the database.`);
  console.warn('The migration will not create another record for those identities. Run npm.cmd run audit:duplicates to review them.\n');
}

let updated = 0;
let created = 0;
const failures = [];
for (let index = 0; index < records.length; index += 1) {
  const record = records[index];
  try {
    const matches = await findMatches(record);
    if (matches.length > 1) {
      console.warn(`⚠ ${record.variety}: ${matches.length} canonical duplicates already exist; skipped automatic update to avoid hiding a duplicate conflict.`);
      console.warn(`  Run npm.cmd run audit:duplicates and review canonical key ${normalizeVariety(record.variety)}.`);
    } else if (matches.length === 1) {
      await updateExisting(matches[0], record);
      updated += 1;
      console.log(`✓ ${record.variety}: updated 1 existing record`);
    } else {
      const createdCore = await createNew(record);
      created += 1;
      if (createdCore?.$id) {
        const key = normalizeVariety(createdCore.variety || record.variety);
        const rows = canonicalCoreIndex.get(key) || [];
        rows.push(createdCore);
        canonicalCoreIndex.set(key, rows);
      }
      console.log(`+ ${record.variety}: added as a new variety`);
    }
  } catch (error) {
    failures.push({ variety: record.variety, message: error?.message || String(error) });
    console.error(`! ${record.variety}: ${error?.message || error}`);
  }
  // A small pause keeps the one-time migration gentle on Appwrite and local networking.
  if (index < records.length - 1) await sleep(250);
}

console.log(`\nMigration complete: ${updated} existing record update(s), ${created} new variety record(s), ${failures.length} failure(s).`);
if (failures.length) {
  console.log('The migration is idempotent. Fix the first error and run the same npm.cmd command again.');
  process.exitCode = 1;
} else {
  console.log('Revoke/delete the temporary APPWRITE_API_KEY used for this one-time migration.');
}
