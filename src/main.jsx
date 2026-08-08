import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';

const LazyApp = lazy(() => import('./App.jsx'));

function BootScreen({ failed = false }) {
  return (
    <main className="app-boot-screen" role="status" aria-live="polite">
      <div className="app-boot-card">
        <span className="app-boot-mark" aria-hidden="true">🌱</span>
        <div>
          <strong>CaneSprout Registry</strong>
          <span>{failed ? 'The app shell could not start cleanly.' : 'Preparing the sugarcane field registry…'}</span>
        </div>
        {!failed && <i className="app-boot-progress" aria-hidden="true" />}
        {failed && <button onClick={() => window.location.replace(`${window.location.pathname}?fresh=${Date.now()}`)}>Reload cleanly</button>}
      </div>
    </main>
  );
}

class RootBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('CaneSprout startup error:', error); }
  render() { return this.state.failed ? <BootScreen failed /> : this.props.children; }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootBoundary>
    <Suspense fallback={<BootScreen />}>
      <LazyApp />
    </Suspense>
  </RootBoundary>
);

// v2.4.0 deliberately retires the old navigation-caching service worker.
// Vercel already serves hashed assets efficiently; removing the extra app-shell
// cache avoids stale index.html -> missing chunk white screens. Cleanup is done
// after first paint and never blocks React or Appwrite startup.
function retireLegacyWebCaches() {
  if (window.germDesktop) return;
  const cleanup = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter((key) => key.startsWith('canesprout-') || key.startsWith('germination-registry-') || key.startsWith('germdatabase-'))
          .map((key) => caches.delete(key)));
      }
    } catch {}
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(cleanup, { timeout: 2500 });
  else window.setTimeout(cleanup, 1200);
}
retireLegacyWebCaches();
