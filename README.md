# CaneSprout Registry v2.4.3

Agriculture-first sugarcane germination and varietal characterization registry. This build keeps the Characterization.xlsx traits optional, enriches the registry with 60 SRA HYV legacy characterization rows, carries 950 seed varieties after safe matching/addition, tracks planting/emergence observations, stores field photos as WebP in Appwrite Storage, and is deliberately tuned for Appwrite Free + Vercel Hobby usage.

## Agriculture-focused interface

- Hero content now follows the crop workflow: planting material → emergence → establishment → varietal characterization.
- Technical developer statistics were replaced with agricultural record metrics.
- Registry cards emphasize plant habit, leaf color, trial/batch, nursery/field location, status, and germination rate.
- Spreadsheet column letters remain internal mapping metadata and are never displayed.
- Green/yellow/white glass UI remains, with lighter blur on repeated elements and smoother compositor-friendly transitions.
- Record cards reveal only when near the viewport and use `content-visibility` so off-screen cards cost less rendering work.
- `prefers-reduced-motion` remains supported.

## Free-plan safeguards

- 25 lean rows maximum per browse/search request.
- Cursor-based Load More. The entire registry is never downloaded for normal browsing.
- 3-character search minimum and 500 ms debounce.
- Indexed exact-first variety/trial/location/status lookup; full-text only for All traits & keywords.
- Numeric variety fragments skip redundant exact/prefix probes.
- Registry cards request only the fields shown on the cards.
- Full 60-trait JSON loads only after opening a record.
- Duplicate simultaneous detail requests are deduplicated.
- Browser/session list cache: 15 minutes.
- First browse page device cache: 45 minutes.
- Detail cache: 45 minutes.
- Appwrite list-response TTL: 15 minutes for browsing and 5 minutes for search.
- No polling, no Realtime subscription, and no total-result calculations.
- Writes happen only on explicit Save, Import, Delete, or setup/seed.
- Edits update only the changed split collection.
- Mutations are never automatically replayed after transport timeouts.
- Local form drafts are saved to localStorage after a debounce and use zero Appwrite writes.
- Manual uncached refresh has a 30-second cooldown.
- Returning users with a local identity skip a redundant `account.get()` call; the first registry request verifies the session naturally.
- Backup remains explicit and uses 100-row cursor pages.

## Media/storage efficiency

- Images are compressed in the browser before upload.
- Full documentation image: max 1500 px WebP, with a smaller fallback for unusually large output.
- Thumbnail: max 320 px WebP.
- Cards and record galleries load thumbnails lazily.
- Full-resolution photos are fetched only after the user opens a photo.
- Failed record saves attempt to clean newly uploaded files to avoid orphaned Storage usage.

## Vercel efficiency

The production site is a static Vite frontend. Normal authentication, registry reads/writes, search, and Storage operations go directly from the browser to Appwrite. No normal CRUD request is routed through a Vercel Function.

- Heavy UI tools are split into on-demand chunks: record details, add/edit form, and Excel import.
- XLSX is loaded only after Import is opened and a workbook is selected.
- HEIC conversion is loaded only for HEIC/HEIF photos.
- Hashed Vite assets are browser/CDN cached for one year.
- The service worker performs no install-time prefetch and checks for updates at most once every 24 hours unless Updates is clicked.
- `version.json` is cached for one day.
- Search crawlers are discouraged with `robots.txt`, meta robots, and `X-Robots-Tag`.
- Appwrite preconnect/dns-prefetch improves first-request latency without adding API calls.

## Windows commands

Run these in Windows CMD from the project folder:

```bat
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

v2.4.0 adds no Appwrite attributes, collections, or indexes. If your existing v2.1.5+ schema already works, **do not rerun setup**. For a fresh Appwrite project only:

```bat
npm.cmd run setup:appwrite
```

## Publish from the permanent Git folder

From `C:\Users\kenshennn\Downloads\Germ`:

```bat
git status
git add -A
git commit -m "CaneSprout v2.3 agriculture UI and quota optimization"
git push origin main
```

If Vercel is connected to `SRA-LabTrack/GermDatabase`, the push automatically starts the new web deployment. The existing GitHub Actions workflow continues to handle Windows releases.


## v2.4.0 fast-start fix

- Raw HTML paints a CaneSprout loading shell before React/Appwrite downloads finish.
- The main application is lazy-loaded after that first paint.
- Legacy navigation-caching service workers are retired after paint and the replacement sw.js self-unregisters if discovered by an old registration.
- HTML revalidates on navigation; hashed Vite assets keep one-year immutable caching.
- Appwrite UI reads use shorter timeouts and the legacy global fallback is opt-in (`VITE_APPWRITE_ENABLE_FALLBACK=true`) rather than automatically doubling a slow failure path.
- No Appwrite schema migration is required.

## v2.4.0 true offline queue

CaneSprout can now store multiple complete field records in IndexedDB while the device is offline. Newly selected photos are compressed to WebP before they enter the queue, so the original phone-size image is not kept by CaneSprout. Each queued new record and photo pair reserves its final Appwrite IDs locally. When connectivity returns, the queue synchronizes sequentially and uses those deterministic IDs to avoid duplicates after uncertain network failures.

The queue is event-driven: it runs once on an online app start, when connectivity returns, or from the explicit Offline queue controls. There is no continuous polling or Realtime subscription. Normal sync goes directly from the browser to Appwrite and does not use Vercel Functions.

No Appwrite schema migration is required for v2.4.0.


## v2.4.3 reference toolbar

The authenticated header now uses one continuous rounded glass toolbar inspired by the supplied AgriRegistry reference: large Registry / Import Excel / Add record tiles, a dedicated online/offline queue status card, and a full account card. Backup, Updates, Offline Queue, and desktop window controls remain available from the compact More menu. This is a UI-only change and adds no Appwrite or Vercel requests.


## v2.5 administrator approval workflow

CaneSprout uses the Appwrite label `canesproutadmin` for administrator authority. Signed-in users can browse live records and submit new registrations/edits for approval. Administrators can approve/reject those requests, delete live records, import workbooks, create accounts, and grant/revoke administrator authority. Privileged user-management actions are isolated to the server-only `/api/admin-accounts` endpoint; routine registry operations continue to use the Appwrite Web SDK directly.


v2.13.1 note: refreshed the Electron login screen into a germplasm showcase layout that uses the built-in photo cross-fade background, with the sign-in form preserved and offline desktop messaging retained.


v2.13.2 note: updated the Electron desktop login screen to use the website-style photo cross-fade backdrop, the “Sugarcane Germplasm Library” eyebrow label, and a 3-step Characterization / Conservation / Utilization showcase flow.


v2.13.5 note: the login showcase flow cards were enlarged and rebalanced for both the website and Electron app so the three boxes are more readable without overlapping.


v2.13.6 note: the three login showcase boxes were enlarged further for better readability on both the website and Electron app while preserving non-overlapping responsive spacing.


v2.13.7 note: the three login showcase boxes were rebalanced to stay readable without overlapping the sign-in card in both the website and Electron app.


## v2.13.13
Mobile phone layouts now use a single collapsible tools button. The dropdown presents registry, Excel, combination, admin, offline, backup, update, and sign-out actions in a vertical list, while desktop and laptop layouts keep the full toolbar.

## v2.13.15 red-font Origin and other attributes
The shared web/Electron data model now includes the red-font attributes from `Characterization and other attributes (1).xlsx`: Country, Breeding Institution/Developer/Breeder, Local/International Collection, Species, Type/Genetic Back Ground, Other details, and Lot Planted in the station. The bundled 950-record snapshot carries the available source values locally, while Appwrite values remain authoritative when present. The official import workbook is now the A:CH `CaneSprout-Characterization-and-Attributes-v2.13.15.xlsx` template.
