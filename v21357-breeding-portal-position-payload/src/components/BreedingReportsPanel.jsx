import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  CheckCircle2,
  Cloud,
  Download,
  FileText,
  LoaderCircle,
  Printer,
  RefreshCw,
  X
} from 'lucide-react';
import {
  buildBreedingReportHtml,
  defaultBreedingReportRequest,
  formatReportDate,
  generateBreedingReport
} from '../lib/breedingReports';
import {
  saveBreedingReportExcel,
  saveBreedingReportPdf,
  saveBreedingReportWord
} from '../lib/breedingReportExports';

function downloadText(filename, content, type = 'text/html;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function safeFilename(value) {
  return String(value || 'breeding-report')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

export default function BreedingReportsPanel({ actor = null, isAdmin = false, online = navigator.onLine, onClose, toolbarBottom = 0 }) {
  const initial = useMemo(() => {
    const value = defaultBreedingReportRequest();
    value.includeCloud = Boolean(online);
    value.technical.preparedBy = actor?.name || actor?.email || '';
    return value;
  }, [actor?.name, actor?.email, online]);

  const [request, setRequest] = useState(initial);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose?.();
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  function updateTechnical(key, value) {
    setRequest((current) => ({
      ...current,
      technical: { ...current.technical, [key]: value }
    }));
  }

  async function generate(event) {
    event?.preventDefault?.();
    setBusy(true);
    setError('');
    try {
      const next = await generateBreedingReport(request);
      setReport(next);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  function reportHtml() {
    return report ? buildBreedingReportHtml(report, { actor }) : '';
  }

  function downloadReport() {
    if (!report) return;
    const filename = `${safeFilename(report.range.label)}-Breeding-Report${report.includeTechnical ? '-Technical' : ''}.html`;
    downloadText(filename, reportHtml());
  }

  function printReport() {
    if (!report) return;
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.opacity = '0';
    frame.style.pointerEvents = 'none';
    frame.style.border = '0';
    document.body.appendChild(frame);

    const doc = frame.contentDocument || frame.contentWindow?.document;
    if (!doc) {
      frame.remove();
      setError('CaneSprout could not prepare the print document in this browser.');
      return;
    }

    doc.open();
    doc.write(reportHtml());
    doc.close();

    const runPrint = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        window.setTimeout(() => frame.remove(), 1200);
      }
    };

    if (doc.readyState === 'complete') window.setTimeout(runPrint, 80);
    else frame.addEventListener('load', () => window.setTimeout(runPrint, 80), { once: true });
  }

  async function runExport(type) {
    if (!report || exportBusy) return;
    setExportBusy(type);
    setError('');
    try {
      if (type === 'pdf') await saveBreedingReportPdf(report);
      else if (type === 'word') await saveBreedingReportWord(report);
      else if (type === 'excel') await saveBreedingReportExcel(report);
    } catch (err) {
      setError(`Could not save ${type === 'word' ? 'Word' : type === 'excel' ? 'Excel' : 'PDF'}: ${err?.message || String(err)}`);
    } finally {
      setExportBusy('');
    }
  }

  const stats = report?.stats || null;
  const reportTopOffset = Math.max(0, Number(toolbarBottom) || 0) + 8;

  return createPortal(
    <div
      className="breeding-reports-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Breeding Reports"
      style={{
        '--breeding-report-top': `${reportTopOffset}px`
      }}
    >
      <section className="breeding-reports-modal">
        <header className="breeding-reports-header">
          <div>
            <span className="breeding-reports-icon"><FileText size={22} /></span>
            <div><small>Combination Registry</small><h2>Breeding Reports</h2><p>Single-period or multi-year weekly, monthly, quarterly, and annual breeding activity.</p></div>
          </div>
          <button type="button" className="secondary-button compact breeding-reports-close" onClick={onClose} aria-label="Close Breeding Reports" title="Close Breeding Reports (Esc)"><X size={17} /> Close</button>
        </header>

        <div className="breeding-reports-body">
          <form className="breeding-report-request" onSubmit={generate}>
            <div className="breeding-report-period-row breeding-report-coverage-row">
              <label>
                <span>Report coverage</span>
                <select value={request.coverage} onChange={(event) => setRequest((current) => ({ ...current, coverage: event.target.value }))}>
                  <option value="single">Single period</option>
                  <option value="range">Time period range</option>
                </select>
              </label>

              {request.coverage === 'single' ? (<>
                <label>
                  <span>Report period</span>
                  <select value={request.period} onChange={(event) => setRequest((current) => ({ ...current, period: event.target.value }))}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annual</option>
                  </select>
                </label>

                {request.period === 'weekly' && (
                  <label><span>Week containing</span><input type="date" value={request.weekDate} onChange={(event) => setRequest((current) => ({ ...current, weekDate: event.target.value }))} /></label>
                )}

                {request.period === 'monthly' && (
                  <label><span>Month</span><input type="month" value={request.month} onChange={(event) => setRequest((current) => ({ ...current, month: event.target.value }))} /></label>
                )}

                {request.period === 'quarterly' && (<>
                  <label><span>Quarter</span><select value={request.quarter} onChange={(event) => setRequest((current) => ({ ...current, quarter: event.target.value }))}><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option></select></label>
                  <label><span>Year</span><input type="number" min="1900" max="2100" value={request.year} onChange={(event) => setRequest((current) => ({ ...current, year: event.target.value }))} /></label>
                </>)}

                {request.period === 'annually' && (
                  <label><span>Year</span><input type="number" min="1900" max="2100" value={request.year} onChange={(event) => setRequest((current) => ({ ...current, year: event.target.value }))} /></label>
                )}
              </>) : (<>
                <label>
                  <span>Break report down by</span>
                  <select value={request.breakdown} onChange={(event) => setRequest((current) => ({ ...current, breakdown: event.target.value }))}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annual</option>
                  </select>
                </label>
                <label><span>Start year</span><input type="number" min="1900" max="2100" value={request.rangeStartYear} onChange={(event) => setRequest((current) => ({ ...current, rangeStartYear: event.target.value }))} /></label>
                <label><span>End year</span><input type="number" min="1900" max="2100" value={request.rangeEndYear} onChange={(event) => setRequest((current) => ({ ...current, rangeEndYear: event.target.value }))} /></label>
              </>)}
            </div>

            {request.coverage === 'range' && (
              <div className="breeding-range-hint">
                <CalendarDays size={17} />
                <span>
                  <b>Time period: {request.rangeStartYear || '—'}–{request.rangeEndYear || '—'}</b>
                  <small>
                    CaneSprout will list every {request.breakdown === 'weekly' ? 'week' : request.breakdown === 'monthly' ? 'month' : request.breakdown === 'quarterly' ? 'quarter' : 'year'} in the range, including intervals with zero recorded crosses.
                  </small>
                </span>
              </div>
            )}

            <div className="breeding-report-options">
              <label className="breeding-report-check">
                <input type="checkbox" checked={request.includeTechnical} onChange={(event) => setRequest((current) => ({ ...current, includeTechnical: event.target.checked }))} />
                <span><FileText size={17} /><b>Include Technical Report</b><small>Add objective, methodology, observations, and recommendations to the requested report.</small></span>
              </label>

              <label className="breeding-report-check">
                <input type="checkbox" checked={request.includeCloud} disabled={!online} onChange={(event) => setRequest((current) => ({ ...current, includeCloud: event.target.checked }))} />
                <span><Cloud size={17} /><b>Include live cloud records</b><small>{online ? 'Includes manual combinations recorded by other connected CaneSprout users.' : 'Unavailable while offline; bundled and local records remain available.'}</small></span>
              </label>
            </div>

            {request.includeTechnical && (
              <section className="breeding-technical-form">
                <div className="breeding-technical-heading"><FileText size={18} /><div><strong>Technical report details</strong><small>Optional narrative fields. Activity totals are calculated automatically from the Combination Registry.</small></div></div>
                <div className="breeding-technical-grid">
                  <label><span>Technical report title</span><input value={request.technical.title} onChange={(event) => updateTechnical('title', event.target.value)} /></label>
                  <label><span>Prepared by</span><input value={request.technical.preparedBy} onChange={(event) => updateTechnical('preparedBy', event.target.value)} /></label>
                  <label className="wide"><span>Objective</span><textarea rows="2" value={request.technical.objective} onChange={(event) => updateTechnical('objective', event.target.value)} /></label>
                  <label className="wide"><span>Methodology / Basis</span><textarea rows="2" value={request.technical.methodology} onChange={(event) => updateTechnical('methodology', event.target.value)} /></label>
                  <label className="wide"><span>Observations / Findings</span><textarea rows="3" value={request.technical.observations} onChange={(event) => updateTechnical('observations', event.target.value)} placeholder="Optional technical observations for this reporting period" /></label>
                  <label className="wide"><span>Recommendations</span><textarea rows="3" value={request.technical.recommendations} onChange={(event) => updateTechnical('recommendations', event.target.value)} placeholder="Optional recommendations or next breeding actions" /></label>
                </div>
              </section>
            )}

            <button className="primary-button breeding-report-generate" type="submit" disabled={busy}>
              {busy ? <><LoaderCircle className="spin" size={17} /> Generating report…</> : <><RefreshCw size={17} /> Generate report</>}
            </button>
          </form>

          {error && <div className="alert error breeding-report-error">{error}</div>}

          {report && (
            <section className="breeding-report-result">
              <div className="breeding-report-result-head">
                <div><small>{report.range.period === 'range' ? `${report.range.breakdown} time-range breeding report` : `${report.range.period} breeding report`}</small><h3>{report.range.label}</h3><span>{formatReportDate(report.range.start)} through {formatReportDate(report.range.end)}</span></div>
                <div className="breeding-report-result-actions">
                  <button type="button" className="secondary-button compact" onClick={downloadReport} disabled={Boolean(exportBusy)}><Download size={16} /> HTML</button>
                  <button type="button" className="secondary-button compact" onClick={printReport} disabled={Boolean(exportBusy)}><Printer size={16} /> Print</button>
                  <button type="button" className="secondary-button compact" onClick={() => runExport('pdf')} disabled={Boolean(exportBusy)}>{exportBusy === 'pdf' ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />} Save PDF</button>
                  <button type="button" className="secondary-button compact" onClick={() => runExport('word')} disabled={Boolean(exportBusy)}>{exportBusy === 'word' ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />} Save Word</button>
                  <button type="button" className="secondary-button compact" onClick={() => runExport('excel')} disabled={Boolean(exportBusy)}>{exportBusy === 'excel' ? <LoaderCircle className="spin" size={16} /> : <FileText size={16} />} Save Excel</button>
                </div>
              </div>

              {report.cloudWarning && <div className="alert info">{report.cloudWarning}</div>}

              <div className={`breeding-report-stat-grid ${report.range.period === 'range' ? 'range-stats' : ''}`}>
                <article><b>{stats.totalCrosses}</b><span>Recorded crosses</span></article>
                <article><b>{stats.uniquePairings}</b><span>Unique pairings</span></article>
                <article><b>{stats.uniqueFemaleParents}</b><span>Female parents</span></article>
                <article><b>{stats.uniqueMaleParents}</b><span>Male parents</span></article>
                <article><b>{stats.activeBreedingDays}</b><span>Breeding days</span></article>
                {report.range.period === 'range' && <>
                  <article><b>{report.timelineStats?.totalIntervals || 0}</b><span>Total intervals</span></article>
                  <article><b>{report.timelineStats?.activeIntervals || 0}</b><span>Active intervals</span></article>
                </>}
              </div>

              {report.range.period === 'range' && (
                <section className="breeding-report-timeline">
                  <div className="breeding-report-timeline-heading">
                    <div><small>TIME PERIOD BREAKDOWN</small><h4>Every {report.range.breakdown === 'weekly' ? 'week' : report.range.breakdown === 'monthly' ? 'month' : report.range.breakdown === 'quarterly' ? 'quarter' : 'year'} from {report.range.startYear} to {report.range.endYear}</h4></div>
                    <span>{report.timelineStats?.activeIntervals || 0} active of {report.timelineStats?.totalIntervals || 0}</span>
                  </div>
                  <div className="breeding-report-timeline-table-wrap">
                    <table className="breeding-report-timeline-table">
                      <thead><tr><th>#</th><th>Period</th><th>Date span</th><th>Crosses</th><th>Pairings</th><th>Parents</th><th>Breeding days</th></tr></thead>
                      <tbody>
                        {report.buckets.map((bucket) => (
                          <tr key={bucket.key} className={bucket.active ? 'active' : 'inactive'}>
                            <td>{bucket.index}</td>
                            <td><strong>{bucket.label}</strong></td>
                            <td>{bucket.detailLabel}</td>
                            <td>{bucket.stats.totalCrosses}</td>
                            <td>{bucket.stats.uniquePairings}</td>
                            <td>{bucket.stats.uniqueParents}</td>
                            <td>{bucket.stats.activeBreedingDays}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <div className="breeding-report-event-table-wrap">
                <table className="breeding-report-event-table">
                  <thead><tr>{report.range.period === 'range' && <th>Interval</th>}<th>Date</th><th>Female parent</th><th>Male parent</th><th>Notes</th><th>Source</th></tr></thead>
                  <tbody>
                    {report.events.map((row) => {
                      const bucket = report.range.period === 'range'
                        ? report.buckets.find((item) => row.report_date >= item.start && row.report_date <= item.end)
                        : null;
                      return (
                        <tr key={`${row.report_date}:${row.$id || row.source_hash || `${row.female_variety}:${row.male_variety}`}`}>
                          {report.range.period === 'range' && <td>{bucket?.label || '—'}</td>}
                          <td>{formatReportDate(row.report_date)}</td>
                          <td><strong>{row.female_variety || 'Not recorded'}</strong></td>
                          <td><strong>{row.male_variety || 'Not recorded'}</strong></td>
                          <td>{row.notes || '—'}</td>
                          <td>{row.source_sheet || (row.local_manual ? 'Manual registry' : '—')}</td>
                        </tr>
                      );
                    })}
                    {!report.events.length && <tr><td colSpan={report.range.period === 'range' ? 6 : 5} className="breeding-report-no-events">No dated breeding combinations were recorded in this reporting period.</td></tr>}
                  </tbody>
                </table>
              </div>

              {report.includeTechnical && (
                <section className="breeding-report-tech-preview">
                  <span className="eyebrow"><FileText size={15} /> Technical Report Included</span>
                  <h3>{report.technical.title || 'Breeding Technical Report'}</h3>
                  <div className="breeding-report-tech-preview-grid">
                    <div><small>Objective</small><p>{report.technical.objective || 'Not provided'}</p></div>
                    <div><small>Methodology / Basis</small><p>{report.technical.methodology || 'Not provided'}</p></div>
                    <div><small>Observations / Findings</small><p>{report.technical.observations || 'No additional observations supplied.'}</p></div>
                    <div><small>Recommendations</small><p>{report.technical.recommendations || 'No recommendations supplied.'}</p></div>
                  </div>
                </section>
              )}
            </section>
          )}
        </div>

        <footer className="breeding-reports-footer">
          <span><CheckCircle2 size={15} /> Visible to {isAdmin ? 'administrators and users' : 'users and administrators'} through the Combination Registry.</span>
          <small>Reports summarize existing breeding records; generating a report does not create duplicate combination records.</small>
        </footer>
      </section>
    </div>,
    document.body
  );
}
