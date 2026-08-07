import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  esbuild: { jsx: 'automatic' },
  build: {
    target: 'es2020',
    sourcemap: false,
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: true,
    reportCompressedSize: false,
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          appwrite: ['appwrite']
        }
      }
    }
  }
});
