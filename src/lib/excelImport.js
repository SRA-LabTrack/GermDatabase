import * as XLSX from 'xlsx';

function normalizedHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[°]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split('-');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
}

export async function parseGermExcel(file, fields) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The workbook does not contain a worksheet.');
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

  const aliases = new Map();
  for (const field of fields) {
    const [key, label] = field;
    aliases.set(normalizedHeader(key), key);
    aliases.set(normalizedHeader(label), key);
  }

  const rows = rawRows.map((row) => {
    const normalized = {};
    for (const [header, value] of Object.entries(row || {})) {
      const key = aliases.get(normalizedHeader(header));
      if (!key) continue;
      normalized[key] = key === 'collection_date' ? normalizeDate(value) : String(value ?? '').trim();
    }
    return normalized;
  }).filter((row) => Object.values(row).some((value) => String(value || '').trim()));

  if (!rows.length) throw new Error('No germ rows were found. Make sure the first row contains column headers.');
  return { rows, sheetName };
}
