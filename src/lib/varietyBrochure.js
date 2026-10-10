import { fileViewUrl } from './registryApi';
import { normalizeVarietyDisplay } from './legacyHyv';
import { brochurePhotoSlots } from './photoSections';

function text(value) {
  return String(value ?? '').trim();
}

function shown(value, fallback = 'N/A') {
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

function parentage(record = {}) {
  const male = normalizeVarietyDisplay(record.parentage_male || '');
  const female = normalizeVarietyDisplay(record.parentage_female || '');
  if (male && female) return `${male} X ${female}`;
  return male || female || 'N/A';
}

function compactJoin(entries = []) {
  return entries
    .filter(([, value]) => text(value))
    .map(([label, value]) => `${label}: ${text(value)}`)
    .join('; ') || 'N/A';
}

export function brochureCharacteristics(record = {}) {
  const leaf = compactJoin([
    ['Color', record.leaf_color],
    ['Erectness', record.leaf_erectness],
    ['Length', record.leaf_length_cm ? `${record.leaf_length_cm} cm` : ''],
    ['Width', record.leaf_width_cm ? `${record.leaf_width_cm} cm` : ''],
    ['Sheath color', record.sheath_primary_color],
    ['Sheath wax', record.sheath_waxiness],
    ['Trichomes', record.sheath_trichome_presence],
    ['Outer auricle', record.auricle_outer_shape],
    ['Inner auricle', record.auricle_inner_shape],
    ['Trashiness', record.stool_trashiness]
  ]);

  const stalk = compactJoin([
    ['Diameter', record.agronomic_stalk_diameter],
    ['Exposed color', record.stalk_exposed_color],
    ['Unexposed color', record.stalk_unexposed_color],
    ['Waxiness', record.stalk_waxiness],
    ['Internode shape', record.stalk_internode_shape],
    ['Alignment', record.stalk_alignment],
    ['Bud groove', record.bud_groove_expression],
    ['Bud shape', record.bud_shape]
  ]);

  const yieldParts = [];
  if (text(record.yield_tc_ha)) yieldParts.push(`${text(record.yield_tc_ha)} TC/Ha`);
  if (text(record.yield_lkg_tc)) yieldParts.push(`${text(record.yield_lkg_tc)} LKg/TC`);

  return {
    growthHabit: shown(record.agronomic_growth_habit || record.stool_plant_habit),
    flowering: shown(record.agronomic_flowering_habit),
    leaf,
    stalk,
    averageMillableStalk: shown(record.agronomic_millable_stalk),
    averageStalkWeight: shown(record.agronomic_stalk_weight),
    averageStalkDiameter: shown(record.agronomic_stalk_diameter),
    diseaseReaction: shown(record.disease_reaction),
    potentialYield: yieldParts.join('; ') || 'N/A',
    recommended: shown(record.recommended_locations || record.tested_location)
  };
}

function photoUrlAt(record, index) {
  const id = index >= 0 ? record?.photo_file_ids?.[index] : '';
  return id ? fileViewUrl(id) : '';
}

function partPhotoHtml(url, label, { circular = false, large = false } = {}) {
  if (!url) {
    return `<div class="part-photo ${large ? 'part-photo-large' : ''} ${circular ? 'part-photo-circle' : ''} part-photo-na">
      <span>${escapeHtml(label)}</span>
      <strong>N/A</strong>
    </div>`;
  }

  return `<figure class="part-photo ${large ? 'part-photo-large' : ''} ${circular ? 'part-photo-circle' : ''}">
    <img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" />
    <figcaption>${escapeHtml(label)}</figcaption>
  </figure>`;
}

export function printableVarietyBrochureHtml(record = {}) {
  const variety = shown(record.variety, 'Unnamed Variety');
  const slots = brochurePhotoSlots(record);
  const characteristics = brochureCharacteristics(record);

  const overviewUrl = photoUrlAt(record, slots.overview);
  const stalkUrl = photoUrlAt(record, slots.stalk);
  const eyeUrl = photoUrlAt(record, slots.budEye);

  const rows = [
    ['Growth Habit', characteristics.growthHabit],
    ['Flowering', characteristics.flowering],
    ['Leaf Characteristics', characteristics.leaf],
    ['Stalk Characteristics', characteristics.stalk],
    ['Average Millable Stalk', characteristics.averageMillableStalk],
    ['Average stalk weight', characteristics.averageStalkWeight],
    ['Average stalk diameter', characteristics.averageStalkDiameter],
    ['Reaction to Diseases', characteristics.diseaseReaction],
    ['Potential Yield', characteristics.potentialYield],
    ['Recommended in', characteristics.recommended]
  ];

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(variety)} - Variety Brochure</title>
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color:#243a34;
    background:#dfe7e2;
  }
  .sheet {
    width:210mm;
    min-height:297mm;
    margin:16px auto;
    background:#f7f7f4;
    box-shadow:0 24px 70px rgba(21,47,38,.18);
    overflow:hidden;
  }
  .masthead {
    min-height:57mm;
    padding:12mm 13mm 9mm;
    text-align:center;
    color:#fff;
    background:
      radial-gradient(circle at 88% 20%, rgba(170,209,75,.18), transparent 23%),
      linear-gradient(135deg,#123b4a,#163c49 58%,#173e45);
  }
  .institution {
    font-family:Georgia,'Times New Roman',serif;
    font-style:italic;
    font-weight:700;
    letter-spacing:.08em;
    font-size:12pt;
  }
  .center-name {
    margin-top:1mm;
    font-family:Georgia,'Times New Roman',serif;
    font-style:italic;
    letter-spacing:.06em;
    font-size:10pt;
    color:#e7efea;
  }
  h1 {
    margin:8mm 0 2mm;
    color:#81de55;
    font:700 31pt/1 Arial,Helvetica,sans-serif;
    letter-spacing:.035em;
  }
  .parentage {
    color:#8ddd60;
    font-size:11pt;
    font-weight:800;
    letter-spacing:.035em;
  }
  .division {
    margin-top:4mm;
    font-size:9pt;
    font-weight:800;
    font-style:italic;
    letter-spacing:.16em;
  }
  .photo-layout {
    display:grid;
    grid-template-columns:minmax(0,1.85fr) minmax(0,1fr);
    gap:4mm;
    padding:6mm 7mm 2mm;
    align-items:center;
  }
  .photo-side {
    display:grid;
    gap:5mm;
    align-content:center;
  }
  .part-photo {
    position:relative;
    margin:0;
    overflow:hidden;
    border:1px solid #e1e5df;
    background:#edf1eb;
  }
  .part-photo-large { height:137mm; }
  .photo-side .part-photo:not(.part-photo-circle) { height:57mm; border-radius:4mm; }
  .part-photo-circle {
    width:56mm;
    height:56mm;
    justify-self:center;
    border-radius:50%;
  }
  .part-photo img {
    width:100%;
    height:100%;
    display:block;
    object-fit:cover;
  }
  .part-photo figcaption {
    position:absolute;
    left:3mm;
    bottom:3mm;
    padding:1.4mm 2.3mm;
    border-radius:999px;
    color:#fff;
    background:rgba(15,48,44,.70);
    font-size:7pt;
    font-weight:800;
  }
  .part-photo-na {
    display:grid;
    place-items:center;
    align-content:center;
    gap:2mm;
    color:#819087;
    background:
      linear-gradient(135deg,rgba(224,232,220,.84),rgba(246,243,222,.92));
  }
  .part-photo-na span {
    font-size:7.5pt;
    font-weight:800;
    letter-spacing:.08em;
    text-transform:uppercase;
  }
  .part-photo-na strong {
    color:#66746c;
    font:700 22pt/1 Georgia,'Times New Roman',serif;
  }
  .characteristics {
    padding:2mm 7mm 8mm;
  }
  .characteristics h2 {
    margin:0 0 4mm;
    color:#123e50;
    text-align:center;
    font-size:13pt;
    font-weight:850;
    letter-spacing:.025em;
  }
  .char-row {
    display:grid;
    grid-template-columns:43mm 1fr;
    gap:4mm;
    padding:1.2mm 0;
    font-size:8.2pt;
    line-height:1.27;
  }
  .char-row b {
    color:#2b3c39;
    font-style:italic;
  }
  .char-row span { color:#424d49; overflow-wrap:anywhere; }
  .footer {
    padding:3mm 7mm 5mm;
    color:#7b8780;
    font-size:6.8pt;
    display:flex;
    justify-content:space-between;
    gap:8mm;
  }
  @media screen and (max-width:760px) {
    .sheet { width:100%; min-height:0; margin:0; box-shadow:none; }
    .photo-layout { grid-template-columns:1fr; }
    .part-photo-large { height:65vh; min-height:360px; }
    .photo-side { grid-template-columns:1fr 1fr; }
    .part-photo-circle { width:44vw; height:44vw; max-width:260px; max-height:260px; }
    .char-row { grid-template-columns:1fr; gap:1mm; padding:2mm 0; }
  }
  @media print {
    body { background:#fff; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .sheet { margin:0; box-shadow:none; }
  }
</style>
</head>
<body>
<main class="sheet">
  <header class="masthead">
    <div class="institution">SUGARCANE GERMPLASM RESOURCE DATABASE</div>
    <div class="center-name">Varietal Characteristics Brochure</div>
    <h1>${escapeHtml(variety)}</h1>
    <div class="parentage">(${escapeHtml(parentage(record))})</div>
    <div class="division">BREEDING PROGRAM</div>
  </header>

  <section class="photo-layout" aria-label="Sugarcane varietal photographs">
    ${partPhotoHtml(overviewUrl, 'Whole variety', { large: true })}
    <div class="photo-side">
      ${partPhotoHtml(stalkUrl, 'Stalk')}
      ${partPhotoHtml(eyeUrl, 'Eye / Bud', { circular: true })}
    </div>
  </section>

  <section class="characteristics">
    <h2>AGRONOMIC-MORPHOLOGICAL CHARACTERISTICS</h2>
    ${rows.map(([label, value]) => `<div class="char-row"><b>${escapeHtml(label)}:</b><span>${escapeHtml(value)}</span></div>`).join('')}
  </section>

  <footer class="footer">
    <span>CaneSprout Registry · Breeding Program</span>
    <span>Brochure uses only recorded registry data. Missing part photos display N/A.</span>
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

function actionButton(label, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (primary) button.className = 'primary';
  return button;
}

export function openVarietyBrochure(record = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Variety brochure preview is only available in the CaneSprout application.');
  }

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
  subtitle.textContent = 'Reference-style brochure with whole-variety, stalk, and eye/bud photo slots. Missing part photos display N/A.';
  copy.append(title, subtitle);

  const actions = document.createElement('div');
  actions.className = 'cs-brochure-preview-actions';

  const download = actionButton('Download HTML');
  const print = actionButton('Print / Save PDF', true);
  const close = actionButton('Close');

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

  function closePreview() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (activeBrochureClose === closePreview) activeBrochureClose = null;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') closePreview();
  }

  download.addEventListener('click', () => {
    triggerDownload(
      printableVarietyBrochureHtml(record),
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

  frame.srcdoc = printableVarietyBrochureHtml(record);
  close.focus();

  return { close: closePreview };
}
