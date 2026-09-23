import { CHARACTERIZATION_GROUPS } from './characterizationFields.js';
import { GERMINATION_FIELDS } from './germinationFields.js';
import { normalizeVarietyDisplay } from './legacyHyv.js';
import { formatLeafLengthCm, isColorTraitField, resolveRhsColors } from './traitVisuals.js';

const CORE_KEYS = new Set([
  'variety',
  'accession_number',
  'origin',
  'collection_year',
  'species',
  'recommended_locations',
  'parentage_female',
  'parentage_male',
  'yield_tc_ha',
  'yield_lkg_tc',
  'disease_reaction'
]);

const PDF = {
  pageWidth: 210,
  pageHeight: 297,
  marginX: 15,
  topY: 15,
  bottomY: 282,
  footerY: 288,
  contentWidth: 180,
  columnGap: 4
};

function text(value) {
  return String(value ?? '').trim();
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
  const female = normalizeVarietyDisplay(record.parentage_female || '');
  const male = normalizeVarietyDisplay(record.parentage_male || '');
  if (male && female) return `${male} male X ${female} female`;
  if (male) return `${male} male`;
  if (female) return `${female} female`;
  return '';
}

function calculatedGermination(record = {}) {
  const directText = text(record.germination_pct);
  if (directText !== '') {
    const direct = Number(directText);
    if (Number.isFinite(direct)) return `${Math.max(0, Math.min(100, direct)).toFixed(2)}%`;
  }

  const planted = Number(record.germ_buds_planted);
  const germinated = Number(record.germ_germinated_count);
  if (!Number.isFinite(planted) || planted <= 0 || !Number.isFinite(germinated)) return '';
  return `${Math.max(0, Math.min(100, (germinated / planted) * 100)).toFixed(2)}%`;
}

function formattedFieldValue(fieldKey, rawValue) {
  const raw = text(rawValue);
  if (!raw) return '';
  if (fieldKey === 'leaf_length_cm') return formatLeafLengthCm(raw, raw).text;
  return raw;
}

function fieldModel(label, fieldKey, rawValue, { wide = false, showMissing = false } = {}) {
  const formatted = formattedFieldValue(fieldKey, rawValue);
  const value = formatted || (showMissing ? 'Not recorded' : '');
  if (!value) return null;
  return {
    label,
    fieldKey,
    rawValue,
    value,
    wide,
    missing: !formatted,
    colors: formatted && isColorTraitField(fieldKey) ? resolveRhsColors(rawValue) : []
  };
}

function coreSectionModel(record = {}) {
  const recommended = text(record.recommended_locations) || text(record.tested_location);
  return {
    title: 'Core Profile Information',
    subtitle: 'Germplasm preview',
    force: true,
    cards: [
      fieldModel('Accession Number', 'accession_number', record.accession_number, { showMissing: true }),
      fieldModel('Country', 'origin', record.origin, { showMissing: true }),
      fieldModel('Collection Year', 'collection_year', record.collection_year, { showMissing: true }),
      fieldModel('Species', 'species', record.species, { showMissing: true }),
      fieldModel('Parentage', 'parentage', parentage(record), { wide: true, showMissing: true }),
      fieldModel('Yield Potential - TC/Ha', 'yield_tc_ha', record.yield_tc_ha, { showMissing: true }),
      fieldModel('Yield Potential - LKg/TC', 'yield_lkg_tc', record.yield_lkg_tc, { showMissing: true }),
      fieldModel('Recommended Locations', 'recommended_locations', recommended, { wide: true, showMissing: true }),
      fieldModel('Reaction to Diseases', 'disease_reaction', record.disease_reaction, { wide: true, showMissing: true })
    ].filter(Boolean)
  };
}

function characterizationSectionModels(record = {}) {
  return CHARACTERIZATION_GROUPS.map((group) => ({
    title: group.title,
    subtitle: 'Additional characterization',
    cards: (group.fields || [])
      .filter((field) => !CORE_KEYS.has(field.key))
      .map((field) => fieldModel(field.label, field.key, record[field.key], { wide: field.type === 'textarea' }))
      .filter(Boolean)
  })).filter((section) => section.cards.length);
}

function germinationSectionModel(record = {}) {
  const cards = GERMINATION_FIELDS
    .map((field) => fieldModel(field.label, field.key, record[field.key], { wide: field.type === 'textarea' }))
    .filter(Boolean);
  const germination = calculatedGermination(record);
  if (germination) cards.push(fieldModel('Calculated Germination %', 'germination_pct', germination));
  return cards.length ? { title: 'Germination Trial', subtitle: 'Additional information', cards: cards.filter(Boolean) } : null;
}

function documentationSectionModel(record = {}) {
  const count = Array.isArray(record.photo_file_ids) ? record.photo_file_ids.length : 0;
  const names = Array.isArray(record.photo_names) ? record.photo_names.map(text).filter(Boolean) : [];
  const sourceName = text(record.source_name);
  const sourceRow = text(record.source_row);
  const cards = [];
  if (count) cards.push(fieldModel('Attached Photos', 'attached_photos', `${count} photo${count === 1 ? '' : 's'}`));
  if (names.length) cards.push(fieldModel('Photo Files', 'photo_names', names.join(', '), { wide: true }));
  if (sourceName) cards.push(fieldModel('Source', 'source_name', sourceName));
  if (sourceRow) cards.push(fieldModel('Source Row', 'source_row', sourceRow));
  return cards.length ? { title: 'Record Documentation', subtitle: 'Registry metadata', cards: cards.filter(Boolean) } : null;
}

function profileSectionModels(record = {}, mode = 'core') {
  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const sections = [coreSectionModel(record)];
  if (normalizedMode === 'complete') {
    sections.push(...characterizationSectionModels(record));
    const germination = germinationSectionModel(record);
    const documentation = documentationSectionModel(record);
    if (germination) sections.push(germination);
    if (documentation) sections.push(documentation);
  }
  return sections;
}

function colorSwatchesHtml(colors = []) {
  if (!colors.length) return '';
  return `<span class="print-color-swatches" aria-label="RHS screen color approximation">${colors.map((color) => `<i style="background:${escapeHtml(color.hex)}" title="${escapeHtml(color.code)} ${escapeHtml(color.hex)}"></i>`).join('')}</span>`;
}

function fieldCardHtml(card) {
  if (!card) return '';
  return `<div class="print-field ${card.wide ? 'print-field-wide' : ''}">
    <div class="print-field-label">${escapeHtml(card.label)}</div>
    <div class="print-field-value ${card.missing ? 'print-field-missing' : ''}">${escapeHtml(card.value)}${colorSwatchesHtml(card.colors)}</div>
  </div>`;
}

function sectionHtml(section) {
  if (!section) return '';
  const body = section.cards.map(fieldCardHtml).filter(Boolean).join('');
  if (!body && !section.force) return '';
  return `<section class="print-section">
    <div class="print-section-heading">
      ${section.subtitle ? `<small>${escapeHtml(section.subtitle)}</small>` : ''}
      <h2>${escapeHtml(section.title)}</h2>
    </div>
    <div class="print-grid">${body || '<div class="print-empty-note">No information recorded.</div>'}</div>
  </section>`;
}

function printStyles() {
  return `
    @page { size: A4; margin: 13mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      color: #213d2b;
      background: #edf3e9;
      font-size: 10.5pt;
      line-height: 1.42;
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 16px;
      border-bottom: 1px solid #d6e3d2;
      background: rgba(250, 253, 248, .97);
      box-shadow: 0 8px 24px rgba(32, 68, 42, .08);
      backdrop-filter: blur(12px);
    }
    .preview-toolbar-copy { min-width: 0; }
    .preview-toolbar-copy strong { display: block; color: #214a30; font-size: 10pt; }
    .preview-toolbar-copy span { display: block; margin-top: 1px; color: #768478; font-size: 7.5pt; }
    .preview-toolbar-actions { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
    .preview-action {
      appearance: none;
      min-height: 35px;
      padding: 7px 12px;
      border: 1px solid #bfd1ba;
      border-radius: 8px;
      background: #fff;
      color: #2c5839;
      font: inherit;
      font-size: 8.5pt;
      font-weight: 700;
      cursor: pointer;
    }
    .preview-action:hover { background: #eef6e9; }
    .preview-action.primary { background: #315f3d; border-color: #315f3d; color: #fff; }
    .preview-action.primary:hover { background: #274f33; }
    .preview-action:disabled { opacity: .55; cursor: wait; }
    .preview-action-status { color: #6f7e72; font-size: 7.5pt; min-width: 0; }
    .preview-stage { padding: 18px 12px 32px; }
    .print-sheet {
      max-width: 188mm;
      min-height: 260mm;
      margin: 0 auto;
      padding: 13mm;
      background: #fff;
      box-shadow: 0 18px 56px rgba(27, 59, 35, .14);
    }
    .print-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      align-items: flex-start;
      padding: 0 0 12px;
      border-bottom: 2px solid #315f3d;
      margin-bottom: 16px;
    }
    .print-eyebrow {
      color: #718473;
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: .15em;
      text-transform: uppercase;
    }
    .print-header h1 {
      margin: 3px 0 2px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 24pt;
      font-weight: 500;
      line-height: 1.06;
      color: #173d27;
    }
    .print-header p { margin: 0; color: #657568; font-size: 8.5pt; }
    .print-meta { min-width: 45mm; text-align: right; color: #6d7b70; font-size: 7.5pt; line-height: 1.45; }
    .print-meta strong { display: block; margin-bottom: 2px; color: #31533a; font-size: 8.5pt; }
    .print-meta span { display: block; }
    .print-section { margin: 0 0 15px; }
    .print-section-heading { margin-bottom: 7px; break-after: avoid; page-break-after: avoid; }
    .print-section-heading small {
      display: block;
      color: #859286;
      font-size: 7pt;
      font-weight: 800;
      letter-spacing: .11em;
      text-transform: uppercase;
    }
    .print-section-heading h2 {
      margin: 1px 0 0;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 15.5pt;
      font-weight: 500;
      color: #204a30;
    }
    .print-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .print-field {
      min-width: 0;
      padding: 8px 9px;
      border: 1px solid #dce8d8;
      border-radius: 7px;
      background: #f8fbf6;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-field-wide { grid-column: 1 / -1; }
    .print-field-label {
      color: #7c8b7f;
      font-size: 6.8pt;
      font-weight: 800;
      letter-spacing: .065em;
      text-transform: uppercase;
      margin-bottom: 2px;
    }
    .print-field-value {
      display: flex;
      align-items: center;
      gap: 7px;
      flex-wrap: wrap;
      color: #294d34;
      font-size: 9.2pt;
      font-weight: 700;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .print-field-missing { color: #879188; font-weight: 600; font-style: italic; }
    .print-empty-note {
      grid-column: 1 / -1;
      padding: 10px;
      border: 1px dashed #d6e1d2;
      border-radius: 7px;
      color: #7b887d;
      font-size: 8.5pt;
    }
    .print-color-swatches {
      display: inline-flex;
      width: 34px;
      height: 17px;
      overflow: hidden;
      border: 1px solid rgba(20,35,24,.25);
      border-radius: 4px;
      vertical-align: middle;
    }
    .print-color-swatches i { display: block; flex: 1; }
    .print-footer {
      margin-top: 12px;
      padding-top: 8px;
      border-top: 1px solid #dce6d9;
      color: #889389;
      font-size: 7pt;
      display: flex;
      justify-content: space-between;
      gap: 12px;
    }
    @media (max-width: 650px) {
      .preview-toolbar { align-items: flex-start; flex-direction: column; }
      .preview-toolbar-actions { width: 100%; justify-content: stretch; }
      .preview-action { flex: 1; }
      .preview-stage { padding-inline: 0; }
      .print-sheet { min-height: 0; box-shadow: none; }
      .print-grid { grid-template-columns: 1fr; }
      .print-field-wide { grid-column: auto; }
    }
    @media print {
      body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .preview-toolbar { display: none !important; }
      .preview-stage { padding: 0; }
      .print-sheet { max-width: none; min-height: 0; margin: 0; padding: 0; box-shadow: none; }
      .print-section-heading { break-after: avoid; page-break-after: avoid; }
      .print-field { break-inside: avoid; page-break-inside: avoid; }
      a { color: inherit; text-decoration: none; }
    }
  `;
}

export function printableVarietyProfileHtml(record = {}, { mode = 'core' } = {}) {
  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const variety = text(record.variety) || 'Unnamed Variety';
  const generated = new Date().toLocaleString();
  const sections = profileSectionModels(record, normalizedMode);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(variety)} - ${normalizedMode === 'complete' ? 'Complete' : 'Core'} Germplasm Profile</title>
  <style>${printStyles()}</style>
</head>
<body>
  <div class="preview-toolbar" role="toolbar" aria-label="Printable profile actions">
    <div class="preview-toolbar-copy">
      <strong>${escapeHtml(variety)} · ${normalizedMode === 'complete' ? 'Complete' : 'Core'} Information</strong>
      <span>Preview first, then print or save crisp editable copies as PDF, Word, or Excel.</span>
    </div>
    <div class="preview-toolbar-actions">
      <button id="download-profile" class="preview-action" type="button">Download HTML</button>
      <button id="print-profile" class="preview-action primary" type="button">Print</button>
      <button id="save-pdf-profile" class="preview-action" type="button">Save PDF</button>
      <button id="save-word-profile" class="preview-action" type="button">Save Word</button>
      <button id="save-excel-profile" class="preview-action" type="button">Save Excel</button>
      <button id="close-profile" class="preview-action" type="button">Close</button>
    </div>
    <span id="preview-action-status" class="preview-action-status" aria-live="polite"></span>
  </div>
  <div class="preview-stage">
    <main class="print-sheet">
      <header class="print-header">
        <div>
          <div class="print-eyebrow">Sugarcane Germplasm Resource Database</div>
          <h1>${escapeHtml(variety)}</h1>
          <p>${normalizedMode === 'complete' ? 'Complete variety profile' : 'Core variety profile'}</p>
        </div>
        <div class="print-meta">
          <strong>${normalizedMode === 'complete' ? 'Complete Information' : 'Core Information'}</strong>
          <span>Generated ${escapeHtml(generated)}</span>
        </div>
      </header>
      ${sections.map(sectionHtml).filter(Boolean).join('')}
      <footer class="print-footer">
        <span>CaneSprout Registry</span>
        <span>Printable germplasm profile</span>
      </footer>
    </main>
  </div>
</body>
</html>`;
}

function hexRgb(hex, fallback = [49, 95, 61]) {
  const value = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback;
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function setTextColorHex(pdf, hex) {
  pdf.setTextColor(...hexRgb(hex));
}

function setDrawColorHex(pdf, hex) {
  pdf.setDrawColor(...hexRgb(hex));
}

function setFillColorHex(pdf, hex) {
  pdf.setFillColor(...hexRgb(hex));
}

function pdfTextLines(pdf, value, maxWidth) {
  const normalized = text(value) || 'Not recorded';
  const lines = pdf.splitTextToSize(normalized, maxWidth);
  return Array.isArray(lines) && lines.length ? lines : [normalized];
}

function cardHeightPdf(pdf, card, width) {
  const innerWidth = width - 7;
  pdf.setFont('helvetica', card.missing ? 'italic' : 'bold');
  pdf.setFontSize(9.1);
  const valueWidth = card.colors?.length ? Math.max(30, innerWidth - 17) : innerWidth;
  const lines = pdfTextLines(pdf, card.value, valueWidth);
  return Math.max(15.2, 8.7 + lines.length * 4.1);
}

function sectionRows(section = {}) {
  const rows = [];
  let pending = null;
  for (const card of section.cards || []) {
    if (card.wide) {
      if (pending) {
        rows.push([pending]);
        pending = null;
      }
      rows.push([card]);
      continue;
    }
    if (!pending) pending = card;
    else {
      rows.push([pending, card]);
      pending = null;
    }
  }
  if (pending) rows.push([pending]);
  return rows;
}

function rowHeightPdf(pdf, row, columnWidth) {
  if (row.length === 1 && row[0].wide) return cardHeightPdf(pdf, row[0], PDF.contentWidth);
  return Math.max(...row.map((card) => cardHeightPdf(pdf, card, columnWidth)));
}

function sectionHeadingHeightPdf() {
  return 13.5;
}

function renderSectionHeadingPdf(pdf, section, y, continued = false) {
  setTextColorHex(pdf, '#7b8b7e');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  const subtitle = continued ? `${section.subtitle || 'Information'} - continued` : (section.subtitle || '');
  if (subtitle) pdf.text(String(subtitle).toUpperCase(), PDF.marginX, y + 2.6);

  setTextColorHex(pdf, '#204a30');
  pdf.setFont('times', 'normal');
  pdf.setFontSize(16.2);
  pdf.text(section.title, PDF.marginX, y + 9.2);
  return y + sectionHeadingHeightPdf();
}

function renderCardPdf(pdf, card, x, y, width, height) {
  setFillColorHex(pdf, '#f8fbf6');
  setDrawColorHex(pdf, '#dce8d8');
  pdf.setLineWidth(0.22);
  pdf.roundedRect(x, y, width, height, 2.1, 2.1, 'FD');

  setTextColorHex(pdf, '#7c8b7f');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(6.8);
  pdf.text(String(card.label || '').toUpperCase(), x + 3.5, y + 4.8, { maxWidth: width - 7 });

  const swatchTotalWidth = card.colors?.length ? 14.5 : 0;
  const valueMaxWidth = width - 7 - swatchTotalWidth;
  setTextColorHex(pdf, card.missing ? '#879188' : '#294d34');
  pdf.setFont('helvetica', card.missing ? 'italic' : 'bold');
  pdf.setFontSize(9.2);
  const lines = pdfTextLines(pdf, card.value, Math.max(24, valueMaxWidth));
  pdf.text(lines, x + 3.5, y + 10.1, { lineHeightFactor: 1.12, maxWidth: Math.max(24, valueMaxWidth) });

  if (card.colors?.length) {
    const swatchX = x + width - 3.5 - swatchTotalWidth;
    const swatchY = y + 7.0;
    const swatchH = 5.6;
    const swatchW = swatchTotalWidth / card.colors.length;
    card.colors.forEach((color, index) => {
      setFillColorHex(pdf, color.hex);
      setDrawColorHex(pdf, '#607060');
      pdf.roundedRect(swatchX + index * swatchW, swatchY, swatchW, swatchH, 0.7, 0.7, 'FD');
    });
  }
}

function renderContinuationHeaderPdf(pdf, variety, mode) {
  setTextColorHex(pdf, '#6e8072');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.2);
  pdf.text('SUGARCANE GERMPLASM RESOURCE DATABASE', PDF.marginX, 12.5);
  setTextColorHex(pdf, '#31533a');
  pdf.setFontSize(8.4);
  pdf.text(`${variety} - ${mode === 'complete' ? 'Complete Profile' : 'Core Profile'}`, PDF.pageWidth - PDF.marginX, 12.5, { align: 'right' });
  setDrawColorHex(pdf, '#dce6d9');
  pdf.setLineWidth(0.25);
  pdf.line(PDF.marginX, 15.2, PDF.pageWidth - PDF.marginX, 15.2);
  return 20;
}

function renderFirstPageHeaderPdf(pdf, variety, mode, generated) {
  setTextColorHex(pdf, '#718473');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.6);
  pdf.text('SUGARCANE GERMPLASM RESOURCE DATABASE', PDF.marginX, 17);

  setTextColorHex(pdf, '#173d27');
  pdf.setFont('times', 'normal');
  pdf.setFontSize(24);
  pdf.text(variety, PDF.marginX, 28.2);

  setTextColorHex(pdf, '#657568');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.6);
  pdf.text(mode === 'complete' ? 'Complete variety profile' : 'Core variety profile', PDF.marginX, 34.2);

  const metaX = PDF.pageWidth - PDF.marginX;
  setTextColorHex(pdf, '#31533a');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.8);
  pdf.text(mode === 'complete' ? 'Complete Information' : 'Core Information', metaX, 20, { align: 'right' });
  setTextColorHex(pdf, '#6d7b70');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.text(`Generated ${generated}`, metaX, 25.1, { align: 'right' });

  setDrawColorHex(pdf, '#315f3d');
  pdf.setLineWidth(0.55);
  pdf.line(PDF.marginX, 40.2, PDF.pageWidth - PDF.marginX, 40.2);
  return 47.5;
}

function sectionEstimatedHeightPdf(pdf, section, columnWidth) {
  const rows = sectionRows(section);
  return sectionHeadingHeightPdf() + rows.reduce((sum, row) => sum + rowHeightPdf(pdf, row, columnWidth) + 2.2, 0) + 3;
}

function addPdfPage(pdf, variety, mode) {
  pdf.addPage();
  return renderContinuationHeaderPdf(pdf, variety, mode);
}

function renderProfileSectionsPdf(pdf, sections, { variety, mode, startY }) {
  const gap = PDF.columnGap;
  const columnWidth = (PDF.contentWidth - gap) / 2;
  let y = startY;

  for (const section of sections) {
    const rows = sectionRows(section);
    if (!rows.length && !section.force) continue;

    const estimated = sectionEstimatedHeightPdf(pdf, section, columnWidth);
    const remaining = PDF.bottomY - y;
    const firstRowHeight = rows.length ? rowHeightPdf(pdf, rows[0], columnWidth) : 0;
    const minimumStartSpace = sectionHeadingHeightPdf() + firstRowHeight + 5;

    if (remaining < minimumStartSpace || (estimated <= PDF.bottomY - 20 && estimated > remaining && remaining < 42)) {
      y = addPdfPage(pdf, variety, mode);
    }

    y = renderSectionHeadingPdf(pdf, section, y, false);

    if (!rows.length) {
      setTextColorHex(pdf, '#7b887d');
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8.6);
      pdf.text('No information recorded.', PDF.marginX, y + 5);
      y += 11;
      continue;
    }

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const rowHeight = rowHeightPdf(pdf, row, columnWidth);
      if (y + rowHeight > PDF.bottomY) {
        y = addPdfPage(pdf, variety, mode);
        y = renderSectionHeadingPdf(pdf, section, y, true);
      }

      if (row.length === 1 && row[0].wide) {
        renderCardPdf(pdf, row[0], PDF.marginX, y, PDF.contentWidth, rowHeight);
      } else {
        renderCardPdf(pdf, row[0], PDF.marginX, y, columnWidth, rowHeight);
        if (row[1]) renderCardPdf(pdf, row[1], PDF.marginX + columnWidth + gap, y, columnWidth, rowHeight);
      }
      y += rowHeight + 2.2;
    }
    y += 5.0;
  }
  return y;
}

function addPdfFooters(pdf) {
  const totalPages = pdf.getNumberOfPages();
  for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
    pdf.setPage(pageNo);
    setDrawColorHex(pdf, '#dce6d9');
    pdf.setLineWidth(0.22);
    pdf.line(PDF.marginX, 284.2, PDF.pageWidth - PDF.marginX, 284.2);

    setTextColorHex(pdf, '#889389');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.2);
    pdf.text('CaneSprout Registry', PDF.marginX, PDF.footerY);
    pdf.text(`Page ${pageNo} of ${totalPages}`, PDF.pageWidth / 2, PDF.footerY, { align: 'center' });
    pdf.text('Printable germplasm profile', PDF.pageWidth - PDF.marginX, PDF.footerY, { align: 'right' });
  }
}

async function saveVectorProfilePdf(record = {}, mode = 'core', filename = 'CaneSprout-Profile.pdf') {
  const { jsPDF } = await import('jspdf');
  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const variety = text(record.variety) || 'Unnamed Variety';
  const generated = new Date().toLocaleString();
  const sections = profileSectionModels(record, normalizedMode);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true, putOnlyUsedFonts: true });
  let y = renderFirstPageHeaderPdf(pdf, variety, normalizedMode, generated);
  y = renderProfileSectionsPdf(pdf, sections, { variety, mode: normalizedMode, startY: y });
  void y;
  addPdfFooters(pdf);
  pdf.setProperties({
    title: `${variety} - ${normalizedMode === 'complete' ? 'Complete' : 'Core'} Germplasm Profile`,
    subject: 'Sugarcane Germplasm Resource Database printable profile',
    author: 'CaneSprout Registry',
    creator: 'CaneSprout Registry'
  });
  pdf.save(filename || `${safeFilename(variety)}-${normalizedMode === 'complete' ? 'Complete' : 'Core'}-Profile.pdf`);
}


function profileExportRows(record = {}, mode = 'core') {
  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const sections = profileSectionModels(record, normalizedMode);
  return sections.map((section) => ({
    ...section,
    cards: (section.cards || []).map((card) => ({
      ...card,
      colorText: (card.colors || []).map((color) => `${color.code} (${color.hex})`).join(' / ')
    }))
  }));
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function cleanHex(value, fallback = '315F3D') {
  const hex = String(value || '').replace('#', '').trim().toUpperCase();
  return /^[0-9A-F]{6}$/.test(hex) ? hex : fallback;
}

async function saveEditableProfileWord(record = {}, mode = 'core', filename = 'CaneSprout-Profile.docx') {
  const {
    AlignmentType,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType
  } = await import('docx');

  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const variety = text(record.variety) || 'Unnamed Variety';
  const generated = new Date().toLocaleString();
  const sections = profileExportRows(record, normalizedMode);
  const children = [];

  children.push(new Paragraph({
    spacing: { after: 90 },
    children: [new TextRun({
      text: 'SUGARCANE GERMPLASM RESOURCE DATABASE',
      bold: true,
      color: '718473',
      size: 16,
      font: 'Arial'
    })]
  }));
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 70 },
    children: [new TextRun({ text: variety, color: '173D27', size: 40, font: 'Georgia' })]
  }));
  children.push(new Paragraph({
    spacing: { after: 30 },
    children: [new TextRun({
      text: normalizedMode === 'complete' ? 'Complete variety profile' : 'Core variety profile',
      color: '657568',
      size: 19,
      font: 'Arial'
    })]
  }));
  children.push(new Paragraph({
    spacing: { after: 220 },
    children: [
      new TextRun({ text: normalizedMode === 'complete' ? 'Complete Information' : 'Core Information', bold: true, color: '31533A', size: 18, font: 'Arial' }),
      new TextRun({ text: `  •  Generated ${generated}`, color: '6D7B70', size: 16, font: 'Arial' })
    ]
  }));

  for (const section of sections) {
    children.push(new Paragraph({
      spacing: { before: 120, after: 35 },
      children: [new TextRun({ text: String(section.subtitle || '').toUpperCase(), bold: true, color: '859286', size: 14, font: 'Arial' })]
    }));
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { after: 90 },
      children: [new TextRun({ text: section.title, color: '204A30', size: 28, font: 'Georgia' })]
    }));

    const rows = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            shading: { fill: 'EEF5EB' },
            children: [new Paragraph({ children: [new TextRun({ text: 'ATTRIBUTE', bold: true, color: '56705B', size: 15, font: 'Arial' })] })]
          }),
          new TableCell({
            width: { size: 66, type: WidthType.PERCENTAGE },
            shading: { fill: 'EEF5EB' },
            children: [new Paragraph({ children: [new TextRun({ text: 'VALUE', bold: true, color: '56705B', size: 15, font: 'Arial' })] })]
          })
        ]
      })
    ];

    for (const card of section.cards || []) {
      const valueRuns = [new TextRun({
        text: card.value || 'Not recorded',
        italics: Boolean(card.missing),
        bold: !card.missing,
        color: card.missing ? '879188' : '294D34',
        size: 18,
        font: 'Arial'
      })];
      if (card.colorText) {
        valueRuns.push(new TextRun({ text: `  •  Screen color: ${card.colorText}`, color: '687A6C', size: 15, font: 'Arial' }));
      }
      rows.push(new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: 34, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FBF6' },
            children: [new Paragraph({ spacing: { before: 55, after: 55 }, children: [new TextRun({ text: card.label, bold: true, color: '7C8B7F', size: 15, font: 'Arial' })] })]
          }),
          new TableCell({
            width: { size: 66, type: WidthType.PERCENTAGE },
            shading: { fill: 'F8FBF6' },
            children: [new Paragraph({ spacing: { before: 55, after: 55 }, children: valueRuns })]
          })
        ]
      }));
    }

    children.push(new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: 80, bottom: 80, left: 90, right: 90 }
    }));
  }

  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 260 },
    children: [new TextRun({ text: 'CaneSprout Registry • Editable germplasm profile', color: '889389', size: 14, font: 'Arial' })]
  }));

  const doc = new Document({
    creator: 'CaneSprout Registry',
    title: `${variety} - ${normalizedMode === 'complete' ? 'Complete' : 'Core'} Germplasm Profile`,
    description: 'Sugarcane Germplasm Resource Database editable profile',
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 19, color: '294D34' },
          paragraph: { spacing: { line: 250, after: 70 } }
        }
      }
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
        }
      },
      children
    }]
  });

  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(blob, filename || `${safeFilename(variety)}-${normalizedMode === 'complete' ? 'Complete' : 'Core'}-Profile.docx`);
}

async function saveEditableProfileExcel(record = {}, mode = 'core', filename = 'CaneSprout-Profile.xlsx') {
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default || xlsxModule;
  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const variety = text(record.variety) || 'Unnamed Variety';
  const generated = new Date().toLocaleString();
  const sections = profileExportRows(record, normalizedMode);

  const rows = [
    ['Sugarcane Germplasm Resource Database', '', '', ''],
    ['Variety', variety, '', ''],
    ['Profile Type', normalizedMode === 'complete' ? 'Complete Information' : 'Core Information', '', ''],
    ['Generated', generated, '', ''],
    ['', '', '', '']
  ];
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];

  for (const section of sections) {
    const titleRow = rows.length;
    rows.push([section.title, '', '', '']);
    merges.push({ s: { r: titleRow, c: 0 }, e: { r: titleRow, c: 3 } });
    if (section.subtitle) rows.push(['Section Type', section.subtitle, '', '']);
    rows.push(['Attribute', 'Value', 'RHS Screen Color', 'Color HEX']);
    for (const card of section.cards || []) {
      const colors = card.colors || [];
      rows.push([
        card.label,
        card.value || 'Not recorded',
        colors.map((color) => color.code).join(' / '),
        colors.map((color) => color.hex).join(' / ')
      ]);
    }
    rows.push(['', '', '', '']);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!merges'] = merges;
  worksheet['!cols'] = [
    { wch: 36 },
    { wch: 72 },
    { wch: 26 },
    { wch: 24 }
  ];
  worksheet['!rows'] = rows.map((row) => ({ hpt: row.some((cell) => String(cell || '').length > 80) ? 42 : 24 }));

  for (const address of Object.keys(worksheet)) {
    if (address.startsWith('!')) continue;
    const cell = worksheet[address];
    cell.s = {
      alignment: { vertical: 'top', wrapText: true },
      font: { name: 'Arial', sz: 10 },
      border: {
        bottom: { style: 'thin', color: { rgb: 'E1E9DE' } }
      }
    };
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Germplasm Profile');
  workbook.Props = {
    Title: `${variety} - ${normalizedMode === 'complete' ? 'Complete' : 'Core'} Germplasm Profile`,
    Subject: 'Sugarcane Germplasm Resource Database profile',
    Author: 'CaneSprout Registry',
    Company: 'CaneSprout Registry',
    CreatedDate: new Date()
  };
  XLSX.writeFile(workbook, filename || `${safeFilename(variety)}-${normalizedMode === 'complete' ? 'Complete' : 'Core'}-Profile.xlsx`, {
    bookType: 'xlsx',
    compression: true,
    cellStyles: true
  });
}

function profileExportFilenames(record = {}, mode = 'core') {
  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const variety = text(record.variety) || 'Unnamed Variety';
  const stem = `${safeFilename(variety)}-${normalizedMode === 'complete' ? 'Complete' : 'Core'}-Profile`;
  return {
    html: `${stem}.html`,
    pdf: `${stem}.pdf`,
    word: `${stem}.docx`,
    excel: `${stem}.xlsx`
  };
}

function downloadedPreviewHtml(frameDocument) {
  if (!frameDocument?.documentElement) throw new Error('The profile preview is not ready yet.');
  const clone = frameDocument.documentElement.cloneNode(true);
  clone.querySelector('.preview-toolbar')?.remove();
  return `<!doctype html>\n${clone.outerHTML}`;
}

let activeProfilePreviewCleanup = null;

function previewActionButton(label, { primary = false } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `cs-profile-preview-action${primary ? ' primary' : ''}`;
  button.textContent = label;
  return button;
}

function openInAppProfilePreview(record = {}, mode = 'core') {
  const normalizedMode = mode === 'complete' ? 'complete' : 'core';
  const filenames = profileExportFilenames(record, normalizedMode);
  const variety = text(record.variety) || 'Unnamed Variety';

  activeProfilePreviewCleanup?.();

  const overlay = document.createElement('div');
  overlay.className = 'cs-profile-preview-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `${variety} ${normalizedMode === 'complete' ? 'complete' : 'core'} printable profile preview`);

  const toolbar = document.createElement('div');
  toolbar.className = 'cs-profile-preview-toolbar';

  const copy = document.createElement('div');
  copy.className = 'cs-profile-preview-toolbar-copy';
  const title = document.createElement('strong');
  title.textContent = `${variety} · ${normalizedMode === 'complete' ? 'Complete' : 'Core'} Information`;
  const subtitle = document.createElement('span');
  subtitle.textContent = 'Preview, print, or save crisp editable copies as PDF, Word, or Excel.';
  copy.append(title, subtitle);

  const actions = document.createElement('div');
  actions.className = 'cs-profile-preview-toolbar-actions';
  const downloadButton = previewActionButton('Download HTML');
  const printButton = previewActionButton('Print', { primary: true });
  const savePdfButton = previewActionButton('Save PDF');
  const saveWordButton = previewActionButton('Save Word');
  const saveExcelButton = previewActionButton('Save Excel');
  const closeButton = previewActionButton('Close');
  actions.append(downloadButton, printButton, savePdfButton, saveWordButton, saveExcelButton, closeButton);

  const status = document.createElement('span');
  status.className = 'cs-profile-preview-status';
  status.setAttribute('aria-live', 'polite');
  toolbar.append(copy, actions, status);

  const stage = document.createElement('div');
  stage.className = 'cs-profile-preview-stage';
  const frame = document.createElement('iframe');
  frame.className = 'cs-profile-preview-frame';
  frame.title = `${variety} printable germplasm profile`;
  frame.setAttribute('referrerpolicy', 'no-referrer');
  stage.appendChild(frame);
  overlay.append(toolbar, stage);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  let closed = false;
  let previewReady = false;
  const exportButtons = [savePdfButton, saveWordButton, saveExcelButton];

  function setStatus(message = '') {
    if (!closed) status.textContent = message;
  }

  function setBusy(busy, message = '') {
    exportButtons.forEach((button) => { button.disabled = Boolean(busy); });
    setStatus(message);
  }

  function closePreview() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (activeProfilePreviewCleanup === closePreview) activeProfilePreviewCleanup = null;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') closePreview();
  }

  async function runExport(label, action) {
    setBusy(true, `Building ${label}...`);
    try {
      await action();
      setBusy(false, `${label} downloaded.`);
    } catch (error) {
      console.error(`CaneSprout ${label} export failed`, error);
      setBusy(false, error?.message || `Could not create ${label}.`);
    }
  }

  frame.addEventListener('load', () => {
    try {
      frame.contentDocument?.querySelector('.preview-toolbar')?.remove();
      previewReady = true;
      setStatus('Preview ready.');
    } catch (error) {
      console.error('CaneSprout profile preview frame failed to initialize', error);
      setStatus('Preview loaded, but document controls could not be prepared.');
    }
  }, { once: true });

  downloadButton.addEventListener('click', () => {
    try {
      const frameDocument = frame.contentDocument;
      if (!previewReady || !frameDocument) throw new Error('The preview is still loading. Try again in a moment.');
      const html = downloadedPreviewHtml(frameDocument);
      triggerBlobDownload(new Blob([html], { type: 'text/html;charset=utf-8' }), filenames.html);
      setStatus('HTML downloaded.');
    } catch (error) {
      setStatus(error?.message || 'Could not download HTML.');
    }
  });

  printButton.addEventListener('click', () => {
    try {
      if (!previewReady || !frame.contentWindow) throw new Error('The preview is still loading. Try again in a moment.');
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setStatus('Print dialog opened.');
    } catch (error) {
      setStatus(error?.message || 'Could not open the print dialog.');
    }
  });

  savePdfButton.addEventListener('click', () => runExport(
    'PDF',
    () => saveVectorProfilePdf(record, normalizedMode, filenames.pdf)
  ));

  saveWordButton.addEventListener('click', () => runExport(
    'Word document',
    () => saveEditableProfileWord(record, normalizedMode, filenames.word)
  ));

  saveExcelButton.addEventListener('click', () => runExport(
    'Excel workbook',
    () => saveEditableProfileExcel(record, normalizedMode, filenames.excel)
  ));

  closeButton.addEventListener('click', closePreview);
  document.addEventListener('keydown', onKeyDown);
  activeProfilePreviewCleanup = closePreview;

  // srcdoc keeps the printable document isolated visually while all actionable
  // controls remain in the main CaneSprout document. This avoids Brave/CSP
  // issues with event handlers and downloads inside about:blank popup windows.
  frame.srcdoc = printableVarietyProfileHtml(record, { mode: normalizedMode });
  closeButton.focus();

  return { close: closePreview, element: overlay, frame };
}

export function printVarietyProfile(record = {}, mode = 'core') {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Printing is only available in the CaneSprout application.');
  }
  return openInAppProfilePreview(record, mode);
}

