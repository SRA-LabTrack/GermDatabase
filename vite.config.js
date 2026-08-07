import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const appVersion = packageJson.version;
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || `v${appVersion}`;

export default defineConfig({
  base: './',
  define: {
    __GERM_VERSION__: JSON.stringify(appVersion),
    __GERM_BUILD_ID__: JSON.stringify(buildId)
  },
  plugins: [{
    name: 'germdatabase-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: appVersion, buildId }, null, 2)
      });
    }
  }],
  esbuild: {
    jsx: 'automatic'
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/xlsx/')) return 'excel';
          if (id.includes('/heic2any/')) return 'heic';
          if (id.includes('/appwrite/')) return 'appwrite';
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
          if (id.includes('/lucide-react/')) return 'icons';
          if (id.includes('/idb/')) return 'idb';
        }
      }
    }
  }
});
