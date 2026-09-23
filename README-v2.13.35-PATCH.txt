CaneSprout v2.13.35 smooth map / pin fix

Extract this ZIP directly into the CaneSprout project root and replace existing files.

Fixes:
- Closing a variety popup no longer closes the Variety Map.
- Bulk map points use Canvas rendering for much smoother zoom and pan.
- Satellite tiles defer updates until zoom settles to reduce stutter.
- Search/focus movement uses shorter adaptive animations.
- Selected variety uses one clean CaneSprout sugarcane branded pin.
- Existing satellite imagery, place labels, Streets layer, search, accuracy circles and profile links are preserved.

Verify:
  npm.cmd run verify:variety-map-web
  npm.cmd run verify:variety-map-precision
  npm.cmd run verify:variety-map-performance
