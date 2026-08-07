import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const APP_VERSION = typeof __GERM_VERSION__ !== 'undefined' ? __GERM_VERSION__ : '1.5.0';
const BUILD_ID = typeof __GERM_BUILD_ID__ !== 'undefined' ? __GERM_BUILD_ID__ : `v${APP_VERSION}`;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Never let an old PWA service worker cache Vite source while developing.
// This was the reason localhost could keep showing an older GermDatabase UI.
if ('serviceWorker' in navigator && !window.germDesktop) {
  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith('germdatabase-')).map((key) => caches.delete(key)));
        }
        console.info(`GermDatabase v${APP_VERSION}: development cache cleared.`);
      } catch (error) {
        console.warn('Could not clear the development service-worker cache.', error);
      }
      return;
    }

    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(BUILD_ID)}`, { updateViaCache: 'none' }).catch(() => {});
  });
}
