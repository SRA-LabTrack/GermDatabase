import { CHARACTERIZATION_FIELDS } from './characterizationFields';

function normalizedHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/**
 * Supports the provided Characterization workbook with two header rows (group + trait),
 * and a simpler one-row template that uses either field keys or labels.
 */
export async function parseCharacterizationExcel(file) {
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook does not contain a worksheet.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (!matrix.length) throw new Error('The worksheet is empty.');

  const secondRowLooksLikeSource = normalizedHeader(matrix?.[1]?.[0]) === 'variety' && matrix[1].length >= 50;
  if (secondRowLooksLikeSource) {
    const rows = matrix.slice(2).map((values, index) => {
      const record = { source_name: file.name || 'Excel import', source_row: index + 3 };
      CHARACTERIZATION_FIELDS.forEach((field, column) => {
        const value = values[column];
        record[field.key] = value == null ? '' : String(value).trim();
      });
      return record;
    }).filter((record) => CHARACTERIZATION_FIELDS.some((field) => record[field.key]));
    if (!rows.length) throw new Error('No characterization rows were found beneath the two header rows.');
    return { rows, sheetName, layout: 'Characterization A:BH' };
  }

  const headers = matrix[0].map(normalizedHeader);
  const lookup = new Map();
  CHARACTERIZATION_FIELDS.forEach((field) => {
    lookup.set(normalizedHeader(field.key), field.key);
    lookup.set(normalizedHeader(field.label), field.key);
    lookup.set(normalizedHeader(`${field.group || ''} ${field.label}`), field.key);
  });
  const mapped = headers.map((header) => lookup.get(header) || null);
  const rows = matrix.slice(1).map((values, index) => {
    const record = { source_name: file.name || 'Excel import', source_row: index + 2 };
    mapped.forEach((key, column) => { if (key) record[key] = values[column] == null ? '' : String(values[column]).trim(); });
    return record;
  }).filter((record) => CHARACTERIZATION_FIELDS.some((field) => record[field.key]));
  if (!rows.length) throw new Error('No recognized sugarcane characterization columns were found.');
  return { rows, sheetName, layout: 'single-header' };
}
