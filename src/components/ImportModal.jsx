import React, { useRef, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, Upload, X } from 'lucide-react';
import { parseCharacterizationExcel } from '../lib/excelImport';
import { bulkCreateRecords } from '../lib/registryApi';
import { messageFor } from '../lib/registryUi';

export default function ImportModal({ onClose, onImported }) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function choose(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      setPreview(await parseCharacterizationExcel(file));
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function importRows() {
    if (!preview?.rows?.length) return;
    setBusy(true);
    setError('');
    try {
      const result = await bulkCreateRecords(preview.rows, ({ done, total, errors }) => setProgress(`Writing ${done}/${total} records directly to Appwrite${errors ? ` • ${errors} failed` : ''}`));
      if (result.errors.length) setError(`${result.imported} records imported. ${result.errors.length} rows failed. First error: ${result.errors[0].message}`);
      else { onImported(); onClose(); }
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  return (
    <div className="modal-backdrop">
      <section className="modal import-modal">
        <header className="modal-header"><div><small>Field data import</small><h2>Import sugarcane characterization workbook</h2></div><button className="icon-button" onClick={onClose} aria-label="Close import"><X size={19} /></button></header>
        <div className="modal-content">
          <div className="import-note"><FileSpreadsheet size={24} /><div><strong>The provided A:BH characterization template is supported directly.</strong><span>All mapped traits remain optional. The workbook stays local until you confirm the preview, then records are written directly to Appwrite without a Vercel API function.</span></div></div>
          <button className="upload-zone" onClick={() => inputRef.current?.click()} disabled={busy}><Upload size={24} /><strong>{busy && !preview ? 'Reading workbook locally…' : 'Choose .xlsx / .xls file'}</strong><span>The Excel parser is lazy-loaded only when this tool is opened.</span></button>
          <input ref={inputRef} hidden type="file" accept=".xlsx,.xls" onChange={(event) => choose(event.target.files?.[0])} />
          {preview && <>
            <div className="import-summary"><span><small>Sheet</small><strong>{preview.sheetName}</strong></span><span><small>Layout</small><strong>{preview.layout}</strong></span><span><small>Rows</small><strong>{preview.rows.length}</strong></span></div>
            <div className="preview-wrap"><table><thead><tr><th>#</th><th>Variety</th><th>Plant habit</th><th>Leaf color</th><th>Stalk color</th><th>Bud shape</th></tr></thead><tbody>{preview.rows.slice(0, 10).map((row, index) => <tr key={index}><td>{index + 1}</td><td>{row.variety || '—'}</td><td>{row.stool_plant_habit || '—'}</td><td>{row.leaf_color || '—'}</td><td>{row.stalk_exposed_color || '—'}</td><td>{row.bud_shape || '—'}</td></tr>)}</tbody></table>{preview.rows.length > 10 && <div className="table-more">+ {preview.rows.length - 10} additional rows</div>}</div>
          </>}
          {progress && <div className="alert progress"><LoaderCircle className="spin" size={17} /> {progress}</div>}
          {error && <div className="alert error">{error}</div>}
        </div>
        <footer className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancel</button><span className="footer-spacer" />{preview && <button className="primary-button" onClick={importRows} disabled={busy}>{busy ? 'Importing…' : `Import ${preview.rows.length} rows`}</button>}</footer>
      </section>
    </div>
  );
}
