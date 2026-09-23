CaneSprout v2.13.75 — Germplasm Map Build Repair

PROBLEM FOUND FROM YOUR BUILD LOG

v2.13.74 inserted the first-redirect visual effect by matching:

  function focusEntry(entry)

The actual CaneSprout function was:

  async function focusEntry(entry)

Because the patch matched only the "function ..." portion, the original
"async" token was left before the newly inserted useEffect and focusEntry was
rewritten as a normal non-async function.

That produced:

  await geocodeLocation(entry.location)

inside a non-async function, causing Vite/esbuild to stop with:

  "await" can only be used inside an "async" function

V2.13.75 REPAIR

- Removes any stranded async token before the v2.13.74 guard.
- Restores:
    async function focusEntry(entry)
- Preserves:
    first redirect visual guard
    1.55 second long-distance fly
    0.72 second nearby transition
    destination tile prewarming
    first redirect overlay/tile masking
- Replaces the old v2.13.59 smooth-map verifier with a behavior-based verifier
  compatible with the current CSS after later cleanup patches.

APPLY

  APPLY-VARIETY-MAP-BUILD-REPAIR-v2.13.75.cmd

VERIFY

  npm.cmd run verify:variety-map-build-repair
  npm.cmd run verify:variety-map-first-redirect
  npm.cmd run verify:variety-map-smooth-redirect
  npm.cmd run build
