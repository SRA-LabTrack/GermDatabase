import React, { useEffect, useMemo, useState } from 'react';
import { Check, LoaderCircle, Search, ShieldCheck, UserPlus, Users, X, XCircle } from 'lucide-react';
import { CHARACTERIZATION_FIELDS } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import { adminAccountRequest } from '../lib/adminAccountsApi';
import { approveChangeRequest, getChangeRequest, listPendingRequests, rejectChangeRequest } from '../lib/approvalApi';
import { getRecord } from '../lib/registryApi';

const REVIEW_FIELDS = [...GERMINATION_FIELDS, ...CHARACTERIZATION_FIELDS];

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
  const changed = useMemo(() => REVIEW_FIELDS.filter((field) => {
    const next = String(desired[field.key] ?? '').trim();
    const prev = String(before?.[field.key] ?? '').trim();
    return request?.request_type === 'create' ? Boolean(next) : next !== prev;
  }), [desired, before, request?.request_type]);

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
        <div className="approval-meta"><span>Submitted by <b>{request.submitted_name || request.submitted_email || request.submitted_by}</b></span><span>{friendlyDate(request.submitted_at)}</span></div>
        <div className="approval-diff-list">
          {!changed.length && <div className="approval-empty">No changed values were detected.</div>}
          {changed.map((field) => <div className="approval-diff" key={field.key}><small>{field.label}</small>{request.request_type === 'edit' && <span className="before-value">Before: {String(before?.[field.key] || 'Not provided')}</span>}<strong>Requested: {String(desired[field.key] || 'Not provided')}</strong></div>)}
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function load(term = '') {
    setLoading(true); setError('');
    try { const result = await adminAccountRequest('list', { search: term }); setUsers(result.users || []); }
    catch (err) { setError(err?.message || String(err)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function create(event) {
    event.preventDefault(); setBusy('create'); setError('');
    try {
      const result = await adminAccountRequest('create', form);
      setUsers((current) => [result.user, ...current.filter((item) => item.id !== result.user.id)]);
      setForm({ name: '', email: '', password: '', role: 'user' });
    } catch (err) { setError(err?.message || String(err)); }
    finally { setBusy(''); }
  }

  async function setRole(user, role) {
    setBusy(user.id); setError('');
    try {
      const result = await adminAccountRequest('setRole', { userId: user.id, role });
      setUsers((current) => current.map((item) => item.id === user.id ? result.user : item));
    } catch (err) { setError(err?.message || String(err)); }
    finally { setBusy(''); }
  }

  return <div className="admin-tab-body accounts-tab">
    <div className="admin-tab-intro"><div><h3>Account management</h3><p>Create user/admin accounts and grant or remove administrator authority. These rare privileged actions use the server-only Appwrite Users API.</p></div></div>
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
