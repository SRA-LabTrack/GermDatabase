CaneSprout v2.13.50 - Installable Website / PWA

WHAT THIS DOES
- Makes the Vercel/web CaneSprout site installable like a desktop app.
- After installation, users can open CaneSprout from the desktop, Start menu, or taskbar without typing the URL.
- Uses standalone app display instead of a normal browser tab.
- Keeps the existing CaneSprout offline service-worker workspace.
- Adds Install CaneSprout to the desktop More menu and mobile tools menu.
- Adds a proper web app manifest and 192/512 installation icons.

APPLY
1. Extract this ZIP directly into your CaneSprout project root.
2. Choose Replace files if Windows asks.
3. Run:
   APPLY-INSTALLABLE-WEBSITE-v2.13.50.cmd
4. Then run:
   npm.cmd run build

TEST ON THE DEPLOYED HTTPS WEBSITE
- Open CaneSprout in Brave or Chrome.
- Sign in.
- More actions -> Install CaneSprout.
- Accept the browser installation prompt.
- Close the browser and launch CaneSprout from the desktop or Start menu.

NOTE
The native browser PWA installation prompt requires the deployed HTTPS website (localhost also qualifies for development). It will not normally appear when opening raw files from disk.
