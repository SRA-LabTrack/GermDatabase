export const LEGACY_SRA_HYV_ALIASES = Object.freeze({
  PHIL031389: 'Phil 03-154-1389',
  PHIL001419: 'Phil 00-185-1419',
  PHIL001893: 'Phil 00-278-1893',
  PHIL980255: 'Phil 98-37-0255',
  PHIL933155: 'Phil 93-227-3155',
  PHIL932349: 'Phil 93-190-2349'
});

export function normalizeVarietyIdentity(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/PHILIPPINES/g, 'PHIL')
    .replace(/[^A-Z0-9]+/g, '');
}

export function canonicalLegacyVariety(value) {
  const normalized = normalizeVarietyIdentity(value);
  return LEGACY_SRA_HYV_ALIASES[normalized] || String(value || '').trim();
}
