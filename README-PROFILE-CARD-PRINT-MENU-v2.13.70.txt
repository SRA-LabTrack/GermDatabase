CaneSprout v2.13.70 — Profile Card Print Menu Portal Fix

PROBLEM
The Core Information / Complete Information menu was rendered inside the
germplasm profile card. Card/footer overflow and layout rules could clip the
popover or push it partly outside the visible card.

FIX
- New ProfileCardPrintMenu component.
- Print menu is rendered with createPortal(..., document.body).
- Menu measures the actual Print button.
- Menu is clamped inside the browser viewport.
- Opens above the Print button when there is enough room.
- Falls below the button when there is not enough space above.
- Repositions during scroll and resize.
- Click outside closes the menu.
- Escape closes the menu.
- Core and Complete actions remain unchanged.

APPLY
  APPLY-PROFILE-CARD-PRINT-MENU-v2.13.70.cmd

VERIFY
  npm.cmd run verify:profile-card-print-menu
  npm.cmd run build
