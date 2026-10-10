CaneSprout v2.13.78 — Brochure-First Germplasm Collection

WHAT CHANGED

1. Germplasm Collection click behavior
   - Clicking any variety card now opens the VARIETY BROCHURE first.
   - The existing complete germplasm profile remains available through:
       Expand Full Details
   - Full Details opens above the brochure. Closing Full Details returns to the brochure.

2. Brochure visual layout
   The design follows the supplied SRA/LAREC brochure reference:
   - dark institutional masthead
   - large bright variety name
   - parentage immediately below the variety
   - large whole-variety image
   - smaller Stalk image
   - circular Eye / Bud close-up
   - AGRONOMIC-MORPHOLOGICAL CHARACTERISTICS below the photos

3. Photo behavior
   New dedicated upload categories:
   - Overview picture of the variety
   - Stalk / internode
   - Eye / bud
   - Leaf / sheath
   - Pests & diseases incidence
   - Growth stages
   - Other characteristics

   Brochure rules:
   - Whole-variety slot uses only an Overview photo.
   - Stalk slot uses only a Stalk photo, or a legacy Characteristics photo whose filename/name clearly says stalk/node/internode.
   - Eye/Bud slot uses only an Eye/Bud photo, or a legacy Characteristics photo whose filename/name clearly says bud/eye.
   - If the correct photo is not available, the brochure displays N/A.
   - CaneSprout never silently substitutes an unrelated photo for the stalk or eye/bud slot.

4. Brochure characteristics
   The brochure uses recorded CaneSprout data for:
   - Growth Habit
   - Flowering
   - Leaf Characteristics
   - Stalk Characteristics
   - Average Millable Stalk
   - Average Stalk Weight
   - Average Stalk Diameter
   - Reaction to Diseases
   - Potential Yield
   - Recommended Locations

5. Printing
   - The printable brochure was redesigned to match the same reference-style layout.
   - Whole-variety / Stalk / Eye-Bud photo slots follow the same N/A rules.
   - Print / Save PDF remains available.

APPLY

  APPLY-BROCHURE-FIRST-v2.13.78.cmd

VERIFY

  npm.cmd pkg get version
  npm.cmd run verify:brochure-first
  npm.cmd run build

EXPECTED VERSION

  "2.13.78"

BASE VERSION

  This patch expects v2.13.77, the previous Breeding Program patch.
