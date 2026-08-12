import React, { useEffect, useMemo, useState } from 'react';
import { Check, KeyRound, LoaderCircle, RefreshCw, Search, ShieldCheck, UserPlus, Users, X, XCircle } from 'lucide-react';
import { CHARACTERIZATION_FIELDS } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import { adminAccountRequest, adminAccountStatus } from '../lib/adminAccountsApi';
import { approveChangeRequest, getChangeRequest, listPendingRequests, rejectChangeRequest } from '../lib/approvalApi';
import { fileViewUrl, getRecord } from '../lib/registryApi';

const REVIEW_FIELDS = [...GERMINATION_FIELDS, ...CHARACTERIZATION_FIELDS];
const REVIEW_FIELD_LABELS = new Map(REVIEW_FIELDS.map((field) => [field.key, field.label]));
const REVIEW_FIELD_ORDER = REVIEW_FIELDS.map((field) => field.key);
const HIDDEN_REVIEW_KEYS = new Set([
  'photo_file_ids', 'thumb_file_ids', 'thumbnail_file_id', 'primary_file_id', 'photo_names'
]);

function hasReviewValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined) return false;
  return String(value).trim() !== '';
}

function displayReviewValue(value) {
  if (!hasReviewValue(value)) return 'Not provided';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function humanizeReviewKey(key) {
  if (REVIEW_FIELD_LABELS.has(key)) return REVIEW_FIELD_LABELS.get(key);
  return String(key || '')
    .replace(/^germ_/, 'Germination ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}


function friendlyDate(value) {
  if (!value) return 'Unknown time';
  try { return new Date(value).toLocaleString(); } catch { return value; }
}

function ApprovalReview({ requestId, currentUser, onClose, onResolved }) {
  const [request, setRequest] = useState(null);
  const [before, setBefore] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    getChangeRequest(requestId).then(async (value) => {
      if (!live) return;
      setRequest(value);
      if (value.request_type === 'edit' && value.target_id) {
        try { const existing = await getRecord(value.target_id); if (live) setBefore(existing); } catch {}
      }
    }).catch((err) => live && setError(err?.message || String(err)));
    return () => { live = false; };
  }, [requestId]);

  const desired = request?.payload?.record || {};
  const reviewEntries = useMemo(() => {
    if (!request) return [];
    const desiredKeys = Object.keys(desired).filter((key) => !key.startsWith('$') && !HIDDEN_REVIEW_KEYS.has(key));
    const orderedKeys = [
      ...REVIEW_FIELD_ORDER.filter((key) => desiredKeys.includes(key)),
      ...desiredKeys.filter((key) => !REVIEW_FIELD_LABELS.has(key)).sort((a, b) => a.localeCompare(b))
    ];
    return orderedKeys
      .filter((key) => {
        if (request.request_type === 'create') return hasReviewValue(desired[key]);
        return displayReviewValue(desired[key]) !== displayReviewValue(before?.[key]);
      })
      .map((key) => ({
        key,
        label: humanizeReviewKey(key),
        before: before?.[key],
        requested: desired[key]
      }));
  }, [desired, before, request]);

  const photoIds = Array.isArray(desired.photo_file_ids) ? desired.photo_file_ids.filter(Boolean) : [];
  const thumbIds = Array.isArray(desired.thumb_file_ids) ? desired.thumb_file_ids.filter(Boolean) : [];
  const photoNames = Array.isArray(desired.photo_names) ? desired.photo_names : [];
  const photoCount = photoIds.length;
  const requestKind = request?.request_type === 'edit' ? 'Edit request' : 'Registration request';

  async function approve() {
    setBusy('approve'); setError('');
    try { await approveChangeRequest(requestId, currentUser); onResolved?.('approved'); onClose(); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setBusy(''); }
  }
  async function reject() {
    if (!confirm('Reject this submission? Newly uploaded pending photos will be cleaned from Appwrite Storage.')) return;
    setBusy('reject'); setError('');
    try { await rejectChangeRequest(requestId, currentUser); onResolved?.('rejected'); onClose(); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setBusy(''); }
  }

  return (
    <div className="admin-review-card">
      <div className="admin-review-heading">
        <div><small>{request?.request_type === 'edit' ? 'Edit request' : 'Registration request'}</small><h3>{request?.variety_summary || 'Sugarcane submission'}</h3></div>
        <button className="icon-button" onClick={onClose}><X size={18} /></button>
      </div>
      {!request && !error && <div className="admin-loading"><LoaderCircle className="spin" size={18} /> Loading request…</div>}
      {request && <>
        <div className="approval-meta">
          <span>Submitted by <b>{request.submitted_name || request.submitted_email || request.submitted_by}</b></span>
          <span>{friendlyDate(request.submitted_at)}</span>
        </div>
        <div className="approval-review-summary">
          <span><small>Request</small><b>{requestKind}</b></span>
          <span><small>Submitted values</small><b>{reviewEntries.length}</b></span>
          <span><small>Attached photos</small><b>{photoCount}</b></span>
          {request.target_id && <span><small>Target record</small><b className="mono-value">{request.target_id}</b></span>}
        </div>
        <div className="approval-diff-list">
          <div className="approval-list-title">
            <div><small>{request.request_type === 'edit' ? 'Requested changes' : 'Submitted record'}</small><strong>{reviewEntries.length ? `${reviewEntries.length} field${reviewEntries.length === 1 ? '' : 's'} to review` : 'No field values submitted'}</strong></div>
            {photoCount > 0 && <span>{photoCount} photo{photoCount === 1 ? '' : 's'}</span>}
          </div>
          {photoCount > 0 && <div className="approval-photo-section">
            <div className="approval-photo-heading"><small>Submitted photos</small><span>Compressed thumbnails • full image opens on click</span></div>
            <div className="approval-photo-grid">
              {photoIds.map((fileId, index) => {
                const previewId = thumbIds[index] || fileId;
                return <a key={fileId} href={fileViewUrl(fileId)} target="_blank" rel="noreferrer" title={photoNames[index] || `Photo ${index + 1}`}>
                  <img src={fileViewUrl(previewId)} alt={photoNames[index] || `Submitted photo ${index + 1}`} loading="lazy" decoding="async" />
                  <span>{photoNames[index] || `Photo ${index + 1}`}</span>
                </a>;
              })}
            </div>
          </div>}
          {!reviewEntries.length && <div className="approval-empty"><strong>No visible field values were included in this request.</strong><span>You can reject it, or approve it only if an intentionally blank record is valid.</span></div>}
          {reviewEntries.map((field) => <div className="approval-diff" key={field.key}>
            <small>{field.label}</small>
            {request.request_type === 'edit' ? <div className="approval-values">
              <span className="before-value"><em>Before</em><b>{displayReviewValue(field.before)}</b></span>
              <span className="requested-value"><em>Requested</em><b>{displayReviewValue(field.requested)}</b></span>
            </div> : <strong>{displayReviewValue(field.requested)}</strong>}
          </div>)}
        </div>
      </>}
      {error && <div className="alert error">{error}</div>}
      <div className="admin-review-actions"><button className="danger-button" disabled={Boolean(busy)} onClick={reject}><XCircle size={16} /> {busy === 'reject' ? 'Rejecting…' : 'Reject'}</button><button className="primary-button" disabled={!request || Boolean(busy)} onClick={approve}><Check size={16} /> {busy === 'approve' ? 'Approving…' : 'Approve & publish'}</button></div>
    </div>
  );
}

function ApprovalsTab({ currentUser, onRegistryChanged }) {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState('');
  const [error, setError] = useState('');

  async function load(reset = false) {
    setLoading(true); setError('');
    try {
      const result = await listPendingRequests({ cursor: reset ? '' : cursor });
      setItems((current) => reset ? result.documents : [...current, ...result.documents]);
      setCursor(result.nextCursor || ''); setHasMore(result.hasMore);
    } catch (err) { setError(err?.message || String(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(true); }, []);

  function resolved() {
    setItems((current) => current.filter((item) => item.$id !== reviewId));
    onRegistryChanged?.();
  }

  return <div className="admin-tab-body">
    <div className="admin-tab-intro"><div><h3>Approval queue</h3><p>Only opening this tab requests pending submissions. There is no polling or Realtime subscription.</p></div><button className="secondary-button" onClick={() => load(true)} disabled={loading}>Refresh</button></div>
    {error && <div className="alert error">{error}</div>}
    {!loading && !items.length && <div className="admin-empty"><ShieldCheck size={30} /><h3>No pending submissions</h3><p>User registrations and edits will appear here when submitted.</p></div>}
    <div className="approval-list">{items.map((item) => <button className="approval-row" key={item.$id} onClick={() => setReviewId(item.$id)}><span><b>{item.variety_summary || 'Unnamed variety'}</b><small>{item.request_type === 'edit' ? 'Edit request' : 'New registration'} • {item.submitted_name || item.submitted_email}</small></span><span>{friendlyDate(item.submitted_at)}</span></button>)}</div>
    {loading && <div className="admin-loading"><LoaderCircle className="spin" size={18} /> Loading approvals…</div>}
    {!loading && hasMore && <button className="secondary-button full" onClick={() => load(false)}>Load 25 more</button>}
    {reviewId && <ApprovalReview requestId={reviewId} currentUser={currentUser} onClose={() => setReviewId('')} onResolved={resolved} />}
  </div>;
}

function AccountsTab({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' });
  const [server, setServer] = useState({ checking: true, configured: false, keySource: '', apiVersion: '', environment: '', deploymentHost: '', detectedServerVariables: [], validated: false, error: '', errorCode: '' });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function checkServer(force = false) {
    setServer((current) => ({ ...current, checking: true, error: '' }));
    setError('');
    try {
      const status = await adminAccountStatus({ force });
      const next = { checking: false, configured: Boolean(status.configured), keySource: status.keySource || '', apiVersion: status.apiVersion || '', environment: status.vercelEnvironment || '', deploymentHost: status.deploymentHost || '', detectedServerVariables: status.detectedServerVariables || [], validated: Boolean(status.keyValidated), error: '', errorCode: '' };
      setServer(next);
      if (next.configured) await load('', { skipServerCheck: true });
    } catch (err) {
      setServer({ checking: false, configured: false, keySource: '', apiVersion: '', environment: '', deploymentHost: '', detectedServerVariables: [], validated: false, error: err?.message || String(err), errorCode: err?.code || '' });
    }
  }

  async function load(term = '', { skipServerCheck = false } = {}) {
    if (!skipServerCheck && !server.configured) return;
    setLoading(true); setError('');
    try {
      const result = await adminAccountRequest('list', { search: term });
      setUsers(result.users || []);
      setServer((current) => ({ ...current, keySource: result.keySource || current.keySource, validated: true }));
    }
    catch (err) { setError(err?.message || String(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { checkServer(false); }, []);

  async function create(event) {
    event.preventDefault();
    if (!server.configured) return;
    setBusy('create'); setError('');
    try {
      const result = await adminAccountRequest('create', form);
      setUsers((current) => [result.user, ...current.filter((item) => item.id !== result.user.id)]);
      setServer((current) => ({ ...current, keySource: result.keySource || current.keySource, validated: true }));
      setForm({ name: '', email: '', password: '', role: 'user' });
    } catch (err) { setError(err?.message || String(err)); }
    finally { setBusy(''); }
  }

  async function setRole(user, role) {
    if (!server.configured) return;
    setBusy(user.id); setError('');
    try {
      const result = await adminAccountRequest('setRole', { userId: user.id, role });
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
      setServer((current) => ({ ...current, keySource: result.keySource || current.keySource, validated: true }));
    } catch (err) { setError(err?.message || String(err)); }
    finally { setBusy(''); }
  }

  return <div className="admin-tab-body accounts-tab">
    <div className="admin-tab-intro"><div><h3>Account management</h3><p>Create user/admin accounts and grant or remove administrator authority. These rare privileged actions use a server-only Appwrite Users API key.</p></div></div>

    {server.checking && <div className="admin-loading"><LoaderCircle className="spin" size={18} /> Checking secure account-management service…</div>}

    {!server.checking && !server.configured && <div className="admin-server-setup">
      <div className="admin-server-setup-icon"><KeyRound size={24} /></div>
      <div className="admin-server-setup-copy">
        <h3>{server.errorCode === 'admin_api_stale_backend' ? 'Production Account Management backend is outdated' : server.errorCode === 'admin_api_unreachable' || server.errorCode === 'admin_api_route_mismatch' ? 'Account Management route is not reachable' : 'One server credential is still required'}</h3>
        {server.errorCode === 'admin_api_stale_backend' ? <>
          <p>The website frontend is newer than the Vercel Account Management function currently answering requests.</p>
          <ol>
            <li>Push the complete CaneSprout v2.6.9 project to <b>main</b>.</li>
            <li>Wait for the Production deployment to finish.</li>
            <li>Hard-refresh once, then click <b>Check again</b>.</li>
          </ol>
        </> : server.errorCode === 'admin_api_unreachable' || server.errorCode === 'admin_api_route_mismatch' ? <>
          <p>Your Appwrite key may already be configured, but this browser could not reach the CaneSprout Vercel Function.</p>
          <ol>
            <li>Deploy <b>CaneSprout v2.6.9 or newer</b> to the same Vercel project.</li>
            <li>Wait for the Production deployment to finish, then hard-refresh once.</li>
            <li>Open <code>/canesprout-admin-api-v269</code> on your production domain. It should show safe JSON diagnostics.</li>
          </ol>
        </> : <>
          <p><b>Localhost working does not mean Vercel has the same secret.</b> Local <code>.env</code> and <code>.env.local</code> files stay on your PC and are not uploaded to Production.</p>
          {server.environment && <div className="admin-runtime-note">Runtime checked: <b>{server.environment}</b>{server.deploymentHost ? ` • ${server.deploymentHost}` : ''}</div>}
          <ol>
            <li>In Vercel, open the exact project serving this domain and confirm a supported server-only key exists under <b>Production</b>. <code>APPWRITE_ADMIN_API_KEY</code> is preferred; <code>APPWRITE_API_KEY</code> is also supported for compatibility.</li>
            <li>If it exists only under Development or Preview, add/update it under Production.</li>
            <li>Create a <b>new Production deployment</b>. Existing deployments do not inherit later Environment Variable changes.</li>
          </ol>
          <p>The ZIP includes <code>REPAIR-VERCEL-PRODUCTION-ADMIN-KEY.cmd</code>, which verifies the linked project's Production environment and triggers a fresh Production deployment through your existing GitHub → Vercel integration. It does not use the Vercel CLI deploy command.</p>
        </>}
        {server.error && <div className="alert error">{server.error}</div>}
        <button className="secondary-button" onClick={() => checkServer(true)}><RefreshCw size={16} /> Check again</button>
      </div>
    </div>}

    {!server.checking && server.configured && <>
      <div className="admin-server-ready"><Check size={15} /><span>{server.validated ? 'Secure Users API ready' : 'Server credential detected'}{server.keySource ? ` • ${server.keySource}` : ''}{server.apiVersion ? ` • ${server.apiVersion}` : ''}</span></div>
      <form className="account-create-form" onSubmit={create}>
        <label><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Account name" /></label>
        <label><span>Email</span><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></label>
        <label><span>Temporary password</span><input type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
        <label><span>Role</span><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="user">User</option><option value="admin">Administrator</option></select></label>
        <button className="primary-button" disabled={busy === 'create'}><UserPlus size={16} /> {busy === 'create' ? 'Creating…' : 'Add account'}</button>
      </form>
      <div className="account-search"><Search size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts…" /><button className="secondary-button" onClick={() => load(search)} disabled={loading}>Search</button></div>
      {error && <div className="alert error">{error}</div>}
      {loading ? <div className="admin-loading"><LoaderCircle className="spin" size={18} /> Loading accounts…</div> : <div className="account-list">{users.map((user) => <div className="account-row" key={user.id}><span className="account-avatar">{String(user.name || user.email || 'U').charAt(0).toUpperCase()}</span><span className="account-identity"><b>{user.name || user.email}</b><small>{user.email}</small></span><span className={`role-pill ${user.role}`}>{user.role === 'admin' ? 'Admin' : 'User'}</span><button className="secondary-button compact" disabled={busy === user.id || user.id === currentUser.id} onClick={() => setRole(user, user.role === 'admin' ? 'user' : 'admin')}>{busy === user.id ? 'Updating…' : user.role === 'admin' ? 'Remove admin' : 'Make admin'}</button></div>)}</div>}
    </>}
  </div>;
}

export default function AdminCenterModal({ currentUser, initialTab = 'approvals', onClose, onRegistryChanged }) {
  const [tab, setTab] = useState(initialTab === 'accounts' ? 'accounts' : 'approvals');
  return <div className="modal-backdrop"><section className="modal admin-center-modal">
    <header className="modal-header"><div><small>Administrator tools</small><h2>Admin center</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></header>
    <div className="admin-tabs"><button className={tab === 'approvals' ? 'active' : ''} onClick={() => setTab('approvals')}><ShieldCheck size={17} /> Approvals</button><button className={tab === 'accounts' ? 'active' : ''} onClick={() => setTab('accounts')}><Users size={17} /> Account management</button></div>
    <div className="modal-content admin-content">{tab === 'approvals' ? <ApprovalsTab currentUser={currentUser} onRegistryChanged={onRegistryChanged} /> : <AccountsTab currentUser={currentUser} />}</div>
  </section></div>;
}
