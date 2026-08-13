import React, { useEffect, useMemo, useState } from 'react';
import { Check, Download, LoaderCircle, Search, X } from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';
import { CHARACTERIZATION_FIELDS } from '../lib/characterizationFields';
import { GERMINATION_FIELDS } from '../lib/germinationFields';
import {
  SEARCH_MIN,
  exportAllRecords,
  getRecord,
  listRecords
} from '../lib/registryApi';
import { messageFor } from '../lib/registryUi';

function excelCellValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((item) => String(item ?? '')).filter(Boolean).join('; ');
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return value;
}

async function writeExcel(records, filename) {
  const XLSX = await import('xlsx');
  const characterizationColumns = CHARACTERIZATION_FIELDS.filter((field) => field.key !== 'variety');
  const germinationColumns = GERMINATION_FIELDS.filter(
    (field) => !characterizationColumns.some((item) => item.key === field.key)
  );

  const rows = records.map((record) => {
    const row = {
      'Record ID': record.$id || record.id || '',
      'Variety Name': excelCellValue(record.variety),
    };

    for (const field of characterizationColumns) {
      row[`${field.label} (${field.key})`] = excelCellValue(record[field.key]);
    }
    for (const field of germinationColumns) {
      row[`${field.label} (${field.key})`] = excelCellValue(record[field.key]);
    }

    row['Source Name'] = excelCellValue(record.source_name);
    row['Source Row'] = excelCellValue(record.source_row);
    row['Created By'] = excelCellValue(record.created_by_name || record.created_by_email);
    row['Created At'] = excelCellValue(record.$createdAt || record.created_at);
    row['Updated At'] = excelCellValue(record.$updatedAt || record.updated_at);
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const headers = rows.length ? Object.keys(rows[0]) : ['Variety Name'];
  worksheet['!cols'] = headers.map((header) => ({
    wch: Math.min(34, Math.max(14, String(header).length + 2)),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Germplasm Collection');
  XLSX.writeFile(workbook, filename, { compression: true });
}

function safeFilename(value) {
  return String(value || 'variety')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export default function ExportExcelModal({ onClose, onExported }) {
  const [scope, setScope] = useState('specific');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (scope !== 'specific') return undefined;
    const term = query.trim();

    if (term.length < SEARCH_MIN) {
      setResults([]);
      setSearching(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      setError('');
      try {
        const page = await listRecords({
          search: term,
          scope: 'variety',
          bypassCache: false,
        });
        if (!cancelled) setResults(page.documents || []);
      } catch (err) {
        if (!cancelled) setError(messageFor(err));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, scope]);

  const selectedIds = useMemo(
    () => new Set(selected.map((record) => record.$id)),
    [selected]
  );

  const selectedLabel = useMemo(() => {
    if (!selected.length) return '';
    if (selected.length === 1) return String(selected[0]?.variety || '').trim();
    return `${selected.length} selected varieties`;
  }, [selected]);

  function toggleSelected(record) {
    if (!record?.$id) return;
    setSelected((current) => {
      const exists = current.some((item) => item.$id === record.$id);
      return exists
        ? current.filter((item) => item.$id !== record.$id)
        : [...current, record];
    });
  }

  function removeSelected(recordId) {
    setSelected((current) => current.filter((item) => item.$id !== recordId));
  }

  function selectVisible() {
    setSelected((current) => {
      const map = new Map(current.map((item) => [item.$id, item]));
      results.forEach((item) => {
        if (item?.$id) map.set(item.$id, item);
      });
      return [...map.values()];
    });
  }

  async function exportSpecific() {
    if (!selected.length) return;

    setBusy(true);
    setError('');
    setProgress(`Loading 0/${selected.length} selected varieties…`);

    try {
      const fullRecords = [];
      const batchSize = 6;

      for (let index = 0; index < selected.length; index += batchSize) {
        const batch = selected.slice(index, index + batchSize);
        const loaded = await Promise.all(batch.map((record) => getRecord(record.$id)));
        fullRecords.push(...loaded);
        setProgress(`Loading ${fullRecords.length}/${selected.length} selected varieties…`);
      }

      setProgress(`Building Excel file for ${fullRecords.length} varieties…`);
      await writeExcel(
        fullRecords,
        selected.length === 1
          ? `Sugarcane-Germplasm-${safeFilename(selected[0]?.variety)}-${new Date().toISOString().slice(0, 10)}.xlsx`
          : `Sugarcane-Germplasm-Selected-${selected.length}-${new Date().toISOString().slice(0, 10)}.xlsx`
      );

      onExported?.(
        selected.length === 1
          ? `${selected[0]?.variety || 'Selected variety'} exported to Excel.`
          : `${selected.length} selected germplasm varieties exported to Excel.`
      );
      onClose();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function exportWholeRegistry() {
    setBusy(true);
    setError('');
    setProgress('Starting parallel registry read…');
    try {
      const documents = await exportAllRecords(({ stage, records, detailRecords }) => {
        if (stage === 'core') setProgress(`Reading registry • ${records || 0} varieties`);
        else if (stage === 'details') setProgress(`Reading details • ${detailRecords || 0}`);
        else setProgress(`Reading registry • ${records || 0} varieties`);
      });

      setProgress(`Building Excel file for ${documents.length} varieties…`);
      await writeExcel(
        documents,
        `Sugarcane-Germplasm-Registry-${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      onExported?.(`${documents.length} germplasm records exported to Excel.`);
      onClose();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal scoped-excel-modal export-excel-modal">
        <header className="modal-header">
          <div>
            <small>Excel export</small>
            <h2>Export germplasm collection</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close export">
            <X size={19} />
          </button>
        </header>

        <div className="modal-content">
          <section className="excel-scope-panel" aria-label="Export scope">
            <div className="excel-scope-heading">
              <strong>What do you want to export?</strong>
              <small>Select one or several varieties, or export the complete registry.</small>
            </div>

            <div className="excel-scope-toggle">
              <button
                type="button"
                className={scope === 'specific' ? 'active' : ''}
                onClick={() => setScope('specific')}
              >
                Specific variety
              </button>
              <button
                type="button"
                className={scope === 'all' ? 'active' : ''}
                onClick={() => setScope('all')}
              >
                Whole registry
              </button>
            </div>

            {scope === 'specific' ? (
              <div className="excel-variety-picker">
                <label>
                  <span>Search live registry</span>
                  <div className="excel-picker-search">
                    <Search size={17} />
                    <input
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                      }}
                      placeholder={`Type at least ${SEARCH_MIN} characters…`}
                      autoFocus
                    />
                    {searching && <LoaderCircle className="spin" size={16} />}
                  </div>
                </label>

                {results.length > 0 && (
                  <div className="excel-result-tools">
                    <span>{results.length} result{results.length === 1 ? '' : 's'} shown</span>
                    <button type="button" className="text-button" onClick={selectVisible}>Select all shown</button>
                  </div>
                )}

                <div className="excel-variety-results multi-select-results">
                  {results.map((record) => {
                    const isSelected = selectedIds.has(record.$id);
                    return (
                      <button
                        key={record.$id}
                        type="button"
                        className={isSelected ? 'active' : ''}
                        onClick={() => toggleSelected(record)}
                        aria-pressed={isSelected}
                      >
                        <span className="excel-result-check">{isSelected ? <Check size={14} /> : <SugarcaneIcon size={15} />}</span>
                        <span>{record.variety || 'Unnamed variety'}</span>
                      </button>
                    );
                  })}
                  {query.trim().length >= SEARCH_MIN && !searching && !results.length && (
                    <span>No matching variety found.</span>
                  )}
                </div>

                <div className="excel-selected-variety multi-selected-varieties">
                  <div className="multi-selected-heading">
                    <span>
                      <small>Selected varieties</small>
                      <strong>{selected.length}</strong>
                    </span>
                    {selected.length > 0 && (
                      <button type="button" className="text-button" onClick={() => setSelected([])}>Clear all</button>
                    )}
                  </div>

                  {selected.length ? (
                    <div className="selected-variety-chips">
                      {selected.map((record) => (
                        <span key={record.$id} className="selected-variety-chip">
                          <SugarcaneIcon size={14} />
                          <strong>{record.variety || 'Unnamed variety'}</strong>
                          <button type="button" onClick={() => removeSelected(record.$id)} aria-label={`Remove ${record.variety || 'variety'}`}>
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span>Search above and select one or more varieties to export together.</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="excel-whole-scope-note">
                <SugarcaneIcon size={24} />
                <div>
                  <strong>Export the complete registry</strong>
                  <span>
                    Core and detail collections are fetched in parallel to reduce waiting time,
                    then combined locally into one .xlsx workbook.
                  </span>
                </div>
              </div>
            )}
          </section>

          {progress && <div className="alert progress"><LoaderCircle className="spin" size={17} /> {progress}</div>}
          {error && <div className="alert error">{error}</div>}
        </div>

        <footer className="modal-footer">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <span className="footer-spacer" />
          <button
            className="primary-button"
            disabled={busy || (scope === 'specific' && !selected.length)}
            onClick={scope === 'specific' ? exportSpecific : exportWholeRegistry}
          >
            <Download size={17} />
            {busy
              ? 'Preparing…'
              : scope === 'specific'
                ? selected.length
                  ? `Export ${selected.length} selected variet${selected.length === 1 ? 'y' : 'ies'}`
                  : 'Select varieties'
                : 'Export whole registry'}
          </button>
        </footer>
      </section>
    </div>
  );
}
