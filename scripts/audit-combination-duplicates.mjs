import fs from 'node:fs';
import path from 'node:path';

const rawPath = path.resolve(process.cwd(), 'seed/combination_registry.json');
const runtimePath = path.resolve(process.cwd(), 'seed/combination_runtime.json');
const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
const runtime = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));

const text = (value) => String(value ?? '').trim();
const normalizedDate = (row) => {
  const date = text(row.combination_date);
  if (date) return `date:${date}`;
  return `raw:${text(row.source_date_text).replace(/\s+/g, ' ').toLowerCase()}`;
};
const eventKey = (row) => `${text(row.female_key)}|${text(row.male_key)}|${normalizedDate(row)}`;

function duplicateGroups(records) {
  const map = new Map();
  for (const row of records || []) {
    const key = eventKey(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.values()].filter((rows) => rows.length > 1);
}

const rawDuplicates = duplicateGroups(raw.records);
const runtimeDuplicates = duplicateGroups(runtime.records);
const docIds = new Set();
let duplicateDocumentIds = 0;
for (const row of runtime.records || []) {
  if (docIds.has(row.document_id)) duplicateDocumentIds += 1;
  docIds.add(row.document_id);
}

console.log('\nCaneSprout Combination Duplicate Audit');
console.log(`Raw workbook entries checked: ${raw.records?.length || 0}`);
console.log(`Raw duplicate event groups:    ${rawDuplicates.length}`);
console.log(`Raw duplicate extra entries:   ${rawDuplicates.reduce((sum, rows) => sum + rows.length - 1, 0)}`);
console.log(`Canonical runtime events:      ${runtime.records?.length || 0}`);
console.log(`Runtime duplicate groups:      ${runtimeDuplicates.length}`);
console.log(`Duplicate runtime document IDs:${duplicateDocumentIds}`);

if (runtimeDuplicates.length || duplicateDocumentIds) {
  console.error('\nFAILED: canonical runtime still contains duplicates.');
  for (const rows of runtimeDuplicates.slice(0, 20)) {
    const first = rows[0];
    console.error(`  - ${first.female_variety} × ${first.male_variety} @ ${first.combination_date || first.source_date_text}: ${rows.length} copies`);
  }
  process.exit(1);
}

console.log('\nPASS: no duplicate combination events remain in the runtime dataset.\n');
