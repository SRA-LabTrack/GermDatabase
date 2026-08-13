import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudOff, HardDrive, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { CHARACTERIZATION_GROUPS } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import { formatBytes, prepareImageVariants } from '../lib/imageTools';
import { queueOfflineRecord } from '../lib/offlineQueue';
import { submitChangeRequest } from '../lib/approvalApi';
import { ID, isNetworkFailure } from '../lib/appwrite';
import { createManualRecord, deleteStoredFiles, fileViewUrl, saveRecord, upsertRecordByVariety, uploadPreparedPhotos } from '../lib/registryApi';
import { emptyForm, messageFor } from '../lib/registryUi';
import { PHOTO_DOCUMENTATION_SECTIONS, normalizedPhotoCategories, primaryPhotoIndex } from '../lib/photoSections';

const DRAFT_PREFIX = 'canesprout-local-draft-v230:';
const DRAFT_SAVE_DELAY_MS = 900;

function Field({ field, value, onChange }) {
  const required = field.key === 'variety';
  const common = {
    value: value ?? '',
    onChange: (event) => onChange(field.key, event.target.value),
    required,
    'aria-required': required ? 'true' : undefined
  };
  return (
    <label className={`form-field ${field.type === 'textarea' ? 'wide' : ''} ${required ? 'required-field' : ''}`}>
      <span>{field.label}<i>{required ? 'Required' : 'Optional'}</i></span>
      {field.type === 'textarea' ? (
        <textarea {...common} rows={4} placeholder={required ? 'Required' : 'Optional'} />
      ) : field.type === 'select' ? (
        <select {...common}><option value="">{required ? 'Select a value' : 'Not provided'}</option>{field.options.map((option) => <option key={option}>{option}</option>)}</select>
      ) : (
        <input {...common} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.type === 'number' ? 'any' : undefined} placeholder={required ? 'Required' : 'Optional'} />
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

export default function RecordFormModal({ initial, actor, isAdmin = false, online, onClose, onSaved, onSubmitted, onQueued }) {
  const ownerId = actor?.id || actor?.$id || actor?.email || 'local-user';
  const editing = Boolean(initial?.$id);
  const draftKey = `${DRAFT_PREFIX}${initial?.$id || 'new'}`;
  const storedDraft = useMemo(() => readDraft(draftKey), [draftKey]);
  const [form, setForm] = useState(() => ({ ...emptyForm(), ...(initial || {}), ...(storedDraft?.form || {}) }));
  const [draftRestored, setDraftRestored] = useState(Boolean(storedDraft));
  const [dirty, setDirty] = useState(Boolean(storedDraft));
  const [newPhotoItems, setNewPhotoItems] = useState([]);
  const [removedFileIds, setRemovedFileIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  // New records keep one client-side ID for the lifetime of this form. If a
  // network timeout happens after Appwrite accepted a write, retrying the same
  // form updates the same document instead of creating a second/ghost record.
  const pendingCreateIdRef = useRef(initial?.$id || ID.unique());

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
    const categories = normalizedPhotoCategories(form.photo_categories, full.length);
    const deleted = [full[index], thumbs[index]].filter(Boolean);
    full.splice(index, 1); thumbs.splice(index, 1); names.splice(index, 1); categories.splice(index, 1);
    setRemovedFileIds((ids) => [...ids, ...deleted]);
    setForm((current) => ({
      ...current,
      photo_file_ids: full,
      thumb_file_ids: thumbs,
      photo_names: names,
      photo_categories: categories,
      primary_file_id: full[primaryPhotoIndex(categories, full.length)] || full[0] || '',
      thumbnail_file_id: thumbs[primaryPhotoIndex(categories, thumbs.length)] || thumbs[0] || ''
    }));
  }

  async function prepareSelectedPhotos() {
    const variants = [];
    for (let index = 0; index < newPhotoItems.length; index += 1) {
      const item = newPhotoItems[index];
      setProgress(`Compressing field photo ${index + 1} of ${newPhotoItems.length} to WebP…`);
      variants.push({ ...(await prepareImageVariants(item.file)), category: item.category });
    }
    return variants;
  }

  function addPhotos(category, files) {
    const picked = Array.from(files || []).slice(0, 4);
    if (!picked.length) return;
    setDirty(true);
    setNewPhotoItems((current) => [...current, ...picked.map((file) => ({ file, category }))].slice(0, 12));
  }

  function removeNewPhoto(index) {
    setDirty(true);
    setNewPhotoItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function saveOffline() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const variants = await prepareSelectedPhotos();
      const queuedBytes = variants.reduce((sum, item) => sum + Number(item.full?.blob?.size || 0) + Number(item.thumb?.blob?.size || 0), 0);
      setProgress(variants.length ? `Saving ${formatBytes(queuedBytes)} of compressed photos to this device…` : 'Saving complete record to this device…');
      const entry = await queueOfflineRecord({
        ownerId,
        actor: { id: actor?.id || actor?.$id || '', name: actor?.name || '', email: actor?.email || '', isAdmin },
        form,
        recordId: initial?.$id || '',
        previous: initial || null,
        removedFileIds,
        variants
      });
      clearDraft();
      onQueued?.(entry);
      onClose();
    } catch (err) {
      setError(err?.message || String(err || 'Could not save this record offline.'));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function submit(event) {
    event.preventDefault();
    const normalizedVariety = String(form.variety || '').trim();
    if (!normalizedVariety) {
      setSuccess('');
      setError('Variety Name is required before this record can be registered.');
      return;
    }
    if (!online) {
      await saveOffline();
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');
    let uploaded = [];
    let variants = [];
    let next = null;
    try {
      variants = await prepareSelectedPhotos();
      if (variants.length) {
        setProgress('Uploading optimized field images and thumbnails…');
        uploaded = await uploadPreparedPhotos(variants, ({ done, total }) => setProgress(`Uploading photo ${done} of ${total}…`), {
          ownerUserId: actor?.id || actor?.$id || '',
          finalAccess: isAdmin
        });
      }
      next = {
        ...form,
        variety: normalizedVariety,
        photo_file_ids: [...(form.photo_file_ids || []), ...uploaded.map((item) => item.fullId)],
        thumb_file_ids: [...(form.thumb_file_ids || []), ...uploaded.map((item) => item.thumbId)],
        photo_names: [...(form.photo_names || []), ...uploaded.map((item) => item.name)],
        photo_categories: [...normalizedPhotoCategories(form.photo_categories, (form.photo_file_ids || []).length), ...uploaded.map((item) => item.category || 'overview')]
      };
      const primaryIndex = primaryPhotoIndex(next.photo_categories, next.photo_file_ids.length);
      next.primary_file_id = next.photo_file_ids[primaryIndex] || next.photo_file_ids[0] || '';
      next.thumbnail_file_id = next.thumb_file_ids[primaryIndex] || next.thumb_file_ids[0] || '';
      if (isAdmin) {
        setProgress(editing ? 'Updating approved record in Appwrite…' : 'Registering variety in Appwrite…');
        const saved = editing
          ? (initial?.__bundledSnapshot
              ? (await upsertRecordByVariety(next, initial)).record
              : await saveRecord(next, initial?.$id || '', initial || null))
          : await createManualRecord(next, pendingCreateIdRef.current, (message) => setProgress(message));
        if (removedFileIds.length) deleteStoredFiles(removedFileIds).catch(() => {});
        clearDraft();
        const successMessage = editing
          ? `${next.variety} was updated successfully.`
          : `${next.variety} was registered successfully.`;
        setSuccess(successMessage);
        setProgress('');
        onSaved?.({ type: editing ? 'edit' : 'create', variety: next.variety || 'Sugarcane record', record: saved });
        window.setTimeout(() => onClose(), 850);
      } else {
        setProgress(editing ? 'Submitting edit for administrator approval…' : 'Submitting registration for administrator approval…');
        await submitChangeRequest({
          record: next,
          recordId: initial?.$id || '',
          actor,
          uploadedFileIds: uploaded.flatMap((item) => [item.fullId, item.thumbId]),
          removedFileIds
        });
        clearDraft();
        const successMessage = `${next.variety} ${editing ? 'edit' : 'registration'} was submitted for administrator approval.`;
        setSuccess(successMessage);
        setProgress('');
        onSubmitted?.({ type: editing ? 'edit' : 'create', variety: next.variety || 'Sugarcane record' });
        window.setTimeout(() => onClose(), 850);
      }
    } catch (err) {
      const networkLost = isNetworkFailure(err) || !navigator.onLine;
      if (networkLost) {
        try {
          // If image upload completed before the record write failed, keep those
          // already-created deterministic references and queue only the record.
          // If upload itself failed, uploadPreparedPhotos cleaned its touched IDs,
          // so the compressed local variants are queued for a later retry.
          const queuedForm = next || { ...form, variety: normalizedVariety };
          const entry = await queueOfflineRecord({
            ownerId,
            actor: { id: actor?.id || actor?.$id || '', name: actor?.name || '', email: actor?.email || '', isAdmin },
            form: queuedForm,
            recordId: initial?.$id || '',
            previous: initial || null,
            removedFileIds,
            variants: uploaded.length ? [] : variants
          });
          clearDraft();
          onQueued?.(entry);
          onClose();
          return;
        } catch (queueError) {
          setError(queueError?.message || messageFor(err));
          return;
        }
      }
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
  const existingCategories = normalizedPhotoCategories(form.photo_categories, existingPhotos.length);
  return (
    <div className="modal-backdrop">
      <form className="modal record-form-modal" onSubmit={submit}>
        <header className="modal-header">
          <div><small>{editing ? 'Edit sugarcane field record' : 'New sugarcane field record'}</small><h2>{editing ? form.variety || 'Edit characterization' : 'Add germination & varietal observations'}</h2></div>
          <button type="button" className="icon-button" onClick={closeKeepingDraft} aria-label="Close form"><X size={19} /></button>
        </header>
        <div className="modal-content form-scroll">
          <div className="optional-banner"><CheckCircle2 size={18} /><div><strong>Variety Name is required; all other traits are optional.</strong><span>{isAdmin ? 'Administrator saves apply directly to the live registry.' : 'User registrations and edits are submitted for administrator approval before they change the live registry.'} Save offline uses IndexedDB on this device.</span></div></div>
          {!online && <div className="offline-form-banner"><CloudOff size={18} /><div><strong>Offline field mode</strong><span>Save offline stores the complete entry plus compressed WebP photos locally. It can sync later when Appwrite is reachable.</span></div></div>}
          {draftRestored && <div className="local-draft-banner"><div><strong>Local draft restored</strong><span>This lightweight text draft came from this device and used zero Appwrite writes.</span></div><button type="button" className="text-button inline" onClick={() => { clearDraft(); setForm({ ...emptyForm(), ...(initial || {}) }); }}>Discard draft</button></div>}

          <section className="form-section germ-section"><div className="form-section-heading"><small>Crop establishment</small><h3>Planting & emergence</h3></div><div className="form-grid">{GERMINATION_FIELDS.map((field) => <Field key={field.key} field={field} value={form[field.key]} onChange={change} />)}</div></section>
          {CHARACTERIZATION_GROUPS.map((group) => <section className="form-section" key={group.title}><div className="form-section-heading"><small>{group.title === 'Germplasm Passport' ? 'Germplasm identity' : 'Varietal characterization'}</small><h3>{group.title}</h3></div><div className="form-grid">{group.fields.map((field) => <Field key={field.key} field={field} value={form[field.key]} onChange={change} />)}</div></section>)}

          <section className="form-section photo-documentation-section">
            <div className="form-section-heading"><small>Field documentation</small><h3>Photo documentation</h3></div>
            <p className="form-hint">Photos are compressed locally first. Each image is tagged to its documentation section so pest/disease evidence, crop stages, detailed characteristics, and variety overviews stay organized. Overview photos are preferred automatically for registry-card thumbnails.</p>
            <div className="photo-category-list">
              {PHOTO_DOCUMENTATION_SECTIONS.map((section) => {
                const existing = existingPhotos.map((id, index) => ({ id, index })).filter(({ index }) => existingCategories[index] === section.key);
                const selected = newPhotoItems.map((item, index) => ({ ...item, index })).filter((item) => item.category === section.key);
                return <div className="photo-category-card" key={section.key}>
                  <div className="photo-category-heading"><div><strong>{section.label}</strong><small>{section.hint}</small></div><span>{existing.length + selected.length} photo{existing.length + selected.length === 1 ? '' : 's'}</span></div>
                  {!!existing.length && <div className="edit-photo-grid">{existing.map(({ id, index }) => <div key={id}><img src={fileViewUrl(form.thumb_file_ids?.[index] || id)} alt={section.label} loading="lazy" decoding="async" /><button type="button" onClick={() => removeExisting(index)}><X size={14} /> Remove</button></div>)}</div>}
                  <label className="photo-drop compact-photo-drop"><ImagePlus size={21} /><span><strong>Add {section.label}</strong><small>Up to 4 at a time • WebP compression before upload/offline save</small></span><input type="file" accept="image/*,.heic,.heif" multiple onChange={(event) => { addPhotos(section.key, event.target.files); event.target.value = ''; }} /></label>
                  {!!selected.length && <div className="selected-files">{selected.map(({ file, index }) => <span key={`${file.name}-${file.size}-${index}`}>{file.name} <small>{formatBytes(file.size)}</small><button type="button" onClick={() => removeNewPhoto(index)} aria-label={`Remove ${file.name}`}><X size={12} /></button></span>)}</div>}
                </div>;
              })}
            </div>
          </section>
          {error && <div className="alert error">{error}</div>}
          {progress && <div className="alert progress"><LoaderCircle className="spin" size={17} /> {progress}</div>}
        </div>
        <footer className="modal-footer record-save-footer">
          <div className="record-save-feedback" aria-live="polite" aria-atomic="true">
            {error && <span className="record-save-message error"><AlertCircle size={15} />{error}</span>}
            {!error && success && <span className="record-save-message success"><CheckCircle2 size={15} />{success}</span>}
            {!error && !success && progress && <span className="record-save-message progress"><LoaderCircle className="spin" size={15} />{progress}</span>}
          </div>
          <button type="button" className="secondary-button" onClick={closeKeepingDraft}>{dirty ? 'Close & keep draft' : 'Close'}</button>
          <span className="footer-spacer" />
          <button type="button" className="secondary-button offline-save-button" onClick={saveOffline} disabled={busy || Boolean(success)}><HardDrive size={16} /> {busy && !progress ? 'Saving offline…' : 'Save offline'}</button>
          <button type="submit" className="primary-button" disabled={busy || Boolean(success)}>{success ? (isAdmin ? (editing ? 'Updated ✓' : 'Registered ✓') : 'Submitted ✓') : busy ? (online ? (isAdmin ? 'Saving…' : 'Submitting…') : 'Saving offline…') : online ? (isAdmin ? (editing ? 'Save changes' : 'Save record') : (editing ? 'Submit edit for approval' : 'Submit registration')) : 'Save offline'}</button>
        </footer>
      </form>
    </div>
  );
}
