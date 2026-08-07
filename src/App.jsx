import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Cloud,
  CloudOff,
  FileSpreadsheet,
  Download,
  Maximize2,
  Minimize2,
  ImagePlus,
  Leaf,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sprout,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { account, ID, isNetworkFailure, withAppwriteFailover } from './lib/appwrite';
import { CHARACTERIZATION_FIELDS, CHARACTERIZATION_GROUPS, SOURCE_RECORD_COUNT } from './lib/characterizationFields';
import { parseCharacterizationExcel } from './lib/excelImport';
import { formatBytes, prepareImageVariants } from './lib/imageTools';
import {
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN,
  SEARCH_SCOPES,
  bulkCreateRecords,
  clearQueryCache,
  deleteRecord,
  deleteStoredFiles,
  exportAllRecords,
  fileViewUrl,
  getRecord,
  listRecords,
  saveRecord,
  uploadPreparedPhotos
} from './lib/registryApi';

const APP_NAME = 'CaneSprout Registry';
const APP_VERSION = '2.1.5';
const USER_CACHE_KEY = 'sugarcane-registry-user-v212';

const GERMINATION_FIELDS = [
  { key: 'germ_trial_code', label: 'Germination trial / batch code', type: 'text' },
  { key: 'germ_location', label: 'Nursery / field location', type: 'text' },
  { key: 'germ_planting_date', label: 'Planting date', type: 'date' },
  { key: 'germ_material_type', label: 'Planting material', type: 'select', options: ['Single-bud sett', 'Two-bud sett', 'Three-bud sett', 'Bud chip', 'Whole stalk section', 'Other'] },
  { key: 'germ_buds_planted', label: 'Buds planted', type: 'number' },
  { key: 'germ_germinated_count', label: 'Germinated buds', type: 'number' },
  { key: 'germ_observation_date', label: 'Observation date', type: 'date' },
  { key: 'germ_status', label: 'Germination status', type: 'select', options: ['Planned', 'Germinating', 'Established', 'Completed', 'Failed'] },
  { key: 'germ_notes', label: 'Germination notes', type: 'textarea' }
];

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

function messageFor(error) {
  const code = Number(error?.code || error?.status || 0);
  if (code === 401) return 'Your sign-in is no longer valid. Please sign in again.';
  if (code === 404) return 'The sugarcane collection has not been set up yet. Run npm.cmd run setup:appwrite once.';
  if (isNetworkFailure(error)) return 'Appwrite is unreachable. Cached pages can still be viewed, but saving needs a connection.';
  return error?.message || String(error || 'Something went wrong.');
}

function loginMessageFor(error) {
  const code = Number(error?.code || error?.status || 0);
  const type = String(error?.type || '').toLowerCase();
  if (type === 'user_invalid_credentials' || type === 'user_not_found' || code === 401) {
    return 'Incorrect email or password. Please check your credentials and try again.';
  }
  if (type === 'user_blocked') return 'This account is blocked. Contact the registry administrator.';
  if (type === 'user_email_not_whitelisted') return 'This email is not allowed to sign in to this Appwrite project.';
  if (isNetworkFailure(error)) return 'Could not reach Appwrite. Check your connection and try again.';
  return error?.message || String(error || 'Could not sign in.');
}

function pct(record) {
  const raw = record?.germination_pct;
  if (raw === '' || raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}

function emptyForm() {
  const base = Object.fromEntries(CHARACTERIZATION_FIELDS.map((field) => [field.key, '']));
  GERMINATION_FIELDS.forEach((field) => { base[field.key] = ''; });
  return {
    ...base,
    photo_file_ids: [],
    thumb_file_ids: [],
    photo_names: [],
    thumbnail_file_id: '',
    primary_file_id: '',
    source_name: 'Manual entry',
    source_row: ''
  };
}

function Brand() {
  return (
    <div className="brand">
      <span className="brand-badge"><Sprout size={24} /></span>
      <span><strong>{APP_NAME}</strong><small>Sugarcane germination & characterization</small></span>
    </div>
  );
}

function Field({ field, value, onChange }) {
  const common = {
    value: value ?? '',
    onChange: (event) => onChange(field.key, event.target.value)
  };
  return (
    <label className={`form-field ${field.type === 'textarea' ? 'wide' : ''}`}>
      <span>{field.label}{field.column ? <em>{field.column}</em> : null}<i>Optional</i></span>
      {field.type === 'textarea' ? (
        <textarea {...common} rows={4} placeholder="Optional" />
      ) : field.type === 'select' ? (
        <select {...common}><option value="">Not provided</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
      ) : (
        <input {...common} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} placeholder="Optional" />
      )}
    </label>
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
        await withAppwriteFailover(() => account.create({ userId: ID.unique(), email: form.email.trim(), password: form.password, name: form.name.trim() || form.email.trim() }), { timeoutMs: 4500 });
      }
      try {
        await withAppwriteFailover(() => account.createEmailPasswordSession({ email: form.email.trim(), password: form.password }), { timeoutMs: 4500 });
      } catch (sessionError) {
        // If Appwrite reports an already-active session, restore it instead of
        // presenting a misleading login error. Any real credential error is
        // handled by loginMessageFor below.
        if (String(sessionError?.type || '').toLowerCase() === 'user_session_already_exists') {
          const existing = await withAppwriteFailover(() => account.get(), { timeoutMs: 3500 });
          onSignedIn(saveCachedUser(existing));
          return;
        }
        throw sessionError;
      }
      const immediate = saveCachedUser({ email: form.email.trim(), name: form.name.trim() });
      onSignedIn(immediate);
      account.get().then((user) => onSignedIn(saveCachedUser(user))).catch(() => {});
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
        <div className="auth-copy">
          <span className="eyebrow"><Leaf size={15} /> SRA sugarcane records</span>
          <h1>From bud emergence to full varietal character.</h1>
          <p>Search the characterization library without downloading the whole database, document germination observations, and attach storage-efficient field photos.</p>
          <div className="auth-metrics">
            <span><strong>{SOURCE_RECORD_COUNT}</strong> spreadsheet rows included</span>
            <span><strong>{PAGE_SIZE}</strong> records per request</span>
          </div>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-card">
          <Brand />
          <div className="auth-heading"><small>{mode === 'login' ? 'Welcome back' : 'New account'}</small><h2>{mode === 'login' ? 'Sign in to the registry' : 'Create registry account'}</h2></div>
          <form onSubmit={submit}>
            {mode === 'signup' && <label><span>Name</span><input value={form.name} onChange={(e) => { setError(''); setForm({ ...form, name: e.target.value }); }} /></label>}
            <label><span>Email</span><input type="email" required value={form.email} onChange={(e) => { setError(''); setForm({ ...form, email: e.target.value }); }} /></label>
            <label><span>Password</span><input type="password" required minLength={8} value={form.password} onChange={(e) => { setError(''); setForm({ ...form, password: e.target.value }); }} /></label>
            {error && <div className="alert error">{error}</div>}
            <button className="primary-button full" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Connecting…</> : mode === 'login' ? 'Sign in' : 'Create account'}</button>
          </form>
          <button className="text-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
            {mode === 'login' ? 'Need an account? Create one' : 'Already registered? Sign in'}
          </button>
        </div>
      </section>
    </main>
  );
}

function RecordCard({ record, onOpen }) {
  const image = fileViewUrl(record.thumbnail_file_id);
  const germPct = pct(record);
  return (
    <article className="record-card" onClick={() => onOpen(record.$id)}>
      <div className={`record-image ${image ? 'has-image' : ''}`}>
        {image ? <img src={image} alt={record.variety || 'Sugarcane'} loading="lazy" decoding="async" /> : <div className="record-placeholder"><Sprout size={38} /><span>Photo optional</span></div>}
        <span className="record-status">{record.germ_status || 'Characterized'}</span>
        {germPct !== null && <span className="rate-chip">{germPct.toFixed(1)}% germinated</span>}
      </div>
      <div className="record-body">
        <div className="record-kicker"><span>Sugarcane variety</span><ArrowUpRight size={16} /></div>
        <h3>{record.variety || 'Unnamed variety'}</h3>
        <div className="trait-mini-grid">
          <span><small>Plant habit</small><b>{record.stool_plant_habit || 'Not provided'}</b></span>
          <span><small>Leaf color</small><b>{record.leaf_color || 'Not provided'}</b></span>
          <span><small>Stalk color</small><b>{record.stalk_exposed_color || 'Not provided'}</b></span>
          <span><small>Bud shape</small><b>{record.bud_shape || 'Not provided'}</b></span>
        </div>
        <footer><span>{record.germ_location || 'Germination location not recorded'}</span><ChevronRight size={17} /></footer>
      </div>
    </article>
  );
}

function SkeletonCard() {
  return <div className="record-card skeleton"><div className="record-image" /><div className="record-body"><i /><i /><i /></div></div>;
}

function DetailModal({ recordId, onClose, onEdit, onDeleted }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let live = true;
    getRecord(recordId).then((value) => { if (live) setRecord(value); }).catch((err) => live && setError(messageFor(err))).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [recordId]);

  async function remove() {
    if (!record || !confirm(`Delete ${record.variety || 'this record'}? This also removes its stored photos.`)) return;
    setDeleting(true);
    try {
      await deleteRecord(record);
      onDeleted();
      onClose();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setDeleting(false);
    }
  }

  const photos = record?.photo_file_ids || [];
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal detail-modal">
        <header className="modal-header"><div><small>Record details</small><h2>{record?.variety || 'Sugarcane characterization'}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header>
        <div className="modal-content detail-content">
          {loading && <div className="detail-loading"><LoaderCircle className="spin" /> Loading only this record…</div>}
          {error && <div className="alert error">{error}</div>}
          {record && <>
            <section className="detail-hero">
              <div><span className="eyebrow">Characterization + germination</span><h3>{record.variety || 'Unnamed variety'}</h3><p>{record.source_name || 'Manual entry'}{record.source_row ? ` • source row ${record.source_row}` : ''}</p></div>
              <div className="detail-hero-rate"><small>Germination</small><strong>{pct(record) === null ? '—' : `${pct(record).toFixed(1)}%`}</strong></div>
            </section>

            {!!photos.length && <section className="photo-gallery">{photos.map((id, index) => <img key={id} src={fileViewUrl(id)} alt={record.photo_names?.[index] || 'Sugarcane photo'} loading="lazy" decoding="async" />)}</section>}

            <section className="detail-section"><div className="section-title"><div><small>Germination tracking</small><h3>Trial information</h3></div></div><div className="detail-grid">{GERMINATION_FIELDS.map((field) => <div key={field.key}><small>{field.label}</small><strong>{record[field.key] || 'Not provided'}</strong></div>)}<div><small>Calculated germination %</small><strong>{pct(record) === null ? 'Not available' : `${pct(record).toFixed(2)}%`}</strong></div></div></section>

            <div className="show-empty-row"><button className="secondary-button" onClick={() => setShowEmpty(!showEmpty)}>{showEmpty ? 'Hide empty traits' : 'Show all traits, including empty'}</button></div>
            {CHARACTERIZATION_GROUPS.map((group) => {
              const fields = showEmpty ? group.fields : group.fields.filter((field) => record[field.key]);
              if (!fields.length) return null;
              return <section className="detail-section" key={group.title}><div className="section-title"><div><small>Spreadsheet traits</small><h3>{group.title}</h3></div></div><div className="detail-grid">{fields.map((field) => <div key={field.key}><small>{field.label} <em>{field.column}</em></small><strong>{record[field.key] || 'Not provided'}</strong></div>)}</div></section>;
            })}
          </>}
        </div>
        {record && <footer className="modal-footer"><button className="danger-button" onClick={remove} disabled={deleting}><Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete'}</button><span className="footer-spacer" /><button className="secondary-button" onClick={() => onEdit(record)}><Pencil size={16} /> Edit</button><button className="primary-button" onClick={onClose}>Done</button></footer>}
      </section>
    </div>
  );
}

function RecordFormModal({ initial, onClose, onSaved }) {
  const editing = Boolean(initial?.$id);
  const [form, setForm] = useState(() => ({ ...emptyForm(), ...(initial || {}) }));
  const [newFiles, setNewFiles] = useState([]);
  const [removedFileIds, setRemovedFileIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function removeExisting(index) {
    const full = [...(form.photo_file_ids || [])];
    const thumbs = [...(form.thumb_file_ids || [])];
    const names = [...(form.photo_names || [])];
    const deleted = [full[index], thumbs[index]].filter(Boolean);
    full.splice(index, 1); thumbs.splice(index, 1); names.splice(index, 1);
    setRemovedFileIds((ids) => [...ids, ...deleted]);
    setForm((current) => ({
      ...current,
      photo_file_ids: full,
      thumb_file_ids: thumbs,
      photo_names: names,
      primary_file_id: full[0] || '',
      thumbnail_file_id: thumbs[0] || ''
    }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const variants = [];
      for (let index = 0; index < newFiles.length; index += 1) {
        setProgress(`Compressing photo ${index + 1} of ${newFiles.length} to WebP…`);
        variants.push(await prepareImageVariants(newFiles[index]));
      }
      let uploaded = [];
      if (variants.length) {
        setProgress('Uploading optimized full images and thumbnails…');
        uploaded = await uploadPreparedPhotos(variants, ({ done, total }) => setProgress(`Uploading photo ${done} of ${total}…`));
      }
      const next = {
        ...form,
        photo_file_ids: [...(form.photo_file_ids || []), ...uploaded.map((item) => item.fullId)],
        thumb_file_ids: [...(form.thumb_file_ids || []), ...uploaded.map((item) => item.thumbId)],
        photo_names: [...(form.photo_names || []), ...uploaded.map((item) => item.name)]
      };
      next.primary_file_id = next.photo_file_ids[0] || '';
      next.thumbnail_file_id = next.thumb_file_ids[0] || '';
      setProgress('Saving record…');
      await saveRecord(next, initial?.$id || '');
      if (removedFileIds.length) deleteStoredFiles(removedFileIds).catch(() => {});
      onSaved();
      onClose();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  const existingPhotos = form.photo_file_ids || [];
  return (
    <div className="modal-backdrop">
      <form className="modal record-form-modal" onSubmit={submit}>
        <header className="modal-header"><div><small>{editing ? 'Edit sugarcane record' : 'New sugarcane record'}</small><h2>{editing ? form.variety || 'Edit characterization' : 'Add characterization & germination data'}</h2></div><button type="button" className="icon-button" onClick={onClose}><X size={19} /></button></header>
        <div className="modal-content form-scroll">
          <div className="optional-banner"><CheckCircle2 size={18} /><div><strong>Every trait is optional.</strong><span>The form mirrors every Characterization.xlsx trait. Fill only what was actually observed.</span></div></div>
          <section className="form-section germ-section"><div className="form-section-heading"><small>Germination tracking</small><h3>Trial & emergence data</h3></div><div className="form-grid">{GERMINATION_FIELDS.map((field) => <Field key={field.key} field={field} value={form[field.key]} onChange={change} />)}</div></section>
          {CHARACTERIZATION_GROUPS.map((group) => <section className="form-section" key={group.title}><div className="form-section-heading"><small>Characterization spreadsheet</small><h3>{group.title}</h3></div><div className="form-grid">{group.fields.map((field) => <Field key={field.key} field={field} value={form[field.key]} onChange={change} />)}</div></section>)}
          <section className="form-section"><div className="form-section-heading"><small>Storage optimized</small><h3>Photos</h3></div><p className="form-hint">Images are converted in the browser to a high-quality WebP plus a small WebP thumbnail. The list loads only thumbnails; full images load only when you open a record.</p>
            {!!existingPhotos.length && <div className="edit-photo-grid">{existingPhotos.map((id, index) => <div key={id}><img src={fileViewUrl(form.thumb_file_ids?.[index] || id)} alt="Existing" loading="lazy" /><button type="button" onClick={() => removeExisting(index)}><X size={14} /> Remove</button></div>)}</div>}
            <label className="photo-drop"><ImagePlus size={24} /><span><strong>Add photos</strong><small>JPEG, PNG, WebP, HEIC/HEIF and browser-readable formats</small></span><input type="file" accept="image/*,.heic,.heif" multiple onChange={(e) => setNewFiles(Array.from(e.target.files || []).slice(0, 8))} /></label>
            {!!newFiles.length && <div className="selected-files">{newFiles.map((file) => <span key={`${file.name}-${file.size}`}>{file.name} <small>{formatBytes(file.size)}</small></span>)}</div>}
          </section>
          {error && <div className="alert error">{error}</div>}
          {progress && <div className="alert progress"><LoaderCircle className="spin" size={17} /> {progress}</div>}
        </div>
        <footer className="modal-footer"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><span className="footer-spacer" /><button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save record'}</button></footer>
      </form>
    </div>
  );
}

function ImportModal({ onClose, onImported }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function choose(file) {
    if (!file) return;
    setBusy(true); setError('');
    try { setPreview(await parseCharacterizationExcel(file)); }
    catch (err) { setError(messageFor(err)); }
    finally { setBusy(false); }
  }

  async function importRows() {
    if (!preview?.rows?.length) return;
    setBusy(true); setError('');
    try {
      const result = await bulkCreateRecords(preview.rows, ({ done, total, errors }) => setProgress(`Writing ${done}/${total} records directly to Appwrite${errors ? ` • ${errors} failed` : ''}`));
      if (result.errors.length) setError(`${result.imported} records imported. ${result.errors.length} rows failed. First error: ${result.errors[0].message}`);
      else { onImported(); onClose(); }
    } catch (err) { setError(messageFor(err)); }
    finally { setBusy(false); setProgress(''); }
  }

  return (
    <div className="modal-backdrop"><section className="modal import-modal"><header className="modal-header"><div><small>Bulk import</small><h2>Import Characterization Excel</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header><div className="modal-content">
      <div className="import-note"><FileSpreadsheet size={24} /><div><strong>The provided A:BH template is supported directly.</strong><span>The parser reads the group row + trait row and maps all 60 spreadsheet columns. Bulk import is the only time the app intentionally performs many database writes.</span></div></div>
      <button className="upload-zone" onClick={() => inputRef.current?.click()} disabled={busy}><Upload size={24} /><strong>{busy && !preview ? 'Reading workbook…' : 'Choose .xlsx / .xls file'}</strong><span>Nothing is uploaded until you confirm the preview.</span></button>
      <input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={(e) => choose(e.target.files?.[0])} />
      {preview && <><div className="import-summary"><span><small>Sheet</small><strong>{preview.sheetName}</strong></span><span><small>Layout</small><strong>{preview.layout}</strong></span><span><small>Rows</small><strong>{preview.rows.length}</strong></span></div><div className="preview-wrap"><table><thead><tr><th>#</th><th>Variety</th><th>Plant habit</th><th>Leaf color</th><th>Stalk color</th><th>Bud shape</th></tr></thead><tbody>{preview.rows.slice(0, 10).map((row, index) => <tr key={index}><td>{index + 1}</td><td>{row.variety || '—'}</td><td>{row.stool_plant_habit || '—'}</td><td>{row.leaf_color || '—'}</td><td>{row.stalk_exposed_color || '—'}</td><td>{row.bud_shape || '—'}</td></tr>)}</tbody></table>{preview.rows.length > 10 && <div className="table-more">+ {preview.rows.length - 10} additional rows</div>}</div></>}
      {progress && <div className="alert progress"><LoaderCircle className="spin" size={17} /> {progress}</div>}
      {error && <div className="alert error">{error}</div>}
    </div><footer className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancel</button><span className="footer-spacer" />{preview && <button className="primary-button" onClick={importRows} disabled={busy}>{busy ? 'Importing…' : `Import ${preview.rows.length} rows`}</button>}</footer></section></div>
  );
}

export default function App() {
  const [user, setUser] = useState(() => cachedUser());
  const [sessionState, setSessionState] = useState(user ? 'checking' : 'signed-out');
  const [online, setOnline] = useState(navigator.onLine);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchScope, setSearchScope] = useState('variety');
  const searchInputRef = useRef(null);
  const searchPanelRef = useRef(null);
  const [records, setRecords] = useState([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(Boolean(user));
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
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  // Restore Appwrite auth in the background on every launch, even when the
  // local user cache is empty. Cached identity can paint immediately, but
  // database reads wait until this verification finishes so a stale cache
  // cannot generate avoidable 401 requests.
  useEffect(() => {
    let live = true;
    const hadCachedUser = Boolean(cachedUser());
    setSessionState('checking');
    withAppwriteFailover(() => account.get(), { timeoutMs: 3500 }).then((value) => {
      if (!live) return;
      setUser(saveCachedUser(value));
      setSessionState('ready');
    }).catch((error) => {
      if (!live) return;
      const code = Number(error?.code || error?.status || 0);
      if (code === 401) {
        clearCachedUser();
        setUser(null);
        setSessionState('signed-out');
      } else if (isNetworkFailure(error) && hadCachedUser) {
        // Keep the cached identity only for the offline cache path.
        setSessionState('offline');
      } else {
        clearCachedUser();
        setUser(null);
        setSessionState('signed-out');
      }
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!window.germDesktop?.onUpdateStatus) return;
    window.germDesktop.onUpdateStatus((payload) => setUpdateState(payload?.status === 'downloading' ? `Downloading ${payload.detail || ''}` : payload?.status || ''));
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();

    // Clear the old browse/search cards as soon as the user starts typing. This
    // prevents stale unrelated entries from sitting under a new search while
    // the debounce clock is running. No Appwrite request is made here.
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
    if (!user || sessionState === 'checking') return;
    const typed = searchInput.trim();

    // 1-2 characters intentionally produce zero database reads. For 3+ chars,
    // wait until the debounced term exactly matches what is currently typed.
    if (typed && typed.length < SEARCH_MIN) {
      setLoading(false);
      setRecords([]);
      return;
    }
    if (typed.length >= SEARCH_MIN && searchTerm !== typed) {
      setLoading(true);
      setRecords([]);
      return;
    }

    const effectiveTerm = typed ? searchTerm : '';
    let live = true;
    setLoading(true);
    setListError('');
    setCacheNote('');
    listRecords({ search: effectiveTerm, scope: searchScope }).then((result) => {
      if (!live) return;
      setRecords(result.documents || []);
      setCursor(result.nextCursor || '');
      setHasMore(Boolean(result.hasMore));
      setSearchMatchMode(result.matchMode || '');
      if (result.offlineFallback) setCacheNote('Showing the last cached browse page because Appwrite is currently unreachable.');
      else if (result.fromCache) setCacheNote('Loaded from short-term cache to avoid another Appwrite database read.');
    }).catch((error) => live && setListError(messageFor(error))).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [user, sessionState, searchInput, searchTerm, searchScope, refreshKey]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setListError('');
    try {
      const result = await listRecords({ search: searchTerm, scope: searchScope, cursor });
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
    setBackupState('Starting backup…');
    setListError('');
    try {
      const documents = await exportAllRecords(({ pages, records: count }) => setBackupState(`Reading page ${pages} • ${count} records`));
      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        source: 'CaneSprout Registry direct Appwrite export',
        records: documents
      };
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
      window.location.reload();
      return;
    }
    if (updateState === 'downloaded') {
      await window.germDesktop.installUpdate?.();
      return;
    }
    setUpdateState('checking');
    try { await window.germDesktop.checkForUpdates?.(); } catch { setUpdateState('error'); }
  }

  function goToRegistrySearch() {
    searchPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select?.();
    }, 160);
  }

  async function signOut() {
    account.deleteSession({ sessionId: 'current' }).catch(() => {});
    clearCachedUser();
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
          <span className={`connection ${online ? 'online' : 'offline'}`}>{online ? <Cloud size={17} /> : <CloudOff size={17} />}<b>{online ? 'Online' : 'Offline'}</b><small>{sessionState === 'checking' ? 'Checking session quietly…' : sessionState === 'offline' ? 'Cached session' : 'Appwrite ready'}</small></span>
          <span className="user-chip"><b>{user.name || user.email?.split('@')[0] || 'User'}</b><small>{user.email}</small></span>
          {window.germDesktop && <div className="desktop-controls"><button className="icon-button" title="Minimize" onClick={() => window.germDesktop.minimize?.()}><Minimize2 size={17} /></button><button className="icon-button" title="Full screen" onClick={() => window.germDesktop.toggleFullscreen?.()}><Maximize2 size={17} /></button></div>}
          <button className="icon-button" title="Sign out" onClick={signOut}><LogOut size={18} /></button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-copy"><span className="eyebrow"><Sprout size={15} /> Sugarcane research library</span><h1>Germination records with the full characterization sheet built in.</h1><p>Every trait from Characterization.xlsx is available when you add or edit a variety, but none of them are mandatory. Search stays server-side so the browser never downloads the entire collection.</p><div className="hero-actions"><button className="primary-button" onClick={() => { setEditRecord(null); setShowForm(true); }}><Plus size={17} /> New sugarcane record</button><button className="secondary-button" onClick={() => setShowImport(true)}><FileSpreadsheet size={17} /> Import workbook</button></div></div>
        <div className="hero-stats"><div><small>Source library</small><strong>{SOURCE_RECORD_COUNT}</strong><span>spreadsheet rows included</span></div><div><small>Database page</small><strong>{PAGE_SIZE}</strong><span>records maximum per request</span></div><div><small>Search delay</small><strong>{SEARCH_DEBOUNCE_MS} ms</strong><span>debounced Appwrite search</span></div><div><small>Photos</small><strong>WebP</strong><span>full + thumbnail variants</span></div></div>
      </section>

      <section className="registry-section" id="registry">
        <div className="registry-toolbar">
          <div><span className="eyebrow">Characterization registry</span><h2>Sugarcane varieties</h2><p>Initial browsing loads only {PAGE_SIZE} lean records. Full traits and full-resolution photos are requested only when a card is opened.</p></div>
          <div className="toolbar-actions"><button className="icon-button bordered" title="Refresh current page" onClick={() => { clearQueryCache(); setRefreshKey((value) => value + 1); }}><RefreshCw size={18} /></button></div>
        </div>

        <div className="search-panel" id="registry-search" ref={searchPanelRef}>
          <Search size={20} />
          <input
            ref={searchInputRef}
            value={searchInput}
            onChange={(e) => { setSearchMatchMode(''); setSearchInput(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Escape') { setSearchInput(''); e.currentTarget.blur(); } }}
            placeholder={searchScope === 'all' ? 'Search any characterization trait or keyword…' : `Search ${SEARCH_SCOPES[searchScope].label.toLowerCase()}…`}
            aria-label="Search sugarcane registry"
          />
          <label className="search-scope">
            <span>Search in</span>
            <select value={searchScope} onChange={(e) => { setSearchScope(e.target.value); setRecords([]); setCursor(''); setHasMore(false); setSearchMatchMode(''); }}>
              {Object.entries(SEARCH_SCOPES).map(([value, config]) => <option key={value} value={value}>{config.label}</option>)}
            </select>
          </label>
          {searchInput && <button className="clear-search" onClick={() => { setSearchMatchMode(''); setSearchInput(''); searchInputRef.current?.focus(); }} aria-label="Clear search"><X size={16} /></button>}
          <span>{searchInput.trim().length > 0 && searchInput.trim().length < SEARCH_MIN ? `${SEARCH_MIN - searchInput.trim().length} more character${SEARCH_MIN - searchInput.trim().length === 1 ? '' : 's'} • 0 reads` : searchInput.trim() ? `${SEARCH_SCOPES[searchScope].label} • ${searchScope === 'all' ? 'keyword index' : 'substring index'}` : 'Browse first 30'}</span>
        </div>
        <div className="query-policy"><CheckCircle2 size={16} /><span>30 records/request • 400 ms debounce • indexed field filters • cursor Load More • lean list fields • detail-on-open • no polling • no Realtime • no total counts</span></div>
        {!loading && searchInput.trim().length >= SEARCH_MIN && searchTerm === searchInput.trim() && <div className="search-result-note"><b>{records.length}</b><span>{searchMatchMode === 'exact' ? `Exact ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match` : `${records.length === 1 ? 'match' : 'matches'} loaded`} for “{searchTerm}” in {SEARCH_SCOPES[searchScope].label}.{hasMore ? ` More matches are available with Load ${PAGE_SIZE} more.` : ''}</span></div>}
        {cacheNote && <div className="alert info">{cacheNote}</div>}
        {listError && <div className="alert error">{listError}</div>}

        <div className="record-grid">
          {loading ? Array.from({ length: 6 }, (_, index) => <SkeletonCard key={index} />) : records.map((record) => <RecordCard key={record.$id} record={record} onOpen={setDetailId} />)}
        </div>
        {!loading && !records.length && <div className="empty-state"><Sprout size={34} /><h3>{searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? `Type at least ${SEARCH_MIN} characters` : searchInput.trim() ? 'No matching sugarcane records' : 'No sugarcane records available'}</h3><p>{searchInput.trim() && searchInput.trim().length < SEARCH_MIN ? 'Short searches are blocked locally, so Appwrite receives zero search requests.' : searchInput.trim() ? `No ${SEARCH_SCOPES[searchScope].label.toLowerCase()} match was returned for “${searchInput.trim()}”. Try another term or switch the search field.` : 'Add or import a record to begin.'}</p></div>}
        {!loading && hasMore && <div className="load-more-row"><button className="secondary-button load-more" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin" size={17} /> Loading {PAGE_SIZE} more…</> : `Load ${PAGE_SIZE} more`} </button><small>Cursor pagination continues after the last loaded record.</small></div>}
      </section>

      <footer className="app-footer"><span><Sprout size={15} /> {APP_NAME} v{APP_VERSION}</span><span>Static Vite frontend • direct Appwrite Web SDK • Vercel CDN</span></footer>

      {detailId && <DetailModal recordId={detailId} onClose={() => setDetailId('')} onEdit={openEdit} onDeleted={() => setRefreshKey((value) => value + 1)} />}
      {showForm && <RecordFormModal initial={editRecord} onClose={() => { setShowForm(false); setEditRecord(null); }} onSaved={() => setRefreshKey((value) => value + 1)} />}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={() => setRefreshKey((value) => value + 1)} />}
    </main>
  );
}
