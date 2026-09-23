CaneSprout v2.13.38 -> v2.13.39 PROFILE TRAIT VISUALIZATION PATCH
===================================================================

WHAT IT ADDS
- RHS color-code screen swatches beside profile color fields.
- Leaf blade length classification:
    0-100 cm       SMALL
    >100-150 cm    MEDIUM
    >150 cm        LARGE
- Example: 95 -> 95 cm (SMALL); 163.6 -> 163.6 cm (LARGE).
- A source verifier: npm.cmd run verify:profile-trait-visuals

HOW TO APPLY
1. Extract this ZIP directly into the CaneSprout project root.
2. From that root run:
      APPLY-PROFILE-VISUALS-v2.13.39.cmd
3. Then run:
      npm.cmd run build

The installer edits the existing DetailModal.jsx rather than replacing it, so the
newer v2.13.38 map/profile and pedigree changes remain intact.

IMPORTANT COLOR NOTE
The swatches are digital screen approximations of RHS-coded colors. Monitor
calibration, browser rendering and the age/edition of a physical RHS chart can
change appearance. Use the physical RHS Colour Chart when color-critical
scientific matching is required.
