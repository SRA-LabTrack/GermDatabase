# CaneSprout Registry v2.1.0

Sugarcane germination and varietal characterization registry built with React, Vite, Appwrite, and an Electron desktop wrapper.

## Characterization.xlsx is the source template

The application includes every A:BH trait from the supplied workbook and a one-time seed containing all 933 non-empty spreadsheet rows. The source workbook itself is included at `examples/Characterization.xlsx`.

Trait groups in the form:
- Identity
- Stool
- Leaf Blade
- Leaf Sheath
- Auricle
- Dewlap
- Ligule
- Stalk
- Bud Shape

Every manual-entry trait is optional. Germination tracking fields are also optional.

## Free-plan focused data access

The registry intentionally does not download the full collection.

- Initial page: 30 lean records only.
- Search: Appwrite full-text index, minimum 3 characters, 400 ms debounce.
- Pagination: cursor-after `Load 30 more`, never offset paging.
- List projection: only card fields and thumbnail ID are requested.
- Details: full record fetched only when opened.
- Photos: Appwrite Storage, WebP full image + small WebP thumbnail, lazy-loaded.
- No Base64 images in database documents.
- No Realtime subscription.
- No continuous polling.
- No total-result count request.
- No Vercel API proxy for ordinary Appwrite operations.
- Short-term browser query cache reduces repeated reads.
- Vercel serves only static Vite assets; hashed assets receive long CDN caching.
- Writes happen only when Save/Import/Delete is confirmed, not while typing.

## First install

```bat
npm install
npm run dev
```

Open `http://localhost:5174`.

## One-time Appwrite v2.1 setup and spreadsheet seed

Create a temporary Appwrite server API key with the required database/storage management scopes and put it in `.env`:

```env
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_FALLBACK_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a744cda00030236187b
VITE_APPWRITE_DATABASE_ID=germdatabase
VITE_APPWRITE_MEDIA_BUCKET_ID=germ-media

APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=6a744cda00030236187b
APPWRITE_DATABASE_ID=germdatabase
APPWRITE_MEDIA_BUCKET_ID=germ-media
APPWRITE_API_KEY=PASTE_TEMPORARY_SETUP_KEY_HERE
```

Then run:

```bat
npm run setup:appwrite
```

The setup creates `sugarcane_characterizations`, the required indexes, the WebP storage bucket if needed, and seeds all 933 spreadsheet rows exactly once. A server-only sentinel prevents the seed from being repeated on later setup runs.

Revoke the temporary API key after setup. Never add `APPWRITE_API_KEY` to Vercel.

## Vercel

Use:
- Framework: Vite
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

Vercel environment variables:

```text
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_FALLBACK_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a744cda00030236187b
VITE_APPWRITE_DATABASE_ID=germdatabase
VITE_APPWRITE_MEDIA_BUCKET_ID=germ-media
```

Also add the final Vercel hostname as an Appwrite Web platform.

## Git update workflow

Keep your permanent repository at `C:\Users\kenshennn\Downloads\Germ`.
For each new ZIP, copy the project contents into that folder without deleting `.git`, then run:

```bat
git status
git add -A
git commit -m "Update CaneSprout Registry"
git push origin main
```

The push updates GitHub, triggers Vercel deployment, and triggers the Windows release workflow.
