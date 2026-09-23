CaneSprout v2.13.63 — Equal Four-Way Toolbar Navigation

Desktop navigation is now a strict equal split:

  Germplasm | Pedigree | Map | Tools
      25%       25%      25%    25%

The complete primary-navigation region consumes all remaining toolbar space
between the brand block and the Online/account utility blocks.

No navigation cell can exceed 25%, so one section cannot overlap another.
At narrower desktop sizes, labels are hidden before overlap can occur while
the four equal sections remain intact.

The portal-based Tools menu from v2.13.62 is preserved.

Apply:
  APPLY-TOOLBAR-EQUAL-NAV-v2.13.63.cmd

Verify:
  npm.cmd run verify:toolbar-equal-nav
  npm.cmd run verify:toolbar-tools-portal
  npm.cmd run build
