import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import './styles.css';
import {
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  CloudOff,
  Download,
  Droplets,
  FileSpreadsheet,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  Search,
  Sprout,
  Wheat,
  X
} from 'lucide-react';
import { account, ID, isNetworkFailure, withAppwriteFailover } from './lib/appwrite';
import { CHARACTERIZATION_FIELDS, SOURCE_RECORD_COUNT } from './lib/characterizationFields';
import { GERMINATION_FIELDS } from './lib/germinationFields';
import {
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN,
  SEARCH_SCOPES,
  clearListCache,
  clearQueryCache,
  exportAllRecords,
  fileViewUrl,
  getRecord,
  listRecords
} from './lib/registryApi';
import { loginMessageFor, messageFor, pct } from './lib/registryUi';

const DetailModal = lazy(() => import('./components/DetailModal.jsx'));
const RecordFormModal = lazy(() => import('./components/RecordFormModal.jsx'));
const ImportModal = lazy(() => import('./components/ImportModal.jsx'));

const APP_NAME = 'CaneSprout Registry';
const APP_VERSION = '2.3.1';
const USER_CACHE_KEY = 'sugarcane-registry-user-v230';
const MANUAL_REFRESH_COOLDOWN_MS = 30_000;
const STALE_NOTICE_MS = 45 * 60_000;

function cachedUser() {
  try {
    const value = JSON.parse(localStorage.getItem(USER_CACHE_KEY) || 'null');
    return value?.email ? value : null;
  } catch {
    return null;
  }
}

function saveCachedUser(user) {
  const safe = { id: user?.$id || user?.id || 'cached', name: user?.name || '', email: user?.email || '' };
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(safe));
  return safe;
}

function clearCachedUser() {
  localStorage.removeItem(USER_CACHE_KEY);
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-badge"><Sprout size={24} /></span>
      <span><strong>{APP_NAME}</strong><small>Sugarcane germination & characterization</small></span>
    </div>
  );
}

function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        const userId = ID.unique();
        await withAppwriteFailover(() => account.create({ userId, email: form.email.trim(), password: form.password, name: form.name.trim() || form.email.trim() }), { timeoutMs: 4500, retryTransport: false });
      }
      try {
        await withAppwriteFailover(() => account.createEmailPasswordSession({ email: form.email.trim(), password: form.password }), { timeoutMs: 3500, retryTransport: false });
      } catch (sessionError) {
        if (String(sessionError?.type || '').toLowerCase() === 'user_session_already_exists') {
          const existing = await withAppwriteFailover(() => account.get(), { timeoutMs: 3500 });
          onSignedIn(saveCachedUser(existing));
          return;
        }
        throw sessionError;
      }
      onSignedIn(saveCachedUser({ email: form.email.trim(), name: form.name.trim() }));
    } catch (err) {
      setError(loginMessageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-art">
        <div className="auth-orb orb-one" />
        <div className="auth-orb orb-two" />
        <div className="auth-field-lines" aria-hidden="true" />
        <div className="auth-copy">
          <span className="eyebrow"><Wheat size={15} /> SRA sugarcane field records</span>
          <h1>From planted bud to established cane.</h1>
          <p>Document sugarcane emergence, nursery observations, field performance, varietal traits, and photos without loading the whole registry at once.</p>
          <div className="crop-flow compact-flow" aria-label="Sugarcane record workflow">
            <span><Sprout size={15} /> Planting</span><i />
            <span><Droplets size={15} /> Emergence</span><i />
            <span><Leaf size={15} /> Establishment</span><i />
            <span><Wheat size={15} /> Characterization</span>
          </div>
          <div className="auth-metrics">
            <span><strong>{SOURCE_RECORD_COUNT}</strong> characterization entries</span>
            <span><strong>{CHARACTERIZATION_FIELDS.length}</strong> optional varietal traits</span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <Brand />
          <div className="auth-heading"><small>{mode === 'login' ? 'Welcome back' : 'New account'}</small><h2>{mode === 'login' ? 'Sign in to the field registry' : 'Create registry account'}</h2></div>
          <form onSubmit={submit}>
            {mode === 'signup' && <label><span>Name</span><input value={form.name} onChange={(event) => { setError(''); setForm({ ...form, name: event.target.value }); }} /></label>}
            <label><span>Email</span><input type="email" required value={form.email} onChange={(event) => { setError(''); setForm({ ...form, email: event.target.value }); }} /></label>
            <label><span>Password</span><input type="password" required minLength={8} value={form.password} onChange={(event) => { setError(''); setForm({ ...form, password: event.target.value }); }} /></label>
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Connecting…</> : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'Need an account? Create one' : 'Already registered? Sign in'}</button>
        </div>
      </section>
    </main>
  );
}

function useViewportReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (!('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '160px 0px', threshold: 0.04 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, visible];
}

function RecordCard({ record, onOpen, index }) {
  const image = fileViewUrl(record.thumbnail_file_id);
  const germPct = pct(record);
  const [cardRef, visible] = useViewportReveal();
  return (
    <article
      ref={cardRef}
      className={`record-card viewport-card ${visible ? 'is-visible' : ''}`}
      style={{ '--card-delay': `${Math.min(index % 6, 5) * 34}ms` }}
      onClick={() => onOpen(record.$id)}
    >
      <div className={`record-image ${image ? 'has-image' : ''}`}>
        {image ? <img src={image} alt={record.variety || 'Sugarcane'} loading="lazy" decoding="async" fetchPriority="low" /> : <div className="record-placeholder"><Sprout size={38} /><span>Field photo optional</span></div>}
        <span className="record-status">{record.germ_status || 'Characterized'}</span>
        {germPct !== null && <span className="rate-chip">{germPct.toFixed(1)}% germinated</span>}
      </div>
      <div className="record-body">
        <div className="record-kicker"><span>Sugarcane variety</span><ArrowUpRight size={16} /></div>
        <h3>{record.variety || 'Unnamed variety'}</h3>
        <div className="trait-mini-grid agri-mini-grid">
          <span><small>Plant habit</small><b>{record.stool_plant_habit || 'Not provided'}</b></span>
          <span><small>Leaf color</small><b>{record.leaf_color || 'Not provided'}</b></span>
          <span><small>Trial / batch</small><b>{record.germ_trial_code || 'Not recorded'}</b></span>
          <span><small>Nursery / field</small><b>{record.germ_location || 'Not recorded'}</b></span>
        </div>
        <footer><span>Open germination & characterization record</span><span className="card-open-icon"><ArrowUpRight size={16} /></span></footer>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return <div className="record-card skeleton"><div className="record-image" /><div className="record-body"><i /><i /><i /></div></div>;
}

function ModalLoading() {
  return <div className="modal-backdrop"><div className="lazy-modal-loader"><LoaderCircle className="spin" size={22} /><span>Opening tool…</span></div></div>;
}

export default function App() {
  const initialUser = cachedUser();
  const [user, setUser] = useState(initialUser);
  const [sessionState, setSessionState] = useState(initialUser ? 'ready' : 'checking');
  const [online, setOnline] = useState(navigator.onLine);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState('variety');
  const searchInputRef = useRef(null);
  const searchPanelRef = useRef(null);
  const forceFreshRef = useRef(false);
  const lastManualRefreshRef = useRef(0);
  const lastFreshDataRef = useRef(Date.now());
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(Boolean(initialUser));
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState('');
  const [cacheNote, setCacheNote] = useState('');
  const [searchMatchMode, setSearchMatchMode] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [detailId, setDetailId] = useState('');
  const [editRecord, setEditRecord] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [backupState, setBackupState] = useState('');
  const [updateState, setUpdateState] = useState('');

  useEffect(() => {
    const goOnline = () => { setOnline(true); setSessionState((state) => state === 'offline' ? 'ready' : state); };
    const goOffline = () => { setOnline(false); if (user) setSessionState('offline'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Returning users do not spend an extra Appwrite account.get() request on
  // every launch. The first real registry query verifies the cookie anyway;
  // a 401 clears the cached identity immediately. account.get() is only used
  // when no local identity exists but a valid Appwrite cookie might.
  useEffect(() => {
    if (cachedUser()) {
      setSessionState(navigator.onLine ? 'ready' : 'offline');
      return undefined;
    }
    let live = true;
    setSessionState('checking');
    withAppwriteFailover(() => account.get(), { timeoutMs: 3500 }).then((value) => {
      if (!live) return;
      setUser(saveCachedUser(value));
      setSessionState('ready');
    }).catch((error) => {
      if (!live) return;
      const code = Number(error?.code || error?.status || 0);
      if (code === 401 || !isNetworkFailure(error)) {
        clearCachedUser();
        setUser(null);
        setSessionState('signed-out');
      } else {
        setSessionState('signed-out');
      }
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!window.germDesktop?.onUpdateStatus) return undefined;
    window.germDesktop.onUpdateStatus((payload) => setUpdateState(payload?.status === 'downloading' ? `Downloading ${payload.detail || ''}` : payload?.status || ''));
    return undefined;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastFreshDataRef.current > STALE_NOTICE_MS) {
        setCacheNote('This view has been open for a while. Cached records remain available; use Refresh only if you need the newest field changes.');
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed) {
      setRecords([]);
      setCursor('');
      setHasMore(false);
      setCacheNote(trimmed.length < SEARCH_MIN ? `Type ${SEARCH_MIN - trimmed.length} more character${SEARCH_MIN - trimmed.length === 1 ? '' : 's'}. No Appwrite request has been sent.` : '');
    }
    if (!trimmed) {
      setSearchTerm('');
      return undefined;
    }
    if (trimmed.length < SEARCH_MIN) return undefined;
    const timer = setTimeout(() => setSearchTerm(trimmed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!user || sessionState === 'checking') return undefined;
    const typed = searchInput.trim();
    if (typed && typed.length < SEARCH_MIN) {
      setLoading(false);
      setRecords([]);
      return undefined;
    }
    if (typed.length >= SEARCH_MIN && searchTerm !== typed) {
      setLoading(true);
      setRecords([]);
      return undefined;
    }

    const effectiveTerm = typed ? searchTerm : '';
    let live = true;
    setLoading(true);
    setListError('');
    setCacheNote('');
    const bypassCache = forceFreshRef.current;
    forceFreshRef.current = false;
    listRecords({ search: effectiveTerm, scope: searchScope, bypassCache }).then((result) => {
      if (!live) return;
      setRecords(result.documents || []);
      setCursor(result.nextCursor || '');
      setHasMore(Boolean(result.hasMore));
      setSearchMatchMode(result.matchMode || '');
      if (!result.fromCache) lastFreshDataRef.current = Date.now();
      if (result.offlineFallback) setCacheNote('Showing the last saved browse page because Appwrite is currently unreachable.');
      else if (result.persistentCache) setCacheNote('Loaded a recent field page from this device: 0 Appwrite reads. Use Refresh only when you need newer data.');
      else if (result.fromCache) setCacheNote('Loaded from bounded local cache: 0 additional Appwrite reads.');
    }).catch((error) => {
      if (!live) return;
      const code = Number(error?.code || error?.status || 0);
      if (code === 401) {
        clearCachedUser();
        clearQueryCache();
        setUser(null);
        setSessionState('signed-out');
        return;
      }
      setListError(messageFor(error));
    }).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [user, sessionState, searchInput, searchTerm, searchScope, refreshKey]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setListError('');
    try {
      const result = await listRecords({ search: searchTerm, scope: searchScope, cursor, strategy: searchMatchMode });
      setRecords((current) => [...current, ...(result.documents || [])]);
      setCursor(result.nextCursor || '');
      setHasMore(Boolean(result.hasMore));
    } catch (error) {
      setListError(messageFor(error));
    } finally {
      setLoadingMore(false);
    }
  }

  async function openEdit(record) {
    setDetailId('');
    try {
      const full = record?.$id ? await getRecord(record.$id) : record;
      setEditRecord(full);
      setShowForm(true);
    } catch (error) {
      setListError(messageFor(error));
    }
  }

  async function createBackup() {
    if (backupState) return;
    if (!confirm('A full backup intentionally reads every registry record and details document. Continue only when you need a fresh export?')) return;
    setBackupState('Starting backup…');
    setListError('');
    try {
      const documents = await exportAllRecords(({ pages, records: count }) => setBackupState(`Reading page ${pages} • ${count} records`));
      const payload = { exportedAt: new Date().toISOString(), appVersion: APP_VERSION, source: 'CaneSprout Registry direct Appwrite export', records: documents };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `canesprout-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setBackupState('');
    } catch (error) {
      setBackupState('');
      setListError(messageFor(error));
    }
  }

  async function handleUpdates() {
    if (!window.germDesktop) {
      setUpdateState('checking');
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter((key) => key.startsWith('canesprout-') || key.startsWith('germination-registry-') || key.startsWith('germdatabase-')).map((key) => caches.delete(key)));
        }
      } catch {}
      window.location.replace(`${window.location.pathname}?fresh=${Date.now()}`);
      return;
    }
    if (updateState === 'downloaded') {
      await window.germDesktop.installUpdate?.();
      return;
    }
    setUpdateState('checking');
    try { await window.germDesktop.checkForUpdates?.(); } catch { setUpdateState('error'); }
  }

  function refreshRegistry(options = {}) {
    const manual = options?.manual === true;
    if (manual) {
      const now = Date.now();
      const remaining = MANUAL_REFRESH_COOLDOWN_MS - (now - lastManualRefreshRef.current);
      if (remaining > 0) {
        setCacheNote(`Fresh refresh is limited to once every ${Math.ceil(MANUAL_REFRESH_COOLDOWN_MS / 1000)} seconds to protect the free-plan quota.`);
        return;
      }
      lastManualRefreshRef.current = now;
    }
    forceFreshRef.current = true;
    clearListCache();
    setRefreshKey((value) => value + 1);
  }

  function goToRegistrySearch() {
    searchPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select?.();
    }, 180);
  }

  async function signOut() {
    account.deleteSession({ sessionId: 'current' }).catch(() => {});
    clearCachedUser();
    clearQueryCache();
    setUser(null);
    setSessionState('signed-out');
    setRecords([]);
  }

  if (!user) return <AuthScreen onSignedIn={(next) => { setUser(next); setSessionState('ready'); }} />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <Brand />
        <nav>
          <button className="nav-button active" onClick={goToRegistrySearch}><Leaf size={17} /> Registry</button>
          <button className="nav-button" onClick={() => setShowImport(true)}><FileSpreadsheet size={17} /> Import Excel</button>
          <button className="nav-button" onClick={createBackup} disabled={Boolean(backupState)}><Download size={17} /> {backupState || 'Backup'}</button>
          <button className="nav-button" onClick={handleUpdates}><RefreshCw size={17} /> {updateState === 'downloaded' ? 'Restart & update' : updateState === 'checking' ? 'Checking…' : 'Updates'}</button>
          <button className="primary-button compact" onClick={() => { setEditRecord(null); setShowForm(true); }}><Plus size={17} /> Add record</button>
        </nav>
        <div className="topbar-right">
          <span className={`connection ${online ? 'online' : 'offline'}`}>{online ? <Cloud size={17} /> : <CloudOff size={17} />}<b>{online ? 'Online' : 'Offline'}</b><small>{sessionState === 'offline' ? 'Device cache available' : 'Direct Appwrite'}</small></span>
          <span className="user-chip"><b>{user.name || user.email?.split('@')[0] || 'User'}</b><small>{user.email}</small></span>
          {window.germDesktop && <div className="desktop-controls"><button className="icon-button" title="Minimize" onClick={() => window.germDesktop.minimize?.()}><Minimize2 size={17} /></button><button className="icon-button" title="Full screen" onClick={() => window.germDesktop.toggleFullscreen?.()}><Maximize2 size={17} /></button></div>}
          <button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={18} /></button>
        </div>
      </header>

      <section className="hero agricultural-hero">
        <div className="hero-sun" aria-hidden="true" />
        <div className="hero-field-pattern" aria-hidden="true" />
        <div className="hero-copy">
          <span className="eyebrow"><Wheat size={15} /> Sugarcane germination & varietal records</span>
          <h1>Follow sugarcane from planting material to field-ready establishment.</h1>
          <p>Keep germination trials, nursery locations, emergence observations, varietal characterization, and field photos together in one searchable record without loading the whole library at once.</p>
          <div className="crop-flow">
            <span><Sprout size={16} /><b>Plant</b><small>setts & bud chips</small></span><i />
            <span><Droplets size={16} /><b>Observe</b><small>emergence & vigor</small></span><i />
            <span><Leaf size={16} /><b>Establish</b><small>nursery & field</small></span><i />
            <span><Wheat size={16} /><b>Characterize</b><small>varietal traits</small></span>
          </div>
          <div className="hero-actions"><button className="primary-button" onClick={() => { setEditRecord(null); setShowForm(true); }}><Plus size={17} /> New sugarcane record</button><button className="secondary-button" onClick={() => setShowImport(true)}><FileSpreadsheet size={17} /> Import field workbook</button></div>
        </div>
        <div className="hero-stats agricultural-stats">
          <div><span className="stat-icon"><FileSpreadsheet size={18} /></span><small>Characterization entries</small><strong>{SOURCE_RECORD_COUNT}</strong><span>source sugarcane records</span></div>
          <div><span className="stat-icon"><Leaf size={18} /></span><small>Varietal traits</small><strong>{CHARACTERIZATION_FIELDS.length}</strong><span>optional traits available</span></div>
          <div><span className="stat-icon"><Droplets size={18} /></span><small>Germination tracking</small><strong>{GERMINATION_FIELDS.length}</strong><span>optional planting & emergence fields</span></div>
          <div><span className="stat-icon"><MapPin size={18} /></span><small>Lean field browsing</small><strong>{PAGE_SIZE}</strong><span>records maximum per page</span></div>
        </div>
      </section>

      <section className="registry-section" id="registry">
        <div className="registry-toolbar">
          <div><span className="eyebrow">Sugarcane field library</span><h2>Germination & characterization records</h2><p>Browse lean field summaries first. Full optional traits and full-resolution photos are requested only when you open a record, keeping routine monitoring light on Appwrite and Vercel.</p></div>
          <div className="toolbar-actions"><button className="icon-button bordered" title="Refresh current page" onClick={() => refreshRegistry({ manual: true })}><RefreshCw size={18} /></button></div>
        </div>

        <div className="search-panel" id="registry-search" ref={searchPanelRef}>
          <Search size={20} />
          <input ref={searchInputRef} value={searchInput} onChange={(event) => { setSearchMatchMode(''); setSearchInput(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Escape') { setSearchInput(''); event.currentTarget.blur(); } }} placeholder={searchScope === 'all' ? 'Search varietal traits or field keywords…' : `Search ${SEARCH_SCOPES[searchScope].label.toLowerCase()}…`} aria-label="Search sugarcane registry" />
          <label className="search-scope"><span>Search in</span><select value={searchScope} onChange={(event) => { setSearchScope(event.target.value); setRecords([]); setCursor(''); setHasMore(false); setSearchMatchMode(''); }}>{Object.entries(SEARCH_SCOPES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
          {searchInput && <button className="clear-search" onClick={() => { setSearchMatchMode(''); setSearchInput(''); searchInputRef.current?.focus(); }} aria-label="Clear search"><X size={16} /></button>}
          <span>{searchInput.trim().length > 0 && searchInput.trim().length < SEARCH_MIN ? `${SEARCH_MIN - searchInput.trim().length} more character${SEARCH_MIN - searchInput.trim().length === 1 ? '' : 's'} • 0 reads` : searchInput.trim() ? `${SEARCH_SCOPES[searchScope].label} • ${searchScope === 'all' ? 'keyword index' : 'smart index'}` : `Browse first ${PAGE_SIZE}`}</span>
        </div>
        <div className="query-policy"><CheckCircle2 size={16} /><span>{PAGE_SIZE} rows/request • {SEARCH_DEBOUNCE_MS} ms debounce • cursor Load More • lean card fields • bounded caching • local drafts • lazy tools/photos • no polling • no Realtime • no totals</span></div>
        {!loading && searchInput.trim().length >= SEARCH_MIN && searchTerm === searchInput.trim() && <div className="search-result-note"><b>{records.length}</b><span>{searchMatchMode === 'exact' ? `Exact ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match` : `${records.length === 1 ? 'match' : 'matches'} loaded`} for “{searchTerm}” in {SEARCH_SCOPES[searchScope].label}.{hasMore ? ` More matches are available with Load ${PAGE_SIZE} more.` : ''}</span></div>}
        {cacheNote && <div className="alert info">{cacheNote}</div>}
        {listError && <div className="alert error">{listError}</div>}

        <div className="record-grid">
          {loading ? Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />) : records.map((record, index) => <RecordCard key={record.$id} record={record} index={index} onOpen={setDetailId} />)}
        </div>
        {!loading && !records.length && <div className="empty-state"><Sprout size={34} /><h3>{searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? `Type at least ${SEARCH_MIN} characters` : searchInput.trim() ? 'No matching sugarcane records' : 'No sugarcane records available'}</h3><p>{searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? 'Short searches stay entirely on this device, so Appwrite receives zero requests.' : searchInput.trim() ? `No ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match was returned for “${searchInput.trim()}”. Try another term or search field.` : 'Add or import a sugarcane record to begin.'}</p></div>}
        {!loading && hasMore && <div className="load-more-row"><button className="secondary-button load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin" size={17} /> Loading {PAGE_SIZE} more…</> : `Load ${PAGE_SIZE} more`}</button><small>More records are fetched only when requested.</small></div>}
      </section>

      <footer className="app-footer"><span><Sprout size={15} /> {APP_NAME} v{APP_VERSION}</span><span>Static Vite shell • direct Appwrite Web SDK • on-demand chunks • storage-efficient WebP media</span></footer>

      <Suspense fallback={<ModalLoading />}>
        {detailId && <DetailModal recordId={detailId} onClose={() => setDetailId('')} onEdit={openEdit} onDeleted={refreshRegistry} />}
        {showForm && <RecordFormModal initial={editRecord} onClose={() => { setShowForm(false); setEditRecord(null); }} onSaved={refreshRegistry} />}
        {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={refreshRegistry} />}
      </Suspense>
    </main>
  );
}
