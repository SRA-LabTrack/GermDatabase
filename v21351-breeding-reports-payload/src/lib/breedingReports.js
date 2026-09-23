import bundledCombinationData from '../../seed/combination_runtime.json';
import {
  COLLECTIONS,
  DATABASE_ID,
  Query,
  databases,
  withAppwriteFailover
} from './appwrite';
import { listRegisteredManualCombinations } from './combinationApi';

const CLOUD_PAGE_SIZE = 100;
const MAX_CLOUD_PAGES = 30;

function text(value) {
  return String(value ?? '').trim();
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toIsoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || y < 1900 || y > 2100) return '';
  if (!Number.isInteger(m) || m < 1 || m > 12) return '';
  if (!Number.isInteger(d) || d < 1 || d > 31) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

const MONTHS = new Map([
  ['jan', 1], ['january', 1],
  ['feb', 2], ['february', 2],
  ['mar', 3], ['march', 3],
  ['apr', 4], ['april', 4],
  ['may', 5],
  ['jun', 6], ['june', 6],
  ['jul', 7], ['july', 7],
  ['aug', 8], ['august', 8],
  ['sep', 9], ['sept', 9], ['september', 9],
  ['oct', 10], ['october', 10],
  ['nov', 11], ['november', 11],
  ['dec', 12], ['december', 12]
]);

export function parseBreedingSourceDate(value) {
  const raw = text(value);
  if (!raw) return '';

  const iso = raw.match(/\b(19\d{2}|20\d{2}|2100)[-\/](\d{1,2})[-\/](\d{1,2})\b/);
  if (iso) return toIsoDate(iso[1], iso[2], iso[3]);

  const monthFirst = raw
    .replace(/\./g, '')
    .match(/\b([A-Za-z]+)\s+(\d{1,2})\s*,?\s*(19\d{2}|20\d{2}|2100)\b/);
  if (monthFirst) {
    const month = MONTHS.get(monthFirst[1].toLowerCase());
    if (month) return toIsoDate(monthFirst[3], month, monthFirst[2]);
  }

  const dayFirst = raw
    .replace(/\./g, '')
    .match(/\b(\d{1,2})\s+([A-Za-z]+)\s*,?\s*(19\d{2}|20\d{2}|2100)\b/);
  if (dayFirst) {
    const month = MONTHS.get(dayFirst[2].toLowerCase());
    if (month) return toIsoDate(dayFirst[3], month, dayFirst[1]);
  }

  return '';
}

function validIsoDate(value) {
  const raw = text(value);
  const match = raw.match(/^(19\d{2}|20\d{2}|2100)-(\d{2})-(\d{2})$/);
  return match ? toIsoDate(match[1], match[2], match[3]) : '';
}

export function breedingEventDate(row) {
  const sourceHash = text(row?.source_hash);
  const sourceDate = parseBreedingSourceDate(row?.source_date_text);
  const normalized = validIsoDate(row?.combination_date);
  const created = validIsoDate(text(row?.created_at || row?.$createdAt).slice(0, 10));

  // Audited workbook rows preserve the original human-entered date in
  // source_date_text. Prefer that over a possibly imperfect normalized date.
  if (sourceHash && sourceDate) return sourceDate;
  return normalized || sourceDate || created;
}

function localDateFromIso(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function isoFromLocalDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function addDays(iso, days) {
  const dt = localDateFromIso(iso);
  dt.setDate(dt.getDate() + Number(days || 0));
  return isoFromLocalDate(dt);
}

function currentIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function endOfMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

export function defaultBreedingReportRequest() {
  const today = currentIsoDate();
  const year = Number(today.slice(0, 4));
  const month = today.slice(0, 7);
  const monthNumber = Number(today.slice(5, 7));
  return {
    period: 'monthly',
    weekDate: today,
    month,
    quarter: String(Math.floor((monthNumber - 1) / 3) + 1),
    year: String(year),
    includeCloud: typeof navigator !== 'undefined' ? navigator.onLine : true,
    includeTechnical: false,
    technical: {
      title: 'Breeding Technical Report',
      preparedBy: '',
      objective: 'Document breeding combinations recorded in CaneSprout for the selected reporting period.',
      methodology: 'Breeding activities are summarized from dated Combination Registry records within the selected reporting period.',
      observations: '',
      recommendations: ''
    }
  };
}

export function resolveBreedingReportRange(request = {}) {
  const period = text(request.period || 'monthly').toLowerCase();
  const safeYear = Math.max(1900, Math.min(2100, Number(request.year) || new Date().getFullYear()));

  if (period === 'weekly') {
    const anchor = validIsoDate(request.weekDate) || currentIsoDate();
    const date = localDateFromIso(anchor);
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const start = addDays(anchor, mondayOffset);
    const end = addDays(start, 6);
    return {
      period,
      start,
      end,
      label: `Week of ${formatReportDate(start)} – ${formatReportDate(end)}`
    };
  }

  if (period === 'quarterly') {
    const quarter = Math.max(1, Math.min(4, Number(request.quarter) || 1));
    const startMonth = ((quarter - 1) * 3) + 1;
    const endMonth = startMonth + 2;
    const start = `${safeYear}-${pad2(startMonth)}-01`;
    const end = `${safeYear}-${pad2(endMonth)}-${pad2(endOfMonth(safeYear, endMonth))}`;
    return { period, start, end, label: `Q${quarter} ${safeYear}` };
  }

  if (period === 'annually' || period === 'annual') {
    const start = `${safeYear}-01-01`;
    const end = `${safeYear}-12-31`;
    return { period: 'annually', start, end, label: `Annual ${safeYear}` };
  }

  const requestedMonth = /^\d{4}-\d{2}$/.test(text(request.month)) ? text(request.month) : currentIsoDate().slice(0, 7);
  const year = Number(requestedMonth.slice(0, 4));
  const month = Number(requestedMonth.slice(5, 7));
  const safeMonth = year >= 1900 && year <= 2100 && month >= 1 && month <= 12
    ? requestedMonth
    : currentIsoDate().slice(0, 7);
  const monthYear = Number(safeMonth.slice(0, 4));
  const monthNumber = Number(safeMonth.slice(5, 7));
  const start = `${safeMonth}-01`;
  const end = `${safeMonth}-${pad2(endOfMonth(monthYear, monthNumber))}`;
  const date = new Date(monthYear, monthNumber - 1, 1);
  return {
    period: 'monthly',
    start,
    end,
    label: date.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
  };
}

export function formatReportDate(value) {
  const iso = validIsoDate(value);
  if (!iso) return text(value) || 'Date not recorded';
  const dt = localDateFromIso(iso);
  return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function bundledRows() {
  const rows = Array.isArray(bundledCombinationData?.records) ? bundledCombinationData.records : [];
  return rows.map((row) => ({
    ...row,
    $id: row.document_id || `seed:${row.source_hash || ''}`,
    bundled_source: true,
    sync_state: 'bundled'
  }));
}

async function cloudManualRows() {
  const rows = [];
  let cursor = '';

  for (let pageIndex = 0; pageIndex < MAX_CLOUD_PAGES; pageIndex += 1) {
    const queries = [
      Query.equal('source_hash', ['']),
      Query.orderAsc('$id'),
      Query.limit(CLOUD_PAGE_SIZE),
      Query.select([
        'male_variety', 'male_key',
        'female_variety', 'female_key',
        'combination_date', 'source_date_text',
        'notes', 'created_by', 'created_by_name', 'created_at',
        'source_hash'
      ])
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const page = await withAppwriteFailover(() => databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: COLLECTIONS.combinations,
      queries,
      total: false,
      ttl: 120
    }), { timeoutMs: 9000 });

    const batch = page.documents || [];
    rows.push(...batch.map((row) => ({ ...row, local_manual: true, sync_state: 'synced' })));
    if (batch.length < CLOUD_PAGE_SIZE) break;
    cursor = batch.at(-1)?.$id || '';
    if (!cursor) break;
  }

  return rows;
}

function eventIdentity(row) {
  const female = text(row?.female_key || row?.female_variety).toUpperCase().replace(/\s+/g, '');
  const male = text(row?.male_key || row?.male_variety).toUpperCase().replace(/\s+/g, '');
  const date = breedingEventDate(row);
  if (!female || !male || !date) return '';
  return `${female}|${male}|${date}`;
}

function mergeEvents(rows) {
  const map = new Map();
  for (const row of rows) {
    const id = eventIdentity(row);
    if (!id) continue;
    const current = map.get(id);

    // Workbook history remains authoritative for the same dated pairing.
    if (!current || (text(row.source_hash) && !text(current.source_hash))) map.set(id, row);
    else if (!text(current.source_hash) && row.local_manual && !current.local_manual) map.set(id, row);
  }
  return [...map.values()];
}

function reportStats(events) {
  const female = new Set();
  const male = new Set();
  const parents = new Set();
  const pairs = new Set();
  const dates = new Set();

  for (const row of events) {
    const femaleLabel = text(row.female_variety);
    const maleLabel = text(row.male_variety);
    if (femaleLabel) {
      female.add(femaleLabel.toUpperCase());
      parents.add(femaleLabel.toUpperCase());
    }
    if (maleLabel) {
      male.add(maleLabel.toUpperCase());
      parents.add(maleLabel.toUpperCase());
    }
    pairs.add(`${femaleLabel.toUpperCase()}|${maleLabel.toUpperCase()}`);
    const date = breedingEventDate(row);
    if (date) dates.add(date);
  }

  return {
    totalCrosses: events.length,
    uniqueFemaleParents: female.size,
    uniqueMaleParents: male.size,
    uniqueParents: parents.size,
    uniquePairings: pairs.size,
    activeBreedingDays: dates.size
  };
}

export async function generateBreedingReport(request = {}) {
  const range = resolveBreedingReportRange(request);
  const localManual = await listRegisteredManualCombinations({ includeCloud: false });
  let cloud = [];
  let cloudWarning = '';

  if (request.includeCloud) {
    try {
      cloud = await cloudManualRows();
    } catch (error) {
      cloudWarning = error?.message || 'Live cloud breeding records could not be loaded. The report uses bundled and locally stored records.';
    }
  }

  const deletedIds = new Set(
    localManual
      .filter((row) => row.deleted_local || row.sync_state === 'delete_pending')
      .map((row) => row.$id)
      .filter(Boolean)
  );

  const sourceRows = bundledRows();
  const visibleCloud = cloud.filter((row) => !deletedIds.has(row.$id));
  const visibleLocal = localManual.filter((row) => !row.deleted_local && row.sync_state !== 'delete_pending');

  const all = mergeEvents([...sourceRows, ...visibleCloud, ...visibleLocal]);
  const events = all
    .map((row) => ({ ...row, report_date: breedingEventDate(row) }))
    .filter((row) => row.report_date && row.report_date >= range.start && row.report_date <= range.end)
    .sort((a, b) => {
      const byDate = b.report_date.localeCompare(a.report_date);
      if (byDate) return byDate;
      const byFemale = text(a.female_variety).localeCompare(text(b.female_variety), undefined, { numeric: true, sensitivity: 'base' });
      if (byFemale) return byFemale;
      return text(a.male_variety).localeCompare(text(b.male_variety), undefined, { numeric: true, sensitivity: 'base' });
    });

  return {
    range,
    events,
    stats: reportStats(events),
    generatedAt: new Date().toISOString(),
    cloudWarning,
    includeCloud: Boolean(request.includeCloud),
    includeTechnical: Boolean(request.includeTechnical),
    technical: request.technical || {}
  };
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildBreedingReportHtml(report, { actor = null } = {}) {
  const technical = report?.technical || {};
  const stats = report?.stats || {};
  const events = Array.isArray(report?.events) ? report.events : [];
  const preparedBy = text(technical.preparedBy) || text(actor?.name || actor?.email) || 'Not specified';
  const generated = new Date(report.generatedAt || Date.now()).toLocaleString();

  const rows = events.length
    ? events.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatReportDate(row.report_date))}</td>
        <td>${escapeHtml(row.female_variety)}</td>
        <td>${escapeHtml(row.male_variety)}</td>
        <td>${escapeHtml(row.notes || '')}</td>
        <td>${escapeHtml(row.source_sheet || (row.local_manual ? 'Manual registry' : ''))}</td>
      </tr>`).join('')
    : `<tr><td colspan="6" class="empty">No dated breeding combinations were recorded in this reporting period.</td></tr>`;

  const techSection = report.includeTechnical ? `
    <section class="technical">
      <div class="section-kicker">TECHNICAL REPORT</div>
      <h2>${escapeHtml(technical.title || 'Breeding Technical Report')}</h2>
      <div class="tech-meta">
        <div><b>Prepared by</b><span>${escapeHtml(preparedBy)}</span></div>
        <div><b>Reporting period</b><span>${escapeHtml(report.range.label)}</span></div>
      </div>
      <h3>Objective</h3>
      <p>${escapeHtml(technical.objective || 'Not provided')}</p>
      <h3>Methodology / Basis</h3>
      <p>${escapeHtml(technical.methodology || 'Not provided')}</p>
      <h3>Breeding activity summary</h3>
      <p>${stats.totalCrosses || 0} recorded breeding combination(s), ${stats.uniquePairings || 0} unique pairing(s), ${stats.uniqueParents || 0} unique parent variety/varieties, across ${stats.activeBreedingDays || 0} dated breeding day(s).</p>
      <h3>Observations / Findings</h3>
      <p>${escapeHtml(technical.observations || 'No additional observations were supplied.')}</p>
      <h3>Recommendations</h3>
      <p>${escapeHtml(technical.recommendations || 'No recommendations were supplied.')}</p>
    </section>` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(report.range.label)} Breeding Report</title>
<style>
@page{size:A4;margin:14mm}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#173e27;background:#fff;font-size:10.5pt}
header{border-bottom:2px solid #2f6b43;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;gap:20px}
h1,h2{font-family:Georgia,"Times New Roman",serif;font-weight:500;margin:0;color:#173e27}
h1{font-size:24pt} h2{font-size:18pt} h3{font-size:11pt;margin:15px 0 5px}
.kicker,.section-kicker{font-size:8.5pt;letter-spacing:.15em;font-weight:700;color:#6f8272;text-transform:uppercase}
.meta{font-size:8.5pt;color:#718076;text-align:right;line-height:1.45}
.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin:14px 0 18px}
.summary div{border:1px solid #dce7d7;border-radius:8px;padding:9px;background:#f8fbf5}
.summary b{display:block;font-size:17pt;font-family:Georgia,"Times New Roman",serif}
.summary span{display:block;font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em;color:#6f8072;margin-top:2px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{border:1px solid #dce5d9;padding:6px 7px;vertical-align:top;overflow-wrap:anywhere}
th{background:#edf4e8;text-align:left;font-size:7.5pt;text-transform:uppercase;letter-spacing:.05em}
th:nth-child(1){width:5%} th:nth-child(2){width:14%} th:nth-child(3),th:nth-child(4){width:18%} th:nth-child(5){width:28%} th:nth-child(6){width:17%}
tr{break-inside:avoid}
.empty{text-align:center;padding:20px;color:#768379;font-style:italic}
.technical{margin-top:22px;border-top:2px solid #2f6b43;padding-top:15px}
.tech-meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 14px}
.tech-meta div{border:1px solid #dce7d7;border-radius:7px;padding:8px}
.tech-meta b,.tech-meta span{display:block}
.tech-meta b{font-size:7.5pt;text-transform:uppercase;color:#718076;margin-bottom:4px}
p{line-height:1.55;margin:0 0 9px;white-space:pre-wrap}
.warning{margin:10px 0;padding:8px 10px;border:1px solid #e0c56c;background:#fff9df;border-radius:7px}
footer{margin-top:16px;border-top:1px solid #dfe7dc;padding-top:7px;color:#7d897f;font-size:8pt;display:flex;justify-content:space-between}
@media print{.warning{break-inside:avoid}}
</style>
</head>
<body>
<header>
  <div>
    <div class="kicker">Sugarcane Germplasm Resource Database</div>
    <h1>Breeding Report</h1>
    <div>${escapeHtml(report.range.label)}</div>
  </div>
  <div class="meta">Generated ${escapeHtml(generated)}<br>${report.includeTechnical ? 'Includes Technical Report' : 'Breeding Activity Summary'}</div>
</header>
${report.cloudWarning ? `<div class="warning">${escapeHtml(report.cloudWarning)}</div>` : ''}
<section class="summary">
  <div><b>${stats.totalCrosses || 0}</b><span>Crosses</span></div>
  <div><b>${stats.uniquePairings || 0}</b><span>Unique pairings</span></div>
  <div><b>${stats.uniqueFemaleParents || 0}</b><span>Female parents</span></div>
  <div><b>${stats.uniqueMaleParents || 0}</b><span>Male parents</span></div>
  <div><b>${stats.activeBreedingDays || 0}</b><span>Breeding days</span></div>
</section>
<section>
  <div class="section-kicker">BREEDING ACTIVITY</div>
  <h2>Recorded combinations</h2>
  <table>
    <thead><tr><th>#</th><th>Date</th><th>Female</th><th>Male</th><th>Notes</th><th>Source</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</section>
${techSection}
<footer><span>CaneSprout Registry</span><span>${escapeHtml(report.range.label)}</span></footer>
</body>
</html>`;
}
