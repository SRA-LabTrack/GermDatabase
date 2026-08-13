import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, LoaderCircle, Pencil, Trash2, X } from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';
import { CHARACTERIZATION_GROUPS, NEW_TEMPLATE_GROUP_TITLES } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import { deleteRecord, deleteRecordByVariety, fileViewUrl, getRecord } from '../lib/registryApi';
import { queueOfflineDelete } from '../lib/offlineQueue';
import { isNetworkFailure } from '../lib/appwrite';
import { messageFor, pct } from '../lib/registryUi';
import { PHOTO_DOCUMENTATION_SECTIONS, normalizedPhotoCategories } from '../lib/photoSections';

const PREVIEW_FIELD_KEYS = new Set([
  'variety',
  'accession_number',
  'origin',
  'collection_year',
  'species',
  'recommended_locations',
  'parentage_female',
  'parentage_male',
  'yield_tc_ha',
  'yield_lkg_tc',
  'disease_reaction',
]);

function shown(value, fallback = 'Not recorded') {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

export default function DetailModal({ recordId, onClose, onEdit, onDeleted, onQueuedDelete, actor = null, online = navigator.onLine, isAdmin = false }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdditional, setShowAdditional] = useState(false);
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
      if (!online || !navigator.onLine) {
        const entry = await queueOfflineDelete({ ownerId: actor?.id || actor?.$id || actor?.email || 'local-user', actor: { ...actor, isAdmin }, record });
        onQueuedDelete?.(entry, record);
      } else if (record.__bundledSnapshot) {
        await deleteRecordByVariety(record.variety);
        onDeleted?.({ offline: false, record });
      } else {
        await deleteRecord(record);
        onDeleted?.({ offline: false, record });
      }
      onClose();
    } catch (err) {
      if (isNetworkFailure(err) || !navigator.onLine) {
        try {
          const entry = await queueOfflineDelete({ ownerId: actor?.id || actor?.$id || actor?.email || 'local-user', actor: { ...actor, isAdmin }, record });
          onQueuedDelete?.(entry, record);
          onClose();
          return;
        } catch (queueError) {
          setError(queueError?.message || messageFor(err));
        }
      } else {
        setError(messageFor(err));
      }
    } finally {
      setDeleting(false);
    }
  }

  const photos = record?.photo_file_ids || [];
  const photoCategories = normalizedPhotoCategories(record?.photo_categories, photos.length);

  const parentals = useMemo(() => {
    if (!record) return 'Not recorded';
    const female = String(record.parentage_female || '').trim();
    const male = String(record.parentage_male || '').trim();
    if (female && male) return `${female} X ${male}`;
    return female || male || 'Not recorded';
  }, [record]);

  return (
    <div className="modal-backdrop detail-profile-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal detail-modal compact-germplasm-profile">
        <header className="modal-header">
          <div><small>Germplasm profile</small><h2>{record?.variety || 'Sugarcane genetic resource'}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close details"><X size={19} /></button>
        </header>

        <div className="modal-content detail-content">
          {loading && <div className="detail-loading"><LoaderCircle className="spin" /> Loading only this record…</div>}
          {error && <div className="alert error">{error}</div>}
          {record?.__bundledSnapshot && <div className="alert info">Offline-safe bundled registry snapshot. Edits/deletes are matched back to the live variety identity when CaneSprout reconnects.</div>}

          {record && <>
            <section className="detail-hero compact-profile-hero">
              <div>
                <span className="eyebrow"><SugarcaneIcon size={16} /> Sugarcane genetic resource profile</span>
                <h3>{record.variety || 'Unnamed variety'}</h3>
                <p>Core germplasm passport and breeding information</p>
              </div>
            </section>

            <section className="detail-section germplasm-preview-section">
              <div className="section-title">
                <div>
                  <small>Germplasm preview</small>
                  <h3>Core profile information</h3>
                </div>
              </div>

              <div className="germplasm-profile-preview-grid">
                <div>
                  <small>Accession Number</small>
                  <strong>{shown(record.accession_number)}</strong>
                </div>

                <div>
                  <small>Origin</small>
                  <strong>{shown(record.origin)}</strong>
                </div>

                <div>
                  <small>Collection Year</small>
                  <strong>{shown(record.collection_year)}</strong>
                </div>

                <div>
                  <small>Species</small>
                  <strong>{shown(record.species)}</strong>
                </div>

                <div className="profile-preview-wide">
                  <small>Parentals</small>
                  <strong>{parentals}</strong>
                </div>

                <div className="yield-preview-card">
                  <small>Yield Potential</small>
                  <span><b>TC/Ha</b><strong>{shown(record.yield_tc_ha)}</strong></span>
                  <span><b>LKg/TC</b><strong>{shown(record.yield_lkg_tc)}</strong></span>
                </div>

                <div className="profile-preview-wide">
                  <small>Recommended locations</small>
                  <strong>{shown(record.recommended_locations)}</strong>
                </div>

                <div className="profile-preview-wide">
                  <small>Reaction to Diseases</small>
                  <strong>{shown(record.disease_reaction)}</strong>
                </div>
              </div>
            </section>

            <div className="additional-traits-toggle-row">
              <button
                type="button"
                className={`secondary-button additional-traits-toggle ${showAdditional ? 'active' : ''}`}
                onClick={() => setShowAdditional((current) => !current)}
                aria-expanded={showAdditional}
              >
                <SugarcaneIcon size={17} />
                <span>{showAdditional ? 'Hide additional traits' : 'Additional traits'}</span>
                {showAdditional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {showAdditional && <>
              {!!photos.length && <section className="detail-section categorized-photo-documentation additional-trait-section">
                <div className="section-title"><div><small>Additional traits</small><h3>Photo documentation</h3></div></div>
                {PHOTO_DOCUMENTATION_SECTIONS.map((section) => {
                  const sectionPhotos = photos.map((id, index) => ({ id, index })).filter(({ index }) => photoCategories[index] === section.key);
                  if (!sectionPhotos.length) return null;
                  return <div className="detail-photo-category" key={section.key}>
                    <div className="detail-photo-category-heading"><strong>{section.label}</strong><small>{section.hint}</small></div>
                    <div className="photo-gallery">
                      {sectionPhotos.map(({ id, index }) => <button type="button" className="photo-thumb-button" key={id} onClick={() => setPhotoViewIndex(index)} title="Load full-resolution photo">
                        <img src={fileViewUrl(record.thumb_file_ids?.[index] || id)} alt={record.photo_names?.[index] || section.label} loading="lazy" decoding="async" fetchPriority="low" />
                        <span>Open photo</span>
                      </button>)}
                    </div>
                  </div>;
                })}
                <p className="photo-bandwidth-note">Only small WebP thumbnails load with the record. Full images are requested from Appwrite Storage only when opened.</p>
              </section>}

              <section className="detail-section additional-trait-section">
                <div className="section-title"><div><small>Additional traits</small><h3>Germination trial</h3></div></div>
                <div className="detail-grid">
                  {GERMINATION_FIELDS.map((field) => (
                    <div key={field.key}>
                      <small>{field.label}</small>
                      <strong>{shown(record[field.key], 'Not provided')}</strong>
                    </div>
                  ))}
                  <div>
                    <small>Calculated germination %</small>
                    <strong>{pct(record) === null ? 'Not available' : `${pct(record).toFixed(2)}%`}</strong>
                  </div>
                </div>
              </section>

              {CHARACTERIZATION_GROUPS.map((group) => {
                const fields = group.fields.filter((field) => !PREVIEW_FIELD_KEYS.has(field.key));
                if (!fields.length) return null;
                const canonicalExtension = NEW_TEMPLATE_GROUP_TITLES.includes(group.title);

                return (
                  <section className={`detail-section additional-trait-section ${canonicalExtension ? 'new-template-trait-section' : ''}`} key={group.title}>
                    <div className="section-title">
                      <div>
                        <small>{canonicalExtension ? 'Additional canonical attributes' : 'Additional characterization'}</small>
                        <h3>{group.title}</h3>
                      </div>
                      {canonicalExtension && <span className="template-trait-badge">Optional trait group</span>}
                    </div>
                    <div className="detail-grid">
                      {fields.map((field) => (
                        <div key={field.key}>
                          <small>{field.label}</small>
                          <strong>{shown(record[field.key], 'Not provided')}</strong>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </>}
          </>}
        </div>

        {record && <footer className="modal-footer detail-profile-footer">
          {isAdmin && (
            <button className="danger-button" onClick={remove} disabled={deleting}>
              <Trash2 size={16} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          )}
          <span className="footer-spacer" />
          {(<button className="secondary-button" onClick={() => onEdit(record)}>
              <Pencil size={16} /> {isAdmin ? 'Edit' : 'Request edit'}
            </button>)}
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
