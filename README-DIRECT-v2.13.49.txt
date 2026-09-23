CaneSprout v2.13.49 DIRECT IN-APP PROFILE PREVIEW BRIDGE
=======================================================

Use this package when your project is still v2.13.47.
You DO NOT need to apply v2.13.48 first.

Accepted starting versions:
- 2.13.47
- 2.13.48
- 2.13.49 (safe re-apply)

Apply:
  APPLY-DIRECT-PROFILE-PREVIEW-v2.13.49.cmd

Verify:
  npm.cmd pkg get version
  npm.cmd run verify:profile-preview-actions
  npm.cmd run verify:profile-document-exports
  npm.cmd run verify:profile-pdf-quality
  npm.cmd run verify:profile-card-print
  npm.cmd run build

Expected version:
  "2.13.49"

This direct bridge replaces the about:blank popup preview with an in-app overlay.
Download HTML, Print, Save PDF, Save Word, Save Excel, Close, and Escape all run from the main CaneSprout document.
