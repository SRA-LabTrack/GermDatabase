import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  BookOpenText,
  ChevronDown,
  Download,
  ExternalLink,
  FileArchive,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import SugarcaneIcon from './SugarcaneIcon.jsx';
import {
  breedingProgramFileDownloadUrl,
  breedingProgramFileViewUrl,
  deleteBreedingProgramDocument,
  listBreedingProgramDocuments,
  uploadBreedingProgramDocument
} from '../lib/breedingProgramApi.js';
import { fileViewUrl, getRecord, listRecords } from '../lib/registryApi.js';
import { openVarietyBrochure } from '../lib/varietyBrochure.js';

const BUNDLED_PROTOCOLS = [
  {
    code: 'SCB-GC-SOP-01',
    title: 'Germplasm Passport Data Management',
    description: 'Permanent, traceable accession identity and origin records for acquired, conserved, exchanged, characterized, and breeding materials.',
    path: '/breeding-program/protocols/SCB-GC-SOP-01_Germplasm_Passport_Data_Management.pdf'
  },
  {
    code: 'SCB-GC-SOP-02',
    title: 'Sugarcane Germplasm Characterization',
    description: 'Standardized botanical, morphological, and selected agronomic descriptors for identification, comparison, duplicate screening, and parent selection.',
    path: '/breeding-program/protocols/SCB-GC-SOP-02_Sugarcane_Germplasm_Characterization.pdf'
  },
  {
    code: 'SCB-BR-SOP-03',
    title: 'Sugarcane Crossing Block Layout and Management',
    description: 'Crossing and flowering block organization for healthy, identified, genetically diverse parents and controlled mating operations.',
    path: '/breeding-program/protocols/SCB-BR-SOP-03_Crossing_Block_Layout_and_Management.pdf'
  },
  {
    code: 'SCB-GC-SOP-04',
    title: 'Sugarcane Germplasm Field Layout and Conservation',
    description: 'Field-genebank conservation, identity, health surveillance, regeneration, movement traceability, and safety duplication.',
    path: '/breeding-program/protocols/SCB-GC-SOP-04_Germplasm_Field_Layout_and_Conservation.pdf'
  },
  {
    code: 'SCB-BR-SOP-05',
    title: 'Single Seedling Plot Test (SSPT)',
    description: 'Early-stage evaluation of genetically unique seedlings and advancement of superior selections to Row Test or first clonal evaluation.',
    path: '/breeding-program/protocols/SCB-BR-SOP-05_Single_Seedling_Plot_Test.pdf'
  },
  {
    code: 'SCB-BR-SOP-06',
    title: 'Controlled Sugarcane Pollination and Hybridization',
    description: 'Controlled hybridization, pollen testing, parent assignment, cross maintenance, fuzz harvest, storage, and pedigree traceability.',
    path: '/breeding-program/protocols/SCB-BR-SOP-06_Controlled_Pollination_and_Hybridization.pdf'
  }
];

const RESEARCH_WORKBOOK_PATH = '/breeding-program/research/Research_Archive_1980-2017.xlsx';
const RESEARCH_PAGE_SIZE = 20;

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function looksLikeYear(value) {
  return /^(?:19|20)\d{2}$/.test(text(value));
}

function authorLike(value) {
  const v = text(value);
  if (!v || v.length > 180) return false;
  return /\bet al\b|,\s*[A-Z]|(?:\band\b)|\([A-Z]|[A-Z]\.\s*[A-Z]\./i.test(v);
}

const CATEGORY_LABELS = new Set([
  'agronomy', 'soil', 'breeding', 'pathology', 'milling', 'chemistry',
  'entomology', 'physiology', 'engineering', 'statistics', 'extension',
  'variety', 'varieties', 'fertilizer', 'fertilization'
]);

function isNoiseLabel(value) {
  const v = text(value);
  if (!v) return true;
  const lower = v.toLowerCase();
  return lower === 'abstract'
    || lower === 'summary and recommendation'
    || lower === 'summary and recommendations'
    || lower === 'recommendation'
    || lower === 'recommendations'
    || CATEGORY_LABELS.has(lower)
    || looksLikeYear(v);
}

function splitColumnIntoSegments(rows, columnIndex) {
  const segments = [];
  let current = [];
  let blankRun = 0;

  const flush = () => {
    if (current.some((item) => text(item.value))) segments.push(current);
    current = [];
    blankRun = 0;
  };

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const value = rows[rowIndex]?.[columnIndex] ?? '';
    const normalized = text(value);

    if (!normalized) {
      blankRun += 1;
      if (blankRun >= 2 && current.length) flush();
      continue;
    }

    blankRun = 0;
    current.push({ rowIndex, value: normalized });
  }

  flush();
  return segments;
}

function segmentToStudy(segment, year, columnIndex) {
  const cleaned = segment.filter((item) => !isNoiseLabel(item.value));
  if (!cleaned.length) return null;

  let titleIndex = 0;
  while (
    titleIndex < cleaned.length - 1
    && cleaned[titleIndex].value.length < 16
    && !authorLike(cleaned[titleIndex + 1].value)
  ) {
    titleIndex += 1;
  }

  const titleItem = cleaned[titleIndex];
  const title = text(titleItem?.value);
  if (!title || title.length < 8 || title.length > 320) return null;

  let author = '';
  let bodyStart = titleIndex + 1;
  if (cleaned[bodyStart] && authorLike(cleaned[bodyStart].value)) {
    author = cleaned[bodyStart].value;
    bodyStart += 1;
  }
  if (cleaned[bodyStart] && looksLikeYear(cleaned[bodyStart].value)) bodyStart += 1;

  const body = cleaned
    .slice(bodyStart)
    .map((item) => item.value)
    .filter((value) => !isNoiseLabel(value))
    .join('\n\n')
    .trim();

  const sentenceLikeTitle = /[.!?]$/.test(title) && title.split(/\s+/).length > 18;
  if (sentenceLikeTitle && !author) return null;

  return {
    id: `${year}:${columnIndex}:${titleItem.rowIndex}:${title.slice(0, 40)}`,
    year,
    title,
    authors: author,
    abstract: body,
    sourceRow: titleItem.rowIndex + 1,
    sourceColumn: columnIndex + 1
  };
}

function parseResearchWorkbook(workbook, XLSX) {
  const studies = [];
  const sheets = [];

  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: true
    });

    sheets.push({ name: sheetName, rows });
    const year = Number(sheetName) || sheetName;
    const maxColumns = rows.reduce((max, row) => Math.max(max, row?.length || 0), 0);

    for (let columnIndex = 0; columnIndex < maxColumns; columnIndex += 1) {
      const segments = splitColumnIntoSegments(rows, columnIndex);
      for (const segment of segments) {
        const study = segmentToStudy(segment, year, columnIndex);
        if (study) studies.push(study);
      }
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const item of studies) {
    const key = `${item.year}|${item.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    const ay = Number(a.year) || 0;
    const by = Number(b.year) || 0;
    if (ay !== by) return by - ay;
    return a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true });
  });

  return { studies: deduped, sheets };
}

function downloadUrl(path) {
  const anchor = document.createElement('a');
  anchor.href = path;
  anchor.download = path.split('/').pop() || 'document';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function UploadPanel({ category, actor, online, onUploaded }) {
  const [form, setForm] = useState({
    title: '',
    code: '',
    year: '',
    authors: '',
    description: ''
  });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!file) {
      setError('Choose a file first.');
      return;
    }

    setBusy(true);
    try {
      await uploadBreedingProgramDocument(file, { ...form, category }, actor);
      setForm({ title: '', code: '', year: '', authors: '', description: '' });
      setFile(null);
      event.currentTarget.reset();
      await onUploaded?.();
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="breeding-program-upload" onSubmit={submit}>
      <div className="breeding-program-upload-heading">
        <div>
          <strong>{category === 'protocol' ? 'Upload protocol' : 'Upload research document'}</strong>
          <span>Administrator uploads are stored in the shared CaneSprout Breeding Program library.</span>
        </div>
        <Upload size={20} />
      </div>

      <div className="breeding-program-upload-grid">
        <label>
          <span>Title</span>
          <input
            required
            value={form.title}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder={category === 'protocol' ? 'Protocol title' : 'Research title'}
          />
        </label>

        {category === 'protocol' ? (
          <label>
            <span>SOP code</span>
            <input
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              placeholder="e.g. SCB-BR-SOP-07"
            />
          </label>
        ) : (
          <>
            <label>
              <span>Year</span>
              <input
                value={form.year}
                onChange={(event) => setForm((current) => ({ ...current, year: event.target.value }))}
                placeholder="e.g. 2026"
              />
            </label>
            <label className="wide">
              <span>Authors</span>
              <input
                value={form.authors}
                onChange={(event) => setForm((current) => ({ ...current, authors: event.target.value }))}
                placeholder="Authors / project team"
              />
            </label>
          </>
        )}

        <label className="wide">
          <span>Description / notes</span>
          <textarea
            rows={3}
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Optional"
          />
        </label>

        <label className="wide file-field">
          <span>File</span>
          <input
            required
            type="file"
            accept={category === 'protocol'
              ? '.pdf,.doc,.docx,application/pdf'
              : '.pdf,.doc,.docx,.xls,.xlsx,.csv,application/pdf'}
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>
      </div>

      {error && <div className="breeding-program-inline-error">{error}</div>}

      <button className="primary-button" type="submit" disabled={!online || busy}>
        {busy ? <><LoaderCircle className="spin" size={17} /> Uploading…</> : <><Plus size={17} /> Add to library</>}
      </button>
    </form>
  );
}

function ProtocolLibrary({ isAdmin, actor, online }) {
  const [cloudDocs, setCloudDocs] = useState([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const result = await listBreedingProgramDocuments({ category: 'protocol' });
      setCloudDocs(result.documents || []);
      setSetupRequired(Boolean(result.setupRequired));
    } catch {
      setCloudDocs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function remove(document) {
    if (!window.confirm(`Delete "${document.title}" from the shared protocol library?`)) return;
    await deleteBreedingProgramDocument(document);
    await refresh();
  }

  const needle = query.trim().toLowerCase();
  const bundled = BUNDLED_PROTOCOLS.filter((item) =>
    !needle || `${item.code} ${item.title} ${item.description}`.toLowerCase().includes(needle)
  );
  const uploaded = cloudDocs.filter((item) =>
    !needle || `${item.code || ''} ${item.title || ''} ${item.description || ''}`.toLowerCase().includes(needle)
  );

  return (
    <div className="breeding-program-pane">
      <div className="breeding-program-summary">
        <div><strong>{BUNDLED_PROTOCOLS.length + cloudDocs.length}</strong><span>protocol documents available</span></div>
        <div><strong>6</strong><span>reference SOPs bundled offline</span></div>
        <div><strong>{cloudDocs.length}</strong><span>shared station uploads</span></div>
      </div>

      <div className="breeding-program-search-row">
        <Search size={18} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SOP title, code, or topic…" />
      </div>

      {setupRequired && isAdmin && (
        <div className="breeding-program-setup-note">
          Shared uploads are not configured yet. Run <b>npm.cmd run setup:breeding-program</b> once with your temporary Appwrite API key.
          The six bundled protocols below already work offline.
        </div>
      )}

      <div className="breeding-program-section-heading">
        <div>
          <small>Reference library</small>
          <h3>Germplasm & breeding protocols</h3>
        </div>
        <span>Bundled source files</span>
      </div>

      <div className="protocol-card-grid">
        {bundled.map((protocol) => (
          <article key={protocol.code} className="protocol-card">
            <div className="protocol-card-top">
              <span className="protocol-file-icon"><FileText size={22} /></span>
              <div>
                <small>{protocol.code}</small>
                <h4>{protocol.title}</h4>
              </div>
            </div>
            <p>{protocol.description}</p>
            <div className="protocol-card-status">Draft technical SOP · Institutional review / local validation</div>
            <footer>
              <a className="secondary-button compact" href={protocol.path} target="_blank" rel="noreferrer">
                <ExternalLink size={15} /> Open PDF
              </a>
              <button className="secondary-button compact" type="button" onClick={() => downloadUrl(protocol.path)}>
                <Download size={15} /> Download
              </button>
            </footer>
          </article>
        ))}
      </div>

      {(loading || uploaded.length > 0) && (
        <>
          <div className="breeding-program-section-heading">
            <div>
              <small>Station library</small>
              <h3>Uploaded protocols</h3>
            </div>
            {loading && <LoaderCircle className="spin" size={18} />}
          </div>

          <div className="breeding-program-document-list">
            {uploaded.map((document) => (
              <article key={document.$id}>
                <span className="breeding-program-doc-icon"><BookOpenText size={19} /></span>
                <div>
                  <small>{document.code || 'Protocol'}</small>
                  <strong>{document.title}</strong>
                  {document.description && <p>{document.description}</p>}
                  <span>{document.file_name}</span>
                </div>
                <div className="breeding-program-doc-actions">
                  <a href={breedingProgramFileViewUrl(document.file_id)} target="_blank" rel="noreferrer" className="secondary-button compact">Open</a>
                  <a href={breedingProgramFileDownloadUrl(document.file_id)} className="secondary-button compact">Download</a>
                  {isAdmin && <button type="button" className="icon-button danger" onClick={() => remove(document)} title="Delete uploaded protocol"><Trash2 size={16} /></button>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {isAdmin && <UploadPanel category="protocol" actor={actor} online={online} onUploaded={refresh} />}
    </div>
  );
}

function ResearchArchive({ isAdmin, actor, online }) {
  const [archive, setArchive] = useState({ studies: [], sheets: [] });
  const [loadingArchive, setLoadingArchive] = useState(true);
  const [archiveError, setArchiveError] = useState('');
  const [cloudDocs, setCloudDocs] = useState([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [visibleCount, setVisibleCount] = useState(RESEARCH_PAGE_SIZE);
  const [expanded, setExpanded] = useState('');

  async function refreshCloud() {
    try {
      const result = await listBreedingProgramDocuments({ category: 'research' });
      setCloudDocs(result.documents || []);
      setSetupRequired(Boolean(result.setupRequired));
    } catch {
      setCloudDocs([]);
    }
  }

  useEffect(() => {
    let live = true;
    (async () => {
      setLoadingArchive(true);
      try {
        const response = await fetch(RESEARCH_WORKBOOK_PATH);
        if (!response.ok) throw new Error(`Could not load research workbook (${response.status}).`);
        const bytes = await response.arrayBuffer();
        const module = await import('xlsx');
        const XLSX = module.default || module;
        const workbook = XLSX.read(bytes, { type: 'array' });
        const parsed = parseResearchWorkbook(workbook, XLSX);
        if (live) setArchive(parsed);
      } catch (error) {
        if (live) setArchiveError(error?.message || String(error));
      } finally {
        if (live) setLoadingArchive(false);
      }
    })();
    refreshCloud();
    return () => { live = false; };
  }, []);

  useEffect(() => {
    setVisibleCount(RESEARCH_PAGE_SIZE);
    setExpanded('');
  }, [query, year]);

  const years = useMemo(() => Array.from(new Set(
    archive.studies.map((item) => String(item.year)).filter(Boolean)
  )).sort((a, b) => Number(b) - Number(a)), [archive.studies]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return archive.studies.filter((item) => {
      if (year !== 'all' && String(item.year) !== year) return false;
      if (!needle) return true;
      return `${item.title} ${item.authors} ${item.abstract}`.toLowerCase().includes(needle);
    });
  }, [archive.studies, query, year]);

  async function remove(document) {
    if (!window.confirm(`Delete "${document.title}" from the shared research archive?`)) return;
    await deleteBreedingProgramDocument(document);
    await refreshCloud();
  }

  return (
    <div className="breeding-program-pane">
      <div className="breeding-program-summary">
        <div><strong>{archive.studies.length}</strong><span>research entries indexed from workbook</span></div>
        <div><strong>{archive.sheets.length}</strong><span>year sheets in the historical archive</span></div>
        <div><strong>{cloudDocs.length}</strong><span>additional shared research files</span></div>
      </div>

      <div className="research-archive-controls">
        <label className="breeding-program-search-row">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, author, abstract, or keyword…" />
        </label>
        <label className="research-year-filter">
          <span>Year</span>
          <select value={year} onChange={(event) => setYear(event.target.value)}>
            <option value="all">All years</option>
            {years.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <ChevronDown size={15} />
        </label>
        <a className="secondary-button" href={RESEARCH_WORKBOOK_PATH} download>
          <FileSpreadsheet size={17} /> Download source Excel
        </a>
      </div>

      {setupRequired && isAdmin && (
        <div className="breeding-program-setup-note">
          Shared research uploads need the one-time Appwrite setup command <b>npm.cmd run setup:breeding-program</b>.
          The historical Excel archive remains available offline regardless.
        </div>
      )}

      {cloudDocs.length > 0 && (
        <>
          <div className="breeding-program-section-heading">
            <div><small>Station uploads</small><h3>Additional research documents</h3></div>
          </div>
          <div className="breeding-program-document-list">
            {cloudDocs.map((document) => (
              <article key={document.$id}>
                <span className="breeding-program-doc-icon"><FileArchive size={19} /></span>
                <div>
                  <small>{document.year || 'Research archive'}</small>
                  <strong>{document.title}</strong>
                  {document.authors && <span>{document.authors}</span>}
                  {document.description && <p>{document.description}</p>}
                </div>
                <div className="breeding-program-doc-actions">
                  <a href={breedingProgramFileViewUrl(document.file_id)} target="_blank" rel="noreferrer" className="secondary-button compact">Open</a>
                  <a href={breedingProgramFileDownloadUrl(document.file_id)} className="secondary-button compact">Download</a>
                  {isAdmin && <button type="button" className="icon-button danger" onClick={() => remove(document)} title="Delete uploaded research file"><Trash2 size={16} /></button>}
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <div className="breeding-program-section-heading">
        <div>
          <small>Historical workbook · 1980–2017</small>
          <h3>Previous and completed research studies</h3>
        </div>
        <span>{filtered.length} matching entries</span>
      </div>

      {loadingArchive && <div className="breeding-program-loading"><LoaderCircle className="spin" size={22} /> Reading historical research workbook…</div>}
      {archiveError && <div className="breeding-program-inline-error">{archiveError}</div>}

      <div className="research-card-list">
        {filtered.slice(0, visibleCount).map((study) => (
          <article key={study.id} className={`research-card ${expanded === study.id ? 'expanded' : ''}`}>
            <button type="button" className="research-card-main" onClick={() => setExpanded((current) => current === study.id ? '' : study.id)}>
              <span className="research-year">{study.year}</span>
              <span className="research-copy">
                <strong>{study.title}</strong>
                {study.authors && <small>{study.authors}</small>}
                {study.abstract && <p>{study.abstract}</p>}
              </span>
              <ChevronDown size={17} className={expanded === study.id ? 'open' : ''} />
            </button>
            {expanded === study.id && (
              <div className="research-card-detail">
                <span>Source sheet: {study.year}</span>
                <span>Source row: {study.sourceRow}</span>
                <p>{study.abstract || 'No abstract text was detected for this workbook entry.'}</p>
              </div>
            )}
          </article>
        ))}
      </div>

      {visibleCount < filtered.length && (
        <button type="button" className="secondary-button breeding-program-load-more" onClick={() => setVisibleCount((current) => current + RESEARCH_PAGE_SIZE)}>
          Show {Math.min(RESEARCH_PAGE_SIZE, filtered.length - visibleCount)} more
        </button>
      )}

      {isAdmin && <UploadPanel category="research" actor={actor} online={online} onUploaded={refreshCloud} />}
    </div>
  );
}

function BrochurePanel() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 3) {
      setSuggestions([]);
      return undefined;
    }

    const requestId = ++requestRef.current;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const result = await listRecords({ search: term, scope: 'variety' });
        if (requestId === requestRef.current) setSuggestions(result.documents || []);
      } catch (err) {
        if (requestId === requestRef.current) setError(err?.message || String(err));
      } finally {
        if (requestId === requestRef.current) setSearching(false);
      }
    }, 240);

    return () => window.clearTimeout(timer);
  }, [query]);

  async function choose(item) {
    setError('');
    setSuggestions([]);
    setQuery(item.variety || '');
    setLoadingRecord(true);
    try {
      const full = await getRecord(item.$id);
      setSelected(full);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setLoadingRecord(false);
    }
  }

  const photoUrl = selected
    ? fileViewUrl(selected.primary_file_id || selected.thumbnail_file_id || selected.photo_file_ids?.[0])
    : '';

  return (
    <div className="breeding-program-pane">
      <div className="brochure-intro">
        <div>
          <small>Variety communication</small>
          <h3>Variety Brochure</h3>
          <p>
            Search a registered variety to generate a cleaner, brochure-style presentation of its core identity,
            parentage, yield potential, recommended locations, and disease reaction.
          </p>
        </div>
        <Printer size={26} />
      </div>

      <div className="brochure-search-wrap">
        <label className="breeding-program-search-row">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(null); setError(''); }}
            placeholder="Search a registered variety…"
          />
          {searching && <LoaderCircle className="spin" size={17} />}
        </label>

        {suggestions.length > 0 && (
          <div className="brochure-search-results">
            {suggestions.slice(0, 12).map((item) => (
              <button key={item.$id} type="button" onClick={() => choose(item)}>
                <SugarcaneIcon size={16} />
                <span>{item.variety}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <div className="breeding-program-inline-error">{error}</div>}
      {loadingRecord && <div className="breeding-program-loading"><LoaderCircle className="spin" size={22} /> Loading complete variety record…</div>}

      {!selected && !loadingRecord && (
        <div className="brochure-empty">
          <SugarcaneIcon size={40} />
          <strong>Select a variety</strong>
          <span>The brochure preview will use the current CaneSprout core data for that variety.</span>
        </div>
      )}

      {selected && (
        <div className="brochure-preview-shell">
          <div className="brochure-preview">
            <div className="brochure-preview-photo" style={photoUrl ? { backgroundImage: `url("${photoUrl}")` } : undefined}>
              {!photoUrl && <span>Germplasm photo not recorded</span>}
            </div>
            <div className="brochure-preview-identity">
              <small>Sugarcane Breeding Program · Variety Brochure</small>
              <h2>{selected.variety || 'Unnamed Variety'}</h2>
              <p>Core germplasm data presented as a concise breeding and field reference.</p>
              <div className="brochure-preview-chips">
                <span>{selected.species || 'Species not recorded'}</span>
                <span>{selected.origin || 'Origin not recorded'}</span>
              </div>
            </div>

            <div className="brochure-preview-facts">
              <div><small>Accession no.</small><strong>{selected.accession_number || 'Not recorded'}</strong></div>
              <div><small>Collection year</small><strong>{selected.collection_year || 'Not recorded'}</strong></div>
              <div><small>Male parent</small><strong>{selected.parentage_male || 'Not recorded'}</strong></div>
              <div><small>Female parent</small><strong>{selected.parentage_female || 'Not recorded'}</strong></div>
              <div><small>Yield · TC/Ha</small><strong>{selected.yield_tc_ha || 'Not recorded'}</strong></div>
              <div><small>Yield · LKg/TC</small><strong>{selected.yield_lkg_tc || 'Not recorded'}</strong></div>
              <div className="wide"><small>Recommended locations</small><strong>{selected.recommended_locations || selected.tested_location || 'Not recorded'}</strong></div>
              <div className="wide"><small>Reaction to diseases</small><strong>{selected.disease_reaction || 'Not recorded'}</strong></div>
            </div>
          </div>

          <div className="brochure-preview-actions">
            <button type="button" className="primary-button" onClick={() => openVarietyBrochure(selected)}>
              <Printer size={17} /> Open printable brochure
            </button>
            <span>Use the browser print dialog to print or save the brochure as PDF.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BreedingProgramModal({
  actor,
  isAdmin = false,
  online = true,
  onClose,
  toolbarBottom = 0
}) {
  const [tab, setTab] = useState('protocols');

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="breeding-program-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="breeding-program-title"
      style={{ '--breeding-program-top': `${Math.max(12, Number(toolbarBottom || 0) + 10)}px` }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="breeding-program-shell">
        <header className="breeding-program-header">
          <div className="breeding-program-heading">
            <span className="breeding-program-heading-icon"><BookOpenText size={23} /></span>
            <div>
              <small>Knowledge, protocols & station research</small>
              <h2 id="breeding-program-title">Breeding Program</h2>
              <p>Germplasm and breeding SOPs, station research archive, and variety brochure tools in one workspace.</p>
            </div>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}><X size={18} /> Close</button>
        </header>

        <nav className="breeding-program-tabs" aria-label="Breeding Program sections">
          <button type="button" className={tab === 'protocols' ? 'active' : ''} onClick={() => setTab('protocols')}>
            <BookOpenText size={18} />
            <span><strong>SOP & Protocols</strong><small>Upload, store, and access breeding procedures</small></span>
          </button>
          <button type="button" className={tab === 'research' ? 'active' : ''} onClick={() => setTab('research')}>
            <Archive size={18} />
            <span><strong>Research Archive</strong><small>Previous and completed station studies</small></span>
          </button>
          <button type="button" className={tab === 'brochure' ? 'active' : ''} onClick={() => setTab('brochure')}>
            <FileText size={18} />
            <span><strong>Variety Brochure</strong><small>Improved presentation of core variety data</small></span>
          </button>
        </nav>

        <main className="breeding-program-content">
          {tab === 'protocols' && <ProtocolLibrary isAdmin={isAdmin} actor={actor} online={online} />}
          {tab === 'research' && <ResearchArchive isAdmin={isAdmin} actor={actor} online={online} />}
          {tab === 'brochure' && <BrochurePanel />}
        </main>
      </section>
    </div>,
    document.body
  );
}
