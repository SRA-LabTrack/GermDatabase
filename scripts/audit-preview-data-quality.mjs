import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const characterization = JSON.parse(fs.readFileSync(path.join(root, 'seed', 'characterization.json'), 'utf8'));
const hyv = JSON.parse(fs.readFileSync(path.join(root, 'seed', 'sra_hyv_characteristics_v273.json'), 'utf8'));
const api = fs.readFileSync(path.join(root, 'src', 'lib', 'registryApi.js'), 'utf8');

const badPatterns = [
  /\bsppot\b/i,
  /\bdowny\s+downy\s+mildew\b/i,
  /\binter\s+mediate\b/i,
  /\bintermidiate\b/i,
  /\binter-\s*mediate\b/i,
  /\bsuscep-\s*tible\b/i,
  /\bresist-\s*tant\b/i
];

function allText(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => allText(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => allText(item, out));
  return out;
}

let failures = 0;
function check(label, pass, detail = '') {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` (${detail})` : ''}`);
  if (!pass) failures += 1;
}

const texts = [...allText(characterization), ...allText(hyv)];
const badHits = [];
for (const text of texts) {
  for (const pattern of badPatterns) {
    const match = text.match(pattern);
    if (match) badHits.push({ pattern: String(pattern), match: match[0], text });
  }
}

const records = Array.isArray(characterization.records) ? characterization.records : [];
const phil991793 = records.find((row) => String(row.variety || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === 'PHIL991793');
const fnStart = api.indexOf('export async function getLocalRecordPreview');
const fnEnd = api.indexOf('\nexport async function getRecord', fnStart);
const previewFn = fnStart >= 0 && fnEnd > fnStart ? api.slice(fnStart, fnEnd) : '';
const lookupAt = previewFn.indexOf('findOfflineRecordByVariety');
const bundledReturnAt = previewFn.indexOf('if (record.__bundledSnapshot)');

console.log('\nCaneSprout v2.13.32 Preview/Data Quality Audit\n');
check('950 bundled characterization records preserved', records.length === 950, String(records.length));
check('Known bundled disease typo corrected for Phil 99-1793', Boolean(phil991793) && /yellow spot/i.test(phil991793.disease_reaction || '') && !/sppot/i.test(phil991793.disease_reaction || ''), phil991793?.disease_reaction || 'record missing');
check('No audited transcription artifacts remain in bundled JSON', badHits.length === 0, `${badHits.length} hit(s)`);
check('Bundled previews check cached live edits before rendering', lookupAt >= 0 && bundledReturnAt >= 0 && lookupAt < bundledReturnAt);
check('Preview overlay explicitly lets cached live snapshot win over bundled record', previewFn.includes('...record,\n      ...(snapshot || {})'));

if (badHits.length) {
  console.log('\nRemaining hits:');
  badHits.slice(0, 20).forEach((hit) => console.log(`- ${hit.match}: ${hit.text.slice(0, 180)}`));
}

console.log(`\n${5 - failures}/5 checks passed.`);
if (failures) process.exit(1);
