import fs from 'node:fs';
import path from 'node:path';

const source = JSON.parse(fs.readFileSync(path.resolve('seed/characterization.json'), 'utf8'));
const rows = Array.isArray(source?.records) ? source.records : [];
const canonical = (value) => String(value || '').normalize('NFKC').trim().toUpperCase().replace(/PHILIPPINES/g, 'PHIL').replace(/[^A-Z0-9]+/g, '');
const cleanDisplay = (value) => String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').replace(/^PHILIPPINES\b/i, 'Phil').replace(/^PHIL\b/i, 'Phil');
const groups = new Map();
rows.forEach((row, index) => {
  const key = canonical(row.variety);
  if (!key) return;
  const list = groups.get(key) || [];
  list.push({ index, variety: String(row.variety || ''), clean: cleanDisplay(row.variety), id: row.$id || row.document_id || row.id || '' });
  groups.set(key, list);
});
const duplicates = [...groups.entries()].filter(([, values]) => values.length > 1);
const formatting = duplicates.filter(([, values]) => new Set(values.map((row) => row.variety)).size > 1 && new Set(values.map((row) => row.clean)).size === 1);
const spacingHyphenOnly = duplicates.filter(([, values]) => {
  const rawUpper = new Set(values.map((row) => String(row.variety || '').normalize('NFKC').trim().toUpperCase()));
  const cleanedUpper = new Set(values.map((row) => String(row.clean || '').toUpperCase()));
  return rawUpper.size > 1 && cleanedUpper.size === 1;
});
console.log('\nCaneSprout local variety identity audit v2.13.9');
console.log(`Bundled records: ${rows.length}`);
console.log(`Canonical nonblank identities: ${groups.size}`);
console.log(`Canonical duplicate groups: ${duplicates.length}`);
console.log(`Extra duplicate records: ${duplicates.reduce((sum, [, values]) => sum + values.length - 1, 0)}`);
console.log(`Formatting-variant groups (including case): ${formatting.length}`);
console.log(`Whitespace/hyphen-only variant groups: ${spacingHyphenOnly.length}\n`);
for (const [key, values] of duplicates) {
  console.log(`! ${key} (${values.length} records)`);
  values.forEach((row) => console.log(`    ${row.variety} -> ${row.clean} ${row.id ? `| ${row.id}` : ''}`));
}
console.log('\nIdentity example:');
['Phil 996-0339', 'Phil 996- 0339', 'Phil 996 -0339'].forEach((value) => console.log(`  ${value} -> ${canonical(value)}`));
console.log('\nThis audit is local/read-only. Run npm.cmd run audit:duplicates for the current live Appwrite registry.\n');
