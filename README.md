# CaneSprout Registry v2.3.0

Agriculture-first sugarcane germination and varietal characterization registry. This build keeps all 60 Characterization.xlsx traits optional, retains the 933 source records, tracks planting/emergence observations, stores field photos as WebP in Appwrite Storage, and is deliberately tuned for Appwrite Free + Vercel Hobby usage.

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

v2.3.0 adds no Appwrite attributes, collections, or indexes. If your existing v2.1.5+ schema already works, **do not rerun setup**. For a fresh Appwrite project only:

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
