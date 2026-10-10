import React, { useEffect, useMemo, useState } from 'react';
import { Info, LoaderCircle, Maximize2, Printer, X, ZoomIn } from 'lucide-react';
import { fileViewUrl, getRecord } from '../lib/registryApi';
import { normalizeVarietyDisplay } from '../lib/legacyHyv';
import { resolveRecordParentage } from '../lib/sourceParentage';
import { brochurePhotoSlots } from '../lib/photoSections';
import { brochureCharacteristics, openVarietyBrochure } from '../lib/varietyBrochure';

function shown(value, fallback = 'N/A') {
  const valueText = String(value ?? '').trim();
  return valueText || fallback;
}

function PartPhoto({ record, index, label, className = '', onOpen }) {
  const fileId = index >= 0 ? record?.photo_file_ids?.[index] : '';
  const url = fileId ? fileViewUrl(fileId) : '';

  if (!url) {
    return (
      <div className={`collection-brochure-photo collection-brochure-photo-na ${className}`}>
        <span>{label}</span>
        <strong>N/A</strong>
        <small>No uploaded image for this part</small>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`collection-brochure-photo collection-brochure-photo-button ${className}`}
      onClick={() => onOpen?.({ url, label })}
      aria-label={`Open full-size ${label} photo`}
      title={`Click to enlarge ${label}`}
    >
      <img src={url} alt={`${record?.variety || 'Sugarcane'} ${label}`} loading="eager" decoding="async" />
      <span className="collection-brochure-photo-caption">{label}</span>
      <span className="collection-brochure-photo-zoom"><ZoomIn size={16} /> Enlarge</span>
    </button>
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
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);

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
      if (event.key !== 'Escape') return;

      if (selectedPhoto) {
        event.preventDefault();
        setSelectedPhoto(null);
        return;
      }

      if (selectedDetail) {
        event.preventDefault();
        setSelectedDetail(null);
        return;
      }

      onClose?.();
    }

    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  }, [onClose, selectedPhoto, selectedDetail]);

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

  function openDetail(label, value) {
    setSelectedDetail({ label, value: shown(value) });
  }

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
          <div className="collection-brochure-window-hint">
            <ZoomIn size={15} />
            <span>Click photos or details to enlarge</span>
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
                <button
                  type="button"
                  className="collection-brochure-parentage collection-brochure-parentage-button"
                  onClick={() => openDetail('Parentage', parentals)}
                  title="Click to view parentage"
                >
                  ({parentals})
                </button>
                <div className="collection-brochure-division">BREEDING PROGRAM</div>
              </header>

              <section className="collection-brochure-photo-layout">
                <PartPhoto
                  record={record}
                  index={slots.overview}
                  label="Whole Variety"
                  className="collection-brochure-photo-main"
                  onOpen={setSelectedPhoto}
                />
                <div className="collection-brochure-photo-side">
                  <PartPhoto
                    record={record}
                    index={slots.stalk}
                    label="Stalk"
                    className="collection-brochure-photo-stalk"
                    onOpen={setSelectedPhoto}
                  />
                  <PartPhoto
                    record={record}
                    index={slots.budEye}
                    label="Eye / Bud"
                    className="collection-brochure-photo-eye"
                    onOpen={setSelectedPhoto}
                  />
                </div>
              </section>

              <section className="collection-brochure-characteristics">
                <div className="collection-brochure-characteristics-heading">
                  <div>
                    <h2>AGRONOMIC-MORPHOLOGICAL CHARACTERISTICS</h2>
                    <span>Click any row to view the complete value in a larger panel.</span>
                  </div>
                  <Info size={18} />
                </div>

                <div className="collection-brochure-characteristic-table">
                  {rows.map(([label, value]) => (
                    <button
                      type="button"
                      className="collection-brochure-characteristic-row"
                      key={label}
                      onClick={() => openDetail(label, value)}
                      title={`View ${label}`}
                    >
                      <b>{label}:</b>
                      <span>{shown(value)}</span>
                      <Maximize2 size={15} />
                    </button>
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

      {selectedPhoto && (
        <div
          className="collection-brochure-photo-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedPhoto.label} full-size photo`}
          onMouseDown={(event) => event.target === event.currentTarget && setSelectedPhoto(null)}
        >
          <div className="collection-brochure-photo-lightbox-card">
            <header>
              <div>
                <small>{record?.variety || 'Sugarcane variety'}</small>
                <strong>{selectedPhoto.label}</strong>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedPhoto(null)} aria-label="Close full-size photo">
                <X size={19} />
              </button>
            </header>
            <div className="collection-brochure-photo-lightbox-image">
              <img src={selectedPhoto.url} alt={`${record?.variety || 'Sugarcane'} ${selectedPhoto.label}`} />
            </div>
          </div>
        </div>
      )}

      {selectedDetail && (
        <div
          className="collection-brochure-detail-viewer"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedDetail.label} detail`}
          onMouseDown={(event) => event.target === event.currentTarget && setSelectedDetail(null)}
        >
          <article className="collection-brochure-detail-card">
            <header>
              <div>
                <small>{record?.variety || 'Sugarcane variety'}</small>
                <strong>{selectedDetail.label}</strong>
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedDetail(null)} aria-label="Close detail">
                <X size={19} />
              </button>
            </header>
            <div className="collection-brochure-detail-value">{selectedDetail.value}</div>
          </article>
        </div>
      )}
    </div>
  );
}
