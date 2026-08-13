export const PHOTO_DOCUMENTATION_SECTIONS = Object.freeze([
  { key: 'pests_diseases', label: 'Pests & diseases incidence', hint: 'Document symptoms, pest presence, injury, or disease incidence.' },
  { key: 'growth_stages', label: 'Growth stages', hint: 'Germination, tillering, stalk elongation, and maturity.' },
  { key: 'characteristics', label: 'Characteristics (Leaf, Stalks/Buds)', hint: 'Close documentation of leaf, stalk, node, bud, and related varietal traits.' },
  { key: 'overview', label: 'Overview picture of the variety', hint: 'Whole-plant, stool, plot, or representative variety overview.' }
]);

export const DEFAULT_PHOTO_CATEGORY = 'overview';
const LABELS = new Map(PHOTO_DOCUMENTATION_SECTIONS.map((item) => [item.key, item.label]));
export function photoCategoryLabel(value) { return LABELS.get(value) || 'Overview picture of the variety'; }
export function normalizedPhotoCategories(categories = [], count = 0) {
  return Array.from({ length: count }, (_, index) => LABELS.has(categories?.[index]) ? categories[index] : DEFAULT_PHOTO_CATEGORY);
}
export function primaryPhotoIndex(categories = [], count = 0) {
  if (!count) return -1;
  const normalized = normalizedPhotoCategories(categories, count);
  const overview = normalized.indexOf('overview');
  return overview >= 0 ? overview : 0;
}
