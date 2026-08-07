import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Beaker,
  ChevronDown,
  Database,
  Dna,
  Eye,
  FileSpreadsheet,
  FlaskConical,
  ImagePlus,
  Leaf,
  Maximize2,
  Minimize2,
  MonitorDown,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  TestTube2,
  Trash2,
  X
} from 'lucide-react';
import { account, APPWRITE_ENDPOINT, COLLECTIONS, ID, MEDIA_BUCKET_ID, getActiveAppwriteEndpoint, storage, withAppwriteFailover } from './lib/appwrite';
import {
  deleteLocal,
  deleteMediaBlob,
  getAllCached,
  getLastSync,
  getMediaBlob,
  makeId,
  mediaStoragePath,
  outboxCount,
  parseMediaStoragePath,
  saveLocal,
  saveMediaLocal,
  syncAll
} from './lib/offlineStore';
import { parseGermExcel } from './lib/excelImport';
import { compressImageToWebP, formatBytes } from './lib/imageTools';

const REGISTER_GROUPS = [
  {
    id: 'identity',
    title: 'Identity & taxonomy',
    subtitle: 'Core naming and classification details',
    fields: [
      ['scientific_name', 'Scientific name', 'text', true],
      ['common_name', 'Common name', 'text', false],
      ['genus', 'Genus', 'text', true],
      ['species', 'Species', 'text', true],
      ['subspecies', 'Subspecies / variant', 'text', false],
      ['organism_type', 'Organism type', 'select', true, ['Bacterium', 'Fungus', 'Virus', 'Protozoan', 'Archaea', 'Algae', 'Other']],
      ['taxonomy_id', 'Taxonomy ID', 'text', false]
    ]
  },
  {
    id: 'morphology',
    title: 'Morphology & physiology',
    subtitle: 'Cell form, growth behavior, and visible characteristics',
    fields: [
      ['gram_stain', 'Gram reaction', 'select', false, ['Gram-positive', 'Gram-negative', 'Gram-variable', 'Not applicable', 'Unknown']],
      ['cell_shape', 'Cell / particle shape', 'select', false, ['Coccus', 'Bacillus / rod', 'Coccobacillus', 'Vibrio', 'Spiral', 'Filamentous', 'Pleomorphic', 'Yeast-like', 'Mold / hyphal', 'Other', 'Unknown']],
      ['cell_arrangement', 'Cell arrangement', 'select', false, ['Single', 'Pairs / diplo', 'Chains', 'Clusters', 'Tetrads', 'Palisades', 'Filaments', 'Other', 'Unknown']],
      ['motility', 'Motility', 'select', false, ['Motile', 'Non-motile', 'Variable', 'Unknown']],
      ['spore_forming', 'Spore forming', 'select', false, ['Yes', 'No', 'Variable', 'Unknown']],
      ['capsule', 'Capsule', 'select', false, ['Present', 'Absent', 'Variable', 'Unknown']],
      ['oxygen_requirement', 'Oxygen requirement', 'select', false, ['Obligate aerobe', 'Obligate anaerobe', 'Facultative anaerobe', 'Microaerophile', 'Aerotolerant anaerobe', 'Unknown']],
      ['pigmentation', 'Pigmentation', 'text', false],
      ['colony_morphology', 'Colony morphology', 'textarea', false],
      ['metabolism', 'Metabolism / biochemical traits', 'textarea', false],
      ['optimal_temperature', 'Optimal temperature (°C)', 'number', false],
      ['optimal_ph', 'Optimal pH', 'number', false],
      ['growth_medium', 'Preferred growth medium', 'text', false]
    ]
  },
  {
    id: 'ecology',
    title: 'Ecology & pathogenic traits',
    subtitle: 'Habitat, host relationship, transmission, and virulence',
    fields: [
      ['habitat', 'Typical habitat / niche', 'textarea', false],
      ['host_range', 'Host range', 'text', false],
      ['disease_association', 'Disease / condition association', 'textarea', false],
      ['transmission_mode', 'Transmission mode', 'text', false],
      ['virulence_factors', 'Virulence factors', 'textarea', false],
      ['toxin_production', 'Toxin production', 'textarea', false],
      ['serotype', 'Serotype / serovar', 'text', false],
      ['notes', 'Additional microorganism notes', 'textarea', false]
    ]
  },
  {
    id: 'strain',
    title: 'Strain & biosafety',
    subtitle: 'Primary strain identity and handling classification',
    fields: [
      ['strain_name', 'Strain name', 'text', true],
      ['pathogenic_status', 'Pathogenic status', 'select', true, ['Pathogenic', 'Opportunistic', 'Non-pathogenic', 'Unknown']],
      ['biosafety_level', 'Biosafety level', 'select', true, ['BSL-1', 'BSL-2', 'BSL-3', 'BSL-4', 'Not assigned']]
    ]
  },
  {
    id: 'sample',
    title: 'Sample & collection',
    subtitle: 'Where the primary isolate or specimen came from',
    fields: [
      ['source', 'Sample source', 'text', true],
      ['collection_date', 'Collection date', 'date', true],
      ['location', 'Location', 'text', true],
      ['host_id', 'Host ID', 'text', false],
      ['specimen_type', 'Specimen type', 'text', true]
    ]
  }
];

const REGISTER_FIELDS = REGISTER_GROUPS.flatMap((group) => group.fields);
const CORE_MICROORGANISM_KEYS = ['scientific_name', 'genus', 'species', 'organism_type', 'taxonomy_id'];
const MICROORGANISM_TRAIT_FIELDS = REGISTER_GROUPS
  .filter((group) => ['identity', 'morphology', 'ecology'].includes(group.id))
  .flatMap((group) => group.fields
    .filter(([key]) => !CORE_MICROORGANISM_KEYS.includes(key))
    .map((field) => ({ key: field[0], label: field[1], category: group.title })));
const MICROORGANISM_TRAIT_KEYS = MICROORGANISM_TRAIT_FIELDS.map((field) => field.key);


const CHILD_SCHEMAS = {
  observations: {
    title: 'Observation',
    icon: Activity,
    fields: [
      ['trait_name', 'Trait name', 'text', true],
      ['observed_value', 'Observed value', 'text', true],
      ['unit', 'Unit', 'text', false],
      ['method', 'Method', 'text', true],
      ['observation_date', 'Observation date', 'date', true],
      ['observer', 'Observer', 'text', true]
    ]
  },
  lab_tests: {
    title: 'Laboratory test',
    icon: FlaskConical,
    fields: [
      ['test_type', 'Test type', 'text', true],
      ['test_name', 'Test name', 'text', true],
      ['result', 'Result', 'textarea', true],
      ['unit', 'Unit', 'text', false],
      ['method', 'Method', 'text', true]
    ]
  },
  antimicrobial_results: {
    title: 'Antimicrobial susceptibility result',
    icon: TestTube2,
    fields: [
      ['antimicrobial', 'Antimicrobial agent', 'text', true],
      ['mic_value', 'MIC value', 'number', false],
      ['zone_diameter', 'Zone diameter (mm)', 'number', false],
      ['interpretation', 'Interpretation', 'select', true, ['Susceptible', 'Intermediate', 'Resistant', 'Not interpreted']],
      ['standard_used', 'Standard used', 'text', false]
    ]
  },
  sequences: {
    title: 'Sequence record',
    icon: Dna,
    fields: [
      ['marker', 'Marker', 'text', true],
      ['accession_number', 'Accession number', 'text', false],
      ['sequence_file', 'Sequence file / URL / path', 'text', false]
    ]
  },
  media: {
    title: 'Media record',
    icon: MonitorDown,
    fields: [
      ['media_type', 'Media type', 'select', true, ['Microscope image', 'Colony image', 'Culture image', 'Sequence file', 'Report', 'Other']],
      ['file_path', 'File path / URL', 'text', true],
      ['caption', 'Caption', 'textarea', false]
    ]
  }
};

const EMPTY_RECORDS = Object.fromEntries(Object.values(COLLECTIONS).map((key) => [key, []]));

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' }).format(date);
}

function syncTimeLabel(value) {
  if (!value) return 'Never synced';
  return `Last sync ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: '2-digit' }).format(new Date(value))}`;
}

function withTimeout(promise, milliseconds = 4500, message = 'Appwrite connection timed out') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), milliseconds);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function appwriteErrorMessage(error) {
  const text = String(error?.message || error || '').toLowerCase();
  if (text.includes('failed to fetch') || text.includes('fetch failed') || text.includes('timed out') || text.includes('timeout')) {
    return 'Appwrite is unreachable right now. Open the local registry and keep working offline; your changes will stay queued for sync.';
  }
  return error?.message || 'Could not connect to Appwrite.';
}

function Field({ spec, value, onChange, optional = false }) {
  const [key, label, type, required, options] = spec;
  const isRequired = optional ? false : required;
  return (
    <div className={`field ${type === 'textarea' ? 'full' : ''}`}>
      <label htmlFor={key}>{label}{isRequired ? ' *' : ''}</label>
      {type === 'select' ? (
        <select id={key} required={isRequired} value={value ?? ''} onChange={(e) => onChange(key, e.target.value)}>
          <option value="">Select…</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : type === 'textarea' ? (
        <textarea id={key} required={isRequired} value={value ?? ''} onChange={(e) => onChange(key, e.target.value)} />
      ) : (
        <input id={key} type={type} step={type === 'number' ? 'any' : undefined} required={isRequired} value={value ?? ''} onChange={(e) => onChange(key, e.target.value)} />
      )}
    </div>
  );
}


function TraitForm({ form, onChange }) {
  const [openSections, setOpenSections] = useState(() => Object.fromEntries(REGISTER_GROUPS.map((group) => [group.id, false])));

  function toggleSection(id) {
    setOpenSections((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <div className="trait-form">
      {REGISTER_GROUPS.map((group) => {
        const open = Boolean(openSections[group.id]);
        return (
          <section className={`trait-section ${open ? 'open' : ''}`} key={group.id}>
            <button className="trait-section-toggle" type="button" onClick={() => toggleSection(group.id)} aria-expanded={open}>
              <span>
                <strong>{group.title}</strong>
                <small>{group.subtitle}</small>
              </span>
              <span className="trait-toggle-actions">
                <span className="trait-toggle-icon"><ChevronDown size={17} /></span>
              </span>
            </button>
            <div className="trait-section-shell" aria-hidden={!open}>
              <div className="trait-section-content">
                <div className="form-grid">
                  {group.fields.map((spec) => <Field key={spec[0]} spec={spec} value={form[spec[0]]} onChange={onChange} optional />)}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}


function isPhotoMedia(row) {
  const type = String(row?.media_type || '').toLowerCase();
  return Boolean(parseMediaStoragePath(row?.file_path)) || type.includes('image') || type.includes('photo');
}

function mediaRemoteUrl(filePath) {
  const target = parseMediaStoragePath(filePath);
  if (!target) return String(filePath || '');
  try {
    return String(storage.getFileView({ bucketId: target.bucketId, fileId: target.fileId }));
  } catch {
    return '';
  }
}

function PhotoCard({ row, onDelete }) {
  const [source, setSource] = useState('');
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let localUrl = '';
    (async () => {
      const local = await getMediaBlob(row.$id).catch(() => null);
      if (cancelled) return;
      if (local?.blob) {
        localUrl = URL.createObjectURL(local.blob);
        setSource(localUrl);
        setMetadata(local);
      } else {
        setSource(mediaRemoteUrl(row.file_path));
      }
    })();
    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [row.$id, row.file_path]);

  return (
    <article className="photo-card">
      <div className="photo-frame">
        {source ? <img src={source} alt={row.caption || 'Germ photo'} loading="lazy" /> : <div className="photo-placeholder"><ImagePlus size={24} /><span>Photo unavailable</span></div>}
      </div>
      <div className="photo-meta">
        <div>
          <strong>{row.caption || 'Germ photo'}</strong>
          <small>
            WebP{metadata?.webpSize ? ` • ${formatBytes(metadata.webpSize)}` : ''}
            {metadata?.width ? ` • ${metadata.width}×${metadata.height}` : ''}
            {row._pending ? ' • queued' : ''}
          </small>
        </div>
        <button className="button small danger" type="button" onClick={() => onDelete(row)} aria-label="Delete photo"><Trash2 size={14} /></button>
      </div>
    </article>
  );
}

function RegistryEntryCard({ row, summary, onOpen }) {
  const [source, setSource] = useState('');
  const photo = summary?.photo || null;

  useEffect(() => {
    let cancelled = false;
    let localUrl = '';
    setSource('');
    if (!photo) return () => {};

    (async () => {
      const local = await getMediaBlob(photo.$id).catch(() => null);
      if (cancelled) return;
      if (local?.blob) {
        localUrl = URL.createObjectURL(local.blob);
        setSource(localUrl);
      } else {
        setSource(mediaRemoteUrl(photo.file_path));
      }
    })();

    return () => {
      cancelled = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [photo?.$id, photo?.file_path]);

  const scientificName = row.scientific_name || 'Unidentified microorganism';
  const commonName = summary?.commonName || row.common_name || 'Common name not recorded';
  const location = summary?.location || 'Location not recorded';
  const genusSpecies = [row.genus, row.species].filter(Boolean).join(' ') || 'Genus / species unassigned';

  return (
    <article
      className="registry-entry-card"
      role="button"
      tabIndex={0}
      aria-label={`Open ${scientificName} details`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className={`registry-entry-media ${source ? 'has-photo' : ''}`}>
        {source ? (
          <img
            src={source}
            alt={photo?.caption || `${scientificName} photo`}
            loading="lazy"
            decoding="async"
            onError={() => setSource('')}
          />
        ) : (
          <div className="registry-entry-placeholder">
            <ImagePlus size={32} />
            <span>{photo ? 'Photo unavailable' : 'Optional photo not added'}</span>
          </div>
        )}
        <span className="registry-entry-type">{row.organism_type || 'Unspecified'}</span>
        <button
          className="registry-entry-view"
          type="button"
          aria-label={`View ${scientificName}`}
          onClick={(event) => { event.stopPropagation(); onOpen(); }}
        >
          <Eye size={17} />
        </button>
      </div>

      <div className="registry-entry-body">
        <div className="registry-entry-kicker">
          <span>{row.microorganism_id || row.$id}</span>
          <span>{row._pending ? 'QUEUED' : 'SYNCED'}</span>
        </div>
        <h3>{scientificName}</h3>
        <p className="registry-entry-common">{commonName}</p>
        <div className="registry-entry-rule" />
        <div className="registry-entry-detail"><Leaf size={15} /><span>{genusSpecies}</span></div>
        <div className="registry-entry-detail"><Database size={15} /><span>{location}</span></div>
        <div className="registry-entry-stats">
          <span><strong>{summary?.strainCount || 0}</strong> strains</span>
          <span><strong>{summary?.sampleCount || 0}</strong> samples</span>
          <span><strong>{summary?.drugCount || 0}</strong> tests</span>
        </div>
      </div>
    </article>
  );
}

function PhotoPickerSummary({ files, onRemove }) {
  if (!files.length) return <div className="photo-picker-empty">No photos selected.</div>;
  return (
    <div className="photo-picker-list">
      {files.map((file, index) => (
        <div className="photo-picker-row" key={`${file.name}-${file.size}-${index}`}>
          <div><strong>{file.name}</strong><small>{formatBytes(file.size)} • will be converted to WebP</small></div>
          <button type="button" className="button small" onClick={() => onRemove(index)}><X size={13} /></button>
        </div>
      ))}
    </div>
  );
}


function GermLogo({ compact = false }) {
  return (
    <span className={`germ-logo ${compact ? 'compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" role="img">
        <path className="germ-logo-stack top" d="M22 24c0-2.5 4.9-4.5 11-4.5s11 2 11 4.5-4.9 4.5-11 4.5-11-2-11-4.5Z" />
        <path className="germ-logo-stack mid" d="M22 24v8.2c0 2.5 4.9 4.5 11 4.5s11-2 11-4.5V24" />
        <path className="germ-logo-stack low" d="M22 32.2v8.3c0 2.5 4.9 4.5 11 4.5s11-2 11-4.5v-8.3" />
        <circle className="germ-logo-dot dot-a" cx="25.5" cy="23.2" r="2.1" />
        <circle className="germ-logo-dot dot-b" cx="39.2" cy="34.6" r="1.7" />
        <circle className="germ-logo-dot dot-c" cx="29.8" cy="42.6" r="1.4" />
        <path className="germ-logo-leaf" d="M44.4 14.4c5.4-.2 8.7 2.3 10.3 7.6-5 .7-8.6-1.7-10.3-7.6Z" />
        <path className="germ-logo-stem" d="M44.8 14.8c2 2.1 4.2 4.7 5.7 7.7" />
      </svg>
    </span>
  );
}

function LuntianSignature() {
  return (
    <div className="luntian-signature">
      <Leaf size={13} />
      <span>Powered by <strong>Luntian</strong></span>
    </div>
  );
}

function Modal({ title, children, onClose, onSubmit, submitLabel = 'Save record', submitDisabled = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={onSubmit}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="button small" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">
          <button type="button" className="button" onClick={onClose}>Cancel</button>
          <button className="button primary" type="submit" disabled={submitDisabled}>{submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cachedUser = (() => {
    try { return JSON.parse(localStorage.getItem('germdatabase-user') || 'null'); } catch { return null; }
  })();

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') {
        await withAppwriteFailover(() => withTimeout(account.create({ userId: ID.unique(), email: form.email.trim(), password: form.password, name: form.name.trim() }), 7500));
      }
      await withAppwriteFailover(() => withTimeout(account.createEmailPasswordSession({ email: form.email.trim(), password: form.password }), 7500));
      const user = await withAppwriteFailover(() => withTimeout(account.get(), 7500));
      localStorage.setItem('germdatabase-user', JSON.stringify({ id: user.$id, name: user.name, email: user.email }));
      onAuthenticated(user);
    } catch (err) {
      setError(appwriteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function openOffline() {
    const localUser = cachedUser || { id: 'local-user', name: 'Local user', email: '' };
    onAuthenticated({ $id: localUser.id, name: localUser.name, email: localUser.email, offline: true, networkFallback: true });
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-side">
          <div className="auth-brandline"><GermLogo /><div className="eyebrow" style={{ color: '#dceaff' }}>SRA • Microbiology Registry</div></div>
          <h1>GermDatabase</h1>
          <p>Register microorganisms, strains, samples, observations, laboratory tests, antimicrobial susceptibility results, sequences, and media in one offline-first scientific registry.</p>
        </div>
        <div className="auth-form">
          <h2>{mode === 'login' ? 'Sign in' : 'Create account'}</h2>
          <p>Appwrite project: GermDatabase • Frankfurt</p>
          <form onSubmit={submit}>
            {mode === 'signup' && <div className="field"><label>Name *</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>}
            <div className="field"><label>Email *</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Password *</label><input type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
            {error && <div className="error-box">{error}</div>}
            <button className="button primary" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
            <button type="button" className="button" onClick={openOffline}>Open local registry</button>
            <small className="auth-local-note">Works without Appwrite. Local changes stay queued until you reconnect.</small>
          </form>
          <div className="auth-switch">
            {mode === 'login' ? 'Need an account? ' : 'Already registered? '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'Create one' : 'Sign in'}</button>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [records, setRecords] = useState(EMPTY_RECORDS);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerForm, setRegisterForm] = useState({});
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [editTargets, setEditTargets] = useState({ strainId: null, sampleId: null });
  const [childModal, setChildModal] = useState(null);
  const [childForm, setChildForm] = useState({});
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [pending, setPending] = useState(0);
  const [lastSync, setLastSync] = useState(0);
  const [updateStatus, setUpdateStatus] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [registerPhotos, setRegisterPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNotice, setPhotoNotice] = useState('');
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const excelInputRef = useRef(null);
  const photoInputRef = useRef(null);
  const registerPhotoInputRef = useRef(null);

  async function refreshLocal() {
    const [all, count, last] = await Promise.all([getAllCached(), outboxCount(), getLastSync()]);
    setRecords({ ...EMPTY_RECORDS, ...all });
    setPending(count);
    setLastSync(last);
  }

  async function performSync() {
    if (!navigator.onLine || syncing || user?.offline) return;
    setSyncing(true);
    setSyncError('');
    try {
      await withAppwriteFailover(() => syncAll());
      await refreshLocal();
    } catch (error) {
      setSyncError(error?.message || 'Sync failed. Local changes are still safe.');
      await refreshLocal();
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refreshLocal();
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem('germdatabase-user') || 'null'); } catch {}

      if (navigator.onLine) {
        try {
          const current = await withAppwriteFailover(() => withTimeout(account.get(), 6500));
          if (!cancelled) {
            setUser(current);
            localStorage.setItem('germdatabase-user', JSON.stringify({ id: current.$id, name: current.name, email: current.email }));
          }
        } catch (error) {
          if (!cancelled && cached) {
            setUser({ $id: cached.id, name: cached.name, email: cached.email, offline: true, networkFallback: true });
            setSyncError(`Appwrite unavailable at ${getActiveAppwriteEndpoint() || APPWRITE_ENDPOINT}. Working from the local cache.`);
          }
        }
      } else if (cached && !cancelled) {
        setUser({ $id: cached.id, name: cached.name, email: cached.email, offline: true, networkFallback: true });
      }
      if (!cancelled) setAuthReady(true);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!user || user.offline || !navigator.onLine) return;
    performSync();
  }, [user]);

  useEffect(() => {
    const onOnline = () => { setOnline(true); if (user && !user.offline) performSync(); };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, [user, syncing]);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add('visible'));
    }, { threshold: .08 });
    const timer = setTimeout(() => document.querySelectorAll('.reveal').forEach((el) => observer.observe(el)), 40);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [records, selectedId]);

  useEffect(() => {
    if (!window.germDesktop) return;
    window.germDesktop.isFullscreen().then(setIsFullscreen).catch(() => {});
    window.germDesktop.onUpdateStatus((payload) => setUpdateStatus(`${payload.status}${payload.detail ? ` • ${payload.detail}` : ''}`));
  }, []);

  const selected = records.microorganisms.find((row) => row.$id === selectedId) || null;
  const selectedStrains = useMemo(() => records.strains.filter((row) => row.microorganism_id === selectedId), [records.strains, selectedId]);
  const selectedStrainIds = useMemo(() => new Set(selectedStrains.map((row) => row.$id)), [selectedStrains]);
  const selectedSamples = useMemo(() => records.samples.filter((row) => selectedStrainIds.has(row.strain_id)), [records.samples, selectedStrainIds]);
  const selectedSampleIds = useMemo(() => new Set(selectedSamples.map((row) => row.$id)), [selectedSamples]);
  const selectedTraitRows = useMemo(() => records.microorganism_traits.filter((row) => row.microorganism_id === selectedId), [records.microorganism_traits, selectedId]);
  const selectedTraitMap = useMemo(() => Object.fromEntries(selectedTraitRows.map((row) => [row.trait_key, row.trait_value])), [selectedTraitRows]);
  const traitValue = (key) => selectedTraitMap[key] ?? selected?.[key] ?? '';
  const hasAnyTrait = MICROORGANISM_TRAIT_KEYS.some((key) => Boolean(traitValue(key)));

  const organismTypes = useMemo(() => ['All', ...Array.from(new Set(records.microorganisms.map((row) => row.organism_type).filter(Boolean))).sort()], [records.microorganisms]);
  const visibleMicrobes = useMemo(() => records.microorganisms.filter((row) => {
    if (typeFilter !== 'All' && row.organism_type !== typeFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const traitText = records.microorganism_traits
      .filter((trait) => trait.microorganism_id === row.$id)
      .map((trait) => `${trait.trait_label || ''} ${trait.trait_value || ''}`)
      .join(' ');
    return [row.scientific_name, row.common_name, row.genus, row.species, row.subspecies, row.organism_type, row.taxonomy_id, row.gram_stain, row.cell_shape, traitText]
      .some((value) => String(value || '').toLowerCase().includes(q));
  }), [records.microorganisms, records.microorganism_traits, search, typeFilter]);

  const registrySummaries = useMemo(() => {
    const summaries = new Map(records.microorganisms.map((row) => [row.$id, {
      strainCount: 0,
      sampleCount: 0,
      drugCount: 0,
      photo: null,
      commonName: '',
      location: ''
    }]));
    const strainToMicrobe = new Map();
    const sampleToMicrobe = new Map();

    for (const strain of records.strains) {
      strainToMicrobe.set(strain.$id, strain.microorganism_id);
      const summary = summaries.get(strain.microorganism_id);
      if (summary) summary.strainCount += 1;
    }

    for (const sample of records.samples) {
      const microorganismId = strainToMicrobe.get(sample.strain_id);
      if (!microorganismId) continue;
      sampleToMicrobe.set(sample.$id, microorganismId);
      const summary = summaries.get(microorganismId);
      if (!summary) continue;
      summary.sampleCount += 1;
      if (!summary.location && sample.location) summary.location = sample.location;
    }

    for (const result of records.antimicrobial_results) {
      const microorganismId = sampleToMicrobe.get(result.sample_id);
      const summary = summaries.get(microorganismId);
      if (summary) summary.drugCount += 1;
    }

    for (const media of records.media) {
      if (!isPhotoMedia(media)) continue;
      const microorganismId = sampleToMicrobe.get(media.sample_id);
      const summary = summaries.get(microorganismId);
      if (summary && !summary.photo) summary.photo = media;
    }

    for (const trait of records.microorganism_traits) {
      if (trait.trait_key !== 'common_name' || !trait.trait_value) continue;
      const summary = summaries.get(trait.microorganism_id);
      if (summary && !summary.commonName) summary.commonName = trait.trait_value;
    }

    return summaries;
  }, [records.microorganisms, records.strains, records.samples, records.antimicrobial_results, records.media, records.microorganism_traits]);

  function recordsForSelected(collection) {
    if (collection === 'sequences') return records.sequences.filter((row) => selectedStrainIds.has(row.strain_id));
    return records[collection].filter((row) => selectedSampleIds.has(row.sample_id));
  }

  async function attachPhotoFiles(files, sampleId) {
    const selectedFiles = Array.from(files || []).slice(0, 12);
    const stats = { count: 0, original: 0, webp: 0, errors: [] };
    for (const file of selectedFiles) {
      try {
        const converted = await compressImageToWebP(file);
        const mediaId = makeId('media');
        await saveMediaLocal(mediaId, {
          media_id: mediaId,
          sample_id: sampleId,
          media_type: 'Germ photo',
          file_path: mediaStoragePath(mediaId, MEDIA_BUCKET_ID),
          caption: String(file.name || 'Germ photo').replace(/\.[^.]+$/, '')
        }, converted.blob, converted);
        stats.count += 1;
        stats.original += converted.originalSize;
        stats.webp += converted.webpSize;
      } catch (error) {
        stats.errors.push(error?.message || `Could not process ${file.name}`);
      }
    }
    return stats;
  }

  async function createGermFromData(form, photoFiles = []) {
    const microorganismId = makeId('micro');
    const strainId = makeId('strain');
    const sampleId = makeId('sample');
    const clean = (value) => String(value ?? '').trim();
    const strainKeys = ['strain_name', 'pathogenic_status', 'biosafety_level'];
    const sampleKeys = ['source', 'collection_date', 'location', 'host_id', 'specimen_type'];
    const hasStrainInput = strainKeys.some((key) => clean(form[key]));
    const hasSampleInput = sampleKeys.some((key) => clean(form[key])) || photoFiles.length > 0;

    await saveLocal(COLLECTIONS.microorganisms, microorganismId, {
      microorganism_id: microorganismId,
      scientific_name: clean(form.scientific_name),
      genus: clean(form.genus),
      species: clean(form.species),
      organism_type: clean(form.organism_type),
      taxonomy_id: clean(form.taxonomy_id)
    });

    for (const trait of MICROORGANISM_TRAIT_FIELDS) {
      const value = clean(form[trait.key]);
      if (!value) continue;
      const traitId = makeId('trait');
      await saveLocal(COLLECTIONS.microorganism_traits, traitId, {
        trait_id: traitId,
        microorganism_id: microorganismId,
        category: trait.category,
        trait_key: trait.key,
        trait_label: trait.label,
        trait_value: value
      });
    }

    if (hasStrainInput || hasSampleInput) {
      await saveLocal(COLLECTIONS.strains, strainId, {
        strain_id: strainId,
        microorganism_id: microorganismId,
        strain_name: clean(form.strain_name),
        pathogenic_status: clean(form.pathogenic_status),
        biosafety_level: clean(form.biosafety_level)
      });
    }

    if (hasSampleInput) {
      await saveLocal(COLLECTIONS.samples, sampleId, {
        sample_id: sampleId,
        strain_id: strainId,
        source: clean(form.source),
        collection_date: clean(form.collection_date),
        location: clean(form.location),
        host_id: clean(form.host_id),
        specimen_type: clean(form.specimen_type)
      });
    }

    const photoStats = photoFiles.length ? await attachPhotoFiles(photoFiles, sampleId) : null;
    return { microorganismId, photoStats };
  }

  async function registerGerm(e) {
    e.preventDefault();
    setPhotoBusy(true);
    setPhotoNotice('');
    try {
      const { microorganismId, photoStats } = await createGermFromData(registerForm, registerPhotos);
      setRegisterOpen(false);
      setRegisterForm({});
      setRegisterPhotos([]);
      await refreshLocal();
      setSelectedId(microorganismId);
      if (photoStats?.count) {
        setPhotoNotice(`${photoStats.count} photo${photoStats.count === 1 ? '' : 's'} converted to WebP: ${formatBytes(photoStats.original)} → ${formatBytes(photoStats.webp)}.`);
      }
      if (photoStats?.errors?.length) setSyncError(photoStats.errors.join(' '));
      if (navigator.onLine && !user?.offline) performSync();
    } finally {
      setPhotoBusy(false);
    }
  }

  async function ensureSelectedPhotoSample() {
    if (!selected) throw new Error('Open a germ before adding photos.');
    if (selectedSamples[0]) return selectedSamples[0].$id;
    const strainId = selectedStrains[0]?.$id || makeId('strain');
    if (!selectedStrains[0]) {
      await saveLocal(COLLECTIONS.strains, strainId, {
        strain_id: strainId,
        microorganism_id: selected.$id,
        strain_name: '',
        pathogenic_status: '',
        biosafety_level: ''
      });
    }
    const sampleId = makeId('sample');
    await saveLocal(COLLECTIONS.samples, sampleId, {
      sample_id: sampleId,
      strain_id: strainId,
      source: '',
      collection_date: '',
      location: '',
      host_id: '',
      specimen_type: ''
    });
    return sampleId;
  }

  async function handlePhotoUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setPhotoBusy(true);
    setPhotoNotice('');
    try {
      const sampleId = await ensureSelectedPhotoSample();
      const stats = await attachPhotoFiles(files, sampleId);
      await refreshLocal();
      if (stats.count) setPhotoNotice(`${stats.count} photo${stats.count === 1 ? '' : 's'} converted to WebP: ${formatBytes(stats.original)} → ${formatBytes(stats.webp)}.`);
      if (stats.errors.length) setSyncError(stats.errors.join(' '));
      if (navigator.onLine && !user?.offline) performSync();
    } catch (error) {
      setSyncError(error?.message || 'Could not add the photo.');
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto(row) {
    if (!confirm('Delete this photo? The deletion will sync to Appwrite when online.')) return;
    await deleteLocal(COLLECTIONS.media, row.$id);
    await deleteMediaBlob(row.$id).catch(() => {});
    await refreshLocal();
    if (navigator.onLine && !user?.offline) performSync();
  }

  function chooseExcelFile() {
    setImportError('');
    excelInputRef.current?.click();
  }

  async function handleExcelFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError('');
    try {
      const parsed = await parseGermExcel(file, REGISTER_FIELDS);
      setImportPreview({ fileName: file.name, rows: parsed.rows, sheetName: parsed.sheetName });
    } catch (error) {
      setImportError(error?.message || 'Could not read the Excel file.');
    }
  }

  async function importExcelRows(e) {
    e.preventDefault();
    if (!importPreview?.rows?.length || importing) return;
    setImporting(true);
    setImportError('');
    try {
      let lastId = null;
      for (const row of importPreview.rows) {
        const created = await createGermFromData(row);
        lastId = created.microorganismId;
      }
      const count = importPreview.rows.length;
      setImportPreview(null);
      await refreshLocal();
      if (lastId) setSelectedId(lastId);
      setPhotoNotice(`${count} germ record${count === 1 ? '' : 's'} imported from Excel and queued for sync.`);
      if (navigator.onLine && !user?.offline) performSync();
    } catch (error) {
      setImportError(error?.message || 'Excel import failed.');
    } finally {
      setImporting(false);
    }
  }


  function openEditGerm() {
    if (!selected) return;
    const strain = selectedStrains[0] || null;
    const sample = strain ? selectedSamples.find((row) => row.strain_id === strain.$id) || selectedSamples[0] : selectedSamples[0] || null;
    setEditTargets({ strainId: strain?.$id || null, sampleId: sample?.$id || null });
    setEditForm({
      ...Object.fromEntries(CORE_MICROORGANISM_KEYS.map((key) => [key, selected[key] || ''])),
      ...Object.fromEntries(MICROORGANISM_TRAIT_KEYS.map((key) => [key, selectedTraitMap[key] ?? selected[key] ?? ''])),
      strain_name: strain?.strain_name || '',
      pathogenic_status: strain?.pathogenic_status || '',
      biosafety_level: strain?.biosafety_level || '',
      source: sample?.source || '',
      collection_date: sample?.collection_date || '',
      location: sample?.location || '',
      host_id: sample?.host_id || '',
      specimen_type: sample?.specimen_type || ''
    });
    setEditOpen(true);
  }

  async function updateGerm(e) {
    e.preventDefault();
    if (!selected) return;

    const microorganismId = selected.$id;
    const strainId = editTargets.strainId || makeId('strain');
    const sampleId = editTargets.sampleId || makeId('sample');

    await saveLocal(COLLECTIONS.microorganisms, microorganismId, {
      microorganism_id: selected.microorganism_id || microorganismId,
      scientific_name: String(editForm.scientific_name ?? '').trim(),
      genus: String(editForm.genus ?? '').trim(),
      species: String(editForm.species ?? '').trim(),
      organism_type: String(editForm.organism_type ?? '').trim(),
      taxonomy_id: String(editForm.taxonomy_id ?? '').trim()
    });

    for (const trait of MICROORGANISM_TRAIT_FIELDS) {
      const value = String(editForm[trait.key] ?? '').trim();
      const existing = selectedTraitRows.find((row) => row.trait_key === trait.key);
      if (!value) {
        if (existing) await deleteLocal(COLLECTIONS.microorganism_traits, existing.$id);
        continue;
      }
      const traitId = existing?.$id || makeId('trait');
      await saveLocal(COLLECTIONS.microorganism_traits, traitId, {
        trait_id: existing?.trait_id || traitId,
        microorganism_id: microorganismId,
        category: trait.category,
        trait_key: trait.key,
        trait_label: trait.label,
        trait_value: value
      });
    }

    const clean = (value) => String(value ?? '').trim();
    const hasExistingStrain = Boolean(editTargets.strainId);
    const hasExistingSample = Boolean(editTargets.sampleId);
    const hasStrainInput = ['strain_name', 'pathogenic_status', 'biosafety_level'].some((key) => clean(editForm[key]));
    const hasSampleInput = ['source', 'collection_date', 'location', 'host_id', 'specimen_type'].some((key) => clean(editForm[key]));

    if (hasExistingStrain || hasStrainInput || hasSampleInput) {
      await saveLocal(COLLECTIONS.strains, strainId, {
        strain_id: selectedStrains.find((row) => row.$id === strainId)?.strain_id || strainId,
        microorganism_id: microorganismId,
        strain_name: clean(editForm.strain_name),
        pathogenic_status: clean(editForm.pathogenic_status),
        biosafety_level: clean(editForm.biosafety_level)
      });
    }

    if (hasExistingSample || hasSampleInput) {
      await saveLocal(COLLECTIONS.samples, sampleId, {
        sample_id: selectedSamples.find((row) => row.$id === sampleId)?.sample_id || sampleId,
        strain_id: strainId,
        source: clean(editForm.source),
        collection_date: clean(editForm.collection_date),
        location: clean(editForm.location),
        host_id: clean(editForm.host_id),
        specimen_type: clean(editForm.specimen_type)
      });
    }

    setEditOpen(false);
    await refreshLocal();
    if (navigator.onLine && !user?.offline) performSync();
  }

  function openChild(collection) {
    const samples = selectedSamples;
    const strains = selectedStrains;
    setChildForm({
      sample_id: samples[0]?.$id || '',
      strain_id: strains[0]?.$id || '',
      observation_date: new Date().toISOString().slice(0, 10),
      interpretation: collection === 'antimicrobial_results' ? 'Not interpreted' : ''
    });
    setChildModal(collection);
  }

  async function saveChild(e) {
    e.preventDefault();
    const collection = childModal;
    const id = makeId(collection === 'antimicrobial_results' ? 'drug' : collection.slice(0, 6));
    const base = { ...childForm };
    if (collection === 'antimicrobial_results') {
      base.mic_value = normalizeNumber(base.mic_value);
      base.zone_diameter = normalizeNumber(base.zone_diameter);
    }
    if (collection === 'sequences') {
      delete base.sample_id;
      base.sequence_id = id;
    } else {
      delete base.strain_id;
      const idField = {
        observations: 'observation_id',
        lab_tests: 'test_id',
        antimicrobial_results: 'susceptibility_id',
        media: 'media_id'
      }[collection];
      base[idField] = id;
    }
    await saveLocal(collection, id, base);
    setChildModal(null);
    setChildForm({});
    await refreshLocal();
    if (navigator.onLine && !user?.offline) performSync();
  }

  async function removeChild(collection, id) {
    if (!confirm('Delete this record? The deletion will sync when internet is available.')) return;
    await deleteLocal(collection, id);
    await refreshLocal();
    if (navigator.onLine && !user?.offline) performSync();
  }

  async function removeGerm() {
    if (!selected || !confirm(`Delete ${selected.scientific_name} and all linked cached records?`)) return;
    const childDeletes = [];
    for (const row of records.observations.filter((r) => selectedSampleIds.has(r.sample_id))) childDeletes.push(deleteLocal('observations', row.$id));
    for (const row of records.lab_tests.filter((r) => selectedSampleIds.has(r.sample_id))) childDeletes.push(deleteLocal('lab_tests', row.$id));
    for (const row of records.antimicrobial_results.filter((r) => selectedSampleIds.has(r.sample_id))) childDeletes.push(deleteLocal('antimicrobial_results', row.$id));
    for (const row of records.media.filter((r) => selectedSampleIds.has(r.sample_id))) childDeletes.push(deleteLocal('media', row.$id));
    for (const row of records.sequences.filter((r) => selectedStrainIds.has(r.strain_id))) childDeletes.push(deleteLocal('sequences', row.$id));
    for (const row of selectedTraitRows) childDeletes.push(deleteLocal(COLLECTIONS.microorganism_traits, row.$id));
    for (const row of selectedSamples) childDeletes.push(deleteLocal('samples', row.$id));
    for (const row of selectedStrains) childDeletes.push(deleteLocal('strains', row.$id));
    childDeletes.push(deleteLocal('microorganisms', selected.$id));
    await Promise.all(childDeletes);
    setSelectedId(null);
    await refreshLocal();
    if (navigator.onLine && !user?.offline) performSync();
  }

  async function signOut() {
    try { if (navigator.onLine && !user?.offline) await account.deleteSession({ sessionId: 'current' }); } catch {}
    setUser(null);
  }

  async function toggleFullscreen() {
    if (window.germDesktop) {
      const next = await window.germDesktop.toggleFullscreen();
      setIsFullscreen(next);
      return;
    }
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
    setIsFullscreen(Boolean(document.fullscreenElement));
  }

  function minimizeWindow() {
    if (window.germDesktop) window.germDesktop.minimize();
    else alert('Minimize is available in the GermDatabase desktop app.');
  }

  function closeWindow() {
    if (window.germDesktop) window.germDesktop.close();
    else alert('Exit is available in the GermDatabase desktop app.');
  }

  function exportRegistry() {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `germdatabase-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function checkUpdates() {
    if (window.germDesktop) {
      setUpdateStatus('checking');
      await window.germDesktop.checkForUpdates();
    } else {
      window.open('https://github.com/SRA-LabTrack/GermDatabase/releases', '_blank', 'noopener,noreferrer');
    }
  }

  if (!authReady) return <div className="auth-page"><div className="notice-box">Loading GermDatabase…</div></div>;
  if (!user) return <AuthPage onAuthenticated={setUser} />;

  const drugCount = records.antimicrobial_results.length;
  const sampleCount = records.samples.length;
  const pendingLabel = pending ? `${pending} queued change${pending === 1 ? '' : 's'}` : 'Offline copy ready';

  return (
    <div className="app-shell">
      <input ref={excelInputRef} className="visually-hidden-input" type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelFile} />
      <input ref={photoInputRef} className="visually-hidden-input" type="file" accept="image/*,.heic,.heif" multiple onChange={handlePhotoUpload} />
      <header className="topbar">
        <div className="brand">
          <GermLogo compact />
          <div><strong>GermDatabase</strong><small>Microorganism Registry</small></div>
        </div>
        <div className="top-actions">
          <button className="top-button" onClick={() => setRegisterOpen(true)}><Plus size={15} /> Register</button>
          <button className="top-button" onClick={chooseExcelFile}><FileSpreadsheet size={15} /> Import Excel</button>
          <button className="top-button" onClick={exportRegistry}>Backup</button>
          <button className="top-button" onClick={checkUpdates}>Updates</button>
          <button className="top-button" onClick={signOut}>Sign out</button>
        </div>
        <div className="window-actions">
          <div className="status-cell">
            <strong><span className={`status-dot ${syncing ? 'syncing' : user?.offline ? 'offline' : online ? '' : 'offline'}`} />{syncing ? 'Syncing' : user?.offline ? 'Local mode' : online ? 'Online' : 'Offline'}</strong>
            <small>{syncError || pendingLabel} • {syncTimeLabel(lastSync)}</small>
          </div>
          <button className="top-button" onClick={performSync} disabled={!online || syncing || user.offline}><RefreshCw size={15} /> Sync</button>
          <button className="top-button" onClick={minimizeWindow}><Minimize2 size={15} /> Minimize</button>
          <button className="top-button" onClick={toggleFullscreen}><Maximize2 size={15} /> {isFullscreen ? 'Exit full screen' : 'Full screen'}</button>
          <button className="top-button danger" onClick={closeWindow}>Exit</button>
        </div>
      </header>

      <main className="page">
        <section className="hero reveal">
          <div className="hero-main">
            <div className="hero-logo-watermark"><GermLogo /></div>
            <p className="eyebrow">Offline-first scientific registry</p>
            <h1>Microbial records, without the spreadsheet fog.</h1>
            <p className="hero-copy">Track microorganism identity, strains, samples, observations, laboratory tests, antimicrobial susceptibility, sequence references, and media. Changes are cached locally first and synchronized to Appwrite when connectivity returns.</p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => setRegisterOpen(true)}><Plus size={16} /> Register a germ</button>
              <button className="button" onClick={performSync} disabled={!online || syncing || user.offline}><RefreshCw size={16} /> Sync now</button>
            </div>
          </div>
          <div className="hero-side">
            <div className="metric"><span className="label">Microorganisms</span><strong className="value">{records.microorganisms.length}</strong></div>
            <div className="metric"><span className="label">Samples</span><strong className="value">{sampleCount}</strong></div>
            <div className="metric"><span className="label">Susceptibility tests</span><strong className="value">{drugCount}</strong></div>
            <div className="metric"><span className="label">Queued offline</span><strong className="value">{pending}</strong></div>
          </div>
        </section>

        {importError && !importPreview && <div className="error-box import-page-error"><strong>Excel import:</strong> {importError}</div>}
        {photoNotice && !selected && <div className="notice-box import-page-error">{photoNotice}</div>}

        <section className="reveal">
          <div className="toolbar">
            <div style={{ position: 'relative' }}><Search size={16} style={{ position: 'absolute', left: 12, top: 13, color: '#6e83a0' }} /><input className="searchbox" style={{ paddingLeft: 38 }} placeholder="Search scientific name, genus, species, taxonomy ID…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="searchbox" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>{organismTypes.map((type) => <option key={type}>{type}</option>)}</select>
            <button className="button" onClick={chooseExcelFile}><FileSpreadsheet size={15} /> Import Excel</button>
            <button className="button" onClick={exportRegistry}>Export JSON</button>
            <button className="button primary" onClick={() => setRegisterOpen(true)}>New record</button>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h2>Microorganism Registry</h2>
              <span className="tag">{visibleMicrobes.length} shown</span>
            </div>
            <div className="registry-card-wrap">
              {visibleMicrobes.length ? (
                <div className="registry-card-grid" key={`${search}::${typeFilter}::${visibleMicrobes.length}`}>
                  {visibleMicrobes.map((row) => (
                    <RegistryEntryCard
                      key={row.$id}
                      row={row}
                      summary={registrySummaries.get(row.$id)}
                      onOpen={() => setSelectedId(row.$id)}
                    />
                  ))}
                </div>
              ) : <div className="empty"><strong>No microorganism records yet.</strong>Register the first germ or change the search filters.</div>}
            </div>
          </div>
        </section>
      </main>

      {selected && (
        <div className="drawer">
          <div className="drawer-backdrop" onClick={() => setSelectedId(null)} />
          <aside className="drawer-panel">
            <div className="drawer-head">
              <div className="drawer-title"><GermLogo compact /><div><p className="eyebrow">Microorganism record</p><h2>{selected.scientific_name}</h2></div></div>
              <div className="drawer-head-actions">
                <button className="button small primary" onClick={openEditGerm}><Pencil size={14} /> Edit germ</button>
                <button className="button small" onClick={() => setSelectedId(null)}><X size={16} /></button>
              </div>
            </div>
            <div className="drawer-content">
              <div className="detail-grid">
                <div className="detail-cell"><small>Microorganism ID</small>{selected.microorganism_id || selected.$id}</div>
                <div className="detail-cell"><small>Taxonomy ID</small>{selected.taxonomy_id || '—'}</div>
                <div className="detail-cell"><small>Genus</small>{selected.genus || '—'}</div>
                <div className="detail-cell"><small>Species</small>{selected.species || '—'}</div>
                <div className="detail-cell"><small>Organism type</small>{selected.organism_type || '—'}</div>
                <div className="detail-cell"><small>Sync state</small>{selected._pending ? 'Queued locally' : 'Cached / synchronized'}</div>
              </div>

              <section className="subsection microorganism-traits">
                <div className="subsection-head"><h3>Microorganism traits</h3></div>
                <div className="trait-summary-grid">
                  {[
                    ['Common name', traitValue('common_name')], ['Gram reaction', traitValue('gram_stain')], ['Cell shape', traitValue('cell_shape')],
                    ['Arrangement', traitValue('cell_arrangement')], ['Motility', traitValue('motility')], ['Spore forming', traitValue('spore_forming')],
                    ['Capsule', traitValue('capsule')], ['Oxygen requirement', traitValue('oxygen_requirement')], ['Optimal temperature', traitValue('optimal_temperature') ? `${traitValue('optimal_temperature')} °C` : ''],
                    ['Optimal pH', traitValue('optimal_ph')], ['Growth medium', traitValue('growth_medium')], ['Pigmentation', traitValue('pigmentation')],
                    ['Habitat', traitValue('habitat')], ['Host range', traitValue('host_range')], ['Disease association', traitValue('disease_association')],
                    ['Transmission', traitValue('transmission_mode')], ['Serotype / serovar', traitValue('serotype')]
                  ].filter(([, value]) => value).map(([label, value]) => (
                    <div className="trait-summary-item" key={label}><small>{label}</small><span>{value}</span></div>
                  ))}
                  {!hasAnyTrait && <div className="empty">No additional microorganism traits recorded yet.</div>}
                </div>
                {(traitValue('colony_morphology') || traitValue('metabolism') || traitValue('virulence_factors') || traitValue('toxin_production') || traitValue('notes')) && (
                  <div className="trait-long-notes">
                    {traitValue('colony_morphology') && <div><small>Colony morphology</small><p>{traitValue('colony_morphology')}</p></div>}
                    {traitValue('metabolism') && <div><small>Metabolism / biochemical traits</small><p>{traitValue('metabolism')}</p></div>}
                    {traitValue('virulence_factors') && <div><small>Virulence factors</small><p>{traitValue('virulence_factors')}</p></div>}
                    {traitValue('toxin_production') && <div><small>Toxin production</small><p>{traitValue('toxin_production')}</p></div>}
                    {traitValue('notes') && <div><small>Additional notes</small><p>{traitValue('notes')}</p></div>}
                  </div>
                )}
              </section>

              <section className="subsection">
                <div className="subsection-head"><h3>Strains</h3></div>
                <div className="stack-list">
                  {selectedStrains.map((row) => <div className="stack-row" key={row.$id}><div><strong>{row.strain_name || row.strain_id}</strong><small>{row.pathogenic_status} • {row.biosafety_level} • ID {row.strain_id || row.$id}</small></div></div>)}
                  {!selectedStrains.length && <div className="empty">No strains linked.</div>}
                </div>
              </section>

              <section className="subsection">
                <div className="subsection-head"><h3>Samples</h3></div>
                <div className="stack-list">
                  {selectedSamples.map((row) => <div className="stack-row" key={row.$id}><div><strong>{row.specimen_type || row.sample_id}</strong><small>{row.source} • {row.location} • {dateLabel(row.collection_date)} • Host {row.host_id || 'N/A'}</small></div></div>)}
                  {!selectedSamples.length && <div className="empty">No samples linked.</div>}
                </div>
              </section>

              <section className="subsection photo-section">
                <div className="subsection-head">
                  <div><h3>Photos</h3><small className="section-kicker">Stored as compressed WebP</small></div>
                  <button className="button small primary" type="button" disabled={photoBusy} onClick={() => photoInputRef.current?.click()}><ImagePlus size={14} /> {photoBusy ? 'Processing…' : 'Add photos'}</button>
                </div>
                {photoNotice && <div className="photo-notice">{photoNotice}</div>}
                <div className="photo-grid">
                  {recordsForSelected('media').filter(isPhotoMedia).map((row) => <PhotoCard key={row.$id} row={row} onDelete={removePhoto} />)}
                  {!recordsForSelected('media').filter(isPhotoMedia).length && <div className="empty photo-empty"><strong>No photos yet.</strong>Add JPEG, PNG, HEIC/HEIF, WebP, AVIF, BMP, or GIF. GermDatabase converts it to WebP before storage.</div>}
                </div>
              </section>

              {Object.entries(CHILD_SCHEMAS).map(([collection, schema]) => {
                const rows = collection === 'media' ? recordsForSelected(collection).filter((row) => !isPhotoMedia(row)) : recordsForSelected(collection);
                return (
                  <section className="subsection" key={collection}>
                    <div className="subsection-head">
                      <h3>{collection === 'antimicrobial_results' ? 'Antimicrobial susceptibility results' : `${schema.title} records`}</h3>
                      <button className="button small primary" onClick={() => openChild(collection)} disabled={collection === 'sequences' ? !selectedStrains.length : !selectedSamples.length}><Plus size={14} /> Add</button>
                    </div>
                    <div className="stack-list">
                      {rows.map((row) => {
                        const main = collection === 'observations' ? `${row.trait_name}: ${row.observed_value}${row.unit ? ` ${row.unit}` : ''}`
                          : collection === 'lab_tests' ? `${row.test_name}: ${row.result}`
                          : collection === 'antimicrobial_results' ? `${row.antimicrobial}: ${row.interpretation}`
                          : collection === 'sequences' ? `${row.marker}${row.accession_number ? ` • ${row.accession_number}` : ''}`
                          : `${row.media_type}: ${row.caption || row.file_path}`;
                        const sub = collection === 'observations' ? `${row.method} • ${dateLabel(row.observation_date)} • ${row.observer}`
                          : collection === 'lab_tests' ? `${row.test_type} • ${row.method}${row.unit ? ` • ${row.unit}` : ''}`
                          : collection === 'antimicrobial_results' ? `MIC ${row.mic_value ?? '—'} • Zone ${row.zone_diameter ?? '—'} mm • ${row.standard_used || 'No standard recorded'}`
                          : collection === 'sequences' ? (row.sequence_file || 'No file/path recorded')
                          : row.file_path;
                        return <div className="stack-row" key={row.$id}><div><strong>{main}</strong><small>{sub}</small></div><button className="button small danger" onClick={() => removeChild(collection, row.$id)}><Trash2 size={14} /></button></div>;
                      })}
                      {!rows.length && <div className="empty">No {schema.title.toLowerCase()} records yet.</div>}
                    </div>
                  </section>
                );
              })}

              <button className="button danger" onClick={removeGerm}><Trash2 size={15} /> Delete microorganism and linked records</button>
            </div>
          </aside>
        </div>
      )}

      {registerOpen && (
        <Modal title="Register microorganism, strain, sample, and photos" onClose={() => { setRegisterOpen(false); setRegisterPhotos([]); }} onSubmit={registerGerm} submitLabel={photoBusy ? 'Processing photos…' : 'Register germ'} submitDisabled={photoBusy}>
          <div className="modal-brand-row"><LuntianSignature /></div>
          <div className="notice-box" style={{ marginBottom: 16 }}>All fields are optional. Photos are also optional. Any selected image is converted locally to high-quality WebP before it is saved or uploaded.</div>
          <TraitForm form={registerForm} onChange={(key, value) => setRegisterForm((current) => ({ ...current, [key]: value }))} />
          <section className="register-photo-box">
            <div className="register-photo-head">
              <div><strong>Germ photos</strong><small>JPEG, PNG, HEIC/HEIF, WebP, AVIF, BMP, and GIF are converted to WebP.</small></div>
              <button type="button" className="button small primary" onClick={() => registerPhotoInputRef.current?.click()}><ImagePlus size={14} /> Choose photos</button>
            </div>
            <input ref={registerPhotoInputRef} className="visually-hidden-input" type="file" accept="image/*,.heic,.heif" multiple onChange={(event) => { const next = Array.from(event.target.files || []); event.target.value = ''; setRegisterPhotos((current) => [...current, ...next].slice(0, 12)); }} />
            <PhotoPickerSummary files={registerPhotos} onRemove={(index) => setRegisterPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
          </section>
        </Modal>
      )}

      {importPreview && (
        <Modal title="Import germs from Excel" onClose={() => { setImportPreview(null); setImportError(''); }} onSubmit={importExcelRows} submitLabel={importing ? 'Importing…' : `Import ${importPreview.rows.length} germ${importPreview.rows.length === 1 ? '' : 's'}`} submitDisabled={importing}>
          <div className="notice-box excel-import-summary">
            <strong>{importPreview.fileName}</strong> • sheet “{importPreview.sheetName}” • {importPreview.rows.length} non-empty row{importPreview.rows.length === 1 ? '' : 's'} found.
            <br />Blank cells are allowed. New IDs are generated automatically and imported records are queued for Appwrite sync.
          </div>
          {importError && <div className="error-box" style={{ marginTop: 10 }}>{importError}</div>}
          <div className="excel-preview-wrap">
            <table className="excel-preview-table">
              <thead><tr><th>#</th><th>Scientific name</th><th>Type</th><th>Strain</th><th>Source</th><th>Location</th></tr></thead>
              <tbody>
                {importPreview.rows.slice(0, 10).map((row, index) => (
                  <tr key={index}><td>{index + 1}</td><td>{row.scientific_name || '—'}</td><td>{row.organism_type || '—'}</td><td>{row.strain_name || '—'}</td><td>{row.source || '—'}</td><td>{row.location || '—'}</td></tr>
                ))}
              </tbody>
            </table>
            {importPreview.rows.length > 10 && <div className="excel-preview-more">+ {importPreview.rows.length - 10} more row{importPreview.rows.length - 10 === 1 ? '' : 's'}</div>}
          </div>
        </Modal>
      )}

      {editOpen && selected && (
        <Modal title="Edit germ profile" onClose={() => setEditOpen(false)} onSubmit={updateGerm} submitLabel="Save changes">
          <div className="modal-brand-row"><LuntianSignature /></div>
          <div className="notice-box" style={{ marginBottom: 16 }}>All fields are optional. Expand only the sections you want to change. Existing linked observations, tests, sequences, and media remain attached.</div>
          <TraitForm form={editForm} onChange={(key, value) => setEditForm((current) => ({ ...current, [key]: value }))} />
        </Modal>
      )}

      {childModal && selected && (
        <Modal title={`Add ${CHILD_SCHEMAS[childModal].title}`} onClose={() => setChildModal(null)} onSubmit={saveChild} submitLabel="Save record">
          <div className="form-grid">
            {childModal === 'sequences' ? (
              <div className="field full"><label>Strain *</label><select required value={childForm.strain_id || ''} onChange={(e) => setChildForm({ ...childForm, strain_id: e.target.value })}><option value="">Select strain…</option>{selectedStrains.map((row) => <option key={row.$id} value={row.$id}>{row.strain_name || row.strain_id}</option>)}</select></div>
            ) : (
              <div className="field full"><label>Sample *</label><select required value={childForm.sample_id || ''} onChange={(e) => setChildForm({ ...childForm, sample_id: e.target.value })}><option value="">Select sample…</option>{selectedSamples.map((row) => <option key={row.$id} value={row.$id}>{row.specimen_type || row.sample_id} • {row.location}</option>)}</select></div>
            )}
            {CHILD_SCHEMAS[childModal].fields.map((spec) => <Field key={spec[0]} spec={spec} value={childForm[spec[0]]} onChange={(key, value) => setChildForm((current) => ({ ...current, [key]: value }))} />)}
          </div>
        </Modal>
      )}

      <div className="global-luntian"><Leaf size={12} /> Powered by <strong>Luntian</strong></div>
      {updateStatus && <div style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 120 }} className="notice-box">Update: {updateStatus}</div>}
    </div>
  );
}
