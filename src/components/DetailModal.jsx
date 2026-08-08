import React, { useEffect, useState } from 'react';
import { LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import { CHARACTERIZATION_GROUPS } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import { deleteRecord, fileViewUrl, getRecord } from '../lib/registryApi';
import { messageFor, pct } from '../lib/registryUi';

export default function DetailModal({ recordId, onClose, onEdit, onDeleted, isAdmin = false }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [photoViewIndex, setPhotoViewIndex] = useState(-1);

  useEffect(() => {
    let live = true;
    getRecord(recordId)
      .then((value) => { if (live) setRecord(value); })
      .catch((err) => live && setError(messageFor(err)))
      .finally(() => live && setLoading(false));
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
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal detail-modal">
        <header className="modal-header">
          <div><small>Field record</small><h2>{record?.variety || 'Sugarcane characterization'}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close details"><X size={19} /></button>
        </header>
        <div className="modal-content detail-content">
          {loading && <div className="detail-loading"><LoaderCircle className="spin" /> Loading only this record…</div>}
          {error && <div className="alert error">{error}</div>}
          {record && <>
            <section className="detail-hero">
              <div>
                <span className="eyebrow">Germination + varietal characterization</span>
                <h3>{record.variety || 'Unnamed variety'}</h3>
                <p>{record.germ_location || 'Nursery / field location not recorded'}{record.germ_trial_code ? ` • Trial ${record.germ_trial_code}` : ''}</p>
              </div>
              <div className="detail-hero-rate"><small>Germination</small><strong>{pct(record) === null ? '—' : `${pct(record).toFixed(1)}%`}</strong></div>
            </section>

            {!!photos.length && <>
              <section className="photo-gallery">
                {photos.map((id, index) => (
                  <button type="button" className="photo-thumb-button" key={id} onClick={() => setPhotoViewIndex(index)} title="Load full-resolution photo">
                    <img src={fileViewUrl(record.thumb_file_ids?.[index] || id)} alt={record.photo_names?.[index] || 'Sugarcane field photo'} loading="lazy" decoding="async" fetchPriority="low" />
                    <span>Open field photo</span>
                  </button>
                ))}
              </section>
              <p className="photo-bandwidth-note">Only small WebP thumbnails load with the record. The full image is requested from Appwrite Storage only when you open a photo.</p>
            </>}

            <section className="detail-section">
              <div className="section-title"><div><small>Crop establishment</small><h3>Germination trial</h3></div></div>
              <div className="detail-grid">
                {GERMINATION_FIELDS.map((field) => <div key={field.key}><small>{field.label}</small><strong>{record[field.key] || 'Not provided'}</strong></div>)}
                <div><small>Calculated germination %</small><strong>{pct(record) === null ? 'Not available' : `${pct(record).toFixed(2)}%`}</strong></div>
              </div>
            </section>

            <div className="show-empty-row"><button className="secondary-button" onClick={() => setShowEmpty(!showEmpty)}>{showEmpty ? 'Hide unrecorded traits' : 'Show all optional traits'}</button></div>
            {CHARACTERIZATION_GROUPS.map((group) => {
              const fields = showEmpty ? group.fields : group.fields.filter((field) => record[field.key]);
              if (!fields.length) return null;
              return (
                <section className="detail-section" key={group.title}>
                  <div className="section-title"><div><small>Varietal characterization</small><h3>{group.title}</h3></div></div>
                  <div className="detail-grid">{fields.map((field) => <div key={field.key}><small>{field.label}</small><strong>{record[field.key] || 'Not provided'}</strong></div>)}</div>
                </section>
              );
            })}
          </>}
        </div>
        {record && <footer className="modal-footer">
          {isAdmin && <button className="danger-button" onClick={remove} disabled={deleting}><Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete'}</button>}
          <span className="footer-spacer" />
          <button className="secondary-button" onClick={() => onEdit(record)}><Pencil size={16} /> {isAdmin ? 'Edit' : 'Request edit'}</button>
          <button className="primary-button" onClick={onClose}>Done</button>
        </footer>}
        {record && photoViewIndex >= 0 && photos[photoViewIndex] && (
          <div className="photo-lightbox" onMouseDown={(event) => event.target === event.currentTarget && setPhotoViewIndex(-1)}>
            <button type="button" className="icon-button photo-lightbox-close" onClick={() => setPhotoViewIndex(-1)} aria-label="Close full photo"><X size={20} /></button>
            <img src={fileViewUrl(photos[photoViewIndex])} alt={record.photo_names?.[photoViewIndex] || 'Full sugarcane field photo'} decoding="async" fetchPriority="high" />
            <span>{record.photo_names?.[photoViewIndex] || `Photo ${photoViewIndex + 1}`}</span>
          </div>
        )}
      </section>
    </div>
  );
}
