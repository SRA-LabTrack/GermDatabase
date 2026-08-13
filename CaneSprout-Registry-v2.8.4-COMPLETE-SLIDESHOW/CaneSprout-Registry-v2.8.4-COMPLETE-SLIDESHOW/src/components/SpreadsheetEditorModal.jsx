import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, LoaderCircle, RefreshCw, RotateCcw, Save, Search, X } from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';
import { CHARACTERIZATION_GROUPS } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN,
  SEARCH_SCOPES,
  SHEET_PAGE_SIZE,
  listSpreadsheetRecords,
  saveSpreadsheetRecords
} from '../lib/registryApi';
import { messageFor } from '../lib/registryUi';

const GROUPS = [
  { title: 'Planting & emergence', fields: GERMINATION_FIELDS },
  ...CHARACTERIZATION_GROUPS
];

function cloneRecord(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

function CellInput({ field, value, onChange }) {
  if (field.type === 'select') {
    return <select value={value ?? ''} onChange={(event) => onChange(event.target.value)}><option value="">Not provided</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>;
  }
  if (field.type === 'textarea') return <textarea rows={2} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />;
  return <input type={field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />;
}

function spreadsheetMessageFor(error) {
  if (error?.spreadsheetPhase === 'details') {
    return 'The registry is reachable, but the full characterization details took too long to load. Retry, or search for a specific variety so fewer full records need to be fetched.';
  }
  if (error?.spreadsheetPhase === 'core') {
    return messageFor(error);
  }
  return messageFor(error);
}

export default function SpreadsheetEditorModal({ onClose, onSaved }) {
  const [rows, setRows] = useState([]);
  const [originals, setOriginals] = useState({});
  const [changed, setChanged] = useState(() => new Set());
  const [groupIndex, setGroupIndex] = useState(0);
  const [cursor, setCursor] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchScope, setSearchScope] = useState('variety');
  const [query, setQuery] = useState({ term: '', scope: 'variety' });
  const tableRef = useRef(null);
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    document.body.classList.add('spreadsheet-editor-open');
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || saving) return;
      if (changed.size) {
        const discardEdits = window.confirm('Discard unsaved spreadsheet edits and close the editor?');
        if (!discardEdits) return;
      }
      onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('spreadsheet-editor-open');
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [changed.size, saving, onClose]);

  function closeEditor() {
    if (saving) return;
    if (changed.size) {
      const discardEdits = window.confirm('Discard unsaved spreadsheet edits and close the editor?');
      if (!discardEdits) return;
    }
    onClose?.();
  }

  const group = GROUPS[groupIndex] || GROUPS[0];
  const visibleFields = useMemo(() => group.fields.filter((field) => field.key !== 'variety'), [group]);
  const activeSearch = Boolean(query.term);

  async function load(reset = false, queryOverride = query) {
    const generation = reset ? loadGenerationRef.current + 1 : loadGenerationRef.current;
    if (reset) loadGenerationRef.current = generation;
    reset ? setLoading(true) : setLoadingMore(true);
    setError('');
    try {
      const result = await listSpreadsheetRecords({
        cursor: reset ? '' : cursor,
        search: queryOverride.term,
        scope: queryOverride.scope
      });
      if (generation !== loadGenerationRef.current) return;
      setRows((current) => reset ? result.documents : [...current, ...result.documents]);
      setOriginals((current) => {
        const next = reset ? {} : { ...current };
        result.documents.forEach((record) => { next[record.$id] = cloneRecord(record); });
        return next;
      });
      if (reset) setChanged(new Set());
      setCursor(result.nextCursor || '');
      setHasMore(Boolean(result.hasMore));
      if (reset) tableRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    } catch (err) {
      if (generation !== loadGenerationRef.current) return;
      if (reset) {
        setRows([]);
        setOriginals({});
        setCursor('');
        setHasMore(false);
      }
      setError(spreadsheetMessageFor(err));
    } finally {
      if (generation === loadGenerationRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    load(true, query);
    // query changes only after the debounce/manual search commits a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.term, query.scope]);

  function commitSearch(rawTerm = searchInput, scope = searchScope) {
    const term = String(rawTerm || '').trim();
    if (changed.size) {
      setNotice('Apply or discard the current spreadsheet edits before changing the search results.');
      return;
    }
    if (term && term.length < SEARCH_MIN) {
      setNotice(`Type at least ${SEARCH_MIN} characters to search. No Appwrite request was sent.`);
      return;
    }
    setNotice('');
    const next = { term, scope };
    if (query.term === next.term && query.scope === next.scope) {
      load(true, next);
    } else {
      setQuery(next);
    }
  }

  useEffect(() => {
    const term = searchInput.trim();
    if (!term) {
      if (query.term && !changed.size) setQuery({ term: '', scope: searchScope });
      return undefined;
    }
    if (term.length < SEARCH_MIN || changed.size) return undefined;
    const timer = window.setTimeout(() => commitSearch(term, searchScope), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, searchScope, changed.size]);

  function clearSearch() {
    if (changed.size) {
      setNotice('Apply or discard the current spreadsheet edits before clearing the search.');
      return;
    }
    setSearchInput('');
    setNotice('');
    if (query.term) setQuery({ term: '', scope: searchScope });
  }

  function edit(recordId, key, value) {
    setRows((current) => current.map((record) => record.$id === recordId ? { ...record, [key]: value } : record));
    setChanged((current) => new Set(current).add(recordId));
    setNotice('');
  }

  function discard() {
    setRows((current) => current.map((record) => changed.has(record.$id) ? cloneRecord(originals[record.$id]) : record));
    setChanged(new Set());
    setNotice('Unsaved spreadsheet edits discarded.');
  }

  async function applyChanges() {
    const changes = rows.filter((record) => changed.has(record.$id)).map((record) => ({ record, previous: originals[record.$id] }));
    if (!changes.length || saving) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const result = await saveSpreadsheetRecords(changes, ({ done, total, errors }) => setProgress(`Applying ${done}/${total} changed row${total === 1 ? '' : 's'}${errors ? ` • ${errors} failed` : ''}`));
      if (result.errors.length) {
        setError(`${result.saved.length} row${result.saved.length === 1 ? '' : 's'} saved. ${result.errors.length} failed. First error: ${result.errors[0].message}`);
        const savedIds = new Set(result.saved.map((record) => record.$id));
        setChanged((current) => new Set([...current].filter((id) => !savedIds.has(id))));
      } else {
        const nextOriginals = { ...originals };
        result.saved.forEach((record) => { nextOriginals[record.$id] = cloneRecord(record); });
        setOriginals(nextOriginals);
        setRows((current) => current.map((record) => nextOriginals[record.$id] || record));
        setChanged(new Set());
        setNotice(`${result.saved.length} changed row${result.saved.length === 1 ? '' : 's'} applied to the live registry.`);
        onSaved?.();
      }
    } catch (err) { setError(messageFor(err)); }
    finally { setSaving(false); setProgress(''); }
  }

  return <div className="modal-backdrop spreadsheet-backdrop">
    <section className="modal spreadsheet-editor-modal">
      <header className="modal-header spreadsheet-editor-header">
        <div className="spreadsheet-editor-title">
          <span className="spreadsheet-editor-mark"><SugarcaneIcon size={24} /></span>
          <div><small>Administrator bulk editing</small><h2>Excel-style registry editor</h2></div>
        </div>
        <button className="secondary-button spreadsheet-close-button" type="button" onClick={closeEditor} aria-label="Close spreadsheet editor">
          <X size={17} /> Close editor
        </button>
      </header>

      <div className="spreadsheet-searchbar">
        <div className="spreadsheet-search-field">
          <Search size={17} />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') commitSearch(); }}
            placeholder="Search variety, trial code, location, status or keywords…"
            aria-label="Search spreadsheet records"
          />
          {searchInput && <button type="button" className="spreadsheet-clear-search" onClick={clearSearch} aria-label="Clear spreadsheet search"><X size={15} /></button>}
        </div>
        <label><span>Search in</span><select value={searchScope} onChange={(event) => setSearchScope(event.target.value)}>{Object.entries(SEARCH_SCOPES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label>
        <button className="secondary-button spreadsheet-search-button" type="button" onClick={() => commitSearch()} disabled={loading || saving}><Search size={15} /> Search</button>
      </div>
      <div className="spreadsheet-search-meta">
        {activeSearch ? <span>Showing up to {SHEET_PAGE_SIZE} full records per page for “{query.term}” in {SEARCH_SCOPES[query.scope]?.label || 'Variety'}.</span> : <span>Browse mode loads {SHEET_PAGE_SIZE} full records per page. Search starts at {SEARCH_MIN} characters after a {SEARCH_DEBOUNCE_MS} ms debounce.</span>}
      </div>

      <div className="spreadsheet-controls">
        <div className="spreadsheet-note"><SugarcaneIcon size={21} /><div><strong>Edit cells, then apply once.</strong><span>Nothing is written while you type. Only changed rows are saved when you press Apply changes.</span></div></div>
        <label><span>Column group</span><select value={groupIndex} onChange={(event) => { setGroupIndex(Number(event.target.value)); tableRef.current?.scrollTo({ left: 0, behavior: 'smooth' }); }}>{GROUPS.map((item, index) => <option value={index} key={item.title}>{item.title}</option>)}</select></label>
        <div className="spreadsheet-actions"><button className="secondary-button" onClick={discard} disabled={!changed.size || saving}><RotateCcw size={15} /> Discard edits</button><button className="primary-button" onClick={applyChanges} disabled={!changed.size || saving}><Save size={16} /> {saving ? 'Applying…' : `Apply ${changed.size || ''} change${changed.size === 1 ? '' : 's'}`}</button></div>
      </div>

      <div className="spreadsheet-table-wrap" ref={tableRef}>
        {loading ? <div className="admin-loading"><LoaderCircle className="spin" size={18} /> Loading up to {SHEET_PAGE_SIZE} full records…</div> : rows.length ? <table className="excel-grid"><thead><tr><th className="row-number">#</th><th className="sticky-variety">Variety</th>{visibleFields.map((field) => <th key={field.key}>{field.label}</th>)}</tr></thead><tbody>{rows.map((record, rowIndex) => <tr key={record.$id} className={changed.has(record.$id) ? 'changed-row' : ''}><td className="row-number">{rowIndex + 1}</td><td className="sticky-variety"><input value={record.variety ?? ''} onChange={(event) => edit(record.$id, 'variety', event.target.value)} /></td>{visibleFields.map((field) => <td key={field.key}><CellInput field={field} value={record[field.key]} onChange={(value) => edit(record.$id, field.key, value)} /></td>)}</tr>)}</tbody></table> : <div className="spreadsheet-empty"><SugarcaneIcon size={30} /><strong>{activeSearch ? 'No matching records' : 'No records loaded'}</strong><span>{activeSearch ? 'Try a different search term or scope.' : 'Retry the registry connection to load editable rows.'}</span></div>}
      </div>

      <footer className="spreadsheet-footer">
        <span>{rows.length} record{rows.length === 1 ? '' : 's'} loaded • {changed.size} row{changed.size === 1 ? '' : 's'} changed{activeSearch ? ` • search: ${query.term}` : ''}</span>
        <div className="spreadsheet-footer-actions">
          {error && <button className="secondary-button" onClick={() => load(true, query)} disabled={loading || saving}><RefreshCw size={14} /> Retry</button>}
          {hasMore && <button className="secondary-button" onClick={() => load(false, query)} disabled={loadingMore || saving}>{loadingMore ? <><LoaderCircle className="spin" size={15} /> Loading…</> : `Load ${SHEET_PAGE_SIZE} more`}</button>}
        </div>
      </footer>
      {notice && <div className="alert success spreadsheet-alert"><CheckCircle2 size={15} /> {notice}</div>}
      {error && <div className="alert error spreadsheet-alert">{error}</div>}
      {progress && <div className="alert progress spreadsheet-alert"><LoaderCircle className="spin" size={15} /> {progress}</div>}
    </section>
  </div>;
}
