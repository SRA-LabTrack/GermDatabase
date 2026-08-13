import { CHARACTERIZATION_FIELDS } from './characterizationFields';

export const CANONICAL_TEMPLATE_PATH = '/templates/CaneSprout-Variety-Import-Template-v2.7.3.xlsx';
export const CANONICAL_TEMPLATE_NAME = 'CaneSprout Variety Import Template v2.7.3';

const CANONICAL_SIGNATURE = Object.freeze([
  [0, 60, 'parentage'],
  [1, 60, 'female'],
  [1, 61, 'male'],
  [0, 62, 'yield_potential'],
  [1, 62, 'lkg_tc'],
  [1, 63, 'tc_ha'],
  [0, 64, 'agronomic_characteristics'],
  [1, 73, 'sra_hyv_agronomic_description'],
  [0, 74, 'pest_and_diseases'],
  [1, 74, 'reaction_diseases'],
  [0, 75, 'tested_location'],
  [0, 76, 'photo_and_documentation']
]);

function normalizedHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function isCanonicalTemplate(matrix) {
  return CANONICAL_SIGNATURE.every(([row, column, expected]) => normalizedHeader(matrix?.[row]?.[column]) === expected);
}

const V272_SIGNATURE = Object.freeze([
  [0, 60, 'parentage'], [1, 60, 'female'], [1, 61, 'male'],
  [0, 62, 'yield_potential'], [1, 62, 'lkg_tc'], [1, 63, 'tc_ha'],
  [0, 64, 'agronomic_characteristics'], [1, 73, 'reaction_diseases'],
  [0, 74, 'tested_location'], [0, 75, 'photo_and_documentation']
]);

function isV272Template(matrix) {
  return V272_SIGNATURE.every(([row, column, expected]) => normalizedHeader(matrix?.[row]?.[column]) === expected);
}

function looksLikeLegacySraHyv(matrix) {
  const title = cleanText(matrix?.[0]?.[0]).toLowerCase();
  return title.includes('sra-bred high yielding varieties')
    && normalizedHeader(matrix?.[2]?.[0]) === 'varieties'
    && normalizedHeader(matrix?.[2]?.[1]) === 'parentage';
}

function parseLegacyParentage(parts) {
  const cleaned = parts.map(cleanText).filter(Boolean);
  if (!cleaned.length) return { female: '', male: '' };
  const joined = cleanText(cleaned.join(' '));
  const split = joined.split(/\s+[xX×]\s+/, 2);
  if (split.length === 2) return { female: cleanText(split[0]), male: cleanText(split[1]) };
  if (cleaned.length >= 2) return {
    female: cleanText(cleaned[0].replace(/[xX×]\s*$/, '')),
    male: cleanText(cleaned.slice(1).join(' '))
  };
  return { female: joined, male: '' };
}

function parseLegacySraHyv(matrix, fileName) {
  const startRows = [];
  for (let row = 4; row < matrix.length; row += 1) {
    if (cleanText(matrix[row]?.[0])) startRows.push(row);
  }
  const rows = startRows.map((start, index) => {
    const end = startRows[index + 1] ?? matrix.length;
    const columnValues = (column) => {
      const values = [];
      for (let row = start; row < end; row += 1) {
        const value = cleanText(matrix[row]?.[column]);
        if (value) values.push(value);
      }
      return values;
    };
    const parents = parseLegacyParentage(columnValues(1));
    return {
      variety: cleanText(matrix[start]?.[0]),
      parentage_female: parents.female,
      parentage_male: parents.male,
      yield_lkg_tc: cleanText(matrix[start]?.[2]),
      yield_tc_ha: cleanText(matrix[start]?.[3]),
      agronomic_characteristics_summary: cleanText(columnValues(4).join(' ')),
      agronomic_millable_stalk: cleanText(columnValues(5).join(' ')),
      disease_reaction: cleanText(columnValues(6).join(' ')),
      agronomic_maturity: cleanText(columnValues(7).join(' ')),
      source_name: fileName || 'SRA HYV legacy workbook',
      source_row: start + 1
    };
  }).filter((record) => record.variety);
  if (!rows.length) throw new Error('No SRA HYV variety rows were found in the legacy workbook.');
  return rows;
}

/**
 * Supports:
 * 1) CaneSprout canonical A:CB v2.7.3 workbook,
 * 2) the earlier A:CA / A:BW characterization workbooks,
 * 3) the SRA-BRED HIGH YIELDING VARIETIES A:H legacy .xls sheets,
 * 4) simple one-row headers using field keys or labels.
 */
export async function parseCharacterizationExcel(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook does not contain a worksheet.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (!matrix.length) throw new Error('The worksheet is empty.');

  if (looksLikeLegacySraHyv(matrix)) {
    const merged = new Map();
    const usedSheets = [];
    for (const candidateName of workbook.SheetNames) {
      const candidateSheet = workbook.Sheets[candidateName];
      const candidateMatrix = XLSX.utils.sheet_to_json(candidateSheet, { header: 1, defval: '', raw: true });
      if (!looksLikeLegacySraHyv(candidateMatrix)) continue;
      usedSheets.push(candidateName);
      for (const row of parseLegacySraHyv(candidateMatrix, file.name)) {
        const key = normalizedHeader(row.variety);
        const prior = merged.get(key) || {};
        const next = { ...prior };
        Object.entries(row).forEach(([field, value]) => {
          if (value !== '' && value != null) next[field] = value;
        });
        merged.set(key, next);
      }
    }
    const rows = [...merged.values()];
    return {
      rows,
      sheetName: usedSheets.join(' + ') || sheetName,
      layout: 'SRA HYV legacy A:H',
      legacySraHyv: true,
      smartUpsertRecommended: true
    };
  }

  const secondRowLooksLikeSource = normalizedHeader(matrix?.[1]?.[0]) === 'variety' && matrix[1].length >= 50;
  if (secondRowLooksLikeSource) {
    const canonical = isCanonicalTemplate(matrix);
    const oldV272 = !canonical && isV272Template(matrix);
    const rows = matrix.slice(2).map((values, index) => {
      const record = { source_name: file.name || 'Excel import', source_row: index + 3 };
      if (oldV272) {
        // v2.7.2 had 75 traits in A:BW and photo headings in BX:CA. Keep
        // its last two trait columns aligned instead of shifting them into the
        // new v2.7.3 agronomic-description column.
        CHARACTERIZATION_FIELDS.slice(0, 73).forEach((field, column) => {
          const value = values[column];
          record[field.key] = value == null ? '' : String(value).trim();
        });
        record.agronomic_characteristics_summary = '';
        record.disease_reaction = values[73] == null ? '' : String(values[73]).trim();
        record.tested_location = values[74] == null ? '' : String(values[74]).trim();
      } else {
        // Canonical trait data occupies A:BX in v2.7.3. BY:CB are photo
        // documentation headings and remain managed by CaneSprout's image uploader.
        CHARACTERIZATION_FIELDS.forEach((field, column) => {
          const value = values[column];
          record[field.key] = value == null ? '' : String(value).trim();
        });
      }
      return record;
    }).filter((record) => CHARACTERIZATION_FIELDS.some((field) => record[field.key]));
    if (!rows.length) throw new Error('No characterization rows were found beneath the two header rows.');
    return {
      rows,
      sheetName,
      layout: canonical ? 'CaneSprout canonical A:CB v2.7.3' : oldV272 ? 'CaneSprout canonical A:CA v2.7.2' : 'Characterization traits layout',
      canonicalTemplate: canonical,
      smartUpsertRecommended: true
    };
  }

  const headers = matrix[0].map(normalizedHeader);
  const lookup = new Map();
  CHARACTERIZATION_FIELDS.forEach((field) => {
    lookup.set(normalizedHeader(field.key), field.key);
    const labelKey = normalizedHeader(field.label);
    if (!lookup.has(labelKey)) lookup.set(labelKey, field.key);
    lookup.set(normalizedHeader(`${field.group || ''} ${field.label}`), field.key);
  });
  const mapped = headers.map((header) => lookup.get(header) || null);
  const rows = matrix.slice(1).map((values, index) => {
    const record = { source_name: file.name || 'Excel import', source_row: index + 2 };
    mapped.forEach((key, column) => { if (key) record[key] = values[column] == null ? '' : String(values[column]).trim(); });
    return record;
  }).filter((record) => CHARACTERIZATION_FIELDS.some((field) => record[field.key]));
  if (!rows.length) throw new Error('No recognized sugarcane characterization columns were found.');
  return { rows, sheetName, layout: 'single-header', smartUpsertRecommended: true };
}
