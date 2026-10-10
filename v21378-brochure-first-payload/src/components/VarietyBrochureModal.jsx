import React, { useEffect, useMemo, useState } from 'react';
import { LoaderCircle, Maximize2, Printer, X } from 'lucide-react';
import { fileViewUrl, getRecord } from '../lib/registryApi';
import { normalizeVarietyDisplay } from '../lib/legacyHyv';
import { resolveRecordParentage } from '../lib/sourceParentage';
import { brochurePhotoSlots } from '../lib/photoSections';
import { brochureCharacteristics, openVarietyBrochure } from '../lib/varietyBrochure';

function shown(value, fallback = 'N/A') {
  const valueText = String(value ?? '').trim();
  return valueText || fallback;
}

function PartPhoto({ record, index, label, className = '' }) {
  const fileId = index >= 0 ? record?.photo_file_ids?.[index] : '';
  const url = fileId ? fileViewUrl(fileId) : '';

  if (!url) {
    return (
      <div className={`collection-brochure-photo collection-brochure-photo-na ${className}`}>
        <span>{label}</span>
        <strong>N/A</strong>
      </div>
    );
  }

  return (
    <figure className={`collection-brochure-photo ${className}`}>
      <img src={url} alt={`${record?.variety || 'Sugarcane'} ${label}`} loading="eager" decoding="async" />
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function VarietyBrochureModal({
  recordId,
  onClose,
  onExpandDetails
}) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');

    getRecord(recordId)
      .then((value) => {
        if (live) setRecord(value);
      })
      .catch((err) => {
        if (live) setError(err?.message || 'Could not load this variety brochure.');
      })
      .finally(() => {
        if (live) setLoading(false);
      });

    return () => { live = false; };
  }, [recordId]);

  useEffect(() => {
    function keyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [onClose]);

  const parentals = useMemo(() => {
    if (!record) return 'N/A';
    const resolved = resolveRecordParentage(record);
    const female = normalizeVarietyDisplay(resolved.female || '');
    const male = normalizeVarietyDisplay(resolved.male || '');
    if (male && female) return `${male} X ${female}`;
    return male || female || 'N/A';
  }, [record]);

  const slots = useMemo(() => record ? brochurePhotoSlots(record) : {
    overview: -1,
    stalk: -1,
    budEye: -1,
    leaf: -1
  }, [record]);

  const characteristics = useMemo(
    () => record ? brochureCharacteristics(record) : null,
    [record]
  );

  const rows = characteristics ? [
    ['Growth Habit', characteristics.growthHabit],
    ['Flowering', characteristics.flowering],
    ['Leaf Characteristics', characteristics.leaf],
    ['Stalk Characteristics', characteristics.stalk],
    ['Average Millable Stalk', characteristics.averageMillableStalk],
    ['Average stalk weight', characteristics.averageStalkWeight],
    ['Average stalk diameter', characteristics.averageStalkDiameter],
    ['Reaction to Diseases', characteristics.diseaseReaction],
    ['Potential Yield', characteristics.potentialYield],
    ['Recommended in', characteristics.recommended]
  ] : [];

  return (
    <div
      className="collection-brochure-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${record?.variety || 'Sugarcane'} variety brochure`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <section className="collection-brochure-modal">
        <header className="collection-brochure-windowbar">
          <div>
            <small>Germplasm Collection · Variety Brochure</small>
            <strong>{record?.variety || 'Loading variety…'}</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close brochure">
            <X size={19} />
          </button>
        </header>

        <div className="collection-brochure-scroll">
          {loading && (
            <div className="collection-brochure-loading">
              <LoaderCircle className="spin" size={24} />
              <span>Building variety brochure…</span>
            </div>
          )}

          {error && <div className="alert error">{error}</div>}

          {record && (
            <article className="collection-brochure-sheet">
              <header className="collection-brochure-masthead">
                <div className="collection-brochure-institution">SUGARCANE GERMPLASM RESOURCE DATABASE</div>
                <div className="collection-brochure-center">Varietal Characteristics Brochure</div>
                <h1>{record.variety || 'Unnamed Variety'}</h1>
                <div className="collection-brochure-parentage">({parentals})</div>
                <div className="collection-brochure-division">BREEDING PROGRAM</div>
              </header>

              <section className="collection-brochure-photo-layout">
                <PartPhoto
                  record={record}
                  index={slots.overview}
                  label="Whole Variety"
                  className="collection-brochure-photo-main"
                />
                <div className="collection-brochure-photo-side">
                  <PartPhoto
                    record={record}
                    index={slots.stalk}
                    label="Stalk"
                    className="collection-brochure-photo-stalk"
                  />
                  <PartPhoto
                    record={record}
                    index={slots.budEye}
                    label="Eye / Bud"
                    className="collection-brochure-photo-eye"
                  />
                </div>
              </section>

              <section className="collection-brochure-characteristics">
                <h2>AGRONOMIC-MORPHOLOGICAL CHARACTERISTICS</h2>
                <div className="collection-brochure-characteristic-table">
                  {rows.map(([label, value]) => (
                    <div className="collection-brochure-characteristic-row" key={label}>
                      <b>{label}:</b>
                      <span>{shown(value)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <footer className="collection-brochure-note">
                <span>
                  Photo slots use only correctly categorized uploaded images.
                  Missing whole-variety, stalk, or eye/bud images display N/A.
                </span>
              </footer>
            </article>
          )}
        </div>

        {record && (
          <footer className="collection-brochure-actions">
            <button type="button" className="secondary-button" onClick={() => openVarietyBrochure(record)}>
              <Printer size={16} /> Print brochure
            </button>
            <span className="footer-spacer" />
            <button
              type="button"
              className="primary-button collection-brochure-expand"
              onClick={() => onExpandDetails?.(record.$id)}
            >
              <Maximize2 size={17} /> Expand full details
            </button>
            <button type="button" className="secondary-button" onClick={onClose}>Close</button>
          </footer>
        )}
      </section>
    </div>
  );
}
