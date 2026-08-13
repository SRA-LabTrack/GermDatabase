import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  Cloud,
  CloudOff,
  Dna,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X
} from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';
import {
  buildCombinationSearchResults,
  combinationSuggestions,
  combinationVarietyKey,
  createCombination,
  deleteCombination,
  getPendingCombinationCount,
  listCombinationVarieties,
  listRegisteredManualCombinations,
  refreshCombinationVarietiesFromLive,
  syncPendingCombinations,
  combinationSourceSummary
} from '../lib/combinationApi';
import { messageFor } from '../lib/registryUi';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function prettyDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Date not recorded';
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function displayedCombinationDate(row) {
  const sourceDate = String(row?.source_date_text || '').trim();
  if (sourceDate) return sourceDate;
  return prettyDate(row?.combination_date);
}

function sourceReference(row) {
  const sheet = String(row?.source_sheet || '').trim();
  const cell = String(row?.source_cell || '').trim();
  if (!sheet && !cell) return '';
  return `${sheet}${cell ? `!${cell}` : ''}`;
}

function VarietyAutocomplete({ catalog, value, onChange, placeholder, disabled = false, required = false, ariaLabel = 'Sugarcane variety' }) {
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => combinationSuggestions(catalog, value, 12), [catalog, value]);
  const typed = String(value || '').trim();
  const showSuggestions = focused && typed.length >= 2 && suggestions.length > 0;

  return (
    <div className="combination-autocomplete">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => window.setTimeout(() => setFocused(false), 100)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        autoComplete="off"
      />
      {focused && typed.length < 2 && <span className="combination-autocomplete-hint">Type at least 2 characters</span>}
      {showSuggestions && (
        <div className="combination-autocomplete-menu" role="listbox" aria-label={`${ariaLabel} suggestions`}>
          {suggestions.map((variety) => (
            <button
              key={`${combinationVarietyKey(variety)}:${variety}`}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(variety);
                setFocused(false);
              }}
            >
              <SugarcaneIcon size={15} />
              <span>{variety}</span>
            </button>
          ))}
          <small>Showing up to 12 local matches</small>
        </div>
      )}
    </div>
  );
}

export default function CombinationRegistryModal({ actor, isAdmin = false, onClose, onChanged, onNotice, toolbarBottom = 0 }) {
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogRefreshing, setCatalogRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('both');
  const [statusFilter, setStatusFilter] = useState('combined');
  const [resultFilter, setResultFilter] = useState('');
  const [history, setHistory] = useState([]);
  const [notCombined, setNotCombined] = useState([]);
  const [searchedVariety, setSearchedVariety] = useState('');
  const [searching, setSearching] = useState(false);
  const [liveChecking, setLiveChecking] = useState(false);
  const [liveCheckedAt, setLiveCheckedAt] = useState('');
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createForm, setCreateForm] = useState({ male: '', female: '', date: today(), notes: '' });
  const [manageOpen, setManageOpen] = useState(false);
  const [registeredRows, setRegisteredRows] = useState([]);
  const [registeredLoading, setRegisteredLoading] = useState(false);
  const [registeredCloudLoaded, setRegisteredCloudLoaded] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [renderLimit, setRenderLimit] = useState(80);
  const resultsRef = useRef(null);
  const sourceSummary = useMemo(() => combinationSourceSummary(), []);

  useEffect(() => {
    let cancelled = false;
    setPendingCount(getPendingCombinationCount());
    listCombinationVarieties()
      .then((values) => { if (!cancelled) setCatalog(values); })
      .catch((err) => { if (!cancelled) setError(messageFor(err)); })
      .finally(() => { if (!cancelled) setCatalogLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const exactCatalogName = useMemo(() => {
    const key = combinationVarietyKey(query);
    if (!key) return '';
    return catalog.find((item) => combinationVarietyKey(item) === key) || '';
  }, [catalog, query]);

  const combinedCounterpartCount = useMemo(
    () => new Set(history.map((row) => combinationVarietyKey(row.counterpart_variety))).size,
    [history]
  );

  useEffect(() => {
    setRenderLimit(80);
    if (resultsRef.current) resultsRef.current.scrollTop = 0;
  }, [searchedVariety, role, statusFilter, resultFilter]);

  const visibleRows = useMemo(() => {
    const needle = resultFilter.trim().toLowerCase();
    const combined = history.map((row) => ({ ...row, status: 'combined' }));
    const pending = notCombined.map((variety) => ({
      $id: `not-combined:${combinationVarietyKey(variety)}`,
      counterpart_variety: variety,
      status: 'not-combined',
      query_role: role === 'female' ? 'female' : role === 'male' ? 'male' : 'both',
      counterpart_role: role === 'female' ? 'male' : role === 'male' ? 'female' : 'counterpart'
    }));
    const source = statusFilter === 'combined' ? combined : statusFilter === 'not-combined' ? pending : [...combined, ...pending];
    if (!needle) return source;
    return source.filter((row) => `${row.counterpart_variety || ''} ${row.combination_date || ''} ${row.notes || ''}`.toLowerCase().includes(needle));
  }, [history, notCombined, resultFilter, role, statusFilter]);

  const renderedRows = useMemo(() => visibleRows.slice(0, renderLimit), [visibleRows, renderLimit]);
  const remainingRows = Math.max(0, visibleRows.length - renderedRows.length);

  async function performSearch(selected, { includeLive = false, force = false } = {}) {
    const target = String(selected || '').trim();
    if (!target) return;
    const setBusy = includeLive ? setLiveChecking : setSearching;
    setBusy(true);
    setError('');
    try {
      const result = await buildCombinationSearchResults(target, { role, includeLive, force });
      setHistory(result.history);
      setNotCombined(result.notCombined);
      const resolved = result.selectedVariety || target;
      setSearchedVariety(resolved);
      setQuery(resolved);
      if (includeLive) setLiveCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      if (!includeLive) {
        setHistory([]);
        setNotCombined([]);
        setSearchedVariety('');
      }
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function runSearch(event) {
    event?.preventDefault?.();
    const selected = exactCatalogName || query.trim();
    await performSearch(selected, { includeLive: false });
  }

  async function checkLiveHistory() {
    if (!searchedVariety || liveChecking) return;
    await performSearch(searchedVariety, { includeLive: true, force: true });
    setPendingCount(getPendingCombinationCount());
  }

  async function refreshLiveCatalog() {
    if (catalogRefreshing) return;
    setCatalogRefreshing(true);
    setError('');
    try {
      const result = await refreshCombinationVarietiesFromLive();
      setCatalog(result.values);
      onNotice?.(`Combination Registry refreshed ${Number(result.liveCount || 0).toLocaleString()} live germplasm varieties.`);
      if (searchedVariety) await performSearch(searchedVariety, { includeLive: false });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setCatalogRefreshing(false);
    }
  }

  async function loadRegisteredCombinations({ includeCloud = false } = {}) {
    if (registeredLoading) return;
    setRegisteredLoading(true);
    setError('');
    try {
      const rows = await listRegisteredManualCombinations({ includeCloud, limit: 50 });
      setRegisteredRows(rows);
      if (includeCloud) {
        setRegisteredCloudLoaded(true);
        onNotice?.(`Loaded up to 50 cloud-registered manual combinations with one Appwrite list request.`);
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setRegisteredLoading(false);
    }
  }

  async function toggleRegisteredManager() {
    const nextOpen = !manageOpen;
    setManageOpen(nextOpen);
    if (nextOpen) {
      setCreateOpen(false);
      await loadRegisteredCombinations({ includeCloud: false });
    }
  }

  async function recordCombination(event) {
    event.preventDefault();
    if (createBusy) return;
    setCreateBusy(true);
    setError('');
    try {
      const saved = await createCombination({
        maleVariety: createForm.male,
        femaleVariety: createForm.female,
        combinationDate: createForm.date,
        notes: createForm.notes
      }, actor);
      const male = saved?.male_variety || createForm.male;
      const female = saved?.female_variety || createForm.female;
      const date = saved?.combination_date || createForm.date;
      setCreateForm({ male: '', female: '', date: today(), notes: '' });
      setCreateOpen(false);
      const pending = getPendingCombinationCount();
      setPendingCount(pending);
      onChanged?.();
      if (saved?.sync_pending) {
        onNotice?.(`${male} × ${female} was recorded locally for ${prettyDate(date)}. Cloud sync is pending${pending ? ` (${pending})` : ''}.`);
      } else {
        onNotice?.(`${male} × ${female} combination recorded and synced for ${prettyDate(date)}.`);
      }
      if (searchedVariety) await performSearch(searchedVariety, { includeLive: false });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setCreateBusy(false);
    }
  }

  async function syncPending() {
    if (syncing || !pendingCount) return;
    setSyncing(true);
    setError('');
    try {
      const result = await syncPendingCombinations({ limit: 5 });
      setPendingCount(result.pending);
      if (result.synced) onNotice?.(`${result.synced} pending combination${result.synced === 1 ? '' : 's'} synced to Appwrite.`);
      if (result.deleted) onNotice?.(`${result.deleted} pending combination deletion${result.deleted === 1 ? '' : 's'} synced to Appwrite.`);
      if (result.failed) setError(result.lastError || 'Appwrite sync is still unavailable. Pending changes remain safe in this browser.');
      if (manageOpen) await loadRegisteredCombinations({ includeCloud: false });
      if (searchedVariety) await performSearch(searchedVariety, { includeLive: false });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setSyncing(false);
    }
  }

  async function removeCombination(row) {
    if (row?.source_hash) {
      onNotice?.('Workbook-source combination records are protected. Only manually registered combinations can be deleted here.');
      return;
    }
    if (!row?.$id || deleteBusyId) return;
    if (!window.confirm(`Delete the ${row.male_variety} × ${row.female_variety} combination recorded for ${prettyDate(row.combination_date)}?

This removes the manually registered combination. The original Cross combination.xlsx history is protected.`)) return;
    setDeleteBusyId(row.$id);
    setError('');
    try {
      const result = await deleteCombination(row);
      setPendingCount(getPendingCombinationCount());
      onChanged?.();
      if (result?.deletePending) {
        onNotice?.(`${row.male_variety} × ${row.female_variety} was removed locally. Cloud deletion is pending and can be retried with Sync pending.`);
      } else {
        onNotice?.(`${row.male_variety} × ${row.female_variety} combination was deleted.`);
      }
      if (manageOpen) await loadRegisteredCombinations({ includeCloud: false });
      if (searchedVariety) await performSearch(searchedVariety, { includeLive: false });
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setDeleteBusyId('');
    }
  }

  function changeRole(nextRole) {
    setRole(nextRole);
    setHistory([]);
    setNotCombined([]);
    setSearchedVariety('');
    setLiveCheckedAt('');
  }

  return (
    <div className="modal-backdrop combination-registry-backdrop" style={{ top: `${Math.max(0, Number(toolbarBottom) || 0) + 8}px` }}>
      <section className="modal combination-registry-modal" aria-label="Combination Registry">
        <header className="modal-header combination-registry-header">
          <div className="combination-heading">
            <span className="combination-heading-icon"><Dna size={23} /></span>
            <div><small>Breeding history</small><h2>Combination Registry</h2></div>
          </div>
          <div className="combination-header-actions">
            {isAdmin && <button type="button" className="primary-button compact" onClick={() => { setManageOpen(false); setCreateOpen((open) => !open); }}><Plus size={17} /><span>Record combination</span></button>}
            {isAdmin && <button type="button" className={`secondary-button compact combination-manage-button ${manageOpen ? 'active' : ''}`} onClick={toggleRegisteredManager}><Trash2 size={16} /><span>Manage registered</span></button>}
            <button type="button" className="secondary-button combination-close-button" onClick={onClose} aria-label="Close Combination Registry"><X size={18} /><span>Close</span></button>
          </div>
        </header>

        <div className="modal-content combination-registry-content">
          {createOpen && isAdmin && (
            <form className="combination-create-panel" onSubmit={recordCombination}>
              <div className="combination-panel-heading">
                <strong>Record a new male × female combination</strong>
                <small>Local-first save. Cloud sync uses one write attempt only and never scans the full registry.</small>
              </div>
              <div className="combination-create-grid">
                <label>
                  <span>Male variety</span>
                  <VarietyAutocomplete catalog={catalog} value={createForm.male} onChange={(male) => setCreateForm((current) => ({ ...current, male }))} placeholder="Type at least 2 characters" ariaLabel="Male variety" disabled={catalogLoading} required />
                </label>
                <span className="combination-cross">×</span>
                <label>
                  <span>Female variety</span>
                  <VarietyAutocomplete catalog={catalog} value={createForm.female} onChange={(female) => setCreateForm((current) => ({ ...current, female }))} placeholder="Type at least 2 characters" ariaLabel="Female variety" disabled={catalogLoading} required />
                </label>
                <label><span>Combination date</span><input type="date" value={createForm.date} onChange={(event) => setCreateForm((current) => ({ ...current, date: event.target.value }))} required /></label>
                <label className="combination-notes"><span>Notes <i>Optional</i></span><input value={createForm.notes} onChange={(event) => setCreateForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Cross number, location, breeder note…" /></label>
                <button className="primary-button" type="submit" disabled={createBusy || catalogLoading}>{createBusy ? <><LoaderCircle className="spin" size={17} /> Recording…</> : <><CheckCircle2 size={17} /> Save combination</>}</button>
              </div>
            </form>
          )}

          {manageOpen && isAdmin && (
            <section className="combination-manage-panel" aria-label="Manage registered combinations">
              <div className="combination-manage-heading">
                <div>
                  <strong>Manage registered combinations</strong>
                  <small>Manual records only. Local list uses zero requests. Check cloud registered performs one Appwrite list request and loads at most 50 records.</small>
                </div>
                <div className="combination-manage-actions">
                  <button type="button" className="secondary-button compact" onClick={() => loadRegisteredCombinations({ includeCloud: true })} disabled={registeredLoading}>
                    {registeredLoading ? <LoaderCircle className="spin" size={15} /> : <Cloud size={15} />}
                    <span>{registeredLoading ? 'Loading…' : registeredCloudLoaded ? 'Refresh cloud registered' : 'Check cloud registered'}</span>
                  </button>
                  <button type="button" className="secondary-button compact" onClick={() => setManageOpen(false)}><X size={15} /><span>Close list</span></button>
                </div>
              </div>
              <div className="combination-manage-list">
                {registeredRows.map((row) => (
                  <article className={`combination-manage-row ${row.sync_state === 'delete_pending' ? 'delete-pending' : ''}`} key={`manage:${row.$id}`}>
                    <div className="combination-manage-cross"><Dna size={18} /></div>
                    <div className="combination-manage-main">
                      <strong>{row.male_variety} <span>×</span> {row.female_variety}</strong>
                      <small>{prettyDate(row.combination_date)}{row.created_by_name ? ` • ${row.created_by_name}` : ''}</small>
                    </div>
                    <div className="combination-manage-state">
                      {row.sync_state === 'delete_pending' ? <span className="combination-sync-badge pending"><CloudOff size={11} /> Deletion pending</span> : row.sync_state === 'pending' ? <span className="combination-sync-badge pending"><CloudOff size={11} /> Create pending</span> : <span className="combination-sync-badge"><Cloud size={11} /> Registered</span>}
                    </div>
                    {row.sync_state !== 'delete_pending' && (
                      <button type="button" className="secondary-button compact danger combination-manage-delete" onClick={() => removeCombination(row)} disabled={deleteBusyId === row.$id}>
                        {deleteBusyId === row.$id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}
                        <span>{deleteBusyId === row.$id ? 'Deleting…' : 'Delete'}</span>
                      </button>
                    )}
                  </article>
                ))}
                {!registeredLoading && registeredRows.length === 0 && (
                  <div className="combination-manage-empty"><Trash2 size={24} /><strong>No manual combinations stored in this browser</strong><span>Use Check cloud registered to load up to 50 manually registered cloud records.</span></div>
                )}
              </div>
            </section>
          )}

          <form className="combination-search-panel" onSubmit={runSearch}>
            <div className="combination-search-copy"><SugarcaneIcon size={22} /><div><strong>Find combination history</strong><small>Typing and normal Search are local-only. Appwrite is contacted only when you explicitly check live changes.</small></div></div>
            <div className="combination-search-row">
              <div className="combination-query-input">
                <Search size={18} />
                <VarietyAutocomplete catalog={catalog} value={query} onChange={setQuery} placeholder={catalogLoading ? 'Loading varieties…' : 'Type at least 2 characters…'} disabled={catalogLoading} ariaLabel="Search female or male variety" />
              </div>
              <div className="combination-role-toggle" aria-label="Search variety role">
                <button type="button" className={role === 'both' ? 'active' : ''} onClick={() => changeRole('both')}>Both roles</button>
                <button type="button" className={role === 'male' ? 'active' : ''} onClick={() => changeRole('male')}>As male</button>
                <button type="button" className={role === 'female' ? 'active' : ''} onClick={() => changeRole('female')}>As female</button>
              </div>
              <button className="primary-button combination-search-button" type="submit" disabled={searching || query.trim().length < 2}>{searching ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} Search</button>
            </div>
          </form>

          <div className="combination-source-strip combination-freeplan-strip">
            <span className="combination-fast-mode"><CheckCircle2 size={14} /><b>Fast local mode</b> normal searches use bundled history</span>
            <span><strong>{Number(sourceSummary.combination_records || 0).toLocaleString()}</strong> unique combination events</span>
            <span><strong>{Number(sourceSummary.sheet_count || 0).toLocaleString()}</strong> source sheets</span>
            {Number(sourceSummary.duplicate_extra_records_removed || 0) > 0 && (
              <span className="combination-integrity-ok"><CheckCircle2 size={14} /><strong>{Number(sourceSummary.duplicate_extra_records_removed).toLocaleString()}</strong> duplicate source entries removed</span>
            )}
            {pendingCount > 0 && (
              <button type="button" className="combination-sync-pending" onClick={syncPending} disabled={syncing} title="Sync at most five pending records per click">
                {syncing ? <LoaderCircle className="spin" size={14} /> : <CloudOff size={14} />}
                <span>{syncing ? 'Syncing…' : `Sync pending (${pendingCount})`}</span>
              </button>
            )}
            {searchedVariety && (
              <button type="button" className="combination-live-refresh" onClick={checkLiveHistory} disabled={liveChecking} title="Fetch only this selected variety's live combination history">
                {liveChecking ? <LoaderCircle className="spin" size={14} /> : <Cloud size={14} />}
                <span>{liveChecking ? 'Checking…' : liveCheckedAt ? `Live checked ${liveCheckedAt}` : 'Check live changes'}</span>
              </button>
            )}
            <button type="button" className="combination-live-refresh" onClick={refreshLiveCatalog} disabled={catalogRefreshing} title="Heavier action: use only when you need newly-added germplasm varieties">
              {catalogRefreshing ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}
              <span>{catalogRefreshing ? 'Refreshing…' : 'Refresh latest varieties'}</span>
            </button>
          </div>

          {error && <div className="alert error combination-error">{error}</div>}

          {searchedVariety && (
            <>
              <section className="combination-summary" aria-label="Combination search summary">
                <div><small>Selected variety</small><strong>{searchedVariety}</strong><span>{role === 'both' ? 'Male + female history' : role === 'male' ? 'Male history' : 'Female history'}</span></div>
                <div><small>Combined with</small><strong>{combinedCounterpartCount}</strong><span>unique varieties</span></div>
                <div><small>Combination events</small><strong>{history.length}</strong><span>recorded events</span></div>
                <div><small>Can still combine with</small><strong>{notCombined.length}</strong><span>registered varieties with no recorded cross</span></div>
              </section>

              <section className="combination-result-tools">
                <div className="combination-status-toggle" aria-label="Combination status filter">
                  <button type="button" className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>All <b>{history.length + notCombined.length}</b></button>
                  <button type="button" className={statusFilter === 'combined' ? 'active' : ''} onClick={() => setStatusFilter('combined')}>Combined <b>{history.length}</b></button>
                  <button type="button" className={statusFilter === 'not-combined' ? 'active' : ''} onClick={() => setStatusFilter('not-combined')}>Can still combine <b>{notCombined.length}</b></button>
                </div>
                <div className="combination-result-search"><Search size={16} /><input value={resultFilter} onChange={(event) => setResultFilter(event.target.value)} placeholder="Filter result varieties…" />{resultFilter && <button type="button" onClick={() => setResultFilter('')} aria-label="Clear result filter"><X size={14} /></button>}</div>
              </section>

              <div className="combination-results" role="list" ref={resultsRef}>
                {renderedRows.map((row) => (
                  <article className={`combination-result-row ${row.status}`} key={`${row.$id}:${row.query_role || ''}`} role="listitem">
                    <div className="combination-result-mark">{row.status === 'combined' ? <Dna size={20} /> : <SugarcaneIcon size={20} />}</div>
                    <div className="combination-result-main">
                      <div className="combination-result-badges">
                        <span className={`combination-status-badge ${row.status}`}>{row.status === 'combined' ? 'Combined' : 'Not yet combined'}</span>
                        {row.status === 'combined' && row.sync_state === 'pending' ? <span className="combination-sync-badge pending"><CloudOff size={11} /> Pending cloud sync</span> : null}
                      </div>
                      <strong>{row.counterpart_variety}</strong>
                      <small>{row.status === 'combined' ? `${searchedVariety} as ${row.query_role} • ${row.counterpart_variety} as ${row.counterpart_role}` : role === 'male' ? 'Available as female counterpart' : role === 'female' ? 'Available as male counterpart' : 'No recorded combination with this variety'}</small>
                    </div>
                    <div className="combination-result-date">{row.status === 'combined' ? <><CalendarDays size={16} /><span><small>Combination date</small><strong>{displayedCombinationDate(row)}</strong>{sourceReference(row) ? <em>{sourceReference(row)}</em> : null}</span></> : <span><small>History</small><strong>No recorded cross</strong></span>}</div>
                    {row.status === 'combined' && row.notes ? <div className="combination-result-notes"><small>Notes</small><span>{row.notes}</span></div> : null}
                    {isAdmin && row.status === 'combined' && !row.source_hash ? <button type="button" className="icon-button combination-delete" onClick={() => removeCombination(row)} disabled={deleteBusyId === row.$id} title="Delete manually registered combination">{deleteBusyId === row.$id ? <LoaderCircle className="spin" size={16} /> : <Trash2 size={17} />}</button> : null}
                  </article>
                ))}
                {!visibleRows.length && <div className="combination-empty"><Dna size={32} /><strong>No results in this filter</strong><span>Change the Combined / Can still combine filter or search another variety.</span></div>}
                {remainingRows > 0 && (
                  <div className="combination-load-more">
                    <span>Showing {renderedRows.length.toLocaleString()} of {visibleRows.length.toLocaleString()} results</span>
                    <button type="button" className="secondary-button compact" onClick={() => setRenderLimit((current) => current + 80)}>Show next {Math.min(80, remainingRows)}</button>
                  </div>
                )}
              </div>
            </>
          )}

          {!searchedVariety && !error && <div className="combination-empty combination-empty-start"><Dna size={36} /><strong>Search a variety to trace its breeding combinations</strong><span>Type at least two characters. Only 12 local suggestions are shown, so opening the field never renders the entire registry.</span></div>}
        </div>
      </section>
    </div>
  );
}
