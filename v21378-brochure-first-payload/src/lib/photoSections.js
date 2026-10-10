export const PHOTO_DOCUMENTATION_SECTIONS = Object.freeze([
  {
    key: 'overview',
    label: 'Overview picture of the variety',
    hint: 'Whole-plant, stool, plot, or representative variety overview used as the main brochure image.'
  },
  {
    key: 'stalk',
    label: 'Stalk / internode',
    hint: 'Close photo of the stalk, internode, node, rind, growth ring, or related stalk features.'
  },
  {
    key: 'bud_eye',
    label: 'Eye / bud',
    hint: 'Close photo of the sugarcane eye or bud, including bud shape, groove/furrow, and surrounding node.'
  },
  {
    key: 'leaf',
    label: 'Leaf / sheath',
    hint: 'Close photo of the leaf blade, sheath, auricle, dewlap, ligule, or other leaf structures.'
  },
  {
    key: 'pests_diseases',
    label: 'Pests & diseases incidence',
    hint: 'Document symptoms, pest presence, injury, or disease incidence.'
  },
  {
    key: 'growth_stages',
    label: 'Growth stages',
    hint: 'Germination, tillering, stalk elongation, and maturity.'
  },
  {
    key: 'characteristics',
    label: 'Other characteristics',
    hint: 'General or legacy characterization images that do not fit a specific plant-part category.'
  }
]);

export const DEFAULT_PHOTO_CATEGORY = 'overview';

const LABELS = new Map(PHOTO_DOCUMENTATION_SECTIONS.map((item) => [item.key, item.label]));

const PART_NAME_PATTERNS = Object.freeze({
  overview: /\b(overview|whole|stool|plant|plot|variety|field)\b/i,
  stalk: /\b(stalk|stem|cane|internode|node|rind|growth[\s_-]*ring)\b/i,
  bud_eye: /\b(bud|eye|eyebud|eye[\s_-]*bud|germ[\s_-]*pore|bud[\s_-]*groove|bud[\s_-]*furrow)\b/i,
  leaf: /\b(leaf|blade|sheath|auricle|dewlap|ligule|midrib)\b/i
});

export function photoCategoryLabel(value) {
  return LABELS.get(value) || 'Overview picture of the variety';
}

export function normalizedPhotoCategories(categories = [], count = 0) {
  return Array.from(
    { length: count },
    (_, index) => LABELS.has(categories?.[index]) ? categories[index] : DEFAULT_PHOTO_CATEGORY
  );
}

export function primaryPhotoIndex(categories = [], count = 0) {
  if (!count) return -1;
  const normalized = normalizedPhotoCategories(categories, count);
  const overview = normalized.indexOf('overview');
  return overview >= 0 ? overview : 0;
}

function photoName(record, index) {
  return String(record?.photo_names?.[index] || '').trim();
}

/**
 * Resolve a photo for a plant part without silently substituting a different part.
 * Exact new categories win. For pre-v2.13.78 legacy "characteristics" photos,
 * a filename/name keyword may identify the part. Otherwise the brochure shows N/A.
 */
export function photoIndexForPart(record = {}, partKey = 'overview') {
  const photos = Array.isArray(record?.photo_file_ids) ? record.photo_file_ids : [];
  if (!photos.length) return -1;

  const categories = normalizedPhotoCategories(record?.photo_categories, photos.length);

  const exact = categories.findIndex((category) => category === partKey);
  if (exact >= 0) return exact;

  const pattern = PART_NAME_PATTERNS[partKey];
  if (!pattern) return -1;

  // Legacy records often put all close-ups under "characteristics".
  const namedLegacy = categories.findIndex((category, index) =>
    category === 'characteristics' && pattern.test(photoName(record, index))
  );
  if (namedLegacy >= 0) return namedLegacy;

  // If a record predates categories entirely, normalized categories become
  // overview. We only keyword-match non-overview parts so an arbitrary old
  // image never becomes a stalk or eye photo by accident.
  if (partKey !== 'overview') {
    const namedAny = photos.findIndex((_, index) => pattern.test(photoName(record, index)));
    if (namedAny >= 0) return namedAny;
  }

  return -1;
}

export function brochurePhotoSlots(record = {}) {
  return {
    overview: photoIndexForPart(record, 'overview'),
    stalk: photoIndexForPart(record, 'stalk'),
    budEye: photoIndexForPart(record, 'bud_eye'),
    leaf: photoIndexForPart(record, 'leaf')
  };
}
