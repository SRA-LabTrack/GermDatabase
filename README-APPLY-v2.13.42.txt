CANESPROUT v2.13.42 PRINTABLE VARIETY PROFILE PATCH

EXPECTED BASE
CaneSprout v2.13.41

INSTALL
1. Extract this ZIP directly into your CaneSprout project root:
   D:\Germ\CaneSprout-Registry-v2.13.0-ELECTRON-OFFLINE-COMPLETE

2. If Windows asks, choose Replace the files in the destination.

3. Run:
   APPLY-PROFILE-PRINT-v2.13.42.cmd

4. Then run the full verification/build commands listed below.

WHAT CHANGES
- Adds Print to every variety profile.
- Core Information print format.
- Complete Information print format.
- Adds A4-friendly printable layout.
- Complete print includes additional characterization, per-attribute coordinates, germination information and registry documentation.
- Blank optional fields do not waste paper.

VERIFY
npm.cmd pkg get version
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

EXPECTED VERSION
"2.13.42"
