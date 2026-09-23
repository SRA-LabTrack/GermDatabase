import { formatReportDate } from './breedingReports';

function text(value) {
  return String(value ?? '').trim();
}

function safeFilename(value) {
  return text(value || 'breeding-report')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1800);
}

function reportBaseName(report) {
  const label = report?.range?.label || 'Breeding Report';
  return `${safeFilename(label)}-Breeding-Report${report?.includeTechnical ? '-Technical' : ''}`;
}

function hexToRgb(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  const safe = /^[0-9A-Fa-f]{6}$/.test(clean) ? clean : '315F3D';
  return [
    parseInt(safe.slice(0, 2), 16),
    parseInt(safe.slice(2, 4), 16),
    parseInt(safe.slice(4, 6), 16)
  ];
}

function setTextHex(pdf, hex) {
  const [r, g, b] = hexToRgb(hex);
  pdf.setTextColor(r, g, b);
}

function setDrawHex(pdf, hex) {
  const [r, g, b] = hexToRgb(hex);
  pdf.setDrawColor(r, g, b);
}

function setFillHex(pdf, hex) {
  const [r, g, b] = hexToRgb(hex);
  pdf.setFillColor(r, g, b);
}

const PDF = {
  pageWidth: 210,
  pageHeight: 297,
  marginX: 14,
  top: 14,
  bottom: 15,
  contentWidth: 182,
  footerY: 290
};

function ensurePdfSpace(pdf, y, needed, continuationTitle = '') {
  if (y + needed <= PDF.pageHeight - PDF.bottom - 7) return y;
  pdf.addPage();
  let next = PDF.top;
  if (continuationTitle) {
    setTextHex(pdf, '#748278');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text(`${continuationTitle} — continued`, PDF.marginX, next);
    next += 6;
  }
  return next;
}

function addPdfFooter(pdf, report) {
  const total = pdf.getNumberOfPages();
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page);
    setDrawHex(pdf, '#DCE6D9');
    pdf.setLineWidth(0.2);
    pdf.line(PDF.marginX, 284.4, PDF.pageWidth - PDF.marginX, 284.4);
    setTextHex(pdf, '#839087');
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.text('CaneSprout Registry', PDF.marginX, PDF.footerY);
    pdf.text(`Page ${page} of ${total}`, PDF.pageWidth / 2, PDF.footerY, { align: 'center' });
    pdf.text(report?.range?.label || 'Breeding Report', PDF.pageWidth - PDF.marginX, PDF.footerY, { align: 'right' });
  }
}

function drawPdfSummaryCard(pdf, x, y, width, label, value) {
  setFillHex(pdf, '#F6FAF3');
  setDrawHex(pdf, '#DCE7D8');
  pdf.roundedRect(x, y, width, 14.5, 2, 2, 'FD');
  setTextHex(pdf, '#245237');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(String(value ?? 0), x + 3, y + 6.2);
  setTextHex(pdf, '#718077');
  pdf.setFontSize(6.5);
  pdf.text(String(label || '').toUpperCase(), x + 3, y + 11.3);
}

function splitPdfText(pdf, value, width) {
  return pdf.splitTextToSize(text(value) || '—', Math.max(12, width));
}

function drawPdfTable(pdf, {
  title,
  columns,
  rows,
  startY,
  repeatTitle = true
}) {
  let y = startY;
  const tableWidth = columns.reduce((sum, col) => sum + col.width, 0);
  const rowPadX = 1.5;
  const rowPadY = 1.5;

  function drawHeader() {
    if (title) {
      setTextHex(pdf, '#28573A');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10.5);
      pdf.text(title, PDF.marginX, y);
      y += 5;
    }
    setFillHex(pdf, '#EDF5E9');
    setDrawHex(pdf, '#DCE6D9');
    pdf.rect(PDF.marginX, y, tableWidth, 8, 'FD');
    let x = PDF.marginX;
    setTextHex(pdf, '#55705B');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.4);
    for (const col of columns) {
      pdf.text(col.label.toUpperCase(), x + rowPadX, y + 5.2);
      x += col.width;
      if (x < PDF.marginX + tableWidth - 0.1) pdf.line(x, y, x, y + 8);
    }
    y += 8;
  }

  drawHeader();

  for (const row of rows) {
    const cellLines = columns.map((col) => splitPdfText(pdf, row[col.key], col.width - rowPadX * 2));
    const maxLines = Math.max(1, ...cellLines.map((lines) => lines.length));
    const rowHeight = Math.max(8, (maxLines * 3.3) + rowPadY * 2);

    if (y + rowHeight > PDF.pageHeight - PDF.bottom - 8) {
      pdf.addPage();
      y = PDF.top;
      if (repeatTitle) drawHeader();
    }

    setFillHex(pdf, row.__inactive ? '#FBFCFA' : '#FFFFFF');
    setDrawHex(pdf, '#E1E9DE');
    pdf.rect(PDF.marginX, y, tableWidth, rowHeight, 'FD');

    let x = PDF.marginX;
    for (let index = 0; index < columns.length; index += 1) {
      const col = columns[index];
      setTextHex(pdf, row.__inactive ? '#8B968E' : '#304F38');
      pdf.setFont('helvetica', col.bold ? 'bold' : 'normal');
      pdf.setFontSize(col.fontSize || 7.2);
      pdf.text(cellLines[index], x + rowPadX, y + 4.3);
      x += col.width;
      if (x < PDF.marginX + tableWidth - 0.1) pdf.line(x, y, x, y + rowHeight);
    }
    y += rowHeight;
  }

  return y + 4;
}

function reportTechnicalRows(report) {
  if (!report?.includeTechnical) return [];
  const tech = report.technical || {};
  return [
    ['Technical Report Title', tech.title || 'Breeding Technical Report'],
    ['Prepared By', tech.preparedBy || 'Not specified'],
    ['Objective', tech.objective || 'Not provided'],
    ['Methodology / Basis', tech.methodology || 'Not provided'],
    ['Observations / Findings', tech.observations || 'No additional observations were supplied.'],
    ['Recommendations', tech.recommendations || 'No recommendations were supplied.']
  ];
}

export async function saveBreedingReportPdf(report) {
  if (!report) throw new Error('Generate a breeding report before saving it.');
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
    putOnlyUsedFonts: true
  });

  let y = PDF.top;

  setTextHex(pdf, '#748278');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.text('SUGARCANE GERMPLASM RESOURCE DATABASE', PDF.marginX, y);
  y += 7;

  setTextHex(pdf, '#173E27');
  pdf.setFont('times', 'normal');
  pdf.setFontSize(22);
  pdf.text('Breeding Report', PDF.marginX, y);
  y += 6;

  setTextHex(pdf, '#607267');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(report.range?.label || 'Breeding Report', PDF.marginX, y);
  y += 5;
  pdf.setFontSize(7.5);
  pdf.text(`${formatReportDate(report.range?.start)} through ${formatReportDate(report.range?.end)}`, PDF.marginX, y);

  const rightX = PDF.pageWidth - PDF.marginX;
  setTextHex(pdf, '#405E49');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.text(report.includeTechnical ? 'Includes Technical Report' : 'Breeding Activity Summary', rightX, PDF.top + 2, { align: 'right' });
  setTextHex(pdf, '#7A867D');
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.text(`Generated ${new Date(report.generatedAt || Date.now()).toLocaleString()}`, rightX, PDF.top + 7, { align: 'right' });

  y += 5;
  setDrawHex(pdf, '#2F6B43');
  pdf.setLineWidth(0.5);
  pdf.line(PDF.marginX, y, rightX, y);
  y += 7;

  const stats = report.stats || {};
  const summary = [
    ['Recorded Crosses', stats.totalCrosses || 0],
    ['Unique Pairings', stats.uniquePairings || 0],
    ['Female Parents', stats.uniqueFemaleParents || 0],
    ['Male Parents', stats.uniqueMaleParents || 0],
    ['Breeding Days', stats.activeBreedingDays || 0]
  ];
  const gap = 2;
  const cardWidth = (PDF.contentWidth - (gap * 4)) / 5;
  summary.forEach(([label, value], index) => drawPdfSummaryCard(pdf, PDF.marginX + index * (cardWidth + gap), y, cardWidth, label, value));
  y += 19;

  if (report.range?.period === 'range') {
    y = ensurePdfSpace(pdf, y, 22, 'Time Period Breakdown');
    setTextHex(pdf, '#28573A');
    pdf.setFont('times', 'normal');
    pdf.setFontSize(15);
    pdf.text('Period-by-period breeding activity', PDF.marginX, y);
    y += 6;

    y = drawPdfTable(pdf, {
      title: '',
      startY: y,
      columns: [
        { key: 'index', label: '#', width: 8, bold: true },
        { key: 'label', label: 'Period', width: 28, bold: true },
        { key: 'detail', label: 'Date span', width: 54 },
        { key: 'crosses', label: 'Crosses', width: 22 },
        { key: 'pairings', label: 'Pairings', width: 22 },
        { key: 'parents', label: 'Parents', width: 22 },
        { key: 'days', label: 'Days', width: 26 }
      ],
      rows: (report.buckets || []).map((bucket) => ({
        index: bucket.index,
        label: bucket.label,
        detail: bucket.detailLabel,
        crosses: bucket.stats?.totalCrosses || 0,
        pairings: bucket.stats?.uniquePairings || 0,
        parents: bucket.stats?.uniqueParents || 0,
        days: bucket.stats?.activeBreedingDays || 0,
        __inactive: !bucket.active
      }))
    });
  }

  y = ensurePdfSpace(pdf, y, 24, 'Recorded Combinations');
  setTextHex(pdf, '#28573A');
  pdf.setFont('times', 'normal');
  pdf.setFontSize(15);
  pdf.text('Recorded combinations', PDF.marginX, y);
  y += 6;

  const rangeMode = report.range?.period === 'range';
  const eventRows = (report.events || []).map((row, index) => {
    const bucket = rangeMode
      ? (report.buckets || []).find((item) => row.report_date >= item.start && row.report_date <= item.end)
      : null;
    return {
      index: index + 1,
      interval: bucket?.label || '',
      date: formatReportDate(row.report_date),
      female: row.female_variety || 'Not recorded',
      male: row.male_variety || 'Not recorded',
      notes: row.notes || '—',
      source: row.source_sheet || (row.local_manual ? 'Manual registry' : '—')
    };
  });

  const eventColumns = rangeMode
    ? [
        { key: 'index', label: '#', width: 7, bold: true },
        { key: 'interval', label: 'Interval', width: 19 },
        { key: 'date', label: 'Date', width: 26 },
        { key: 'female', label: 'Female', width: 31, bold: true },
        { key: 'male', label: 'Male', width: 31, bold: true },
        { key: 'notes', label: 'Notes', width: 40 },
        { key: 'source', label: 'Source', width: 28 }
      ]
    : [
        { key: 'index', label: '#', width: 8, bold: true },
        { key: 'date', label: 'Date', width: 28 },
        { key: 'female', label: 'Female', width: 35, bold: true },
        { key: 'male', label: 'Male', width: 35, bold: true },
        { key: 'notes', label: 'Notes', width: 47 },
        { key: 'source', label: 'Source', width: 29 }
      ];

  y = drawPdfTable(pdf, {
    title: '',
    startY: y,
    columns: eventColumns,
    rows: eventRows.length ? eventRows : [{ index: '', interval: '', date: 'No dated breeding combinations were recorded in this reporting period.', female: '', male: '', notes: '', source: '' }]
  });

  if (report.includeTechnical) {
    y = ensurePdfSpace(pdf, y, 25, 'Technical Report');
    setTextHex(pdf, '#748278');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text('TECHNICAL REPORT', PDF.marginX, y);
    y += 6;
    setTextHex(pdf, '#28573A');
    pdf.setFont('times', 'normal');
    pdf.setFontSize(15);
    pdf.text(text(report.technical?.title) || 'Breeding Technical Report', PDF.marginX, y);
    y += 7;

    for (const [label, value] of reportTechnicalRows(report).slice(1)) {
      const lines = splitPdfText(pdf, value, PDF.contentWidth);
      const needed = 7 + lines.length * 4.2;
      y = ensurePdfSpace(pdf, y, needed, 'Technical Report');
      setTextHex(pdf, '#66776C');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.2);
      pdf.text(label.toUpperCase(), PDF.marginX, y);
      y += 4.5;
      setTextHex(pdf, '#304F38');
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.text(lines, PDF.marginX, y);
      y += lines.length * 4.2 + 3.2;
    }
  }

  addPdfFooter(pdf, report);
  pdf.setProperties({
    title: `${report.range?.label || 'Breeding'} - Breeding Report`,
    subject: 'CaneSprout breeding activity report',
    author: 'CaneSprout Registry',
    creator: 'CaneSprout Registry'
  });
  pdf.save(`${reportBaseName(report)}.pdf`);
}

function docxCell(children, options = {}) {
  return { children, ...options };
}

export async function saveBreedingReportWord(report) {
  if (!report) throw new Error('Generate a breeding report before saving it.');
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

  const paragraph = (value, options = {}) => new Paragraph({
    spacing: options.spacing || { after: 60, line: 250 },
    keepNext: Boolean(options.keepNext),
    alignment: options.alignment,
    children: [new TextRun({
      text: String(value ?? ''),
      bold: Boolean(options.bold),
      italics: Boolean(options.italics),
      color: options.color || '294D34',
      size: options.size || 19,
      font: options.font || 'Arial'
    })]
  });

  const tableCell = (value, { header = false, width = 20, bold = false } = {}) => new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    shading: { fill: header ? 'EEF5EB' : 'FAFCF8' },
    children: [paragraph(value, {
      bold: header || bold,
      color: header ? '56705B' : '294D34',
      size: header ? 15 : 17,
      spacing: { before: 35, after: 35, line: 230 }
    })]
  });

  const children = [];
  children.push(paragraph('SUGARCANE GERMPLASM RESOURCE DATABASE', { bold: true, color: '718473', size: 15, spacing: { after: 70 } }));
  children.push(new Paragraph({
    heading: HeadingLevel.TITLE,
    spacing: { after: 45 },
    children: [new TextRun({ text: 'Breeding Report', color: '173D27', size: 38, font: 'Georgia' })]
  }));
  children.push(paragraph(report.range?.label || '', { color: '526A59', size: 20, spacing: { after: 35 } }));
  children.push(paragraph(`${formatReportDate(report.range?.start)} through ${formatReportDate(report.range?.end)}`, { color: '748178', size: 16, spacing: { after: 170 } }));

  const stats = report.stats || {};
  const summaryRows = [
    ['Recorded Crosses', stats.totalCrosses || 0],
    ['Unique Pairings', stats.uniquePairings || 0],
    ['Female Parents', stats.uniqueFemaleParents || 0],
    ['Male Parents', stats.uniqueMaleParents || 0],
    ['Breeding Days', stats.activeBreedingDays || 0]
  ];
  if (report.range?.period === 'range') {
    summaryRows.push(['Total Intervals', report.timelineStats?.totalIntervals || 0]);
    summaryRows.push(['Active Intervals', report.timelineStats?.activeIntervals || 0]);
  }

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 80, after: 70 },
    children: [new TextRun({ text: 'Report Summary', color: '204A30', size: 27, font: 'Georgia' })]
  }));
  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [tableCell('Metric', { header: true, width: 60 }), tableCell('Value', { header: true, width: 40 })]
      }),
      ...summaryRows.map(([label, value]) => new TableRow({
        cantSplit: true,
        children: [tableCell(label, { width: 60, bold: true }), tableCell(value, { width: 40 })]
      }))
    ]
  }));

  if (report.range?.period === 'range') {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 180, after: 70 },
      children: [new TextRun({ text: 'Period-by-Period Breeding Activity', color: '204A30', size: 27, font: 'Georgia' })]
    }));
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            tableCell('#', { header: true, width: 7 }),
            tableCell('Period', { header: true, width: 18 }),
            tableCell('Date Span', { header: true, width: 31 }),
            tableCell('Crosses', { header: true, width: 11 }),
            tableCell('Pairings', { header: true, width: 11 }),
            tableCell('Parents', { header: true, width: 11 }),
            tableCell('Days', { header: true, width: 11 })
          ]
        }),
        ...(report.buckets || []).map((bucket) => new TableRow({
          cantSplit: true,
          children: [
            tableCell(bucket.index, { width: 7 }),
            tableCell(bucket.label, { width: 18, bold: true }),
            tableCell(bucket.detailLabel, { width: 31 }),
            tableCell(bucket.stats?.totalCrosses || 0, { width: 11 }),
            tableCell(bucket.stats?.uniquePairings || 0, { width: 11 }),
            tableCell(bucket.stats?.uniqueParents || 0, { width: 11 }),
            tableCell(bucket.stats?.activeBreedingDays || 0, { width: 11 })
          ]
        }))
      ]
    }));
  }

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    spacing: { before: 180, after: 70 },
    children: [new TextRun({ text: 'Recorded Combinations', color: '204A30', size: 27, font: 'Georgia' })]
  }));

  const rangeMode = report.range?.period === 'range';
  const eventHeader = [
    ...(rangeMode ? [tableCell('Interval', { header: true, width: 13 })] : []),
    tableCell('Date', { header: true, width: 15 }),
    tableCell('Female Parent', { header: true, width: 18 }),
    tableCell('Male Parent', { header: true, width: 18 }),
    tableCell('Notes', { header: true, width: 22 }),
    tableCell('Source', { header: true, width: rangeMode ? 14 : 27 })
  ];

  const eventRows = (report.events || []).map((row) => {
    const bucket = rangeMode
      ? (report.buckets || []).find((item) => row.report_date >= item.start && row.report_date <= item.end)
      : null;
    return new TableRow({
      cantSplit: true,
      children: [
        ...(rangeMode ? [tableCell(bucket?.label || '—', { width: 13 })] : []),
        tableCell(formatReportDate(row.report_date), { width: 15 }),
        tableCell(row.female_variety || 'Not recorded', { width: 18, bold: true }),
        tableCell(row.male_variety || 'Not recorded', { width: 18, bold: true }),
        tableCell(row.notes || '—', { width: 22 }),
        tableCell(row.source_sheet || (row.local_manual ? 'Manual registry' : '—'), { width: rangeMode ? 14 : 27 })
      ]
    });
  });

  if (!eventRows.length) {
    eventRows.push(new TableRow({
      children: [new TableCell({
        columnSpan: rangeMode ? 6 : 5,
        children: [paragraph('No dated breeding combinations were recorded in this reporting period.', { italics: true, color: '7C897F' })]
      })]
    }));
  }

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: eventHeader }), ...eventRows]
  }));

  if (report.includeTechnical) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      keepNext: true,
      spacing: { before: 200, after: 70 },
      children: [new TextRun({ text: report.technical?.title || 'Breeding Technical Report', color: '204A30', size: 27, font: 'Georgia' })]
    }));
    for (const [label, value] of reportTechnicalRows(report).slice(1)) {
      children.push(paragraph(label.toUpperCase(), { bold: true, color: '718073', size: 14, spacing: { before: 80, after: 30 } }));
      children.push(paragraph(value, { color: '304F38', size: 18, spacing: { after: 90, line: 260 } }));
    }
  }

  children.push(paragraph('CaneSprout Registry • Editable breeding report', {
    alignment: AlignmentType.CENTER,
    color: '889389',
    size: 14,
    spacing: { before: 240 }
  }));

  const doc = new Document({
    creator: 'CaneSprout Registry',
    title: `${report.range?.label || 'Breeding'} - Breeding Report`,
    description: 'Sugarcane Germplasm Resource Database breeding report',
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: 18, color: '294D34' },
          paragraph: { spacing: { line: 250, after: 60 } }
        }
      }
    },
    sections: [{
      properties: { page: { margin: { top: 720, right: 650, bottom: 720, left: 650 } } },
      children
    }]
  });

  const blob = await Packer.toBlob(doc);
  triggerBlobDownload(blob, `${reportBaseName(report)}.docx`);
}

function applyExcelCellStyles(worksheet) {
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
}

export async function saveBreedingReportExcel(report) {
  if (!report) throw new Error('Generate a breeding report before saving it.');
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default || xlsxModule;
  const workbook = XLSX.utils.book_new();

  const stats = report.stats || {};
  const summaryRows = [
    ['CaneSprout Breeding Report', report.range?.label || ''],
    ['Start Date', report.range?.start || ''],
    ['End Date', report.range?.end || ''],
    ['Generated', new Date(report.generatedAt || Date.now()).toLocaleString()],
    ['Technical Report Included', report.includeTechnical ? 'Yes' : 'No'],
    ['Live Cloud Records Included', report.includeCloud ? 'Yes' : 'No'],
    [],
    ['Metric', 'Value'],
    ['Recorded Crosses', stats.totalCrosses || 0],
    ['Unique Pairings', stats.uniquePairings || 0],
    ['Female Parents', stats.uniqueFemaleParents || 0],
    ['Male Parents', stats.uniqueMaleParents || 0],
    ['Unique Parents', stats.uniqueParents || 0],
    ['Breeding Days', stats.activeBreedingDays || 0]
  ];
  if (report.range?.period === 'range') {
    summaryRows.push(['Total Intervals', report.timelineStats?.totalIntervals || 0]);
    summaryRows.push(['Active Intervals', report.timelineStats?.activeIntervals || 0]);
    summaryRows.push(['Inactive Intervals', report.timelineStats?.inactiveIntervals || 0]);
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet['!cols'] = [{ wch: 34 }, { wch: 76 }];
  summarySheet['!rows'] = summaryRows.map((row) => ({ hpt: row?.some?.((cell) => String(cell || '').length > 70) ? 40 : 22 }));
  applyExcelCellStyles(summarySheet);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  if (report.range?.period === 'range') {
    const timelineRows = [
      ['#', 'Period', 'Start', 'End', 'Date Span', 'Crosses', 'Unique Pairings', 'Unique Parents', 'Breeding Days', 'Activity']
    ];
    for (const bucket of report.buckets || []) {
      timelineRows.push([
        bucket.index,
        bucket.label,
        bucket.start,
        bucket.end,
        bucket.detailLabel,
        bucket.stats?.totalCrosses || 0,
        bucket.stats?.uniquePairings || 0,
        bucket.stats?.uniqueParents || 0,
        bucket.stats?.activeBreedingDays || 0,
        bucket.active ? 'Active' : 'No recorded crosses'
      ]);
    }
    const timelineSheet = XLSX.utils.aoa_to_sheet(timelineRows);
    timelineSheet['!cols'] = [
      { wch: 7 }, { wch: 20 }, { wch: 13 }, { wch: 13 }, { wch: 34 },
      { wch: 11 }, { wch: 15 }, { wch: 14 }, { wch: 14 }, { wch: 22 }
    ];
    timelineSheet['!rows'] = timelineRows.map(() => ({ hpt: 24 }));
    timelineSheet['!autofilter'] = { ref: `A1:J${timelineRows.length}` };
    applyExcelCellStyles(timelineSheet);
    XLSX.utils.book_append_sheet(workbook, timelineSheet, 'Timeline');
  }

  const rangeMode = report.range?.period === 'range';
  const eventsRows = [[
    ...(rangeMode ? ['Interval'] : []),
    'Date', 'Female Parent', 'Male Parent', 'Notes', 'Source', 'Source Cell', 'Recorded By'
  ]];
  for (const row of report.events || []) {
    const bucket = rangeMode
      ? (report.buckets || []).find((item) => row.report_date >= item.start && row.report_date <= item.end)
      : null;
    eventsRows.push([
      ...(rangeMode ? [bucket?.label || ''] : []),
      row.report_date || '',
      row.female_variety || '',
      row.male_variety || '',
      row.notes || '',
      row.source_sheet || (row.local_manual ? 'Manual registry' : ''),
      row.source_cell || '',
      row.created_by_name || row.created_by || ''
    ]);
  }
  const eventSheet = XLSX.utils.aoa_to_sheet(eventsRows);
  eventSheet['!cols'] = [
    ...(rangeMode ? [{ wch: 18 }] : []),
    { wch: 13 }, { wch: 24 }, { wch: 24 }, { wch: 48 }, { wch: 28 }, { wch: 16 }, { wch: 25 }
  ];
  eventSheet['!rows'] = eventsRows.map((row) => ({ hpt: row.some((cell) => String(cell || '').length > 80) ? 42 : 24 }));
  const eventLastCol = rangeMode ? 'H' : 'G';
  eventSheet['!autofilter'] = { ref: `A1:${eventLastCol}${Math.max(1, eventsRows.length)}` };
  applyExcelCellStyles(eventSheet);
  XLSX.utils.book_append_sheet(workbook, eventSheet, 'Breeding Events');

  if (report.includeTechnical) {
    const technicalRows = [['Technical Report Field', 'Content'], ...reportTechnicalRows(report)];
    const technicalSheet = XLSX.utils.aoa_to_sheet(technicalRows);
    technicalSheet['!cols'] = [{ wch: 32 }, { wch: 100 }];
    technicalSheet['!rows'] = technicalRows.map((row) => ({ hpt: String(row?.[1] || '').length > 120 ? 60 : 28 }));
    applyExcelCellStyles(technicalSheet);
    XLSX.utils.book_append_sheet(workbook, technicalSheet, 'Technical Report');
  }

  workbook.Props = {
    Title: `${report.range?.label || 'Breeding'} - Breeding Report`,
    Subject: 'CaneSprout breeding activity report',
    Author: 'CaneSprout Registry',
    Company: 'CaneSprout Registry',
    CreatedDate: new Date()
  };

  XLSX.writeFile(workbook, `${reportBaseName(report)}.xlsx`, {
    bookType: 'xlsx',
    compression: true,
    cellStyles: true
  });
}
