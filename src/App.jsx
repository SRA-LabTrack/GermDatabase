import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import './styles.css';
import {
  ArrowUpRight,
  CheckCircle2,
  Cloud,
  CloudOff,
  CloudUpload,
  Download,
  Droplets,
  FileSpreadsheet,
  Leaf,
  LoaderCircle,
  LogOut,
  MapPin,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sprout,
  Wheat,
  Users,
  X
} from 'lucide-react';
import { ADMIN_LABEL, account, isNetworkFailure, withAppwriteFailover } from './lib/appwrite';
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
import { getOfflineQueueSummary, subscribeOfflineQueue, syncOfflineQueue } from './lib/offlineQueue';

const DetailModal = lazy(() => import('./components/DetailModal.jsx'));
const RecordFormModal = lazy(() => import('./components/RecordFormModal.jsx'));
const ImportModal = lazy(() => import('./components/ImportModal.jsx'));
const OfflineQueueModal = lazy(() => import('./components/OfflineQueueModal.jsx'));
const AdminCenterModal = lazy(() => import('./components/AdminCenterModal.jsx'));

const APP_NAME = 'CaneSprout Registry';
const APP_VERSION = '2.5.4';
const USER_CACHE_KEY = 'sugarcane-registry-user-v230';
const ROLE_REFRESH_PREFIX = 'canesprout-role-refresh-v251:';
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
  const safe = { id: user?.$id || user?.id || 'cached', name: user?.name || '', email: user?.email || '', labels: Array.isArray(user?.labels) ? user.labels : [] };
  localStorage.setItem(USER_CACHE_KEY, JSON.stringify(safe));
  return safe;
}

function clearCachedUser() {
  localStorage.removeItem(USER_CACHE_KEY);
}

function roleRefreshKey(user) {
  return `${ROLE_REFRESH_PREFIX}${user?.id || user?.$id || user?.email || 'unknown'}`;
}

function markRoleRefreshed(user) {
  try { sessionStorage.setItem(roleRefreshKey(user), '1'); } catch {}
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
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      try {
        await withAppwriteFailover(() => account.createEmailPasswordSession({ email: form.email.trim(), password: form.password }), { timeoutMs: 3500, retryTransport: false });
      } catch (sessionError) {
        if (String(sessionError?.type || '').toLowerCase() !== 'user_session_already_exists') throw sessionError;
      }
      const existing = await withAppwriteFailover(() => account.get(), { timeoutMs: 3500 });
      markRoleRefreshed(existing);
      onSignedIn(saveCachedUser(existing));
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
          <div className="auth-heading"><small>Welcome back</small><h2>Sign in to the field registry</h2></div>
          <form onSubmit={submit}>
            <label><span>Email</span><input type="email" required value={form.email} onChange={(event) => { setError(''); setForm({ ...form, email: event.target.value }); }} /></label>
            <label><span>Password</span><input type="password" required minLength={8} value={form.password} onChange={(event) => { setError(''); setForm({ ...form, password: event.target.value }); }} /></label>
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Connecting…</> : 'Sign in'}</button>
          </form>
          <p className="auth-admin-note">Accounts are created and assigned roles by a CaneSprout administrator.</p>
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
  const [showOfflineQueue, setShowOfflineQueue] = useState(false);
  const [showAdminCenter, setShowAdminCenter] = useState(false);
  const [adminCenterTab, setAdminCenterTab] = useState('approvals');
  const [submissionNotice, setSubmissionNotice] = useState('');
  const [offlineSummary, setOfflineSummary] = useState({ count: 0, pending: 0, errors: 0, photoCount: 0, bytes: 0 });
  const [offlineSyncState, setOfflineSyncState] = useState('');
  const [backupState, setBackupState] = useState('');
  const [updateState, setUpdateState] = useState('');

  useEffect(() => {
    const goOnline = () => { setOnline(true); setSessionState((state) => state === 'offline' ? 'ready' : state); };
    const goOffline = () => { setOnline(false); if (user) setSessionState('offline'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setOfflineSummary({ count: 0, pending: 0, errors: 0, photoCount: 0, bytes: 0 });
      return undefined;
    }
    const ownerId = user.id || user.email;
    let live = true;
    const refreshLocalQueue = () => getOfflineQueueSummary(ownerId).then((summary) => { if (live) setOfflineSummary(summary); }).catch(() => {});
    refreshLocalQueue();
    const unsubscribe = subscribeOfflineQueue(refreshLocalQueue);
    return () => { live = false; unsubscribe?.(); };
  }, [user]);

  // Offline queue sync is event-driven rather than polled. It runs once when
  // an authenticated app starts online and once when connectivity returns.
  // Entries are processed sequentially and the batch stops on a network error,
  // which avoids request storms against Appwrite or Vercel.
  useEffect(() => {
    if (!user || !online || sessionState === 'checking' || sessionState === 'signed-out') return undefined;
    const ownerId = user.id || user.email;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const summary = await getOfflineQueueSummary(ownerId);
        if (cancelled || !summary.count) return;
        setOfflineSyncState(`Syncing ${summary.count} offline entr${summary.count === 1 ? 'y' : 'ies'}…`);
        const result = await syncOfflineQueue({
          ownerId,
          actor: { ...user, isAdmin: Array.isArray(user?.labels) && user.labels.includes(ADMIN_LABEL) },
          onProgress: (event) => {
            if (cancelled) return;
            const name = event.entry?.form?.variety || event.entry?.form?.germ_trial_code || 'offline record';
            if (event.phase === 'entry') setOfflineSyncState(`Syncing ${event.index}/${event.total}: ${name}`);
            if (event.phase === 'photos') setOfflineSyncState(`Uploading compressed photo ${event.done}/${event.total}`);
            if (event.phase === 'record') setOfflineSyncState(`Saving ${name}…`);
            if (event.phase === 'request') setOfflineSyncState(`Submitting ${name} for administrator approval…`);
          }
        });
        if (cancelled) return;
        if (result.synced) {
          setOfflineSyncState(result.approvalRequests ? `${result.approvalRequests} offline submission${result.approvalRequests === 1 ? '' : 's'} sent for administrator approval` : `${result.synced} offline entr${result.synced === 1 ? 'y' : 'ies'} synced`);
          clearListCache();
          // Avoid an automatic post-sync list read. When browsing normally,
          // merge the just-saved records into the current page locally.
          if (!searchInput.trim() && result.records?.length) {
            setRecords((current) => {
              const merged = [...result.records, ...current];
              return Array.from(new Map(merged.map((record) => [record.$id, record])).values()).slice(0, PAGE_SIZE);
            });
          }
          window.setTimeout(() => !cancelled && setOfflineSyncState(''), 3500);
        } else if (result.remaining) {
          setOfflineSyncState('Offline entries are still waiting safely on this device.');
        }
      } catch {
        if (!cancelled) setOfflineSyncState('Offline queue will retry on the next connection event.');
      }
    }, 1800);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [user, online, sessionState]);

  // Returning users do not spend an extra Appwrite account.get() request on
  // every launch. The first real registry query verifies the cookie anyway;
  // a 401 clears the cached identity immediately. account.get() is only used
  // when no local identity exists but a valid Appwrite cookie might.
  useEffect(() => {
    const cached = cachedUser();
    if (cached && Array.isArray(cached.labels)) {
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

  // Role-sensitive UI must not rely on an old cached label forever. We refresh
  // the current Appwrite account once per browser tab/session when online.
  // Login already performs account.get(), so freshly signed-in users are marked
  // as refreshed and do not spend an extra request.
  useEffect(() => {
    if (!user || !online) return undefined;
    const key = roleRefreshKey(user);
    try {
      if (sessionStorage.getItem(key) === '1') return undefined;
      sessionStorage.setItem(key, 'pending');
    } catch {}

    let live = true;
    withAppwriteFailover(() => account.get(), { timeoutMs: 3500 }).then((fresh) => {
      if (!live) return;
      const next = saveCachedUser(fresh);
      markRoleRefreshed(next);
      setUser(next);
    }).catch((error) => {
      try { sessionStorage.removeItem(key); } catch {}
      const code = Number(error?.code || error?.status || 0);
      if (code === 401 && live) {
        clearCachedUser();
        setUser(null);
        setSessionState('signed-out');
      }
    });
    return () => { live = false; };
  }, [user?.id, user?.email, online]);

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

  function handleQueuedOffline(entry) {
    setOfflineSyncState(`${entry?.form?.variety || 'Sugarcane record'} saved offline on this device.`);
    window.setTimeout(() => setOfflineSyncState(''), 4200);
  }

  function handleOfflineSynced(result) {
    if (!result?.synced) return;
    clearListCache();
    if (!searchInput.trim() && result.records?.length) {
      setRecords((current) => {
        const merged = [...result.records, ...current];
        return Array.from(new Map(merged.map((record) => [record.$id, record])).values()).slice(0, PAGE_SIZE);
      });
    }
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

  const isAdmin = Array.isArray(user?.labels) && user.labels.includes(ADMIN_LABEL);

  async function openAdminCenter(tab = 'approvals') {
    try {
      const fresh = await withAppwriteFailover(() => account.get(), { timeoutMs: 3500 });
      const next = saveCachedUser(fresh);
      setUser(next);
      if (!Array.isArray(next.labels) || !next.labels.includes(ADMIN_LABEL)) {
        setSubmissionNotice('This account no longer has administrator authority.');
        return;
      }
      setAdminCenterTab(tab);
      setShowAdminCenter(true);
    } catch (error) {
      setListError(messageFor(error));
    }
  }

  if (!user) return <AuthScreen onSignedIn={(next) => { setUser(next); setSessionState('ready'); }} />;

  return (
    <main className="app-shell">
      <header className={`topbar reference-toolbar ${isAdmin ? 'admin-toolbar' : 'user-toolbar'}`}>
        <div className="toolbar-brand-panel"><Brand /></div>

        <nav className={`toolbar-main-actions ${isAdmin ? 'admin-actions' : ''}`} aria-label="Primary registry navigation">
          <button className="toolbar-tile nav-button active" onClick={goToRegistrySearch}><Leaf size={21} /><span>Registry</span></button>
          {isAdmin && <button className="toolbar-tile nav-button" onClick={() => setShowImport(true)}><FileSpreadsheet size={21} /><span>Import Excel</span></button>}
          <button className="toolbar-tile toolbar-add" onClick={() => { setEditRecord(null); setShowForm(true); }}><Plus size={22} /><span>Add record</span></button>
          {isAdmin && <button className="toolbar-tile nav-button toolbar-accounts" onClick={() => openAdminCenter('approvals')} title="Admin Center: approvals and account management"><ShieldCheck size={21} /><span>Admin Center</span></button>}
        </nav>

        <button
          type="button"
          className={`toolbar-status-card connection ${online ? 'online' : 'offline'} ${offlineSummary.count ? 'has-queue' : ''}`}
          onClick={() => setShowOfflineQueue(true)}
          title="Open offline queue"
        >
          {online ? <Cloud size={23} /> : <CloudOff size={23} />}
          <span><b>{online ? 'Online' : 'Offline'}</b><small>{offlineSummary.count ? `${offlineSummary.count} offline ${offlineSummary.count === 1 ? 'entry' : 'entries'}` : sessionState === 'offline' ? 'Offline copy ready' : 'Offline copy ready'}</small></span>
          {offlineSummary.count ? <strong className="toolbar-queue-badge">{offlineSummary.count}</strong> : null}
        </button>

        <div className={`toolbar-account-card ${isAdmin ? 'admin-account' : 'user-account'}`}>
          <span className="toolbar-avatar" aria-hidden="true">{String(user.name || user.email || 'U').trim().charAt(0).toUpperCase()}</span>
          <span className="user-chip"><b>{user.name || user.email?.split('@')[0] || 'User'}</b><small>{isAdmin ? 'Administrator' : 'User'} • {user.email}</small></span>


          <details className="toolbar-more">
            <summary className="icon-button" title="More actions"><MoreHorizontal size={19} /></summary>
            <div className="toolbar-more-menu">
              {isAdmin && <button onClick={() => openAdminCenter('approvals')}><ShieldCheck size={17} /><span>Pending approvals</span></button>}
              {isAdmin && <button onClick={() => openAdminCenter('accounts')}><Users size={17} /><span>Account management</span></button>}
              <button onClick={() => setShowOfflineQueue(true)}><CloudUpload size={17} /><span>Offline queue</span>{offlineSummary.count ? <b>{offlineSummary.count}</b> : null}</button>
              <button onClick={createBackup} disabled={Boolean(backupState)}><Download size={17} /><span>{backupState || 'Backup'}</span></button>
              <button onClick={handleUpdates}><RefreshCw size={17} /><span>{updateState === 'downloaded' ? 'Restart & update' : updateState === 'checking' ? 'Checking…' : 'Updates'}</span></button>
              {window.germDesktop && <><button onClick={() => window.germDesktop.minimize?.()}><Minimize2 size={17} /><span>Minimize</span></button><button onClick={() => window.germDesktop.toggleFullscreen?.()}><Maximize2 size={17} /><span>Full screen</span></button></>}
            </div>
          </details>

          <button className="toolbar-signout icon-button" title="Sign out" onClick={signOut}><LogOut size={21} /></button>
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
          <div className="hero-actions"><button className="primary-button" onClick={() => { setEditRecord(null); setShowForm(true); }}><Plus size={17} /> New sugarcane record</button>{isAdmin && <button className="secondary-button" onClick={() => setShowImport(true)}><FileSpreadsheet size={17} /> Import field workbook</button>}</div>
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
        {submissionNotice && <div className="alert success"><CheckCircle2 size={16} /> {submissionNotice}</div>}
        {!!offlineSummary.count && <div className="offline-queue-banner"><CloudUpload size={18} /><div><strong>{offlineSummary.count} offline entr{offlineSummary.count === 1 ? 'y' : 'ies'} waiting on this device</strong><span>{offlineSummary.photoCount ? `${offlineSummary.photoCount} compressed photo${offlineSummary.photoCount === 1 ? '' : 's'} included. ` : ''}Sync is direct to Appwrite and never routed through Vercel.</span></div><button className="secondary-button" onClick={() => setShowOfflineQueue(true)}>Open queue</button></div>}
        {offlineSyncState && <div className="alert info offline-sync-status"><CloudUpload size={16} /> {offlineSyncState}</div>}
        <div className="query-policy"><CheckCircle2 size={16} /><span>{PAGE_SIZE} rows/request • {SEARCH_DEBOUNCE_MS} ms debounce • cursor Load More • lean card fields • bounded caching • admin approval workflow • IndexedDB offline queue • lazy tools/photos • no polling • no Realtime • no totals</span></div>
        {!loading && searchInput.trim().length >= SEARCH_MIN && searchTerm === searchInput.trim() && <div className="search-result-note"><b>{records.length}</b><span>{searchMatchMode === 'exact' ? `Exact ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match` : `${records.length === 1 ? 'match' : 'matches'} loaded`} for “{searchTerm}” in {SEARCH_SCOPES[searchScope].label}.{hasMore ? ` More matches are available with Load ${PAGE_SIZE} more.` : ''}</span></div>}
        {cacheNote && <div className="alert info">{cacheNote}</div>}
        {listError && <div className="alert error">{listError}</div>}

        <div className="record-grid">
          {loading ? Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />) : records.map((record, index) => <RecordCard key={record.$id} record={record} index={index} onOpen={setDetailId} />)}
        </div>
        {!loading && !records.length && <div className="empty-state"><Sprout size={34} /><h3>{searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? `Type at least ${SEARCH_MIN} characters` : searchInput.trim() ? 'No matching sugarcane records' : 'No sugarcane records available'}</h3><p>{searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? 'Short searches stay entirely on this device, so Appwrite receives zero requests.' : searchInput.trim() ? `No ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match was returned for “${searchInput.trim()}”. Try another term or search field.` : 'Add or import a sugarcane record to begin.'}</p></div>}
        {!loading && hasMore && <div className="load-more-row"><button className="secondary-button load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin" size={17} /> Loading {PAGE_SIZE} more…</> : `Load ${PAGE_SIZE} more`}</button><small>More records are fetched only when requested.</small></div>}
      </section>

      <footer className="app-footer"><span><Sprout size={15} /> {APP_NAME} v{APP_VERSION}</span><span>Static Vite shell • direct Appwrite Web SDK • IndexedDB offline queue • storage-efficient WebP media</span></footer>

      <Suspense fallback={<ModalLoading />}>
        {detailId && <DetailModal recordId={detailId} isAdmin={isAdmin} onClose={() => setDetailId('')} onEdit={openEdit} onDeleted={refreshRegistry} />}
        {showForm && <RecordFormModal initial={editRecord} actor={user} isAdmin={isAdmin} online={online} onClose={() => { setShowForm(false); setEditRecord(null); }} onSaved={refreshRegistry} onSubmitted={({ type, variety }) => { setSubmissionNotice(`${variety} ${type === 'edit' ? 'edit' : 'registration'} submitted for administrator approval.`); window.setTimeout(() => setSubmissionNotice(''), 6000); }} onQueued={handleQueuedOffline} />}
        {showImport && isAdmin && <ImportModal onClose={() => setShowImport(false)} onImported={refreshRegistry} />}
        {showOfflineQueue && <OfflineQueueModal ownerId={user.id || user.email} actor={{ ...user, isAdmin }} online={online} onClose={() => setShowOfflineQueue(false)} onSynced={handleOfflineSynced} />}
        {showAdminCenter && isAdmin && <AdminCenterModal initialTab={adminCenterTab} currentUser={user} onClose={() => setShowAdminCenter(false)} onRegistryChanged={() => { clearListCache(); refreshRegistry(); }} />}
      </Suspense>
    </main>
  );
}
