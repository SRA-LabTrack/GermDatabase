CaneSprout v2.13.74 — First Germplasm Map Redirect Fix

WHAT THE RECORDING SHOWED

The first variety click starts from the full-world map. The selected
accuracy circle is already present while Leaflet flies from world zoom to the
destination. This causes the accuracy circle to scale into the enormous
white/orange/green target seen in the recording.

At the same time, Leaflet scales the already-loaded low-resolution world
satellite tiles until destination tiles arrive. That creates the smeared
green/brown frame during the first redirect.

Later redirects begin from a much closer map zoom, which is why the same
artifact is not nearly as visible afterward.

V2.13.74 FIX

Only the FIRST variety redirect after each map opening receives a temporary
visual guard:

1. Existing destination tile pre-warming still runs.
2. Existing 1.55-second long-distance flyTo remains unchanged.
3. During that first redirect:
   - accuracy/vector overlays are hidden
   - selected marker is hidden
   - popup is visually held back
   - stretched world-level tile containers are strongly dimmed
   - a dark satellite-colored transition veil masks the overview scaling
4. After 2.15 seconds, the guard is removed.
5. The already-open destination marker/popup/accuracy area reveal normally.
6. Every later variety redirect uses the normal existing smooth-map behavior.

The first-redirect ref belongs to VarietyMapModal, so closing the map and
opening it again correctly treats the next first selection as a first redirect.

APPLY

  APPLY-VARIETY-MAP-FIRST-REDIRECT-FIX-v2.13.74.cmd

VERIFY

  npm.cmd run verify:variety-map-first-redirect
  npm.cmd run verify:variety-map-smooth-redirect
  npm.cmd run build
