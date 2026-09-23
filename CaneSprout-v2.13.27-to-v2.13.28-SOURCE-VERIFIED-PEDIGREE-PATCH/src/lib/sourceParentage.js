import sourceData from '../data/sraParentage.js';
import { canonicalLegacyVariety, normalizeVarietyDisplay, normalizeVarietyIdentity } from './legacyHyv.js';

function canonicalDisplay(value) {
  return normalizeVarietyDisplay(canonicalLegacyVariety(value || ''));
}

function canonicalKey(value) {
  return normalizeVarietyIdentity(canonicalDisplay(value));
}

const PARENTAGE_BY_IDENTITY = new Map();
for (const entry of sourceData.records || []) {
  const variety = canonicalDisplay(entry.variety || entry.source_variety || '');
  const key = canonicalKey(variety);
  if (!key) continue;
  PARENTAGE_BY_IDENTITY.set(key, {
    variety,
    sourceVariety: normalizeVarietyDisplay(entry.source_variety || entry.variety || ''),
    male: canonicalDisplay(entry.male || ''),
    female: canonicalDisplay(entry.female || ''),
    sourceName: entry.source_name || '',
    sourceSheet: entry.source_sheet || '',
    sourceRow: entry.source_row ?? null,
    safeAlias: entry.safe_alias || ''
  });
}

export const SOURCE_PARENTAGE_METADATA = Object.freeze({
  version: sourceData.version,
  recordCount: sourceData.record_count || PARENTAGE_BY_IDENTITY.size,
  sourcePrecedence: Object.freeze([...(sourceData.source_precedence || [])]),
  sourceFiles: Object.freeze([...(sourceData.source_files || [])]),
  note: sourceData.source_note || ''
});

export function authoritativeParentageForVariety(variety) {
  const key = canonicalKey(variety);
  return key ? (PARENTAGE_BY_IDENTITY.get(key) || null) : null;
}

export function resolveRecordParentage(record) {
  const source = authoritativeParentageForVariety(record?.variety || '');
  const male = source?.male || canonicalDisplay(record?.parentage_male || '');
  const female = source?.female || canonicalDisplay(record?.parentage_female || '');
  return {
    male,
    female,
    sourceBacked: Boolean(source),
    sourceName: source?.sourceName || record?.sra_hyv_source_name || '',
    sourceSheet: source?.sourceSheet || record?.sra_hyv_source_sheet || '',
    sourceRow: source?.sourceRow ?? record?.sra_hyv_source_row ?? null,
    sourceVariety: source?.sourceVariety || ''
  };
}

export function sourceParentageRecords() {
  return [...PARENTAGE_BY_IDENTITY.values()].map((entry, index) => ({
    $id: `pedigree_source_${String(index + 1).padStart(3, '0')}`,
    variety: entry.variety,
    parentage_male: entry.male,
    parentage_female: entry.female,
    __pedigreeSourceOnly: true,
    __pedigreeSourceBacked: true,
    sra_hyv_source_name: entry.sourceName,
    sra_hyv_source_sheet: entry.sourceSheet,
    sra_hyv_source_row: entry.sourceRow
  }));
}

export function pedigreeIdentity(value) {
  return canonicalKey(value);
}

export function canonicalPedigreeDisplay(value) {
  return canonicalDisplay(value);
}
