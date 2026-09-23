import { normalizeVarietyDisplay } from './legacyHyv.js';
import {
  canonicalPedigreeDisplay,
  pedigreeIdentity,
  resolveRecordParentage,
  sourceParentageRecords
} from './sourceParentage.js';

function populated(value) {
  return String(value || '').trim();
}

function candidateScore(record) {
  if (!record) return -1;
  const sourceParentage = resolveRecordParentage(record);
  let score = 0;
  if (populated(sourceParentage.male)) score += 5;
  if (populated(sourceParentage.female)) score += 5;
  if (sourceParentage.sourceBacked || record.__pedigreeSourceBacked) score += 3;
  if (populated(record.breeding_institution_developer_breeder)) score += 1;
  if (populated(record.origin)) score += 1;
  if (!record.__bundledSnapshot && !record.__pedigreeSourceOnly) score += 0.25;
  // A real registry profile should win over a source-only synthetic record when
  // both carry the same authoritative SRA parentage.
  if (!record.__pedigreeSourceOnly) score += 0.5;
  return score;
}

function augmentedRecords(records = []) {
  // Source-only records ensure a documented SRA parent can continue to its own
  // parents even if that variety's full registry profile is missing locally.
  return [...(records || []), ...sourceParentageRecords()];
}

export function buildPedigreeIndex(records = []) {
  const grouped = new Map();
  for (const record of augmentedRecords(records)) {
    const key = pedigreeIdentity(record?.variety || '');
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(record);
    grouped.set(key, list);
  }

  const index = new Map();
  grouped.forEach((candidates, key) => {
    const sorted = [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a));
    index.set(key, sorted[0]);
  });
  return { index, grouped };
}

function unresolvedNode(name, role, depth) {
  const display = canonicalPedigreeDisplay(name || '');
  return {
    name: display || 'N/A',
    role,
    depth,
    recordId: '',
    resolved: false,
    missing: !display,
    repeated: false,
    sourceBacked: false,
    sourceName: '',
    sourceSheet: '',
    sourceRow: null,
    male: null,
    female: null
  };
}

function makeNode(record, role, depth, maxDepth, index, visited) {
  if (!record) return unresolvedNode('', role, depth);
  const display = canonicalPedigreeDisplay(record.variety || '') || 'Unnamed variety';
  const key = pedigreeIdentity(display);
  const parentage = resolveRecordParentage(record);
  if (key && visited.has(key)) {
    return {
      name: display,
      role,
      depth,
      recordId: record.__pedigreeSourceOnly ? '' : (record.$id || ''),
      resolved: true,
      missing: false,
      repeated: true,
      sourceBacked: Boolean(parentage.sourceBacked || record.__pedigreeSourceBacked),
      sourceName: parentage.sourceName || record.sra_hyv_source_name || '',
      sourceSheet: parentage.sourceSheet || record.sra_hyv_source_sheet || '',
      sourceRow: parentage.sourceRow ?? record.sra_hyv_source_row ?? null,
      male: null,
      female: null
    };
  }

  const nextVisited = new Set(visited);
  if (key) nextVisited.add(key);
  const node = {
    name: display,
    role,
    depth,
    recordId: record.__pedigreeSourceOnly ? '' : (record.$id || ''),
    resolved: true,
    missing: false,
    repeated: false,
    sourceBacked: Boolean(parentage.sourceBacked || record.__pedigreeSourceBacked),
    sourceName: parentage.sourceName || record.sra_hyv_source_name || '',
    sourceSheet: parentage.sourceSheet || record.sra_hyv_source_sheet || '',
    sourceRow: parentage.sourceRow ?? record.sra_hyv_source_row ?? null,
    male: null,
    female: null
  };
  if (depth >= maxDepth) return node;

  const maleName = canonicalPedigreeDisplay(parentage.male || '');
  const femaleName = canonicalPedigreeDisplay(parentage.female || '');

  if (maleName) {
    const maleRecord = index.get(pedigreeIdentity(maleName));
    node.male = maleRecord
      ? makeNode(maleRecord, 'male', depth + 1, maxDepth, index, nextVisited)
      : unresolvedNode(maleName, 'male', depth + 1);
  } else {
    node.male = unresolvedNode('', 'male', depth + 1);
  }

  if (femaleName) {
    const femaleRecord = index.get(pedigreeIdentity(femaleName));
    node.female = femaleRecord
      ? makeNode(femaleRecord, 'female', depth + 1, maxDepth, index, nextVisited)
      : unresolvedNode(femaleName, 'female', depth + 1);
  } else {
    node.female = unresolvedNode('', 'female', depth + 1);
  }

  return node;
}

export function buildThreeGenerationPedigree(record, records = []) {
  if (!record) return null;
  const { index, grouped } = buildPedigreeIndex(records);
  const key = pedigreeIdentity(record.variety || '');
  const root = (key && index.get(key)) || record;
  const tree = makeNode(root, 'selected', 1, 3, index, new Set());
  tree.duplicateSourceCount = key
    ? (grouped.get(key)?.filter((item) => !item.__pedigreeSourceOnly).length || 1)
    : 1;
  return tree;
}

export function pedigreeCatalog(records = []) {
  const { index } = buildPedigreeIndex(records);
  return [...index.values()]
    .filter((record) => pedigreeIdentity(record?.variety || '') && !record.__pedigreeSourceOnly)
    .sort((a, b) => canonicalPedigreeDisplay(a.variety).localeCompare(canonicalPedigreeDisplay(b.variety)));
}

export function pedigreeMatches(records = [], query = '', limit = 12) {
  const typed = String(query || '').trim();
  if (!typed) return records.slice(0, limit);
  const lower = normalizeVarietyDisplay(typed).toLowerCase();
  const key = pedigreeIdentity(typed);
  return records
    .filter((record) => {
      const name = canonicalPedigreeDisplay(record?.variety || '');
      return name.toLowerCase().includes(lower) || (key && pedigreeIdentity(name).includes(key));
    })
    .slice(0, limit);
}
