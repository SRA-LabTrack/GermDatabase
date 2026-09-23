import React, { useEffect, useMemo, useRef, useState } from 'react';
import { GitBranch, LoaderCircle, Search, X } from 'lucide-react';
import { listLocalPedigreeRecords } from '../lib/registryApi';
import { buildThreeGenerationPedigree, pedigreeCatalog, pedigreeMatches } from '../lib/pedigree';
import { normalizeVarietyDisplay, normalizeVarietyIdentity } from '../lib/legacyHyv';
import { SOURCE_PARENTAGE_METADATA } from '../lib/sourceParentage';

function NodeCard({ node, label, onOpenProfile }) {
  const canOpen = Boolean(node?.resolved && node?.recordId && onOpenProfile);
  return (
    <article className={`pedigree-node-card ${node?.missing ? 'missing' : ''} ${node?.resolved ? 'resolved' : 'unresolved'}`}>
      <span className="pedigree-node-role">{label}</span>
      <strong>{node?.name || 'N/A'}</strong>
      {node?.repeated && <small>Repeated ancestor</small>}
      {node?.sourceBacked && <small className="pedigree-source-note">SRA source-backed parentage{node?.sourceRow ? ` · row ${node.sourceRow}` : ''}</small>}
      {!node?.missing && !node?.resolved && <small>Name recorded, matching registry profile not found</small>}
      {node?.missing && <small>Parentage not recorded</small>}
      {canOpen && <button type="button" onClick={() => onOpenProfile(node.recordId)}>View profile</button>}
    </article>
  );
}

function connectorLabel(role) {
  return role === 'male' ? 'Male parent' : 'Female parent';
}

export default function PedigreeModal({ onClose, onOpenProfile }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    let live = true;
    listLocalPedigreeRecords()
      .then((rows) => { if (live) setRecords(rows || []); })
      .catch((err) => { if (live) setError(err?.message || String(err)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const catalog = useMemo(() => pedigreeCatalog(records), [records]);
  const suggestions = useMemo(() => pedigreeMatches(catalog, query, 12), [catalog, query]);
  const tree = useMemo(() => selected ? buildThreeGenerationPedigree(selected, records) : null, [selected, records]);

  const parents = tree ? [tree.male, tree.female] : [];
  const grandparents = tree ? [tree.male?.male, tree.male?.female, tree.female?.male, tree.female?.female] : [];

  function choose(record) {
    setSelected(record);
    setQuery(normalizeVarietyDisplay(record?.variety || ''));
  }

  function submitSearch(event) {
    event.preventDefault();
    const typedKey = normalizeVarietyIdentity(query);
    const exact = catalog.find((record) => normalizeVarietyIdentity(record.variety) === typedKey);
    choose(exact || suggestions[0] || null);
  }

  return (
    <div className="pedigree-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pedigree-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <section className="pedigree-modal-shell">
        <header className="pedigree-modal-header">
          <div>
            <span className="eyebrow"><GitBranch size={16} /> Germplasm lineage</span>
            <h2 id="pedigree-title">Three-Generation Pedigree</h2>
            <p>Select a variety to trace its recorded male and female parentage through parents and grandparents.</p>
          </div>
          <button type="button" className="icon-button bordered" onClick={onClose} aria-label="Close pedigree"><X size={20} /></button>
        </header>

        <form className="pedigree-search" onSubmit={submitSearch}>
          <Search size={19} />
          <input ref={searchRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Search a registered variety…" autoComplete="off" aria-label="Search variety for pedigree" />
          <button type="submit" className="primary-button" disabled={loading || !query.trim()}>Build pedigree</button>
          {!!query.trim() && !selected && suggestions.length > 0 && (
            <div className="pedigree-search-results" role="listbox" aria-label="Variety suggestions">
              {suggestions.map((record) => (
                <button key={`${normalizeVarietyIdentity(record.variety)}:${record.$id || record.variety}`} type="button" onClick={() => choose(record)}>
                  <GitBranch size={15} /><span>{normalizeVarietyDisplay(record.variety)}</span>
                </button>
              ))}
            </div>
          )}
        </form>

        {loading && <div className="pedigree-loading"><LoaderCircle className="spin" size={22} /> Loading local germplasm parentage…</div>}
        {error && <div className="alert error">{error}</div>}

        {!loading && !tree && (
          <div className="pedigree-empty-state">
            <GitBranch size={38} />
            <h3>Select a variety</h3>
            <p>The chart uses CaneSprout's existing parentage records. Missing ancestors are shown as N/A.</p>
          </div>
        )}

        {tree && (
          <div className="pedigree-chart-wrap">
            <div className="pedigree-generation pedigree-generation-root">
              <div className="pedigree-generation-label"><b>Generation 1</b><span>Selected variety</span></div>
              <div className="pedigree-generation-grid root-grid">
                <NodeCard node={tree} label="Selected variety" onOpenProfile={onOpenProfile} />
              </div>
            </div>

            <div className="pedigree-branch-lines two"><span /><span /></div>

            <div className="pedigree-generation">
              <div className="pedigree-generation-label"><b>Generation 2</b><span>Parents</span></div>
              <div className="pedigree-generation-grid parents-grid">
                {parents.map((node, index) => <NodeCard key={`parent-${index}`} node={node} label={connectorLabel(index === 0 ? 'male' : 'female')} onOpenProfile={onOpenProfile} />)}
              </div>
            </div>

            <div className="pedigree-branch-lines four"><span /><span /><span /><span /></div>

            <div className="pedigree-generation">
              <div className="pedigree-generation-label"><b>Generation 3</b><span>Grandparents</span></div>
              <div className="pedigree-generation-grid grandparents-grid">
                {grandparents.map((node, index) => {
                  const parentSide = index < 2 ? 'male parent' : 'female parent';
                  const role = index % 2 === 0 ? 'Male' : 'Female';
                  return <NodeCard key={`grand-${index}`} node={node} label={`${role} parent of ${parentSide}`} onOpenProfile={onOpenProfile} />;
                })}
              </div>
            </div>

            <footer className="pedigree-chart-note">
              <span>Male parents are shown before female parents at each branch.</span>
              <span>Pedigree depth: 3 generations.</span>
              <span>{SOURCE_PARENTAGE_METADATA.recordCount} SRA HYV parentage records are used as the authoritative lineage source, with LR taking precedence over LG.</span>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
