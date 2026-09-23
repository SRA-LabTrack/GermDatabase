import { N_RHS_RGB, STANDARD_RHS_RGB } from './rhsColorData.js';

export const COLOR_TRAIT_FIELDS = new Set([
  'leaf_color',
  'leaf_midrib_color',
  'sheath_primary_color',
  'sheath_secondary_color',
  'dewlap_primary_color',
  'dewlap_secondary_color',
  'stalk_exposed_color',
  'stalk_unexposed_color'
]);

export const LEAF_LENGTH_THRESHOLDS_CM = Object.freeze({
  smallMax: 100,
  mediumMax: 150
});

function cleanText(value) {
  return String(value ?? '').trim();
}

export function normalizeRhsCode(value) {
  return cleanText(value)
    .toUpperCase()
    .replace(/^RHS\s*/i, '')
    .replace(/\s+/g, '')
    .replace(/\?/g, '');
}

function standardFallbackForPrefixed(code) {
  const legacy = code.replace(/^NN?/, '');
  return STANDARD_RHS_RGB[legacy] ? legacy : '';
}

export function resolveRhsColor(code) {
  const normalized = normalizeRhsCode(code);
  if (!normalized) return null;

  if (N_RHS_RGB[normalized]) {
    return {
      code: normalized,
      hex: `#${N_RHS_RGB[normalized]}`,
      approximate: true,
      source: 'N-series screen approximation'
    };
  }

  if (STANDARD_RHS_RGB[normalized]) {
    return {
      code: normalized,
      hex: `#${STANDARD_RHS_RGB[normalized]}`,
      approximate: true,
      source: 'RHS screen approximation'
    };
  }

  if (/^NN?\d{1,3}[A-D]$/.test(normalized)) {
    const legacy = standardFallbackForPrefixed(normalized);
    if (legacy) {
      return {
        code: normalized,
        hex: `#${STANDARD_RHS_RGB[legacy]}`,
        approximate: true,
        source: `Nearest legacy screen approximation (${legacy})`
      };
    }
  }

  return null;
}

export function resolveRhsColors(value) {
  const raw = cleanText(value);
  if (!raw) return [];

  // A few source records contain dual RHS observations such as 200D/199A.
  // Keep both visible rather than silently discarding the second observation.
  const candidates = raw
    .split(/\s*(?:\/|,|;|\+|&)\s*/g)
    .map(normalizeRhsCode)
    .filter(Boolean);

  const seen = new Set();
  const colors = [];
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const resolved = resolveRhsColor(candidate);
    if (resolved) colors.push(resolved);
  }
  return colors;
}

export function isColorTraitField(fieldKey) {
  return COLOR_TRAIT_FIELDS.has(String(fieldKey || ''));
}

export function classifyLeafLengthCm(value) {
  const number = Number.parseFloat(String(value ?? '').replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(number) || number < 0) return '';
  if (number <= LEAF_LENGTH_THRESHOLDS_CM.smallMax) return 'SMALL';
  if (number <= LEAF_LENGTH_THRESHOLDS_CM.mediumMax) return 'MEDIUM';
  return 'LARGE';
}

function conciseNumber(value) {
  if (!Number.isFinite(value)) return '';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(2)));
}

export function formatLeafLengthCm(value, fallback = 'Not provided') {
  const raw = cleanText(value);
  if (!raw) return { text: fallback, measurement: '', size: '' };

  const number = Number.parseFloat(raw.replace(/[^0-9.+-]/g, ''));
  if (!Number.isFinite(number) || number < 0) {
    return { text: raw, measurement: raw, size: '' };
  }

  const size = classifyLeafLengthCm(number);
  const measurement = `${conciseNumber(number)} cm`;
  return {
    text: size ? `${measurement} (${size})` : measurement,
    measurement,
    size
  };
}
