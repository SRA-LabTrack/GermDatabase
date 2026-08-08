import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CloudUpload, HardDrive, LoaderCircle, RefreshCw, Trash2, X } from 'lucide-react';
import { formatBytes } from '../lib/imageTools';
import {
  discardPendingOfflineEntry,
  getOfflineQueueSummary,
  getOfflineStorageEstimate,
  listOfflineEntries,
  subscribeOfflineQueue,
  syncOfflineQueue
} from '../lib/offlineQueue';

function ageText(timestamp) {
  const minutes = Math.max(0, Math.round((Date.now() - Number(timestamp || Date.now())) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export default function OfflineQueueModal({ ownerId, actor, online, onClose, onSynced }) {
  const [entries, setEntries] = useState([]);
  const [summary, setSummary] = useState({ count: 0, photoCount: 0, bytes: 0, errors: 0 });
  const [estimate, setEstimate] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  async function reload() {
    const [nextEntries, nextSummary, nextEstimate] = await Promise.all([
      listOfflineEntries(ownerId),
      getOfflineQueueSummary(ownerId),
      getOfflineStorageEstimate()
    ]);
    setEntries(nextEntries);
    setSummary(nextSummary);
    setEstimate(nextEstimate);
  }

  useEffect(() => {
    reload().catch((err) => setError(err?.message || String(err)));
    return subscribeOfflineQueue(() => reload().catch(() => {}));
  }, [ownerId]);

  const storagePct = useMemo(() => estimate?.quota ? Math.min(100, (estimate.usage / estimate.quota) * 100) : null, [estimate]);

  async function sync(entryId = '') {
    if (!online || !navigator.onLine) {
      setError('No internet connection yet. Your queued entries and photos remain safely stored on this device.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await syncOfflineQueue({
        ownerId,
        actor,
        entryId,
        ignoreBackoff: true,
        onProgress: (event) => {
          const name = event.entry?.form?.variety || event.entry?.form?.germ_trial_code || 'offline record';
          if (event.phase === 'entry') setProgress(`Syncing ${event.index} of ${event.total}: ${name}`);
          if (event.phase === 'photos') setProgress(`Uploading compressed photo ${event.done} of ${event.total} for ${name}`);
          if (event.phase === 'record') setProgress(`Saving ${name} to Appwrite…`);
          if (event.phase === 'request') setProgress(`Submitting ${name} for administrator approval…`);
          if (event.phase === 'cleanup') setProgress(`Finishing photo cleanup for ${name}…`);
        }
      });
      if (result.synced) onSynced?.(result);
      if (result.failed) setError(`${result.failed} queued entr${result.failed === 1 ? 'y' : 'ies'} still need attention. Nothing was discarded.`);
      setProgress(result.synced ? (result.approvalRequests ? `${result.approvalRequests} submission${result.approvalRequests === 1 ? '' : 's'} sent for administrator approval.` : `${result.synced} offline entr${result.synced === 1 ? 'y' : 'ies'} synced successfully.`) : 'No queued entries were synced.');
      await reload();
    } catch (err) {
      setError(err?.message || String(err || 'Offline sync failed.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry) {
    if (!confirm(`Remove the offline copy of ${entry.form?.variety || 'this queued record'}?`)) return;
    setError('');
    try {
      await discardPendingOfflineEntry(entry.id, ownerId);
      await reload();
    } catch (err) {
      setError(err?.message || String(err));
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal offline-queue-modal">
        <header className="modal-header">
          <div><small>IndexedDB field storage</small><h2>Offline queue</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close offline queue"><X size={19} /></button>
        </header>
        <div className="modal-content offline-queue-content">
          <div className="offline-queue-summary">
            <div><HardDrive size={19} /><span><small>Queued entries</small><strong>{summary.count}</strong></span></div>
            <div><CloudUpload size={19} /><span><small>Queued photos</small><strong>{summary.photoCount}</strong></span></div>
            <div><HardDrive size={19} /><span><small>Compressed queue</small><strong>{formatBytes(summary.bytes)}</strong></span></div>
            <div className={online ? 'queue-online' : 'queue-offline'}><span><small>Connection</small><strong>{online ? 'Ready to sync' : 'Offline'}</strong></span></div>
          </div>

          {estimate && <div className="device-storage-note"><span>Browser storage currently uses {formatBytes(estimate.usage)} of approximately {formatBytes(estimate.quota)} available to this site.</span>{storagePct !== null && <i><b style={{ width: `${storagePct}%` }} /></i>}</div>}
          <div className="queue-policy-note"><CloudUpload size={17} /><div><strong>Free-plan friendly sync</strong><span>No polling. Entries sync sequentially, compressed photos keep deterministic file IDs, and network failures stop the batch instead of retrying repeatedly.</span></div></div>

          {error && <div className="alert error">{error}</div>}
          {progress && <div className="alert progress">{busy && <LoaderCircle className="spin" size={17} />}{progress}</div>}

          {!entries.length ? (
            <div className="offline-queue-empty"><HardDrive size={34} /><h3>No offline entries waiting</h3><p>Use Save offline from the sugarcane record form when field connectivity is unavailable.</p></div>
          ) : (
            <div className="offline-entry-list">
              {entries.map((entry) => (
                <article key={entry.id} className={`offline-entry ${entry.status === 'error' ? 'has-error' : ''}`}>
                  <div className="offline-entry-main">
                    <span className="offline-entry-icon">{entry.status === 'error' ? <AlertTriangle size={19} /> : <HardDrive size={19} />}</span>
                    <div><small>{entry.operation === 'create' ? 'New field record' : 'Queued edit'} • {ageText(entry.createdAt)}</small><h3>{entry.form?.variety || entry.form?.germ_trial_code || 'Unnamed sugarcane record'}</h3><p>{entry.form?.germ_location || 'Location not recorded'}{entry.photos?.length ? ` • ${entry.photos.length} compressed photo${entry.photos.length === 1 ? '' : 's'}` : ' • no new photos'}</p>{entry.lastError && <span className="offline-entry-error">{entry.lastError}</span>}</div>
                  </div>
                  <div className="offline-entry-actions">
                    <button className="secondary-button compact-action" onClick={() => sync(entry.id)} disabled={busy || !online}><RefreshCw size={15} /> {entry.status === 'error' ? 'Retry' : 'Sync'}</button>
                    {Number(entry.attempts || 0) === 0 && <button className="icon-button bordered" title="Remove unsynced local entry" onClick={() => remove(entry)} disabled={busy}><Trash2 size={16} /></button>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          <span className="queue-footer-note">Multiple offline entries are supported and remain local until a successful Appwrite sync.</span>
          <span className="footer-spacer" />
          <button className="secondary-button" onClick={onClose}>Close</button>
          {!!entries.length && <button className="primary-button" onClick={() => sync()} disabled={busy || !online}>{busy ? <><LoaderCircle className="spin" size={16} /> Syncing…</> : <><CloudUpload size={16} /> Sync all</>}</button>}
        </footer>
      </section>
    </div>
  );
}
