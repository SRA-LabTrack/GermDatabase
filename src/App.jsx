import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import './styles.css';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Cloud,
  CloudOff,
  CloudUpload,
  Download,
  Droplets,
  FileSpreadsheet,
  LoaderCircle,
  LogOut,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X
} from 'lucide-react';
import { ADMIN_LABEL, account, isNetworkFailure, withAppwriteFailover } from './lib/appwrite';
import { CHARACTERIZATION_FIELDS, SOURCE_RECORD_COUNT } from './lib/characterizationFields';
import { GERMINATION_FIELDS } from './lib/germinationFields';
import {
  PAGE_SIZE,
  RECENT_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN,
  SEARCH_SCOPES,
  clearListCache,
  clearQueryCache,
  exportAllRecords,
  fileViewUrl,
  getRecord,
  listRecentRecords,
  listRecords
} from './lib/registryApi';
import { loginMessageFor, messageFor } from './lib/registryUi';
import { getOfflineQueueSummary, subscribeOfflineQueue, syncOfflineQueue } from './lib/offlineQueue';
import SugarcaneIcon from './components/SugarcaneIcon.jsx';

const DetailModal = lazy(() => import('./components/DetailModal.jsx'));
const RecordFormModal = lazy(() => import('./components/RecordFormModal.jsx'));
const ImportModal = lazy(() => import('./components/ImportModal.jsx'));
const ExportExcelModal = lazy(() => import('./components/ExportExcelModal.jsx'));
const OfflineQueueModal = lazy(() => import('./components/OfflineQueueModal.jsx'));
const AdminCenterModal = lazy(() => import('./components/AdminCenterModal.jsx'));
const SpreadsheetEditorModal = lazy(() => import('./components/SpreadsheetEditorModal.jsx'));

const APP_NAME = 'Sugarcane Germplasm Resource Database';
const APP_VERSION = '2.9.14';
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
      <span className="brand-badge"><SugarcaneIcon size={27} /></span>
      <span className="brand-copy">
        <strong>
          <span>Sugarcane Germplasm</span>
          <span>Resource Database</span>
        </strong>
        <small>Genetic resource repository</small>
      </span>
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
        await withAppwriteFailover(() => account.createEmailPasswordSession({ email: form.email.trim(), password: form.password }), { timeoutMs: 9000, retryTransport: false });
      } catch (sessionError) {
        if (String(sessionError?.type || '').toLowerCase() !== 'user_session_already_exists') throw sessionError;
      }
      const existing = await withAppwriteFailover(() => account.get(), { timeoutMs: 9000 });
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
          <span className="eyebrow"><SugarcaneIcon size={16} /> Sugarcane genetic resources</span>
          <h1>Exploring the Genetic Wealth of Sugarcane Diversity</h1>
          <p>A Digital Repository for Characterization, Conservation, and Utilization of Sugarcane Genetic Resources.</p>
          <div className="crop-flow compact-flow" aria-label="Sugarcane record workflow">
            <span><SugarcaneIcon size={15} /> Characterization</span><i />
            <span><Droplets size={15} /> Emergence</span><i />
            <span><SugarcaneIcon size={15} /> Conservation</span><i />
            <span><SugarcaneIcon size={15} /> Utilization</span>
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
          <div className="auth-heading"><small>Welcome back</small><h2>Sign in to the germplasm database</h2></div>
          <form onSubmit={submit}>
            <label><span>Email</span><input type="email" required value={form.email} onChange={(event) => { setError(''); setForm({ ...form, email: event.target.value }); }} /></label>
            <label><span>Password</span><input type="password" required minLength={8} value={form.password} onChange={(event) => { setError(''); setForm({ ...form, password: event.target.value }); }} /></label>
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Connecting…</> : 'Sign in'}</button>
          </form>
          <p className="auth-admin-note">Accounts are created and assigned roles by a Sugarcane Germplasm Resource Database administrator.</p>
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
  const [cardRef, visible] = useViewportReveal();
  const [profilePreview, setProfilePreview] = useState(record.__bundledSnapshot ? record : null);

  useEffect(() => {
    let live = true;
    if (!visible) return () => { live = false; };
    if (record.__bundledSnapshot) {
      setProfilePreview(record);
      return () => { live = false; };
    }
    setProfilePreview(null);
    getRecord(record.$id)
      .then((full) => { if (live && full) setProfilePreview(full); })
      .catch(() => { if (live) setProfilePreview({ ...record, __previewFailed: true }); });
    return () => { live = false; };
  }, [visible, record.$id]);

  const preview = profilePreview || record;
  const missing = !profilePreview && !record.__bundledSnapshot ? 'Loading…' : 'Not recorded';
  const parentals = [preview.parentage_female, preview.parentage_male].filter(Boolean).join(' × ') || missing;
  const tcHa = preview.yield_tc_ha || missing;
  const lkgTc = preview.yield_lkg_tc || missing;
  const recommended = preview.recommended_locations || preview.tested_location || missing;
  const disease = preview.disease_reaction || missing;

  return (
    <article
      ref={cardRef}
      className={`record-card germplasm-card viewport-card ${visible ? 'is-visible' : ''}`}
      style={{ '--card-delay': `${Math.min(index % 6, 5) * 34}ms` }}
    >
      <div className={`record-image ${image ? 'has-image' : ''}`}>
        {image ? <img src={image} alt={record.variety || 'Sugarcane germplasm'} loading="lazy" decoding="async" fetchPriority="low" /> : <div className="record-placeholder"><SugarcaneIcon size={44} /><span>Germplasm photo optional</span></div>}
        <span className="record-status">Germplasm accession</span>
      </div>
      <div className="record-body">
        <div className="record-kicker"><span>Variety Name</span><SugarcaneIcon size={18} /></div>
        <h3>{record.variety || 'Unnamed variety'}</h3>
        <div className="germplasm-preview-grid">
          <span><small>Accession Number</small><b>{preview.accession_number || missing}</b></span>
          <span><small>Origin</small><b>{preview.origin || missing}</b></span>
          <span><small>Collection Year</small><b>{preview.collection_year || missing}</b></span>
          <span><small>Species</small><b>{preview.species || missing}</b></span>
          <span className="preview-wide"><small>Parentals</small><b>{parentals}</b></span>
          <span className="preview-yield"><small>Yield Potential</small><b><em>TC/Ha</em> {tcHa}<i /> <em>LKg/TC</em> {lkgTc}</b></span>
          <span className="preview-wide"><small>Recommended Locations</small><b>{recommended}</b></span>
          <span className="preview-wide preview-disease"><small>Reaction to Diseases</small><b>{disease}</b></span>
        </div>
        <footer className="germplasm-card-footer">
          <span>Preview only. Open the profile for complete characterization data.</span>
          <button type="button" className="primary-button view-profile-button" onClick={() => onOpen(record.$id)}>View Profile <ArrowUpRight size={16} /></button>
        </footer>
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

function excelCellValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return value;
}

export default function App() {
  const initialUser = cachedUser();
  const [user, setUser] = useState(initialUser);
  const [sessionState, setSessionState] = useState(initialUser ? 'ready' : 'checking');
  const [online, setOnline] = useState(navigator.onLine);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState('variety');
  const [recentMode, setRecentMode] = useState(false);
  const searchInputRef = useRef(null);
  const searchPanelRef = useRef(null);
  const aboutSectionRef = useRef(null);
  const collectionSectionRef = useRef(null);
  const excelMenuRef = useRef(null);
  const forceFreshRef = useRef(false);
  const lastManualRefreshRef = useRef(0);
  const lastFreshDataRef = useRef(Date.now());
  const toolbarRef = useRef(null);
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
  const [showExportExcel, setShowExportExcel] = useState(false);
  const [showExcelMenu, setShowExcelMenu] = useState(false);
  const [excelExportState, setExcelExportState] = useState('');
  const [showOfflineQueue, setShowOfflineQueue] = useState(false);
  const [showAdminCenter, setShowAdminCenter] = useState(false);
  const [showSpreadsheetEditor, setShowSpreadsheetEditor] = useState(false);
  const [adminCenterTab, setAdminCenterTab] = useState('approvals');
  const [submissionNotice, setSubmissionNotice] = useState('');
  const [offlineSummary, setOfflineSummary] = useState({ count: 0, pending: 0, errors: 0, photoCount: 0, bytes: 0 });
  const [offlineSyncState, setOfflineSyncState] = useState('');
  const [backupState, setBackupState] = useState('');
  const [updateState, setUpdateState] = useState('');
  const [toolbarBottom, setToolbarBottom] = useState(108);

  useEffect(() => {
    let frame = 0;

    const measureToolbar = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = toolbarRef.current?.getBoundingClientRect();
        if (!rect) return;
        setToolbarBottom(Math.max(0, Math.round(rect.bottom)));
      });
    };

    measureToolbar();
    window.addEventListener('resize', measureToolbar);
    window.addEventListener('orientationchange', measureToolbar);

    const observer = typeof ResizeObserver !== 'undefined' && toolbarRef.current
      ? new ResizeObserver(measureToolbar)
      : null;
    observer?.observe(toolbarRef.current);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measureToolbar);
      window.removeEventListener('orientationchange', measureToolbar);
    };
  }, []);

  useEffect(() => {
    if (!showExcelMenu) return undefined;

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setShowExcelMenu(false);
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [showExcelMenu]);

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
          if (!searchInput.trim() && !recentMode && result.records?.length) {
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
  }, [user, online, sessionState, recentMode]);

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
    withAppwriteFailover(() => account.get(), { timeoutMs: 9000 }).then((value) => {
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
    withAppwriteFailover(() => account.get(), { timeoutMs: 9000 }).then((fresh) => {
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
    if (!recentMode && typed && typed.length < SEARCH_MIN) {
      setLoading(false);
      setRecords([]);
      return undefined;
    }
    if (!recentMode && typed.length >= SEARCH_MIN && searchTerm !== typed) {
      setLoading(true);
      setRecords([]);
      return undefined;
    }

    const effectiveTerm = recentMode ? '' : (typed ? searchTerm : '');
    let live = true;
    setLoading(true);
    setListError('');
    setCacheNote('');
    const bypassCache = forceFreshRef.current;
    forceFreshRef.current = false;
    const request = recentMode
      ? listRecentRecords({ bypassCache })
      : listRecords({ search: effectiveTerm, scope: searchScope, bypassCache });
    request.then((result) => {
      if (!live) return;
      setRecords(result.documents || []);
      setCursor(result.nextCursor || '');
      setHasMore(Boolean(result.hasMore));
      setSearchMatchMode(result.matchMode || '');
      if (!result.fromCache) lastFreshDataRef.current = Date.now();
      if (result.bundledSnapshot) setCacheNote(`Appwrite did not respond in time. Showing the bundled ${SOURCE_RECORD_COUNT}-record registry snapshot read-only; press Refresh when connectivity returns to switch back to live records.`);
      else if (result.offlineFallback) setCacheNote('Showing the last saved browse page because Appwrite is currently unreachable.');
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
  }, [user, sessionState, searchInput, searchTerm, searchScope, recentMode, refreshKey]);

  async function loadMore() {
    if (recentMode || !cursor || loadingMore) return;
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
      const payload = { exportedAt: new Date().toISOString(), appVersion: APP_VERSION, source: 'Sugarcane Germplasm Resource Database direct Appwrite export', records: documents };
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
    if (!searchInput.trim() && !recentMode && result.records?.length) {
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

  function goToGermplasmCollection() {
    collectionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function goToAboutGermplasm() {
    aboutSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      const fresh = await withAppwriteFailover(() => account.get(), { timeoutMs: 9000 });
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
      <header ref={toolbarRef} className={`topbar reference-toolbar ${isAdmin ? 'admin-toolbar' : 'user-toolbar'}`}>
        <div className="toolbar-brand-panel"><Brand /></div>

        <nav className={`toolbar-main-actions segmented-toolbar ${isAdmin ? 'admin-actions' : ''}`} aria-label="Primary registry navigation">
          <button
            className={`toolbar-tile nav-button ${!showImport && !showExcelMenu && !showExportExcel && !showSpreadsheetEditor && !showForm && !showAdminCenter ? 'active' : ''}`}
            aria-current={!showImport && !showExcelMenu && !showExportExcel && !showSpreadsheetEditor && !showForm && !showAdminCenter ? 'page' : undefined}
            onClick={() => { setShowExcelMenu(false); goToGermplasmCollection(); }}
          >
            <SugarcaneIcon size={22} /><span>Germplasm</span>
          </button>
          {isAdmin && (
            <div
              className={`excel-tools-segment ${showExcelMenu || showImport || showExportExcel || showSpreadsheetEditor || excelExportState ? 'active' : ''}`}
            >
              <button
                type="button"
                className="excel-tools-toggle"
                aria-expanded={showExcelMenu}
                aria-controls="excel-tools-expansion"
                onClick={() => setShowExcelMenu((open) => !open)}
              >
                <FileSpreadsheet size={21} />
                <span>Import Excel</span>
                <ChevronDown className={`excel-tools-chevron ${showExcelMenu ? 'open' : ''}`} size={15} />
              </button>


            </div>
          )}
          <button
            className={`toolbar-tile nav-button toolbar-add ${showForm ? 'active' : ''}`}
            aria-pressed={showForm}
            onClick={() => { setShowExcelMenu(false); setEditRecord(null); setShowForm(true); }}
          >
            <Plus size={22} /><span>Add record</span>
          </button>
          {isAdmin && (
            <button
              className={`toolbar-tile nav-button toolbar-accounts ${showAdminCenter ? 'active' : ''}`}
              aria-pressed={showAdminCenter}
              onClick={() => { setShowExcelMenu(false); openAdminCenter('approvals'); }}
              title="Admin Center: approvals and account management"
            >
              <ShieldCheck size={21} /><span>Admin Center</span>
            </button>
          )}
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

      {isAdmin && showExcelMenu && (
        <section
          id="excel-tools-expansion"
          className="excel-tools-expansion excel-tools-viewport"
          aria-label="Excel tools"
          style={{ top: `${toolbarBottom + 8}px` }}
        >
          <div className="excel-tools-expansion-label">
            <FileSpreadsheet size={20} />
            <span><strong>Excel Tools</strong><small>Work with one variety or the complete registry</small></span>
          </div>

          <div className="excel-tools-expansion-actions">
            <button
              type="button"
              className="excel-action excel-action-primary"
              onClick={() => {
                setShowExcelMenu(false);
                setShowImport(true);
              }}
            >
              <FileSpreadsheet size={18} />
              <span><strong>Import Excel</strong><small>Specific variety or whole registry</small></span>
            </button>

            <button
              type="button"
              className="excel-action"
              onClick={() => {
                setShowExcelMenu(false);
                setShowExportExcel(true);
              }}
            >
              <Download size={18} />
              <span><strong>Export Excel</strong><small>Specific variety or whole registry</small></span>
            </button>

            <button
              type="button"
              className="excel-action"
              onClick={() => {
                setShowExcelMenu(false);
                setShowSpreadsheetEditor(true);
              }}
            >
              <FileSpreadsheet size={18} />
              <span><strong>Edit in Excel format</strong><small>Open bulk spreadsheet editor</small></span>
            </button>
          </div>
        </section>
      )}


      <section className="hero agricultural-hero germplasm-hero">
        <div className="hero-sun" aria-hidden="true" />
        <div className="hero-field-pattern" aria-hidden="true" />
        <div className="hero-copy">
          <span className="eyebrow"><SugarcaneIcon size={17} /> A Digital Repository for Characterization, Conservation, and Utilization of Sugarcane Genetic Resources</span>
          <h1>Discover the Genetic Diversity of Sugarcane</h1>
          <p className="hero-subtitle">A comprehensive platform showcasing sugarcane germplasm collections, characteristics, and valuable genetic resources for research and crop improvement.</p>
        </div>
        <div className="hero-stats agricultural-stats germplasm-stats germplasm-category-cards" aria-label="Sugarcane germplasm collection categories">
          <div>
            <span className="stat-icon"><SugarcaneIcon size={20} /></span>
            <small>Germplasm Collection</small>
            <strong>Accession</strong>
            <span>Documented sugarcane accessions maintained in the resource database.</span>
          </div>
          <div>
            <span className="stat-icon"><SugarcaneIcon size={20} /></span>
            <small>Germplasm Collection</small>
            <strong>SRA Developed Varieties</strong>
            <span>Sugarcane varieties developed and documented through SRA breeding programs.</span>
          </div>
          <div>
            <span className="stat-icon"><SugarcaneIcon size={20} /></span>
            <small>Germplasm Collection</small>
            <strong>Local Collection</strong>
            <span>Locally collected and maintained sugarcane genetic resources.</span>
          </div>
          <div>
            <span className="stat-icon"><SugarcaneIcon size={20} /></span>
            <small>Germplasm Collection</small>
            <strong>International Collection</strong>
            <span>Introduced and internationally sourced sugarcane germplasm resources.</span>
          </div>
        </div>
      </section>

      <section className="about-germplasm-section" id="about-germplasm" ref={aboutSectionRef}>
        <div className="about-germplasm-copy">
          <span className="eyebrow"><SugarcaneIcon size={17} /> About Germplasm</span>
          <h2>What is Sugarcane Germplasm?</h2>
          <p>Sugarcane germplasm represents the diverse genetic resources preserved for research, conservation, and breeding. These collections provide valuable traits that support the development of improved sugarcane varieties with higher productivity, resilience, and adaptability.</p>
        </div>
        <div className="about-germplasm-pillars" aria-label="Germplasm resource priorities">
          <article><SugarcaneIcon size={30} /><div><strong>Characterization</strong><span>Compare morphological, agronomic, yield, parentage, and disease-response traits.</span></div></article>
          <article><SugarcaneIcon size={30} /><div><strong>Conservation</strong><span>Preserve valuable sugarcane genetic resources and their documented identity.</span></div></article>
          <article><SugarcaneIcon size={30} /><div><strong>Utilization</strong><span>Support research, breeding, crop improvement, and informed variety selection.</span></div></article>
        </div>
      </section>

      <section className="registry-section germplasm-collection-section" id="registry" ref={collectionSectionRef}>
        <div className="registry-toolbar">
          <div><span className="eyebrow"><SugarcaneIcon size={16} /> SUGARCANE GERMPLASM LIBRARY</span><h2>Explore Our Germplasm Collection</h2><p>Browse focused germplasm previews with key passport, parentage, yield, location, and disease-response information. Select <strong>View Profile</strong> to open the complete characterization record.</p></div>
          <div className="toolbar-actions"><button className="icon-button bordered" title="Refresh current page" onClick={() => refreshRegistry({ manual: true })}><RefreshCw size={18} /></button></div>
        </div>

        <div className="search-panel" id="registry-search" ref={searchPanelRef}>
          <Search size={20} />
          <input ref={searchInputRef} value={searchInput} onChange={(event) => { setRecentMode(false); setSearchMatchMode(''); setSearchInput(event.target.value); }} onKeyDown={(event) => { if (event.key === 'Escape') { setSearchInput(''); event.currentTarget.blur(); } }} placeholder={recentMode ? `Showing ${RECENT_LIMIT} most recently added records` : searchScope === 'all' ? 'Search varietal traits or field keywords…' : `Search ${SEARCH_SCOPES[searchScope].label.toLowerCase()}…`} aria-label="Search sugarcane registry" />
          <button type="button" className={`recent-search-button ${recentMode ? 'active' : ''}`} onClick={() => { const next = !recentMode; setRecentMode(next); setSearchInput(''); setSearchTerm(''); setSearchMatchMode(next ? 'recent' : ''); setRecords([]); setCursor(''); setHasMore(false); }} aria-pressed={recentMode} title={`Show the ${RECENT_LIMIT} most recently added records`}><Clock3 size={16} /><span>Recently added</span><b>{RECENT_LIMIT}</b></button>
          <label className="search-scope"><span>Search in</span><select value={searchScope} disabled={recentMode} onChange={(event) => { setRecentMode(false); setSearchScope(event.target.value); setRecords([]); setCursor(''); setHasMore(false); setSearchMatchMode(''); }}>{Object.entries(SEARCH_SCOPES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}</select></label>
          {searchInput && <button className="clear-search" onClick={() => { setRecentMode(false); setSearchMatchMode(''); setSearchInput(''); searchInputRef.current?.focus(); }} aria-label="Clear search"><X size={16} /></button>}
          <span>{recentMode ? `Newest ${RECENT_LIMIT} • on-demand lean view` : searchInput.trim().length > 0 && searchInput.trim().length < SEARCH_MIN ? `${SEARCH_MIN - searchInput.trim().length} more character${SEARCH_MIN - searchInput.trim().length === 1 ? '' : 's'} • 0 reads` : searchInput.trim() ? `${SEARCH_SCOPES[searchScope].label} • ${searchScope === 'all' ? 'keyword index' : 'smart index'}` : `Browse first ${PAGE_SIZE}`}</span>
        </div>
        {submissionNotice && <div className="alert success"><CheckCircle2 size={16} /> {submissionNotice}</div>}
        {!!offlineSummary.count && <div className="offline-queue-banner"><CloudUpload size={18} /><div><strong>{offlineSummary.count} offline entr{offlineSummary.count === 1 ? 'y' : 'ies'} waiting on this device</strong><span>{offlineSummary.photoCount ? `${offlineSummary.photoCount} compressed photo${offlineSummary.photoCount === 1 ? '' : 's'} included. ` : ''}Sync is direct to Appwrite and never routed through Vercel.</span></div><button className="secondary-button" onClick={() => setShowOfflineQueue(true)}>Open queue</button></div>}
        {offlineSyncState && <div className="alert info offline-sync-status"><CloudUpload size={16} /> {offlineSyncState}</div>}
        <div className="query-policy"><CheckCircle2 size={16} /><span>{PAGE_SIZE} rows/request • recent view capped at {RECENT_LIMIT} • {SEARCH_DEBOUNCE_MS} ms debounce • cursor Load More • lazy germplasm preview traits • bounded caching • admin approval workflow • IndexedDB offline queue • lazy tools/photos • no polling • no Realtime • no totals</span></div>
        {!loading && recentMode && <div className="search-result-note recent-result-note"><b>{records.length}</b><span>Most recently added sugarcane records, newest first. This view is capped at {RECENT_LIMIT} lean records and does not auto-refresh.</span></div>}
        {!loading && !recentMode && searchInput.trim().length >= SEARCH_MIN && searchTerm === searchInput.trim() && <div className="search-result-note"><b>{records.length}</b><span>{searchMatchMode === 'exact' ? `Exact ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match` : `${records.length === 1 ? 'match' : 'matches'} loaded`} for “{searchTerm}” in {SEARCH_SCOPES[searchScope].label}.{hasMore ? ` More matches are available with Load ${PAGE_SIZE} more.` : ''}</span></div>}
        {cacheNote && <div className="alert info">{cacheNote}</div>}
        {listError && <div className="alert error">{listError}</div>}

        <div className="record-grid">
          {loading ? Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />) : records.map((record, index) => <RecordCard key={record.$id} record={record} index={index} onOpen={setDetailId} />)}
        </div>
        {!loading && !records.length && <div className="empty-state"><SugarcaneIcon size={38} /><h3>{recentMode ? 'No recently added records' : searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? `Type at least ${SEARCH_MIN} characters` : searchInput.trim() ? 'No matching sugarcane records' : 'No sugarcane records available'}</h3><p>{recentMode ? 'No registry entries were returned for the recent-record view.' : searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? 'Short searches stay entirely on this device, so Appwrite receives zero requests.' : searchInput.trim() ? `No ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match was returned for “${searchInput.trim()}”. Try another term or search field.` : 'Add or import a sugarcane record to begin.'}</p></div>}
        {!loading && hasMore && <div className="load-more-row"><button className="secondary-button load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin" size={17} /> Loading {PAGE_SIZE} more…</> : `Load ${PAGE_SIZE} more`}</button><small>More records are fetched only when requested.</small></div>}
      </section>

      <footer className="app-footer"><span><SugarcaneIcon size={17} /> {APP_NAME} v{APP_VERSION}</span><span>Static Vite shell • direct Appwrite Web SDK • IndexedDB offline queue • storage-efficient WebP media</span></footer>

      <Suspense fallback={<ModalLoading />}>
        {detailId && <DetailModal recordId={detailId} isAdmin={isAdmin} onClose={() => setDetailId('')} onEdit={openEdit} onDeleted={refreshRegistry} />}
        {showForm && <RecordFormModal initial={editRecord} actor={user} isAdmin={isAdmin} online={online} onClose={() => { setShowForm(false); setEditRecord(null); }} onSaved={refreshRegistry} onSubmitted={({ type, variety }) => { setSubmissionNotice(`${variety} ${type === 'edit' ? 'edit' : 'registration'} submitted for administrator approval.`); window.setTimeout(() => setSubmissionNotice(''), 6000); }} onQueued={handleQueuedOffline} />}
        {showImport && isAdmin && <ImportModal onClose={() => setShowImport(false)} onImported={refreshRegistry} />}
        {showExportExcel && isAdmin && <ExportExcelModal onClose={() => setShowExportExcel(false)} onExported={(message) => setSubmissionNotice(message)} />}
        {showOfflineQueue && <OfflineQueueModal ownerId={user.id || user.email} actor={{ ...user, isAdmin }} online={online} onClose={() => setShowOfflineQueue(false)} onSynced={handleOfflineSynced} />}
        {showSpreadsheetEditor && isAdmin && <SpreadsheetEditorModal onClose={() => setShowSpreadsheetEditor(false)} onSaved={() => { clearListCache(); refreshRegistry(); }} />}
        {showAdminCenter && isAdmin && <AdminCenterModal initialTab={adminCenterTab} currentUser={user} onClose={() => setShowAdminCenter(false)} onRegistryChanged={() => { clearListCache(); refreshRegistry(); }} />}
      </Suspense>
    </main>
  );
}
