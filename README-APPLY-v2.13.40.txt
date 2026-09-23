CaneSprout v2.13.40
CLICKABLE COLOR PREVIEW + EXACT LATITUDE/LONGITUDE MAP PATCH

BASE REQUIRED
  CaneSprout v2.13.39

INSTALL
1. Extract this ZIP directly into your CaneSprout project root.
2. Allow Windows to merge/replace the patch files.
3. From Command Prompt in the project root run:

   APPLY-PROFILE-MAP-EXACT-v2.13.40.cmd

4. Then run the full checks:

   npm.cmd pkg get version
   npm.cmd run verify:profile-trait-visuals
   npm.cmd run verify:profile-map-exact
   npm.cmd run verify:variety-map-web
   npm.cmd run verify:variety-map-precision
   npm.cmd run verify:variety-map-performance
   npm.cmd run verify:variety-map-transition
   npm.cmd run verify:variety-map-profile-return
   npm.cmd run audit:variety-map-coverage
   npm.cmd run build

FEATURES
- Clicking an RHS color palette opens a large preview dialog.
- Preview shows each recorded RHS code, hex screen approximation, and source note.
- Adds optional Latitude and Longitude fields in decimal degrees.
- Latitude accepts -90 through 90; longitude accepts -180 through 180.
- When BOTH coordinates are valid, they become the highest-priority Germplasm Map position.
- Exact coordinates override country/station/tested/recommended geocoding for the pin itself.
- Satellite imagery remains the default map layer.
- Exact coordinates use coordinate precision at close satellite zoom and are marked non-approximate.
- Missing or invalid coordinate pairs fall back to the existing map location hierarchy.

NOTE
Coordinates should be entered as decimal degrees, for example:
  Latitude:  10.123456
  Longitude: 122.987654
Negative values are supported for south latitudes and west longitudes.
