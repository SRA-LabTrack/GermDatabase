import { fileViewUrl } from './registryApi';
import { normalizeVarietyDisplay } from './legacyHyv';

function text(value) {
  return String(value ?? '').trim();
}

function shown(value, fallback = 'Not recorded') {
  return text(value) || fallback;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeFilename(value) {
  return text(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || 'Sugarcane-Variety';
}

function parentName(value) {
  return normalizeVarietyDisplay(value || '') || 'Not recorded';
}

function brochurePhotoUrl(record = {}) {
  const id = text(record.primary_file_id || record.thumbnail_file_id || record.photo_file_ids?.[0]);
  return id ? fileViewUrl(id) : '';
}

function brochureHtml(record = {}) {
  const variety = shown(record.variety, 'Unnamed Variety');
  const photo = brochurePhotoUrl(record);
  const recommended = text(record.recommended_locations) || text(record.tested_location) || 'Not recorded';

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(variety)} - Variety Brochure</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body { font-family: Arial, Helvetica, sans-serif; color:#183d28; background:#edf3e8; }
  .sheet {
    width:min(190mm, calc(100vw - 28px));
    min-height:277mm;
    margin:18px auto;
    background:#fff;
    box-shadow:0 24px 70px rgba(28,64,39,.16);
    overflow:hidden;
  }
  .hero {
    display:grid;
    grid-template-columns:minmax(0, 1.05fr) minmax(0, .95fr);
    min-height:92mm;
    background:
      radial-gradient(circle at 82% 10%, rgba(227,236,104,.38), transparent 34%),
      linear-gradient(135deg,#173f28,#2d7445);
    color:#fff;
  }
  .photo {
    min-height:92mm;
    background:
      linear-gradient(rgba(23,63,40,.12),rgba(23,63,40,.12)),
      ${photo ? `url("${escapeHtml(photo)}") center/cover no-repeat` : 'linear-gradient(145deg,#cfe4bd,#f0e99b)'};
    position:relative;
  }
  .photo::after {
    content:"${photo ? '' : 'Germplasm photo not recorded'}";
    position:absolute; inset:0;
    display:${photo ? 'none' : 'grid'};
    place-items:center;
    color:#557e58;
    font-size:11pt;
    font-weight:700;
  }
  .identity { padding:15mm 12mm 12mm; display:flex; flex-direction:column; justify-content:center; }
  .eyebrow { font-size:7.5pt; letter-spacing:.17em; font-weight:800; text-transform:uppercase; color:#d8e8c6; }
  h1 { margin:5mm 0 2mm; font:500 30pt/1 Georgia,'Times New Roman',serif; color:#fff; overflow-wrap:anywhere; }
  .sub { margin:0; color:#dbe8dc; font-size:9pt; line-height:1.5; }
  .chips { display:flex; flex-wrap:wrap; gap:5px; margin-top:7mm; }
  .chip { padding:5px 8px; border:1px solid rgba(255,255,255,.24); border-radius:999px; background:rgba(255,255,255,.09); font-size:7.5pt; }
  .content { padding:9mm 11mm 10mm; display:grid; gap:8mm; }
  .facts { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:5px; }
  .fact { padding:7px 8px; border:1px solid #dbe7d7; background:#f7faf4; border-radius:8px; min-width:0; }
  .fact small { display:block; color:#7d8d7f; font-size:6.5pt; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
  .fact strong { display:block; margin-top:3px; color:#244d33; font-size:9pt; overflow-wrap:anywhere; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:7mm; }
  .panel { padding:7mm; border:1px solid #dce7d8; border-radius:10px; background:#fbfcf9; }
  .panel h2 { margin:0 0 5mm; font:500 16pt/1.1 Georgia,'Times New Roman',serif; color:#204c31; }
  .row { display:grid; grid-template-columns:34mm 1fr; gap:5mm; padding:4px 0; border-bottom:1px solid #edf2ea; }
  .row:last-child { border-bottom:0; }
  .row span { color:#7f8d80; font-size:7pt; font-weight:800; text-transform:uppercase; letter-spacing:.05em; }
  .row b { color:#294e34; font-size:9pt; overflow-wrap:anywhere; }
  .wide { grid-column:1 / -1; }
  .location { padding:7mm; border-radius:10px; background:linear-gradient(120deg,#edf6e5,#fff8cf); border:1px solid #dbe5bd; }
  .location small { color:#71826f; font-size:7pt; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
  .location strong { display:block; margin-top:2mm; font:500 15pt/1.2 Georgia,'Times New Roman',serif; color:#2a5738; }
  .footer { display:flex; justify-content:space-between; gap:10px; padding:5mm 11mm; border-top:1px solid #e2eadf; color:#879287; font-size:7pt; }
  @media (max-width:700px) {
    .sheet { width:100%; margin:0; min-height:0; box-shadow:none; }
    .hero { grid-template-columns:1fr; }
    .photo { min-height:60vw; }
    .facts { grid-template-columns:1fr 1fr; }
    .grid { grid-template-columns:1fr; }
  }
  @media print {
    body { background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet { width:auto; min-height:0; margin:0; box-shadow:none; }
  }
</style>
</head>
<body>
<main class="sheet">
  <section class="hero">
    <div class="photo" aria-label="Germplasm photograph"></div>
    <div class="identity">
      <span class="eyebrow">Sugarcane Breeding Program · Variety Brochure</span>
      <h1>${escapeHtml(variety)}</h1>
      <p class="sub">Core germplasm data presented as a concise field and breeding reference.</p>
      <div class="chips">
        <span class="chip">${escapeHtml(shown(record.species))}</span>
        <span class="chip">${escapeHtml(shown(record.origin))}</span>
        <span class="chip">Collection: ${escapeHtml(shown(record.collection_year))}</span>
      </div>
    </div>
  </section>

  <section class="content">
    <div class="facts">
      <div class="fact"><small>Accession no.</small><strong>${escapeHtml(shown(record.accession_number))}</strong></div>
      <div class="fact"><small>Country / Origin</small><strong>${escapeHtml(shown(record.origin))}</strong></div>
      <div class="fact"><small>Collection year</small><strong>${escapeHtml(shown(record.collection_year))}</strong></div>
      <div class="fact"><small>Species</small><strong>${escapeHtml(shown(record.species))}</strong></div>
    </div>

    <div class="grid">
      <article class="panel">
        <h2>Parentage</h2>
        <div class="row"><span>Male parent</span><b>${escapeHtml(parentName(record.parentage_male))}</b></div>
        <div class="row"><span>Female parent</span><b>${escapeHtml(parentName(record.parentage_female))}</b></div>
      </article>

      <article class="panel">
        <h2>Yield Potential</h2>
        <div class="row"><span>TC/Ha</span><b>${escapeHtml(shown(record.yield_tc_ha))}</b></div>
        <div class="row"><span>LKg/TC</span><b>${escapeHtml(shown(record.yield_lkg_tc))}</b></div>
      </article>

      <article class="panel wide">
        <h2>Plant Health & Adaptation</h2>
        <div class="row"><span>Disease reaction</span><b>${escapeHtml(shown(record.disease_reaction))}</b></div>
      </article>
    </div>

    <div class="location">
      <small>Recommended / Tested Locations</small>
      <strong>${escapeHtml(recommended)}</strong>
    </div>
  </section>

  <footer class="footer">
    <span>CaneSprout Registry · Breeding Program</span>
    <span>Core data brochure</span>
  </footer>
</main>
</body>
</html>`;
}

function triggerDownload(html, filename) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

let activeBrochureClose = null;

export function openVarietyBrochure(record = {}) {
  if (typeof document === 'undefined') throw new Error('Variety brochure preview is only available in the CaneSprout application.');

  const variety = shown(record.variety, 'Unnamed Variety');
  activeBrochureClose?.();

  const overlay = document.createElement('div');
  overlay.className = 'cs-brochure-preview-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${variety} variety brochure preview`);

  const toolbar = document.createElement('div');
  toolbar.className = 'cs-brochure-preview-toolbar';

  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = `${variety} · Variety Brochure`;
  const subtitle = document.createElement('span');
  subtitle.textContent = 'Print the brochure or choose Save as PDF in your browser print dialog.';
  copy.append(title, subtitle);

  const actions = document.createElement('div');
  actions.className = 'cs-brochure-preview-actions';

  const download = document.createElement('button');
  download.type = 'button';
  download.textContent = 'Download HTML';

  const print = document.createElement('button');
  print.type = 'button';
  print.className = 'primary';
  print.textContent = 'Print / Save PDF';

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';

  actions.append(download, print, close);
  toolbar.append(copy, actions);

  const frame = document.createElement('iframe');
  frame.className = 'cs-brochure-preview-frame';
  frame.title = `${variety} variety brochure`;

  overlay.append(toolbar, frame);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  let closed = false;
  const closePreview = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (activeBrochureClose === closePreview) activeBrochureClose = null;
  };

  function onKeyDown(event) {
    if (event.key === 'Escape') closePreview();
  }

  download.addEventListener('click', () => {
    triggerDownload(
      brochureHtml(record),
      `${safeFilename(variety)}-Variety-Brochure.html`
    );
  });

  print.addEventListener('click', () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  });

  close.addEventListener('click', closePreview);
  document.addEventListener('keydown', onKeyDown);
  activeBrochureClose = closePreview;
  frame.srcdoc = brochureHtml(record);
  close.focus();

  return { close: closePreview };
}

export { brochureHtml as printableVarietyBrochureHtml };
