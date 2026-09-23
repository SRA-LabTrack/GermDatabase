import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const checks = [];
function check(label, condition) { checks.push({ label, ok: Boolean(condition) }); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

const pkg = JSON.parse(read('package.json'));
const detail = read('src/components/DetailModal.jsx');
const styles = read('src/styles.css');
const component = read('src/components/TraitValue.jsx');
const visuals = read('src/lib/traitVisuals.js');
const palette = read('src/lib/rhsColorData.js');

const helperPath = pathToFileURL(path.join(ROOT, 'src/lib/traitVisuals.js')).href;
const helper = await import(`${helperPath}?verify=${Date.now()}`);

check('Version is 2.13.49', pkg.version === '2.13.49');
check('Profile verifier npm script exists', pkg.scripts?.['verify:profile-trait-visuals'] === 'node scripts/verify-profile-trait-visuals.mjs');
check('TraitValue component exists', exists('src/components/TraitValue.jsx'));
check('RHS palette data exists', exists('src/lib/rhsColorData.js') && palette.includes("'137B':'2d3f23'") && palette.includes("'192B':'aebaa7'"));
check('Detail profile imports TraitValue', detail.includes("import TraitValue from './TraitValue.jsx';"));
check('Additional characterization uses TraitValue', detail.includes('TraitValue fieldKey={field.key} value={record[field.key]}'));
check('Color visualization CSS is present', styles.includes('v2.13.39 RHS COLOR VISUALIZATION + LEAF LENGTH SIZE'));
check('Leaf color is configured as a visual color field', visuals.includes("'leaf_color'"));
check('Midrib color is configured as a visual color field', visuals.includes("'leaf_midrib_color'"));
check('137B resolves to expected screen color', helper.resolveRhsColor('137B')?.hex?.toLowerCase() === '#2d3f23');
check('192B resolves to expected screen color', helper.resolveRhsColor('192B')?.hex?.toLowerCase() === '#aebaa7');
check('N138A has an N-series approximation', helper.resolveRhsColor('N138A')?.hex?.toLowerCase() === '#55715d');
check('95 cm is SMALL', helper.formatLeafLengthCm('95').text === '95 cm (SMALL)');
check('125 cm is MEDIUM', helper.formatLeafLengthCm('125').text === '125 cm (MEDIUM)');
check('163.6 cm is LARGE', helper.formatLeafLengthCm('163.6').text === '163.6 cm (LARGE)');
check('Dual color codes produce two swatches', helper.resolveRhsColors('200D/199A').length === 2);

console.log('\nCaneSprout v2.13.49 Profile Trait Visualization Verification\n');
for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.label}`);
const passed = checks.filter((item) => item.ok).length;
console.log(`\n${passed}/${checks.length} checks passed.\n`);
if (passed !== checks.length) process.exitCode = 1;
