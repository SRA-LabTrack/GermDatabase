CaneSprout v2.13.41 - Origin & Other Attributes Per-Attribute Coordinates
=======================================================================

WHAT THIS PATCH CHANGES
-----------------------
Every field under Origin & Other Attributes gets its own OPTIONAL latitude and longitude pair:

- Country / Origin
- Breeding Institution / Developer / Breeder
- Local / International Collection
- Species
- Type / Genetic Background
- Other details
- Lot Planted in the station

Each pair accepts decimal degrees and remains optional.

MAP BEHAVIOR
------------
The Germplasm Map uses a valid exact coordinate pair before approximate place-name geocoding.
When several exact pairs are present, the map uses this priority:

1. Lot Planted in the station
2. Other details
3. Country / Origin
4. Breeding Institution / Developer / Breeder
5. Local / International Collection
6. Species
7. Type / Genetic Background
8. Legacy general latitude / longitude from v2.13.40

This keeps one primary map pin per variety while preserving every entered coordinate pair in the record.

BACKWARD COMPATIBILITY
----------------------
Records created in v2.13.40 with the old generic latitude/longitude pair still map correctly.
When such a record is edited, those values are prefilled into the new Country/Origin coordinate pair so they are preserved under the new structure.

INSTALL
-------
Extract this ZIP directly into the CaneSprout project root, replacing/merging files.
Then run:

  APPLY-ORIGIN-ATTRIBUTE-COORDINATES-v2.13.41.cmd
  npm.cmd run build

Do not commit until verification and the production build both pass.
