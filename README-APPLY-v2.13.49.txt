CaneSprout v2.13.48 -> v2.13.49
IN-APP PROFILE PREVIEW / DEAD BUTTON FIX

Why this update exists
----------------------
The external about:blank preview window could display its toolbar while Brave or
browser isolation prevented its actions from remaining functional. Because Close
also failed, the popup browsing context itself was the unreliable boundary.

v2.13.49 removes that boundary completely.

What changes
------------
- Printable profile preview opens inside CaneSprout as a full-screen overlay.
- All six buttons live in the main CaneSprout document:
  Download HTML / Print / Save PDF / Save Word / Save Excel / Close.
- PDF, Word and Excel exporters execute from the main application context.
- The printable page is shown inside a same-document iframe via srcdoc.
- Close and Escape remove the overlay and restore page scrolling.
- No window.open / about:blank popup is used for profile preview.

Apply
-----
1. Extract this ZIP directly into the CaneSprout project root.
2. Replace files when Windows asks.
3. Run:

   APPLY-PROFILE-PREVIEW-OVERLAY-v2.13.49.cmd

4. Verify:

   npm.cmd pkg get version
   npm.cmd run verify:profile-preview-actions
   npm.cmd run verify:profile-document-exports
   npm.cmd run verify:profile-pdf-quality
   npm.cmd run verify:profile-card-print
   npm.cmd run build

Expected version: 2.13.49

No npm install is required when v2.13.47+ dependencies are already installed.
