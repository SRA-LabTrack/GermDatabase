import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const APP_VERSION = '2.3.0';
const SW_CHECK_KEY = 'canesprout-sw-check-v230';
const SW_CHECK_INTERVAL = 24 * 60 * 60_000;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

if ('serviceWorker' in navigator && !window.germDesktop) {
  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      } catch {}
      return;
    }

    try {
      const existing = await navigator.serviceWorker.getRegistration();
      const lastCheck = Number(localStorage.getItem(SW_CHECK_KEY) || 0);
      // Do not hit /sw.js on every page load. Daily automatic checks are enough for a
      // registry app; the Updates button can force a check at any time.
      if (!existing || Date.now() - lastCheck > SW_CHECK_INTERVAL) {
        await navigator.serviceWorker.register(`/sw.js?v=${APP_VERSION}`, { updateViaCache: 'none' });
        localStorage.setItem(SW_CHECK_KEY, String(Date.now()));
      }
    } catch {}
  });
}
