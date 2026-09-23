CaneSprout v2.13.43 - Collection Card Print Fix
================================================

WHY THIS PATCH EXISTS
The v2.13.42 patch added Print to the opened variety profile modal.
The germplasm collection preview card itself still showed only View Profile.
This patch adds Print directly to every collection card, matching the requested UI.

WHAT IT ADDS
- Print button beside View Profile on every germplasm collection card.
- Core Information option.
- Complete Information option.
- Full record is fetched when the user explicitly chooses Print, so complete output never relies only on lean preview data.
- Print interactions stop event propagation and do not accidentally open the profile modal.
- Existing Print control inside the opened profile remains available.
- Responsive mobile layout for Print + View Profile actions.

INSTALL
1. Extract all contents of this ZIP directly into your CaneSprout project root.
2. Replace files if Windows asks.
3. Run:

   APPLY-PROFILE-CARD-PRINT-v2.13.43.cmd

4. Then verify:

   npm.cmd pkg get version
   npm.cmd run verify:profile-card-print
   npm.cmd run verify:profile-print
   npm.cmd run verify:origin-attribute-coordinates
   npm.cmd run verify:profile-trait-visuals
   npm.cmd run verify:profile-map-exact
   npm.cmd run verify:variety-map-web
   npm.cmd run verify:variety-map-precision
   npm.cmd run verify:variety-map-performance
   npm.cmd run verify:variety-map-transition
   npm.cmd run verify:variety-map-profile-return
   npm.cmd run audit:variety-map-coverage
   npm.cmd run build

Expected version: 2.13.43
