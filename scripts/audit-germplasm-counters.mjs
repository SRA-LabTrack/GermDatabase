import fs from 'node:fs';
import path from 'node:path';

const seedPath = path.resolve(process.cwd(), 'seed', 'characterization.json');
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const rows = Array.isArray(seed?.records) ? seed.records : [];

function key(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '');
}
function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const unique = new Map();
for (const row of rows) {
  const id = key(row?.variety);
  if (!id) continue;
  const current = unique.get(id) || {};
  unique.set(id, {
    variety: current.variety || String(row?.variety || '').trim(),
    breeding_institution_developer_breeder: current.breeding_institution_developer_breeder || String(row?.breeding_institution_developer_breeder || '').trim(),
    collection_scope: current.collection_scope || String(row?.collection_scope || '').trim()
  });
}

let sra = 0;
let local = 0;
for (const row of unique.values()) {
  if (norm(row.breeding_institution_developer_breeder) === 'sugar regulatory administration') sra += 1;
  const scope = norm(row.collection_scope);
  if (scope === 'local') local += 1;
}

console.log('\nCaneSprout v2.13.17 germplasm dashboard counter audit\n');
console.log(`Source rows:                    ${rows.length}`);
console.log(`Unique nonblank varieties:      ${unique.size}`);
console.log(`SRA Developed Varieties:        ${sra}`);
console.log(`Local Collection:               ${local}`);
const international = Math.max(0, unique.size - local);
console.log(`International Collection:       ${international}`);
console.log('\nRules: canonical variety identity; SRA exact normalized developer; Local exact classification; International = all unique varieties other than Local.\n');
