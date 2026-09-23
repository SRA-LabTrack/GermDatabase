import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const TARGET_VERSION = '2.13.49';
const checks = [];
function pass(name, condition, detail = '') { checks.push({ name, ok: Boolean(condition), detail }); }

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const detail = fs.readFileSync(path.join(ROOT, 'src/components/DetailModal.jsx'), 'utf8');
const helper = fs.readFileSync(path.join(ROOT, 'src/lib/profilePrint.js'), 'utf8');
const styles = fs.readFileSync(path.join(ROOT, 'src/styles.css'), 'utf8');

pass(`Version is ${TARGET_VERSION}`, pkg.version === TARGET_VERSION, pkg.version);
pass('Profile print verifier npm script exists', pkg.scripts?.['verify:profile-print']?.includes('verify-profile-print-v2.13.42.mjs'));
pass('Printable profile helper exists', helper.includes('export function printableVarietyProfileHtml'));
pass('Browser print launcher exists', helper.includes('export function printVarietyProfile'));
pass('Detail profile imports print helper', detail.includes("printVarietyProfile } from '../lib/profilePrint.js'"));
pass('Profile footer has Print action', detail.includes('profile-print-action') && detail.includes('<Printer size={16} /> Print'));
pass('Core Information option exists', detail.includes("printProfile('core')") && detail.includes('Core Information'));
pass('Complete Information option exists', detail.includes("printProfile('complete')") && detail.includes('Complete Information'));
pass('Print menu styling exists', styles.includes('v2.13.42 PRINTABLE CORE + COMPLETE VARIETY PROFILE'));
pass('A4 print layout exists', helper.includes('@page { size: A4'));
pass('Complete print reads characterization groups', helper.includes('CHARACTERIZATION_GROUPS.map'));
pass('Complete print reads germination fields', helper.includes('GERMINATION_FIELDS.map'));
pass('Printable color swatches are supported', helper.includes('print-color-swatches') && helper.includes('resolveRhsColors'));
pass('Leaf length formatter is retained in print output', helper.includes("fieldKey === 'leaf_length_cm'") && helper.includes('formatLeafLengthCm'));
pass('Blank fields are omitted from print cards', helper.includes("if (!value) return '';"));

const moduleUrl = `${pathToFileURL(path.join(ROOT, 'src/lib/profilePrint.js')).href}?verify=${Date.now()}`;
const printable = await import(moduleUrl);
const record = {
  variety: 'PHIL TEST-42',
  accession_number: 'ACC-42',
  origin: 'Philippines',
  species: 'Saccharum hybrid',
  parentage_female: 'Parent A',
  parentage_male: 'Parent B',
  yield_tc_ha: '150',
  recommended_locations: 'Negros Occidental',
  disease_reaction: 'Resistant',
  leaf_color: '137B',
  leaf_length_cm: '95',
  leaf_texture: 'Rough',
  lot_planted_station: 'La Granja',
  lot_planted_latitude: '10.410001',
  lot_planted_longitude: '122.987654',
  germ_trial_code: 'GT-42',
  germ_buds_planted: '100',
  germ_germinated_count: '90',
  source_name: 'Verification record'
};

const coreHtml = printable.printableVarietyProfileHtml(record, { mode: 'core' });
const completeHtml = printable.printableVarietyProfileHtml(record, { mode: 'complete' });

pass('Core print contains variety and core data', coreHtml.includes('PHIL TEST-42') && coreHtml.includes('ACC-42') && coreHtml.includes('Negros Occidental'));
pass('Core print excludes additional leaf characterization', !coreHtml.includes('Rough') && !coreHtml.includes('95 cm'));
pass('Complete print includes additional characterization', completeHtml.includes('Rough') && completeHtml.includes('95 cm (SMALL)'));
pass('Complete print includes exact coordinate fields', completeHtml.includes('10.410001') && completeHtml.includes('122.987654'));
pass('Complete print includes germination information', completeHtml.includes('GT-42') && completeHtml.includes('90.00%'));
pass('Complete print renders RHS color approximation', completeHtml.includes('137B') && completeHtml.includes('print-color-swatches'));

console.log(`\nCaneSprout v${TARGET_VERSION} Printable Variety Profile Verification\n`);
for (const check of checks) console.log(`${check.ok ? 'PASS' : 'FAIL'}  ${check.name}${check.detail && !check.ok ? ` (${check.detail})` : ''}`);
const passed = checks.filter((check) => check.ok).length;
console.log(`\n${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exitCode = 1;
