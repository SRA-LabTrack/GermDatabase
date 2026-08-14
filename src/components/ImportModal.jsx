import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Search, Upload, X } from 'lucide-react';
import { CANONICAL_TEMPLATE_PATH, parseCharacterizationExcel } from '../lib/excelImport';
import { bulkUpsertRecords } from '../lib/registryApi';
import { queueOfflineRecord } from '../lib/offlineQueue';
import { messageFor } from '../lib/registryUi';

export default function ImportModal({ onClose, onImported, actor = null, online = navigator.onLine }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clearBlankCells, setClearBlankCells] = useState(false);
  const [importScope, setImportScope] = useState('specific');
  const [varietyQuery, setVarietyQuery] = useState('');
  const [selectedVariety, setSelectedVariety] = useState('');
  const inputRef = useRef(null);

  const filteredVarieties = useMemo(() => {
    const rows = Array.isArray(preview?.rows) ? preview.rows : [];
    const needle = varietyQuery.trim().toLowerCase();
    const seen = new Set();
    return rows
      .filter((row) => {
        const variety = String(row?.variety || '').trim();
        if (!variety || seen.has(variety)) return false;
        seen.add(variety);
        return !needle || variety.toLowerCase().includes(needle);
      })
      .slice(0, 40)
      .map((row) => String(row.variety || '').trim());
  }, [preview, varietyQuery]);

  const selectedRow = useMemo(() => {
    if (!preview?.rows?.length || !selectedVariety) return null;
    return preview.rows.find(
      (row) => String(row?.variety || '').trim() === selectedVariety
    ) || null;
  }, [preview, selectedVariety]);

  const rowsToImport = importScope === 'specific'
    ? (selectedRow ? [selectedRow] : [])
    : (preview?.rows || []);

  async function choose(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    setSuccess('');
    setProgress('Reading workbook locally…');
    try {
      const parsed = await parseCharacterizationExcel(file);
      setPreview(parsed);
      const firstVariety = String(parsed?.rows?.find((row) => String(row?.variety || '').trim())?.variety || '').trim();
      setSelectedVariety(firstVariety);
      setVarietyQuery('');
      setImportScope(parsed?.rows?.length === 1 ? 'specific' : 'specific');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function importRows() {
    if (!rowsToImport.length) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (!online || !navigator.onLine) {
        const ownerId = actor?.id || actor?.$id || actor?.email || 'local-user';
        let queued = 0;
        for (let index = 0; index < rowsToImport.length; index += 1) {
          const row = rowsToImport[index];
          await queueOfflineRecord({
            ownerId,
            actor: { id: actor?.id || actor?.$id || '', name: actor?.name || '', email: actor?.email || '', isAdmin: true },
            form: { ...row, source_name: row.source_name || 'Excel import' },
            operationOverride: 'upsert',
            syncOptions: { clearBlankCells }
          });
          queued += 1;
          setProgress(`Saving ${queued}/${rowsToImport.length} workbook row${rowsToImport.length === 1 ? '' : 's'} to the offline queue…`);
        }
        const completedMessage = importScope === 'specific' && selectedVariety
          ? `${selectedVariety} was saved to the offline queue and will sync when the connection returns.`
          : `${queued} workbook varieties were saved to this device and will sync gradually when the connection returns.`;
        setProgress('');
        setSuccess(completedMessage);
        onImported?.({ created: 0, updated: 0, queued, total: rowsToImport.length, scope: importScope, variety: importScope === 'specific' ? selectedVariety : '', offline: true, message: completedMessage });
        window.setTimeout(() => onClose(), 1100);
        return;
      }

      const result = await bulkUpsertRecords(
        rowsToImport,
        ({ done, total, errors, created, updated }) => {
          setProgress(
            `Applying ${done}/${total} • ${updated} updated • ${created} added` +
            (errors ? ` • ${errors} failed` : '')
          );
        },
        { clearBlankCells }
      );

      if (result.errors.length) {
        const ownerId = actor?.id || actor?.$id || actor?.email || 'local-user';
        let queued = 0;
        const stillFailed = [];
        for (const issue of result.errors) {
          const networkish = !navigator.onLine || /network|fetch|unreachable|timed out|timeout/i.test(String(issue?.message || ''));
          if (!networkish) {
            stillFailed.push(issue);
            continue;
          }
          const row = rowsToImport[issue.index];
          if (!row) {
            stillFailed.push(issue);
            continue;
          }
          try {
            await queueOfflineRecord({
              ownerId,
              actor: { id: actor?.id || actor?.$id || '', name: actor?.name || '', email: actor?.email || '', isAdmin: true },
              form: { ...row, source_name: row.source_name || 'Excel import' },
              operationOverride: 'upsert',
              syncOptions: { clearBlankCells }
            });
            queued += 1;
          } catch {
            stillFailed.push(issue);
          }
        }
        if (queued) {
          const completedMessage = `${result.created + result.updated} workbook row${result.created + result.updated === 1 ? '' : 's'} reached Appwrite and ${queued} interrupted row${queued === 1 ? '' : 's'} were saved offline for automatic sync.`;
          setSuccess(completedMessage);
          onImported?.({ created: result.created || 0, updated: result.updated || 0, queued, total: rowsToImport.length, scope: importScope, variety: importScope === 'specific' ? selectedVariety : '', offline: true, message: completedMessage });
        }
        if (stillFailed.length) {
          setError(`${stillFailed.length} workbook row${stillFailed.length === 1 ? '' : 's'} still need attention. First error: ${stillFailed[0].message}`);
        }
      } else {
        const completedMessage = importScope === 'specific' && selectedVariety
          ? `${selectedVariety} imported successfully. ${result.created || 0} added, ${result.updated || 0} updated.`
          : `Excel import completed for ${rowsToImport.length} ${rowsToImport.length === 1 ? 'variety' : 'varieties'}. ${result.created || 0} added, ${result.updated || 0} updated.`;
        setProgress('');
        setSuccess(completedMessage);
        onImported?.({
          created: result.created || 0,
          updated: result.updated || 0,
          total: rowsToImport.length,
          scope: importScope,
          variety: importScope === 'specific' ? selectedVariety : '',
          message: completedMessage
        });
        window.setTimeout(() => onClose(), 1100);
      }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal import-modal scoped-excel-modal">
        <header className="modal-header">
          <div>
            <small>Excel import</small>
            <h2>Import sugarcane germplasm</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close import">
            <X size={19} />
          </button>
        </header>

        <div className="modal-content">
          <div className="import-note canonical-template-note">
            <FileSpreadsheet size={24} />
            <div>
              <strong>The A:CH workbook is the official germplasm template.</strong>
              <span>
                You can apply only one selected variety or apply every row in the uploaded
                registry workbook. The red-font Origin and other-attribute columns are supported directly. Existing varieties are updated safely instead of duplicated.
              </span>
            </div>
            <a className="secondary-button template-download-button" href={CANONICAL_TEMPLATE_PATH} download>
              <Download size={16} /> Download template
            </a>
          </div>

          <button
            className="upload-zone"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <Upload size={24} />
            <strong>{busy && !preview ? 'Reading workbook locally…' : 'Choose .xlsx or .xls workbook'}</strong>
            <span>Parsing happens on this device before any Appwrite write begins.</span>
          </button>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept=".xlsx,.xls"
            onChange={(event) => choose(event.target.files?.[0])}
          />

          {preview && (
            <>
              <div className="import-summary">
                <span><small>Sheet</small><strong>{preview.sheetName}</strong></span>
                <span><small>Layout</small><strong>{preview.layout}</strong></span>
                <span><small>Rows</small><strong>{preview.rows.length}</strong></span>
                {preview.canonicalTemplate && <span><small>Template</small><strong>Official</strong></span>}
              </div>

              <section className="excel-scope-panel" aria-label="Import scope">
                <div className="excel-scope-heading">
                  <strong>What do you want to import?</strong>
                  <small>Specific variety is faster because only one workbook row is applied.</small>
                </div>
                <div className="excel-scope-toggle">
                  <button
                    type="button"
                    className={importScope === 'specific' ? 'active' : ''}
                    onClick={() => setImportScope('specific')}
                  >
                    Specific variety
                  </button>
                  <button
                    type="button"
                    className={importScope === 'all' ? 'active' : ''}
                    onClick={() => setImportScope('all')}
                  >
                    Whole registry
                  </button>
                </div>

                {importScope === 'specific' && (
                  <div className="excel-variety-picker">
                    <label>
                      <span>Find variety in workbook</span>
                      <div className="excel-picker-search">
                        <Search size={17} />
                        <input
                          value={varietyQuery}
                          onChange={(event) => setVarietyQuery(event.target.value)}
                          placeholder="Type variety name…"
                        />
                      </div>
                    </label>
                    <div className="excel-variety-results">
                      {filteredVarieties.map((variety) => (
                        <button
                          key={variety}
                          type="button"
                          className={selectedVariety === variety ? 'active' : ''}
                          onClick={() => {
                            setSelectedVariety(variety);
                            setVarietyQuery(variety);
                          }}
                        >
                          {variety}
                        </button>
                      ))}
                      {!filteredVarieties.length && <span>No matching variety in this workbook.</span>}
                    </div>
                    {selectedRow && (
                      <div className="excel-selected-variety">
                        <small>Selected variety</small>
                        <strong>{selectedVariety}</strong>
                      </div>
                    )}
                  </div>
                )}

                {importScope === 'all' && (
                  <div className="excel-whole-scope-note">
                    <strong>Whole registry workbook</strong>
                    <span>All {preview.rows.length} parsed rows will be applied. Matching varieties update; unmatched varieties are added.</span>
                  </div>
                )}
              </section>

              <label className="import-clear-toggle">
                <input
                  type="checkbox"
                  checked={clearBlankCells}
                  onChange={(event) => setClearBlankCells(event.target.checked)}
                />
                <span>
                  <strong>Blank cells clear existing values</strong>
                  <small>Off by default. Enable only when blank workbook cells are intentional deletions.</small>
                </span>
              </label>

              <div className="preview-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Variety</th>
                      <th>Parentage</th>
                      <th>LKg/TC</th>
                      <th>TC/HA</th>
                      <th>Maturity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(importScope === 'specific' && selectedRow ? [selectedRow] : preview.rows.slice(0, 10)).map((row, index) => (
                      <tr key={`${row.variety || 'row'}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{row.variety || '—'}</td>
                        <td>{[row.parentage_female, row.parentage_male].filter(Boolean).join(' × ') || '—'}</td>
                        <td>{row.yield_lkg_tc || '—'}</td>
                        <td>{row.yield_tc_ha || '—'}</td>
                        <td>{row.agronomic_maturity || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importScope === 'all' && preview.rows.length > 10 && (
                  <div className="table-more">+ {preview.rows.length - 10} additional rows</div>
                )}
              </div>
            </>
          )}

          {progress && <div className="alert progress"><LoaderCircle className="spin" size={17} /> {progress}</div>}
          {success && <div className="alert success import-success-confirmation"><CheckCircle2 size={18} /> <div><strong>Import completed</strong><span>{success}</span></div></div>}
          {error && <div className="alert error">{error}</div>}
        </div>

        <footer className="modal-footer">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <span className="footer-spacer" />
          {preview && (
            <button
              className="primary-button"
              onClick={importRows}
              disabled={busy || Boolean(success) || !rowsToImport.length}
            >
              {success
                ? 'Imported ✓'
                : busy
                ? 'Applying…'
                : !online
                  ? (importScope === 'specific' ? `Save ${selectedVariety || 'selected variety'} offline` : `Queue whole registry (${preview.rows.length})`)
                  : importScope === 'specific'
                    ? `Import ${selectedVariety || 'selected variety'}`
                    : `Import whole registry (${preview.rows.length})`}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
