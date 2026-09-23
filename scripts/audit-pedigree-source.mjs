import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import source from '../src/data/sraParentage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'seed/characterization.json'), 'utf8')).records || [];

const aliases = source.safe_aliases || {};
const normalize = (value) => String(value || '').trim().toUpperCase().replace(/PHILIPPINES/g, 'PHIL').replace(/[^A-Z0-9]+/g, '');
const canonical = (value) => aliases[normalize(value)] || String(value || '').trim();
const key = (value) => normalize(canonical(value));

const registryByKey = new Map();
for (const record of registry) {
  const id = key(record.variety);
  if (!id) continue;
  const list = registryByKey.get(id) || [];
  list.push(record);
  registryByKey.set(id, list);
}
const sourceByKey = new Map(source.records.map((record) => [key(record.variety), record]));

let matchedRoots = 0;
let matchingParentage = 0;
let conflictingParentage = 0;
let resolvedParentRefs = 0;
let sourceParentRefs = 0;
let rootsWithGrandparents = 0;
const conflicts = [];

for (const record of source.records) {
  const rootKey = key(record.variety);
  const candidates = registryByKey.get(rootKey) || [];
  if (candidates.length) matchedRoots += 1;
  const exact = candidates.some((candidate) => key(candidate.parentage_male) === key(record.male) && key(candidate.parentage_female) === key(record.female));
  if (exact) matchingParentage += 1;
  else if (candidates.length) {
    conflictingParentage += 1;
    conflicts.push({ variety: record.variety, sourceMale: record.male, sourceFemale: record.female, registry: candidates.map((candidate) => ({ male: candidate.parentage_male || '', female: candidate.parentage_female || '' })) });
  }
  let hasGrandparentBranch = false;
  for (const parent of [record.male, record.female]) {
    if (registryByKey.has(key(parent))) resolvedParentRefs += 1;
    if (sourceByKey.has(key(parent))) {
      sourceParentRefs += 1;
      hasGrandparentBranch = true;
    }
  }
  if (hasGrandparentBranch) rootsWithGrandparents += 1;
}

console.log('\nCaneSprout source-backed pedigree audit v2.13.29');
console.log(`Authoritative SRA parentage records: ${source.records.length}`);
console.log(`Records with both male and female parents: ${source.records.filter((record) => record.male && record.female).length}`);
console.log(`Canonical source varieties matched to registry: ${matchedRoots}/${source.records.length}`);
console.log(`Registry parentage already matching source: ${matchingParentage}/${source.records.length}`);
console.log(`Conflicting source-vs-registry parentage: ${conflictingParentage}`);
console.log(`Parent references resolving to a registered variety: ${resolvedParentRefs}/${source.records.length * 2}`);
console.log(`Parent references that themselves have authoritative parentage: ${sourceParentRefs}/${source.records.length * 2}`);
console.log(`Source varieties with at least one Generation-3 branch: ${rootsWithGrandparents}`);
console.log('Source precedence:', (source.source_precedence || []).join(' -> '));
if (conflicts.length) {
  console.log('\nConflicts requiring review:');
  for (const conflict of conflicts) console.log(JSON.stringify(conflict));
  process.exitCode = 2;
} else {
  console.log('\nPASS: source-backed parentage agrees with the current bundled registry for every matched SRA HYV variety.');
}
