CaneSprout v2.13.59 — Smoother Germplasm Map Redirection

WHY
The supplied recording shows long-distance variety redirection moving faster
than satellite imagery can settle. During the jump, Leaflet briefly displays
partially loaded/stretched imagery before the final destination tiles resolve.

CHANGES
- Nearby map redirects: 0.36s -> 0.72s
- Long-distance fly redirects: 0.68s -> 1.55s
- Destination imagery is pre-warmed at:
    target zoom - 2
    target zoom - 1
    target zoom
- Satellite keepBuffer: 4 -> 6
- GPU/compositing hints added to Leaflet animated tile layers.
- Tile opacity transitions are slightly softened.
- Existing moveend popup behavior is preserved, so the destination popup opens
  only after the movement finishes.
- Existing stale moveend callbacks remain cancelled before a new redirect.

The result is intentionally slower than the previous redirection, giving
satellite tiles substantially more time to arrive during continent-to-continent
or country-to-country movement.

APPLY
1. Extract this ZIP directly into the CaneSprout project root.
2. Run:
   APPLY-VARIETY-MAP-SMOOTH-REDIRECT-v2.13.59.cmd
3. Run:
   npm.cmd run verify:variety-map-smooth-redirect
   npm.cmd run verify:variety-map-performance
   npm.cmd run verify:variety-map-transition
   npm.cmd run build

TEST
Use the same type of long redirect shown in the recording, e.g. Australia to a
Philippines/Asia variety. The movement should be slower, with fewer abrupt tile
swaps and less blurred/stretched imagery.
