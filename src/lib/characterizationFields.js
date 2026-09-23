// Updated from Characterization and other attributes (1).xlsx. Keep keys stable: Appwrite indexes and seeded rows depend on them.
export const CHARACTERIZATION_GROUPS = [
  {
    "title": "Germplasm Passport",
    "fields": [
      { "key": "variety", "label": "Variety Name", "type": "text" },
      { "key": "accession_number", "label": "Accession Number", "type": "text" },
      { "key": "collection_year", "label": "Collection Year", "type": "text" },
      { "key": "recommended_locations", "label": "Recommended Locations", "type": "textarea" }
    ]
  },
  {
    "title": "Origin & Other Attributes",
    "fields": [
      { "key": "origin", "label": "Country", "type": "text", "newTrait": true },
      { "key": "origin_latitude", "label": "Country Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true, "coordinateFor": "origin" },
      { "key": "origin_longitude", "label": "Country Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true, "coordinateFor": "origin" },
      { "key": "breeding_institution_developer_breeder", "label": "Breeding Institution/Developer/Breeder", "type": "text", "newTrait": true },
      { "key": "breeder_latitude", "label": "Breeding Institution Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true, "coordinateFor": "breeding_institution_developer_breeder" },
      { "key": "breeder_longitude", "label": "Breeding Institution Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true, "coordinateFor": "breeding_institution_developer_breeder" },
      { "key": "collection_scope", "label": "Local/International Collection", "type": "text", "newTrait": true },
      { "key": "collection_latitude", "label": "Collection Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true, "coordinateFor": "collection_scope" },
      { "key": "collection_longitude", "label": "Collection Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true, "coordinateFor": "collection_scope" },
      { "key": "species", "label": "Species", "type": "text", "newTrait": true },
      { "key": "species_latitude", "label": "Species Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true, "coordinateFor": "species" },
      { "key": "species_longitude", "label": "Species Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true, "coordinateFor": "species" },
      { "key": "genetic_background", "label": "Type/Genetic Back Ground", "type": "text", "newTrait": true },
      { "key": "genetic_background_latitude", "label": "Genetic Background Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true, "coordinateFor": "genetic_background" },
      { "key": "genetic_background_longitude", "label": "Genetic Background Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true, "coordinateFor": "genetic_background" },
      { "key": "other_details", "label": "Other details", "type": "textarea", "newTrait": true },
      { "key": "other_details_latitude", "label": "Other Details Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true, "coordinateFor": "other_details" },
      { "key": "other_details_longitude", "label": "Other Details Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true, "coordinateFor": "other_details" },
      { "key": "lot_planted_station", "label": "Lot Planted in the station", "type": "text", "newTrait": true },
      { "key": "lot_planted_latitude", "label": "Lot Planted Latitude (decimal degrees)", "type": "number", "min": -90, "max": 90, "step": "any", "placeholder": "e.g. 10.123456", "newTrait": true, "coordinateFor": "lot_planted_station" },
      { "key": "lot_planted_longitude", "label": "Lot Planted Longitude (decimal degrees)", "type": "number", "min": -180, "max": 180, "step": "any", "placeholder": "e.g. 122.987654", "newTrait": true, "coordinateFor": "lot_planted_station" },
    ]
  },
  {
    "title": "Stool",
    "fields": [
      {
        "key": "stool_plant_habit",
        "label": "Plant Habit",
        "type": "text"
      },
      {
        "key": "stool_tillering_habit",
        "label": "Tillering Habit",
        "type": "text"
      },
      {
        "key": "stool_tillering_density",
        "label": "Tillering Density",
        "type": "text"
      },
      {
        "key": "stool_leaf_carriage",
        "label": "Leaf Carriage",
        "type": "text"
      },
      {
        "key": "stool_trashiness",
        "label": "Trashiness",
        "type": "text"
      }
    ]
  },
  {
    "title": "Leaf Blade",
    "fields": [
      {
        "key": "leaf_color",
        "label": "Color",
        "type": "text"
      },
      {
        "key": "leaf_texture",
        "label": "Leaf Blade Texture",
        "type": "text"
      },
      {
        "key": "leaf_erectness",
        "label": "Erectness",
        "type": "text"
      },
      {
        "key": "leaf_length_cm",
        "label": "Length (cm)",
        "type": "text"
      },
      {
        "key": "leaf_width_cm",
        "label": "Width (cm)",
        "type": "text"
      },
      {
        "key": "leaf_margin_pubescence",
        "label": "Leaf Margin Pubescence",
        "type": "text"
      },
      {
        "key": "leaf_midrib_color",
        "label": "Midrib Color",
        "type": "text"
      },
      {
        "key": "leaf_variety",
        "label": "Variety",
        "type": "text"
      }
    ]
  },
  {
    "title": "Leaf Sheath",
    "fields": [
      {
        "key": "sheath_waxiness",
        "label": "Waxiness",
        "type": "text"
      },
      {
        "key": "sheath_primary_color",
        "label": "Primary Color",
        "type": "text"
      },
      {
        "key": "sheath_secondary_color",
        "label": "Secondary Color",
        "type": "text"
      },
      {
        "key": "sheath_trichome_presence",
        "label": "Presence of Trichomes",
        "type": "text"
      },
      {
        "key": "sheath_trichome_quality",
        "label": "Trichome quality",
        "type": "text"
      },
      {
        "key": "sheath_trichome_persist",
        "label": "Persistence of Trichomes",
        "type": "text"
      }
    ]
  },
  {
    "title": "Auricle",
    "fields": [
      {
        "key": "auricle_outer_shape",
        "label": "Outer Auricle Shape",
        "type": "text"
      },
      {
        "key": "auricle_inner_shape",
        "label": "Inner Auricle Shape",
        "type": "text"
      },
      {
        "key": "auricle_variety",
        "label": "Variety",
        "type": "text"
      }
    ]
  },
  {
    "title": "Dewlap",
    "fields": [
      {
        "key": "dewlap_waxiness",
        "label": "Waxiness",
        "type": "text"
      },
      {
        "key": "dewlap_primary_color",
        "label": "Primary Color",
        "type": "text"
      },
      {
        "key": "dewlap_secondary_color",
        "label": "Secondary Color",
        "type": "text"
      },
      {
        "key": "dewlap_shape",
        "label": "Shape",
        "type": "text"
      },
      {
        "key": "dewlap_margin_undulation",
        "label": "Dewlap Margin Undulation",
        "type": "text"
      }
    ]
  },
  {
    "title": "Ligule",
    "fields": [
      {
        "key": "ligule_shape",
        "label": "Shape",
        "type": "text"
      },
      {
        "key": "ligule_hairiness",
        "label": "Hairiness",
        "type": "text"
      },
      {
        "key": "ligule_source_ae",
        "label": "Unlabeled source trait",
        "type": "text"
      },
      {
        "key": "ligule_variety",
        "label": "Variety",
        "type": "text"
      }
    ]
  },
  {
    "title": "Stalk",
    "fields": [
      {
        "key": "stalk_waxiness",
        "label": "Waxiness",
        "type": "text"
      },
      {
        "key": "stalk_exposed_color",
        "label": "Color of Exposed internode",
        "type": "text"
      },
      {
        "key": "stalk_unexposed_color",
        "label": "Color of Unexposed internode",
        "type": "text"
      },
      {
        "key": "stalk_stripes",
        "label": "Stripes on cane",
        "type": "text"
      },
      {
        "key": "stalk_growth_cracks",
        "label": "Splits/ Growth Cracks",
        "type": "text"
      },
      {
        "key": "stalk_corky_cracks",
        "label": "Corky Cracks",
        "type": "text"
      },
      {
        "key": "stalk_corky_patch",
        "label": "Corky Patch",
        "type": "text"
      },
      {
        "key": "stalk_variety_a",
        "label": "Variety",
        "type": "text"
      },
      {
        "key": "stalk_internode_shape",
        "label": "Internode Shape",
        "type": "text"
      },
      {
        "key": "stalk_alignment",
        "label": "Alignment",
        "type": "text"
      },
      {
        "key": "stalk_node_swelling",
        "label": "Node Swelling",
        "type": "text"
      },
      {
        "key": "stalk_growth_ring_width",
        "label": "Growth Ring Width",
        "type": "text"
      },
      {
        "key": "stalk_root_primordia_rows",
        "label": "Rows of Root Primodia",
        "type": "text"
      },
      {
        "key": "stalk_leaf_scar_prominence",
        "label": "Leaf Scar Prominence",
        "type": "text"
      },
      {
        "key": "stalk_root_band_shape",
        "label": "Root Band Shape",
        "type": "text"
      },
      {
        "key": "stalk_pith_bottom",
        "label": "STALK PITHINESS (Bottom)",
        "type": "text"
      },
      {
        "key": "stalk_pith_middle",
        "label": "STALK PITHINESS (Middle)",
        "type": "text"
      },
      {
        "key": "stalk_pith_top",
        "label": "STALK PITHINESS (Top)",
        "type": "text"
      },
      {
        "key": "stalk_variety_b",
        "label": "Variety",
        "type": "text"
      }
    ]
  },
  {
    "title": "Bud Shape",
    "fields": [
      {
        "key": "bud_shape",
        "label": "Shape",
        "type": "text"
      },
      {
        "key": "bud_prominence",
        "label": "Prominence",
        "type": "text"
      },
      {
        "key": "bud_length_mm",
        "label": "Length (mm)",
        "type": "text"
      },
      {
        "key": "bud_width_mm",
        "label": "Width (mm)",
        "type": "text"
      },
      {
        "key": "bud_germ_position",
        "label": "Bud Germ Position",
        "type": "text"
      },
      {
        "key": "bud_groove_expression",
        "label": "Bud Groove/ Furrow Expression",
        "type": "text"
      },
      {
        "key": "bud_hair",
        "label": "Bud Hair",
        "type": "text"
      },
      {
        "key": "bud_tip_position",
        "label": "Bud Tip Position",
        "type": "text"
      },
      {
        "key": "bud_base_position",
        "label": "Bud Base Position",
        "type": "text"
      }
    ]
  }  ,
  {
    "title": "Parentage",
    "fields": [
      { "key": "parentage_female", "label": "Female", "type": "text" },
      { "key": "parentage_male", "label": "Male", "type": "text" }
    ]
  },
  {
    "title": "Yield Potential",
    "fields": [
      { "key": "yield_lkg_tc", "label": "LKg/TC", "type": "text" },
      { "key": "yield_tc_ha", "label": "TC/HA", "type": "text" }
    ]
  },
  {
    "title": "Agronomic Characteristics",
    "fields": [
      { "key": "agronomic_germination", "label": "Germination", "type": "text" },
      { "key": "agronomic_growth_habit", "label": "Growth Habit", "type": "text" },
      { "key": "agronomic_flowering_habit", "label": "Flowering Habit", "type": "text" },
      { "key": "agronomic_stalk_diameter", "label": "Stalk Diameter", "type": "text" },
      { "key": "agronomic_stalk_length", "label": "Stalk Length", "type": "text" },
      { "key": "agronomic_stalk_weight", "label": "Stalk Weight", "type": "text" },
      { "key": "agronomic_number_of_tiller", "label": "Number of Tiller", "type": "text" },
      { "key": "agronomic_millable_stalk", "label": "Average No. of Millable Stalks", "type": "text" },
      { "key": "agronomic_maturity", "label": "Maturity (Months)", "type": "text" },
      { "key": "agronomic_characteristics_summary", "label": "SRA HYV Agronomic Description", "type": "textarea" }
    ]
  },
  {
    "title": "Pest and Diseases",
    "fields": [
      { "key": "disease_reaction", "label": "Reaction Diseases", "type": "textarea" }
    ]
  },
  {
    "title": "Tested Location",
    "fields": [
      { "key": "tested_location", "label": "Tested Location", "type": "text" }
    ]
  }

];



// Red-font attributes introduced by the canonical
// "Characterization and other attributes" workbook. These groups are
// hydrated for every existing record even when the older Appwrite row has
// never stored a value for them yet.
export const NEW_TEMPLATE_GROUP_TITLES = Object.freeze([
  'Origin & Other Attributes'
]);

export const CHARACTERIZATION_FIELDS = CHARACTERIZATION_GROUPS.flatMap((group) =>
  group.fields.map((field) => ({ ...field, group: group.title }))
);
export const SOURCE_RECORD_COUNT = 950;
