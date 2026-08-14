import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const payload = JSON.parse(fs.readFileSync(path.join(root, 'seed', 'characterization.json'), 'utf8'));
const records = Array.isArray(payload.records) ? payload.records : [];
const fields = [
  ['origin', 'Country'],
  ['breeding_institution_developer_breeder', 'Breeding Institution/Developer/Breeder'],
  ['collection_scope', 'Local/International Collection'],
  ['species', 'Species'],
  ['genetic_background', 'Type/Genetic Back Ground'],
  ['other_details', 'Other details'],
  ['lot_planted_station', 'Lot Planted in the station']
];
console.log('\nCaneSprout red-trait local audit v2.13.15');
console.log(`Bundled records: ${records.length}`);
for (const [key, label] of fields) {
  const values = records.map((record) => String(record?.[key] || '').trim()).filter(Boolean);
  console.log(`${label}: ${values.length} populated • ${new Set(values).size} unique value(s)`);
}
const enriched = records.filter((record) => fields.some(([key]) => String(record?.[key] || '').trim())).length;
console.log(`Records with at least one new red-font trait: ${enriched}`);
if (records.length !== 950) process.exitCode = 1;
