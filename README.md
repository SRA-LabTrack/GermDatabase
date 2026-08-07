# CaneSprout Registry v2.2.0

Sugarcane germination and varietal characterization registry for SRA-style research records. This build keeps all 60 Characterization.xlsx traits optional, supports germination observations and WebP field photos, and is deliberately optimized for Appwrite Free + Vercel Hobby usage.

## Runtime efficiency

- 25 lean core rows maximum per browse/search page.
- Cursor-based Load More, never whole-registry loading.
- 3-character search minimum with 400 ms debounce.
- Variety/trial/location/status searches use exact-first indexed lookup, then prefix, then contains only if needed.
- All-traits search uses the dedicated full-text index.
- `total=false` on lists.
- Appwrite list-response TTL caching: 5 minutes for browsing, 3 minutes for searches.
- Browser/session list cache: 5 minutes; first browse page persists for 10 minutes.
- Detail cache: 15 minutes; full trait JSON loads only when a record is opened.
- No polling and no Realtime subscription.
- Writes happen only on explicit Save, Import, Delete, or setup/seed.
- Mutations are never replayed automatically after a transport timeout.
- Backup is explicit and uses 100-row cursor pages to reduce request overhead.
- Photos live in Appwrite Storage, not database Base64. Full WebP max 1800 px; thumbnail max 420 px.

## Vercel efficiency

The deployed app is a static Vite frontend. Normal login, search, record reads/writes, and Storage operations go directly from the browser to Appwrite. There are no Vercel Functions in the ordinary CRUD path.

Hashed assets have one-year browser caching. The service worker does not prefetch on install, serves the captured app shell cache-first on later visits, and only checks its script at most every six hours unless the user clicks Updates. `robots.txt` and `X-Robots-Tag` discourage public crawler traffic to the authenticated registry.

## Glass UI

v2.2.0 adds translucent green/yellow/white glass surfaces, modal transitions, card entrance/hover motion, subtle ambient gradient orbs, focus animations, and shimmer skeletons. Motion is CSS-only and therefore does not create network requests. `prefers-reduced-motion` is respected.

## Windows commands

Use Windows CMD commands with `npm.cmd`:

```bat
npm.cmd install
npm.cmd run dev
npm.cmd run build
npm.cmd run preview
```

Existing working v2.1.5 Appwrite databases do **not** need another setup for v2.2.0. For a fresh database only:

```bat
npm.cmd run setup:appwrite
```

## Publish from the permanent Git folder

From `C:\Users\kenshennn\Downloads\Germ`:

```bat
git status
git add -A
git commit -m "CaneSprout v2.2 glass and free-plan optimization"
git push origin main
```

If Vercel is connected to `SRA-LabTrack/GermDatabase`, that push starts the web deployment automatically. The repository's GitHub Actions workflow continues to handle Windows releases.
