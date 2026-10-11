import fs from 'node:fs';

const TARGET_VERSION = '2.13.89';
const BASE_VERSION = '2.13.88';

const paths = {
  modal: 'src/components/BreedingProgramModal.jsx',
  css: 'src/styles.css',
  pkg: 'package.json',
  lock: 'package-lock.json',
  version: 'public/version.json',
  gitignore: '.gitignore'
};

function fail(message) {
  console.error(`\nERROR: ${message}`);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Required file not found: ${file}`);
  return fs.readFileSync(file, 'utf8');
}

function backup(file) {
  if (!fs.existsSync(file)) return;
  const backupPath = `${file}.v${BASE_VERSION}-backup`;
  if (!fs.existsSync(backupPath)) fs.copyFileSync(file, backupPath);
}

function write(file, content) {
  fs.writeFileSync(file, content, 'utf8');
}

function removeBrochurePanel(modal) {
  const startMarker = '\nfunction BrochurePanel() {';
  const endMarker = '\nexport default function BreedingProgramModal';
  const start = modal.indexOf(startMarker);
  if (start < 0) return modal;
  const end = modal.indexOf(endMarker, start);
  if (end < 0) fail('Could not safely locate the end of BrochurePanel().');
  return modal.slice(0, start) + '\n' + modal.slice(end);
}

function removeBrochureTabButton(modal) {
  const pattern = /\n\s*<button type="button" className=\{tab === 'brochure' \? 'active' : ''\} onClick=\{\(\) => setTab\('brochure'\)\}>[\s\S]*?<\/button>/;
  return modal.replace(pattern, '');
}

function updateTabGrid(css) {
  return css.replace(/\.breeding-program-tabs\s*\{[^{}]*\}/g, (block) => {
    return block.replace(
      /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)(\s*!important)?;/g,
      (_match, important = '') => `grid-template-columns: repeat(2, minmax(0, 1fr))${important};`
    );
  });
}

console.log(`
============================================================
CaneSprout ${BASE_VERSION} -> ${TARGET_VERSION}
Breeding Program: SOP & Protocols + Research Archive only
============================================================
`);

const pkg = JSON.parse(read(paths.pkg));
if (![BASE_VERSION, TARGET_VERSION].includes(pkg.version)) {
  fail(`Expected package version ${BASE_VERSION} or ${TARGET_VERSION}, found ${pkg.version}.`);
}

for (const file of [paths.modal, paths.css, paths.pkg, paths.lock, paths.version]) {
  if (fs.existsSync(file)) backup(file);
}

let modal = read(paths.modal);
let css = read(paths.css);

modal = modal
  .replace(
    "import React, { useEffect, useMemo, useRef, useState } from 'react';",
    "import React, { useEffect, useMemo, useState } from 'react';"
  )
  .replace(/\nimport SugarcaneIcon from '\.\/SugarcaneIcon\.jsx';/, '')
  .replace(/\nimport \{ fileViewUrl, getRecord, listRecords \} from '\.\.\/lib\/registryApi\.js';/, '')
  .replace(/\nimport \{ openVarietyBrochure \} from '\.\.\/lib\/varietyBrochure\.js';/, '');

modal = removeBrochurePanel(modal);
modal = removeBrochureTabButton(modal);

modal = modal.replace(
  /\n\s*\{tab === 'brochure' && <BrochurePanel \/>\}/,
  ''
);

modal = modal.replace(
  'Germplasm and breeding SOPs, station research archive, and variety brochure tools in one workspace.',
  'Germplasm and breeding SOPs and the station research archive in one focused workspace.'
);

css = updateTabGrid(css);

const brochureRemainsInSection =
  modal.includes("tab === 'brochure'") ||
  modal.includes('function BrochurePanel()') ||
  modal.includes('openVarietyBrochure') ||
  modal.includes("from './SugarcaneIcon.jsx'") ||
  modal.includes('Variety Brochure</strong>');

if (brochureRemainsInSection) {
  fail('Variety Brochure references still remain inside BreedingProgramModal.jsx. No files were finalized.');
}

if (!modal.includes("tab === 'protocols'") || !modal.includes("tab === 'research'")) {
  fail('The SOP & Protocols or Research Archive section is missing after the edit.');
}

if (!/\.breeding-program-tabs\s*\{[^{}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(css)) {
  fail('Could not convert the Breeding Program navigation to two equal columns.');
}

pkg.version = TARGET_VERSION;
pkg.scripts = pkg.scripts || {};
pkg.scripts['verify:breeding-program-two-sections'] =
  'node scripts/verify-breeding-program-two-sections-v2.13.89.mjs';

let lock = null;
if (fs.existsSync(paths.lock)) {
  lock = JSON.parse(read(paths.lock));
  lock.version = TARGET_VERSION;
  if (lock.packages?.['']) lock.packages[''].version = TARGET_VERSION;
}

let versionInfo = {};
if (fs.existsSync(paths.version)) {
  versionInfo = JSON.parse(read(paths.version));
}
versionInfo.version = TARGET_VERSION;
versionInfo.channel = versionInfo.channel || 'stable';
versionInfo.notes =
  'Simplifies the Breeding Program workspace to two focused sections: SOP & Protocols and Research Archive. Variety Brochure is removed from Breeding Program because brochure access is already available elsewhere.';
versionInfo.updated = '2026-10-11';
versionInfo.updatedAt = new Date().toISOString();

write(paths.modal, modal);
write(paths.css, css);
write(paths.pkg, JSON.stringify(pkg, null, 2) + '\n');
if (lock) write(paths.lock, JSON.stringify(lock, null, 2) + '\n');
write(paths.version, JSON.stringify(versionInfo, null, 2) + '\n');

let gitignore = fs.existsSync(paths.gitignore) ? fs.readFileSync(paths.gitignore, 'utf8') : '';
if (!gitignore.split(/\r?\n/).includes('*.v*-backup')) {
  if (gitignore && !gitignore.endsWith('\n')) gitignore += '\n';
  gitignore += '*.v*-backup\n';
  write(paths.gitignore, gitignore);
}

console.log('Updated:');
console.log('  - Breeding Program now has only SOP & Protocols and Research Archive.');
console.log('  - Variety Brochure tab/panel removed from Breeding Program only.');
console.log('  - Existing brochure utilities elsewhere in CaneSprout were left untouched.');
console.log('  - Breeding Program navigation changed from 3 columns to 2 equal columns.');
console.log(`  - package.json / package-lock.json / public/version.json moved to ${TARGET_VERSION}.`);
console.log('  - Added npm verifier: verify:breeding-program-two-sections');
console.log('\nPATCH APPLIED SUCCESSFULLY.\n');
