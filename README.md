# GermDatabase v1.3.0

# GermDatabase

GermDatabase is an offline-first React + Appwrite microorganism registry with a Windows Electron desktop wrapper.

## Included scientific records

### MICROORGANISMS
- microorganism_id
- scientific_name / common_name
- genus / species / subspecies
- organism_type / taxonomy_id
- gram_stain / cell_shape / cell_arrangement
- motility / spore_forming / capsule / oxygen_requirement
- pigmentation / colony_morphology / metabolism
- optimal_temperature / optimal_ph / growth_medium
- habitat / host_range / disease_association / transmission_mode
- virulence_factors / toxin_production / serotype / notes

### STRAINS
- strain_id
- microorganism_id
- strain_name
- pathogenic_status
- biosafety_level

### SAMPLES
- sample_id
- strain_id
- source
- collection_date
- location
- host_id
- specimen_type

### OBSERVATIONS
- observation_id
- sample_id
- trait_name
- observed_value
- unit
- method
- observation_date
- observer

### LAB_TESTS
- test_id
- sample_id
- test_type
- test_name
- result
- unit
- method

### ANTIMICROBIAL_RESULTS
- susceptibility_id
- sample_id
- antimicrobial
- mic_value
- zone_diameter
- interpretation
- standard_used

### SEQUENCES
- sequence_id
- strain_id
- marker
- accession_number
- sequence_file

### MEDIA
- media_id
- sample_id
- media_type
- file_path
- caption

## Already configured

- Appwrite project: `GermDatabase`
- Appwrite Project ID: `6a744cda00030236187b`
- Frankfurt endpoint: `https://fra.cloud.appwrite.io/v1`
- Database ID used by this app: `germdatabase`
- GitHub release target: `SRA-LabTrack/GermDatabase`
- Vercel: `vercel.json` is included for a Vite deployment

## Important Appwrite setup

The project ID and endpoint are safe client configuration. An Appwrite **server API key is not**.

1. Copy `.env.example` to `.env`.
2. In Appwrite, create a temporary API key with database management scopes. Add Storage management scopes if you also want the optional `germ-media` bucket.
3. Paste it into `APPWRITE_API_KEY` in `.env`.
4. Run:

```bash
npm install
npm run setup:appwrite
```

The setup command creates the database and all eight scientific collections. When it succeeds, delete the temporary Appwrite API key.

The setup command also tries to register Appwrite Web platforms for `localhost` and `127.0.0.1`. If your temporary key does not include project/platform management permission, database setup still continues and prints a warning. In that case, add a **Web** platform with hostname `localhost` manually in Appwrite Console.

## Run the website

```bash
npm install
npm run dev
```

Open `http://localhost:5174`. This build intentionally uses the hostname `localhost` for Appwrite Web CORS/authentication.

## Appwrite connectivity repair in v1.3.0

- Frankfurt remains the primary Appwrite endpoint: `https://fra.cloud.appwrite.io/v1`.
- Dev mode now runs on `localhost:5174` instead of `127.0.0.1:5174`.
- The Windows desktop build no longer loads the app with a `file://` origin.
- Genuine transport failures can retry the global Appwrite endpoint without masking credential, permission, or validation errors.
- `CHECK-APPWRITE-CONNECTION.cmd` now tests Node HTTPS, DNS, TCP 443, and Windows HTTPS separately.
- Offline IndexedDB/outbox behavior remains intact if Appwrite is truly unavailable.

## Offline behavior

GermDatabase stores registry documents in IndexedDB and stores create/update/delete operations in an ordered local outbox. Every change is written locally first. When internet access returns, the app pushes queued changes to Appwrite and then pulls the current remote registry.

The web app also installs a service worker after the first online visit so the application shell can reopen offline.

## Desktop app

Development:

```bash
npm run desktop:dev
```

Windows installer:

```bash
npm run desktop:build:win
```

The packaged desktop app now serves its built UI from a private `http://localhost:<random-port>` server instead of `file://`. This keeps Appwrite browser authentication on a valid Web origin without disabling Electron web security.

The desktop build has working **Minimize**, **Full Screen / Exit Full Screen**, and **Exit** controls.

## GitHub releases and updates

The Windows desktop build uses `electron-updater` with GitHub Releases. The included workflow now runs on **every push to `main`**. It derives a monotonically increasing desktop version from the package major/minor plus the GitHub Actions run number, builds the NSIS installer, and publishes the update metadata and installer automatically.

Once the repository is connected, normal updates are simply:

```bash
git add .
git commit -m "Update GermDatabase"
git push
```

Existing installed versions discover newer GitHub Releases automatically. After the package downloads, GermDatabase offers **Restart & update**.

## Vercel

Connect the repository `SRA-LabTrack/GermDatabase` to the desired Vercel account/team. Vercel will use:

- Build command: `npm run build`
- Output directory: `dist`

Set these Vercel environment variables:

```text
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_FALLBACK_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a744cda00030236187b
VITE_APPWRITE_DATABASE_ID=germdatabase
VITE_APPWRITE_MEDIA_BUCKET_ID=germ-media
```

Do **not** add `APPWRITE_API_KEY` to the browser deployment.

## UI revision 1.2.2
- Transparent GermDatabase logo with no opaque background plate
- Reference-style spring modal entrance with blur and scale
- Collapsible Add/Edit sections with animated height, opacity, chevron rotation, and staggered fields
- Rounded form-sheet sections inspired by the supplied interaction reference while the main registry remains compact
- Expanded microorganism morphology, physiology, ecology, pathogenicity, and growth traits
- New microorganism trait summary in the record drawer

### Existing Appwrite installations
If your `microorganisms` collection already exists, run `npm run setup:appwrite` again with a temporary Appwrite server API key. The setup script now adds any missing microorganism trait attributes without deleting existing records. Remove the temporary key afterward.

## UI

This edition intentionally uses **square edges** throughout. There are no rounded cards, pills, modals, inputs, or toolbar buttons. The layout is responsive and includes scroll reveal, hover, sync, and transition animations.
## UI revision 1.1.0
- AgriRegistry-inspired Georgia serif display typography with compact utility text
- LabTrack-inspired dense dashboard spacing and information hierarchy
- Sharp-edge glass UI with translucent blue/white layers and backdrop blur
- Smaller fonts, toolbar, forms, metrics, tables, and drawers
- Scroll reveals, staggered metrics, glass sweeps, hover motion, modal/drawer transitions, and sync pulse
- No rounded corners


## v1.4 Excel import and germ photos

GermDatabase now includes an **Import Excel** action in the top navigation and registry toolbar. The importer accepts `.xlsx`, `.xls`, and `.csv`, reads the first worksheet, maps either field keys or human-readable Register Germ labels, previews the rows before committing, ignores completely blank rows, and allows blank cells because Register Germ fields are optional. A matching test workbook is included at `examples/GermDatabase-Dummy-Germ-Import.xlsx`.

Photos can be selected while registering a germ or added later from the germ detail drawer. Images are converted in the browser to high-quality WebP before they are persisted. Large phone photos are scaled to a maximum edge of 3000 px and encoded at high WebP quality, with a gentle second compression pass only for unusually large files. HEIC/HEIF is supported through `heic2any`; other Chromium-readable image formats are accepted through the native decoder.

Photo binaries remain in IndexedDB while offline. During sync they are uploaded to the Appwrite Storage bucket configured by `VITE_APPWRITE_MEDIA_BUCKET_ID` (default `germ-media`), while the media collection stores only a lightweight Appwrite Storage path and caption. This avoids putting Base64 image payloads into database documents.


## v1.5 performance and continuous-update revision

- Authentication no longer blocks first paint on the Appwrite session probe.
- Login enters as soon as the session is created; profile enrichment happens in the background.
- Cached registry startup uses one IndexedDB scan instead of one query per collection.
- Initial Appwrite pulls use three bounded workers rather than nine fully sequential collection pulls.
- `xlsx` is dynamically imported only when Excel Import is opened.
- Vite separates React, Appwrite, icons, IndexedDB, Excel, and HEIC into cache-friendly chunks.
- The service worker uses cache-first content-hashed assets and network-first HTML/version checks.
- Desktop update checks are delayed until after startup so they do not compete with login.
- Every push to GitHub `main` can create a new Windows release for older installed clients.
- Vercel builds expose a commit-based `version.json`, allowing running web clients to detect a newer deployment.
