import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import SugarcaneIcon from './components/SugarcaneIcon.jsx';
import "./backgroundSlideshow.js";
import { registerCaneSproutOfflineWorker } from './lib/offlineApp.js';

function BootScreen({ failed = false }) {
  return (
    <main className="app-boot-screen" role="status" aria-live="polite">
      <div className="app-boot-card">
        <span className="app-boot-mark" aria-hidden="true"><SugarcaneIcon size={32} /></span>
        <div>
          <strong>Sugarcane Germplasm Resource Database</strong>
          <span>{failed ? 'The app shell could not start cleanly.' : 'Preparing the sugarcane germplasm collection…'}</span>
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
  componentDidCatch(error) { console.error('Sugarcane Germplasm Resource Database startup error:', error); }
  render() { return this.state.failed ? <BootScreen failed /> : this.props.children; }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <RootBoundary>
    <App />
  </RootBoundary>
);

// v2.12.0 restores a versioned offline app shell. Registration never blocks
// React startup and is disabled in Vite development/desktop mode. The worker
// only caches same-origin static assets; Appwrite traffic is never intercepted.
registerCaneSproutOfflineWorker().catch(() => {});
