import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { CHARACTERIZATION_GROUPS } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import { formatBytes, prepareImageVariants } from '../lib/imageTools';
import { deleteStoredFiles, fileViewUrl, saveRecord, uploadPreparedPhotos } from '../lib/registryApi';
import { emptyForm, messageFor } from '../lib/registryUi';

const DRAFT_PREFIX = 'canesprout-local-draft-v230:';
const DRAFT_SAVE_DELAY_MS = 900;

function Field({ field, value, onChange }) {
  const common = { value: value ?? '', onChange: (event) => onChange(field.key, event.target.value) };
  return (
    <label className={`form-field ${field.type === 'textarea' ? 'wide' : ''}`}>
      <span>{field.label}<i>Optional</i></span>
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

function readDraft(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || 'null');
    return parsed?.form && typeof parsed.form === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(key, form) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), form }));
  } catch {}
}

export default function RecordFormModal({ initial, onClose, onSaved }) {
  const editing = Boolean(initial?.$id);
  const draftKey = `${DRAFT_PREFIX}${initial?.$id || 'new'}`;
  const storedDraft = useMemo(() => readDraft(draftKey), [draftKey]);
  const [form, setForm] = useState(() => ({ ...emptyForm(), ...(initial || {}), ...(storedDraft?.form || {}) }));
  const [draftRestored, setDraftRestored] = useState(Boolean(storedDraft));
  const [dirty, setDirty] = useState(Boolean(storedDraft));
  const [newFiles, setNewFiles] = useState([]);
  const [removedFileIds, setRemovedFileIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dirty) return undefined;
    const timer = window.setTimeout(() => writeDraft(draftKey, form), DRAFT_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draftKey, form, dirty]);

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch {}
    setDraftRestored(false);
    setDirty(false);
  }

  function closeKeepingDraft() {
    if (dirty) writeDraft(draftKey, form);
    onClose();
  }

  function change(key, value) {
    setDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function removeExisting(index) {
    setDirty(true);
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
    let uploaded = [];
    try {
      const variants = [];
      for (let index = 0; index < newFiles.length; index += 1) {
        setProgress(`Compressing field photo ${index + 1} of ${newFiles.length} to WebP…`);
        variants.push(await prepareImageVariants(newFiles[index]));
      }
      if (variants.length) {
        setProgress('Uploading optimized field images and thumbnails…');
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
      await saveRecord(next, initial?.$id || '', initial || null);
      if (removedFileIds.length) deleteStoredFiles(removedFileIds).catch(() => {});
      clearDraft();
      onSaved();
      onClose();
    } catch (err) {
      if (uploaded.length) {
        const orphanIds = uploaded.flatMap((item) => [item.fullId, item.thumbId]).filter(Boolean);
        await deleteStoredFiles(orphanIds).catch(() => {});
      }
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
        <header className="modal-header">
          <div><small>{editing ? 'Edit sugarcane field record' : 'New sugarcane field record'}</small><h2>{editing ? form.variety || 'Edit characterization' : 'Add germination & varietal observations'}</h2></div>
          <button type="button" className="icon-button" onClick={closeKeepingDraft} aria-label="Close form"><X size={19} /></button>
        </header>
        <div className="modal-content form-scroll">
          <div className="optional-banner"><CheckCircle2 size={18} /><div><strong>Every trait is optional.</strong><span>Record only what was actually observed in the nursery, field, or characterization sheet. Cloud writes happen only when you press Save.</span></div></div>
          {draftRestored && <div className="local-draft-banner"><div><strong>Local draft restored</strong><span>This draft came from this device and used zero Appwrite writes.</span></div><button type="button" className="text-button inline" onClick={() => { clearDraft(); setForm({ ...emptyForm(), ...(initial || {}) }); }}>Discard draft</button></div>}

          <section className="form-section germ-section"><div className="form-section-heading"><small>Crop establishment</small><h3>Planting & emergence</h3></div><div className="form-grid">{GERMINATION_FIELDS.map((field) => <Field key={field.key} field={field} value={form[field.key]} onChange={change} />)}</div></section>
          {CHARACTERIZATION_GROUPS.map((group) => <section className="form-section" key={group.title}><div className="form-section-heading"><small>Varietal characterization</small><h3>{group.title}</h3></div><div className="form-grid">{group.fields.map((field) => <Field key={field.key} field={field} value={form[field.key]} onChange={change} />)}</div></section>)}

          <section className="form-section">
            <div className="form-section-heading"><small>Field documentation</small><h3>Photos</h3></div>
            <p className="form-hint">Photos are compressed locally before upload. Cards use tiny WebP thumbnails; full images are fetched only when a photo is opened.</p>
            {!!existingPhotos.length && <div className="edit-photo-grid">{existingPhotos.map((id, index) => <div key={id}><img src={fileViewUrl(form.thumb_file_ids?.[index] || id)} alt="Existing field record" loading="lazy" decoding="async" /><button type="button" onClick={() => removeExisting(index)}><X size={14} /> Remove</button></div>)}</div>}
            <label className="photo-drop"><ImagePlus size={24} /><span><strong>Add field photos</strong><small>JPEG, PNG, WebP, HEIC/HEIF and browser-readable images</small></span><input type="file" accept="image/*,.heic,.heif" multiple onChange={(event) => { setDirty(true); setNewFiles(Array.from(event.target.files || []).slice(0, 8)); }} /></label>
            {!!newFiles.length && <div className="selected-files">{newFiles.map((file) => <span key={`${file.name}-${file.size}`}>{file.name} <small>{formatBytes(file.size)}</small></span>)}</div>}
          </section>
          {error && <div className="alert error">{error}</div>}
          {progress && <div className="alert progress"><LoaderCircle className="spin" size={17} /> {progress}</div>}
        </div>
        <footer className="modal-footer">
          <button type="button" className="secondary-button" onClick={closeKeepingDraft}>{dirty ? 'Close & keep local draft' : 'Close'}</button>
          <span className="footer-spacer" />
          <button className="primary-button" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Save record'}</button>
        </footer>
      </form>
    </div>
  );
}
