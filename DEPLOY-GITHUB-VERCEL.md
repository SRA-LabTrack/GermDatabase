# GermDatabase deployment and automatic updates

## 1. Push this folder to GitHub

Open Command Prompt in the extracted `GermDatabase` folder and run:

```bat
git init
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/SRA-LabTrack/GermDatabase.git
git add .
git commit -m "GermDatabase v1.5 optimized deployment"
git push -u origin main
```

After the first push, later changes only need:

```bat
git add .
git commit -m "Update GermDatabase"
git push
```

Every push to `main` does two independent update paths:

1. Vercel, when connected to this GitHub repository, automatically creates a new production deployment.
2. `.github/workflows/release-windows.yml` automatically creates a newer Windows GitHub Release. Installed GermDatabase desktop builds use `electron-updater` to discover that release.

The workflow derives the release as `MAJOR.MINOR.GITHUB_RUN_NUMBER`, so each push has a version newer than the previous desktop build without requiring you to manually edit the version every time.

## 2. Import into Vercel

In Vercel choose **Add New > Project**, import `SRA-LabTrack/GermDatabase`, and use:

- Framework Preset: Vite
- Root Directory: `./`
- Build Command: `npm run build`
- Output Directory: `dist`

Add these Environment Variables to Production, Preview, and Development:

```text
VITE_APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
VITE_APPWRITE_FALLBACK_ENDPOINT=https://cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=6a744cda00030236187b
VITE_APPWRITE_DATABASE_ID=germdatabase
VITE_APPWRITE_MEDIA_BUCKET_ID=germ-media
```

Never put `APPWRITE_API_KEY` in Vercel for this browser app. Vite `VITE_*` values are client-visible configuration, so they must not contain secrets.

## 3. Appwrite platform hostname

After Vercel gives you the production domain, open the Appwrite project and add that hostname as a Web platform, for example:

```text
germdatabase.vercel.app
```

Keep `localhost` as a Web platform for local/desktop use. Add any preview hostname you need to test separately.

## 4. How updates reach older versions

### Website
Vercel deploys every main-branch push. GermDatabase checks `/version.json` on focus and periodically. If the browser is still running an older build it displays an update notice; clicking **Updates** reloads the newest Vercel build. The service worker uses network-first HTML/version checks so a stale shell cannot pin the old site forever.

### Windows desktop
The installed desktop app checks GitHub Releases after startup. A newer release downloads in the background. When ready, the UI shows **Restart & update**. The installer target is NSIS, which is supported by `electron-updater`.

Important: the GitHub repository must remain public for token-free desktop update checks. If you make it private later, the update architecture needs to change.
