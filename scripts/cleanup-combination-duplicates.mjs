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
const collectionId = 'sugarcane_combination_registry';
const apiKey = process.env.APPWRITE_API_KEY;
const audit = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'seed/combination_duplicates_removed.json'), 'utf8'));

if (!apiKey || apiKey.includes('PASTE_TEMPORARY')) {
  console.error('\nMissing APPWRITE_API_KEY. Add a temporary server API key to .env, run this cleanup once, then revoke the key.\n');
  process.exit(1);
}

async function request(method, route) {
  const response = await fetch(`${endpoint}${route}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Appwrite-Project': projectId,
      'X-Appwrite-Key': apiKey,
      'X-Appwrite-Response-Format': '1.9.5'
    },
    signal: AbortSignal.timeout(30000)
  });
  const raw = await response.text();
  const parsed = raw ? (() => { try { return JSON.parse(raw); } catch { return { message: raw }; } })() : {};
  if (!response.ok) {
    const error = new Error(parsed?.message || `${response.status} ${response.statusText}`);
    error.status = response.status;
    throw error;
  }
  return parsed;
}

function route(id) {
  return `/databases/${databaseId}/collections/${collectionId}/documents/${encodeURIComponent(id)}`;
}

console.log('\nCaneSprout safe Combination Registry duplicate cleanup');
console.log(`Audited duplicate groups: ${audit.metadata?.duplicate_groups || 0}`);
console.log(`Exact duplicate documents targeted: ${audit.metadata?.duplicate_extra_records || 0}\n`);

let deleted = 0;
let absent = 0;
let skipped = 0;

for (const group of audit.groups || []) {
  let keeper;
  try {
    keeper = await request('GET', route(group.keep_document_id));
  } catch (error) {
    if (error.status === 404) {
      console.warn(`! Keeper missing, group skipped: ${group.female_variety} × ${group.male_variety} @ ${group.combination_date || group.source_date_text}`);
      skipped += (group.removed || []).length;
      continue;
    }
    throw error;
  }

  for (const duplicate of group.removed || []) {
    let current;
    try {
      current = await request('GET', route(duplicate.document_id));
    } catch (error) {
      if (error.status === 404) {
        absent += 1;
        continue;
      }
      throw error;
    }

    const sameEvent =
      String(current.female_key || '') === String(keeper.female_key || '') &&
      String(current.male_key || '') === String(keeper.male_key || '') &&
      String(current.combination_date || '') === String(keeper.combination_date || '') &&
      String(current.source_date_text || '') === String(keeper.source_date_text || '');

    if (!sameEvent) {
      console.warn(`! ${duplicate.document_id} changed in cloud and was NOT deleted.`);
      skipped += 1;
      continue;
    }

    await request('DELETE', route(duplicate.document_id));
    deleted += 1;
    console.log(`✓ removed duplicate ${duplicate.source_sheet}!${duplicate.source_cell}; kept ${group.keep_source_sheet}!${group.keep_source_cell}`);
  }
}

console.log('\nCleanup complete.');
console.log(`Deleted:        ${deleted}`);
console.log(`Already absent: ${absent}`);
console.log(`Skipped safely: ${skipped}`);
console.log('\nRevoke the temporary APPWRITE_API_KEY now.\n');
