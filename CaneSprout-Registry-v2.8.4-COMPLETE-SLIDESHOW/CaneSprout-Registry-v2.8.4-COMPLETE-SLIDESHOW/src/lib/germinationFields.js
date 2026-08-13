export const GERMINATION_FIELDS = Object.freeze([
  { key: 'germ_trial_code', label: 'Germination trial / batch code', type: 'text' },
  { key: 'germ_location', label: 'Nursery / field location', type: 'text' },
  { key: 'germ_planting_date', label: 'Planting date', type: 'date' },
  { key: 'germ_material_type', label: 'Planting material', type: 'select', options: ['Single-bud sett', 'Two-bud sett', 'Three-bud sett', 'Bud chip', 'Whole stalk section', 'Other'] },
  { key: 'germ_buds_planted', label: 'Buds planted', type: 'number' },
  { key: 'germ_germinated_count', label: 'Germinated buds', type: 'number' },
  { key: 'germ_observation_date', label: 'Observation date', type: 'date' },
  { key: 'germ_status', label: 'Germination status', type: 'select', options: ['Planned', 'Germinating', 'Established', 'Completed', 'Failed'] },
  { key: 'germ_notes', label: 'Germination notes', type: 'textarea' }
]);
