import { jsPDF } from 'jspdf';

export type PdfMetric = {
  label: string;
  value: string | number;
  detail?: string;
};

export type PdfChartDatum = {
  label: string;
  value: number;
};

export type PdfChart = {
  title: string;
  description?: string;
  kind: 'bar' | 'line';
  data: PdfChartDatum[];
  valueSuffix?: string;
  color?: [number, number, number];
};

export type PdfTable = {
  title: string;
  description?: string;
  columns: Array<{ label: string; weight?: number; align?: 'left' | 'right' | 'center' }>;
  rows: Array<Array<string | number | null | undefined>>;
};

export type PdfReportDefinition = {
  fileName: string;
  title: string;
  reportType: string;
  generatedAt: string;
  generatedBy: string;
  generatedByRole: string;
  periodLabel?: string;
  scopeLabel?: string;
  summary?: PdfMetric[];
  charts?: PdfChart[];
  tables?: PdfTable[];
  notes?: string[];
  classification?: string;
  brandLogoDataUrl?: string;
  brandCoverDataUrl?: string;
};

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 15;
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
const FOOTER_Y = PAGE_HEIGHT - 10;

const COLOR = {
  ink: [15, 23, 42] as const,
  muted: [100, 116, 139] as const,
  border: [226, 232, 240] as const,
  surface: [255, 247, 247] as const,
  brand: [168, 18, 29] as const,
  accent: [202, 34, 48] as const,
  accentSoft: [253, 232, 234] as const,
  white: [255, 255, 255] as const,
};

export function normalizePdfText(value: unknown): string {
  return String(value ?? 'Not provided')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u00b7\u2022]/g, '|')
    .replace(/\u2026/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
    .trim() || '-';
}

export function safePdfFileName(value: string): string {
  const normalized = value.toLowerCase().replace(/\.pdf$/i, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${normalized || 'hirna-report'}.pdf`;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return normalizePdfText(value);
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

export function buildPdfDocument(report: PdfReportDefinition): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  let y = MARGIN;
  let sectionNumber = 0;

  doc.setProperties({
    title: normalizePdfText(report.title),
    subject: normalizePdfText(report.reportType),
    author: normalizePdfText(report.generatedBy),
    creator: 'Hirna TNVS Facilities & Administrative Management System',
    keywords: 'Hirna,TNVS,Facilities,Administrative,Report',
  });

  const setText = (size: number, style: 'normal' | 'bold' = 'normal', color: readonly [number, number, number] = COLOR.ink) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
  };

  const drawLogo = (x: number, top: number, size: number) => {
    if (report.brandLogoDataUrl) {
      try {
        doc.addImage(report.brandLogoDataUrl, 'PNG', x, top, size, size, 'hirna-logo', 'FAST');
        return;
      } catch (error) {
        console.warn('Unable to embed the Hirna logo in the PDF; using the text fallback.', error);
      }
    }
    doc.setFillColor(...COLOR.accent);
    doc.roundedRect(x, top, size, size, 2, 2, 'F');
    setText(Math.max(7, size * 0.34), 'bold', COLOR.white);
    doc.text('H', x + (size / 2), top + (size * 0.63), { align: 'center' });
  };

  const continuationHeader = () => {
    drawLogo(MARGIN, 7, 11);
    setText(12, 'bold');
    doc.text('HIRNA', MARGIN + 15, 13);
    setText(7.5, 'bold');
    doc.text(normalizePdfText(report.title), PAGE_WIDTH - MARGIN, 10, { align: 'right' });
    setText(6.5, 'normal', COLOR.muted);
    doc.text(normalizePdfText(report.periodLabel ?? 'Authorized report'), PAGE_WIDTH - MARGIN, 14, { align: 'right' });
    doc.setDrawColor(...COLOR.accent);
    doc.setLineWidth(0.45);
    doc.line(MARGIN, 20, PAGE_WIDTH - MARGIN, 20);
    y = 29;
  };

  const addPage = () => {
    doc.addPage();
    continuationHeader();
  };

  const ensureSpace = (height: number) => {
    if (y + height > FOOTER_Y - 8) addPage();
  };

  const writeWrapped = (text: string, x: number, maxWidth: number, size = 9, lineHeight = 4.2, style: 'normal' | 'bold' = 'normal', color: readonly [number, number, number] = COLOR.ink) => {
    setText(size, style, color);
    const lines = doc.splitTextToSize(normalizePdfText(text), maxWidth) as string[];
    doc.text(lines, x, y);
    y += Math.max(1, lines.length) * lineHeight;
  };

  const sectionTitle = (title: string, description?: string) => {
    ensureSpace(description ? 17 : 11);
    sectionNumber += 1;
    y += 3;
    setText(12, 'bold', COLOR.brand);
    doc.text(`${sectionNumber}.`, MARGIN, y + 1);
    doc.text(normalizePdfText(title).toUpperCase(), MARGIN + 9, y + 1);
    y += 7;
    if (description) writeWrapped(description, MARGIN + 5, CONTENT_WIDTH - 5, 8, 3.8, 'normal', COLOR.muted);
    y += 2;
  };

  const drawCoverPage = () => {
    doc.setFillColor(255, 246, 247);
    doc.ellipse(PAGE_WIDTH + 12, -8, 75, 38, 'F');
    doc.setFillColor(246, 190, 195);
    doc.ellipse(PAGE_WIDTH + 18, -13, 62, 29, 'F');
    drawLogo(MARGIN, 16, 34);
    setText(8, 'bold');
    doc.text('Facilities & Administrative', PAGE_WIDTH - MARGIN, 23, { align: 'right' });
    doc.text('Management System', PAGE_WIDTH - MARGIN, 28, { align: 'right' });
    setText(7, 'normal', COLOR.muted);
    doc.text(`${normalizePdfText(report.classification ?? 'INTERNAL')} Report`, PAGE_WIDTH - MARGIN, 34, { align: 'right' });

    y = 67;
    setText(24, 'bold', COLOR.brand);
    const titleLines = doc.splitTextToSize(normalizePdfText(report.reportType).toUpperCase(), CONTENT_WIDTH - 8) as string[];
    doc.text(titleLines, MARGIN, y);
    y += titleLines.length * 10 + 5;
    setText(9, 'bold', COLOR.ink);
    doc.text(normalizePdfText(report.title).toUpperCase(), MARGIN, y);
    y += 8;
    doc.setDrawColor(...COLOR.accent);
    doc.setLineWidth(0.55);
    doc.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    y += 14;

    const metadata = [
      ['Reporting Period', report.periodLabel ?? 'Current authorized snapshot'],
      ['Generated', `${formatGeneratedAt(report.generatedAt)} (Asia/Manila)`],
      ['Generated By', report.generatedBy],
      ['Role / Department', report.generatedByRole],
      ['Authorization Scope', report.scopeLabel ?? 'Current authenticated role scope'],
    ];
    metadata.forEach(([label, value]) => {
      doc.setFillColor(...COLOR.accent);
      doc.circle(MARGIN + 2.5, y - 1, 2.2, 'F');
      setText(8, 'bold');
      doc.text(label, MARGIN + 9, y);
      setText(8.5, 'normal');
      const lines = doc.splitTextToSize(normalizePdfText(value), 105) as string[];
      doc.text(lines.slice(0, 2), MARGIN + 52, y);
      y += Math.max(11, lines.length * 4.2 + 4);
    });

    if (report.brandCoverDataUrl) {
      try {
        doc.addImage(report.brandCoverDataUrl, 'PNG', 0, 182, PAGE_WIDTH, 70, 'hirna-cover-art', 'FAST');
      } catch (error) {
        console.warn('Unable to embed the Hirna cover artwork in the PDF.', error);
      }
    }

    doc.setFillColor(253, 232, 234);
    doc.ellipse(75, PAGE_HEIGHT + 4, 120, 50, 'F');
    doc.setFillColor(...COLOR.accent);
    doc.ellipse(150, PAGE_HEIGHT + 25, 125, 55, 'F');
    doc.setFillColor(...COLOR.brand);
    doc.ellipse(205, PAGE_HEIGHT + 29, 85, 48, 'F');
    setText(7.5, 'bold', COLOR.white);
    doc.text('People. Facilities. Mobility.', PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 21, { align: 'right' });
    doc.text('A Smarter Tomorrow.', PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 16, { align: 'right' });
    setText(7.5, 'normal', COLOR.ink);
    doc.text('Hirna TNVS Facilities & Administrative Management System', MARGIN, PAGE_HEIGHT - 18);
  };

  const drawSummary = (metrics: PdfMetric[]) => {
    sectionTitle('Executive Summary', 'Key authorized values for the selected reporting period.');
    const gap = 3;
    const columns = Math.min(4, metrics.length || 1);
    const cardWidth = (CONTENT_WIDTH - (gap * (columns - 1))) / columns;
    for (let start = 0; start < metrics.length; start += columns) {
      ensureSpace(29);
      metrics.slice(start, start + columns).forEach((metric, column) => {
        const x = MARGIN + (column * (cardWidth + gap));
        doc.setFillColor(...COLOR.surface);
        doc.setDrawColor(250, 220, 223);
        doc.roundedRect(x, y, cardWidth, 25, 2, 2, 'FD');
        doc.setFillColor(...COLOR.accent);
        doc.circle(x + (cardWidth / 2), y + 5.2, 2.2, 'F');
        setText(12, 'bold');
        doc.text(normalizePdfText(metric.value), x + (cardWidth / 2), y + 12, { align: 'center' });
        setText(6.8, 'bold', COLOR.ink);
        doc.text(normalizePdfText(metric.label), x + (cardWidth / 2), y + 17, { align: 'center' });
        if (metric.detail) {
          setText(5.8, 'normal', COLOR.muted);
          const detail = doc.splitTextToSize(normalizePdfText(metric.detail), cardWidth - 5) as string[];
          doc.text(detail.slice(0, 1), x + (cardWidth / 2), y + 21, { align: 'center' });
        }
      });
      y += 29;
    }
  };

  const drawChart = (chart: PdfChart) => {
    const availableData = chart.data.filter((item) => Number.isFinite(item.value));
    const data = chart.kind === 'bar' ? availableData.slice(0, 15) : availableData;
    const chartHeight = 65;
    ensureSpace(chartHeight + 20);
    sectionTitle(chart.title, chart.description);
    if (!data.length) {
      writeWrapped('No chart data is available for this reporting period.', MARGIN, CONTENT_WIDTH, 9, 4.2, 'normal', COLOR.muted);
      return;
    }

    const x0 = MARGIN + 12;
    const plotWidth = CONTENT_WIDTH - 20;
    const plotHeight = 42;
    const top = y + 2;
    const baseline = top + plotHeight;
    const maxValue = Math.max(1, ...data.map((item) => item.value));
    const color = chart.color ?? COLOR.accent;
    const suffix = chart.valueSuffix ? normalizePdfText(chart.valueSuffix) : '';
    doc.setDrawColor(...COLOR.border);
    doc.line(x0, top, x0, baseline);
    doc.line(x0, baseline, x0 + plotWidth, baseline);
    setText(6.5, 'normal', COLOR.muted);
    doc.text(`Max ${normalizePdfText(maxValue)}${suffix}`, x0, top - 2);

    if (chart.kind === 'bar') {
      const slot = plotWidth / data.length;
      const barWidth = Math.max(3, Math.min(10, slot * 0.55));
      data.forEach((item, index) => {
        const height = (item.value / maxValue) * (plotHeight - 3);
        const x = x0 + (slot * index) + ((slot - barWidth) / 2);
        doc.setFillColor(color[0], color[1], color[2]);
        doc.roundedRect(x, baseline - height, barWidth, height, 1, 1, 'F');
        setText(6.5, 'bold');
        doc.text(`${normalizePdfText(item.value)}${suffix}`, x + (barWidth / 2), baseline - height - 2, { align: 'center' });
        setText(5.8, 'normal', COLOR.muted);
        const label = normalizePdfText(item.label).slice(0, 16);
        doc.text(label, x + (barWidth / 2), baseline + 4, { align: 'center', angle: data.length > 7 ? 35 : 0 });
      });
    } else {
      const step = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;
      const labelEvery = Math.max(1, Math.ceil(data.length / 8));
      doc.setDrawColor(color[0], color[1], color[2]);
      doc.setLineWidth(0.8);
      data.forEach((item, index) => {
        const x = x0 + (step * index);
        const pointY = baseline - ((item.value / maxValue) * (plotHeight - 3));
        if (index > 0) {
          const previous = data[index - 1];
          const previousX = x0 + (step * (index - 1));
          const previousY = baseline - ((previous.value / maxValue) * (plotHeight - 3));
          doc.line(previousX, previousY, x, pointY);
        }
        doc.setFillColor(color[0], color[1], color[2]);
        doc.circle(x, pointY, data.length > 31 ? 0.6 : 1.2, 'F');
        if (index % labelEvery === 0 || index === data.length - 1) {
          setText(5.8, 'normal', COLOR.muted);
          doc.text(normalizePdfText(item.label).slice(0, 14), x, baseline + 4, { align: 'center', angle: data.length > 7 ? 35 : 0 });
        }
      });
    }
    y = baseline + 13;
  };

  const drawTable = (table: PdfTable) => {
    sectionTitle(table.title, table.description);
    if (!table.rows.length) {
      writeWrapped('No detailed records are available for this reporting period.', MARGIN, CONTENT_WIDTH, 9, 4.2, 'normal', COLOR.muted);
      return;
    }
    const weights = table.columns.map((column) => column.weight ?? 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    const widths = weights.map((weight) => (CONTENT_WIDTH * weight) / totalWeight);

    const drawTableHeader = () => {
      ensureSpace(10);
      doc.setFillColor(250, 229, 231);
      doc.setDrawColor(242, 196, 201);
      doc.rect(MARGIN, y, CONTENT_WIDTH, 9, 'F');
      let x = MARGIN;
      table.columns.forEach((column, index) => {
        setText(6.8, 'bold', COLOR.brand);
        const align = column.align ?? 'left';
        const textX = align === 'right' ? x + widths[index] - 2.5 : align === 'center' ? x + (widths[index] / 2) : x + 2.5;
        doc.text(normalizePdfText(column.label).toUpperCase(), textX, y + 5.8, { align });
        x += widths[index];
      });
      y += 9;
    };

    drawTableHeader();
    table.rows.forEach((row, rowIndex) => {
      const cellLines = table.columns.map((_, index) => doc.splitTextToSize(normalizePdfText(row[index]), widths[index] - 5) as string[]);
      const rowHeight = Math.max(8, Math.max(...cellLines.map((lines) => lines.length)) * 3.4 + 3.5);
      if (y + rowHeight > FOOTER_Y - 8) {
        addPage();
        drawTableHeader();
      }
      if (rowIndex % 2 === 1) {
        doc.setFillColor(...COLOR.surface);
        doc.rect(MARGIN, y, CONTENT_WIDTH, rowHeight, 'F');
      }
      doc.setDrawColor(...COLOR.border);
      doc.line(MARGIN, y + rowHeight, MARGIN + CONTENT_WIDTH, y + rowHeight);
      let x = MARGIN;
      cellLines.forEach((lines, index) => {
        const align = table.columns[index].align ?? 'left';
        const textX = align === 'right' ? x + widths[index] - 2.5 : align === 'center' ? x + (widths[index] / 2) : x + 2.5;
        setText(7.2, index === 0 ? 'bold' : 'normal', index === 0 ? COLOR.ink : COLOR.muted);
        doc.text(lines, textX, y + 4.8, { align });
        x += widths[index];
      });
      y += rowHeight;
    });
    y += 4;
  };

  drawCoverPage();
  addPage();
  if (report.summary?.length) drawSummary(report.summary);
  report.charts?.forEach(drawChart);
  report.tables?.forEach(drawTable);
  if (report.notes?.length) {
    sectionTitle('Key Insights and Report Notes');
    report.notes.forEach((note) => {
      ensureSpace(8);
      writeWrapped(`- ${note}`, MARGIN + 3, CONTENT_WIDTH - 3, 8, 4, 'normal', COLOR.muted);
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    if (page === 1) {
      setText(7, 'normal', COLOR.white);
      doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 7, { align: 'right' });
      continue;
    }
    doc.setDrawColor(...COLOR.border);
    doc.line(MARGIN, FOOTER_Y - 4, PAGE_WIDTH - MARGIN, FOOTER_Y - 4);
    setText(7, 'normal', COLOR.muted);
    doc.text('Hirna TNVS Facilities & Administrative Management System', MARGIN, FOOTER_Y);
    doc.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, FOOTER_Y, { align: 'right' });
  }
  return doc;
}

export function createPdfBlob(report: PdfReportDefinition): Blob {
  const blob = buildPdfDocument(report).output('blob');
  if (blob.type !== 'application/pdf') throw new Error('The report generator did not produce a valid PDF MIME type.');
  return blob;
}

const brandAssetPromises = new Map<string, Promise<string | undefined>>();

function loadBrandAssetDataUrl(path: string, label: string): Promise<string | undefined> {
  const existing = brandAssetPromises.get(path);
  if (existing) return existing;
  const promise = fetch(path, { cache: 'force-cache' })
    .then((response) => {
      if (!response.ok) throw new Error(`${label} request failed with status ${response.status}.`);
      return response.blob();
    })
    .then((blob) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error(`Unable to read ${label}.`));
      reader.readAsDataURL(blob);
    }))
    .catch((error) => {
      console.warn(`Unable to load ${label} for the PDF.`, error);
      return undefined;
    });
  brandAssetPromises.set(path, promise);
  return promise;
}

export async function downloadPdfReport(report: PdfReportDefinition): Promise<string> {
  const fileName = safePdfFileName(report.fileName);
  const [brandLogoDataUrl, brandCoverDataUrl] = await Promise.all([
    report.brandLogoDataUrl ? Promise.resolve(report.brandLogoDataUrl) : loadBrandAssetDataUrl('/hirna-logo.png', 'the Hirna logo'),
    report.brandCoverDataUrl ? Promise.resolve(report.brandCoverDataUrl) : loadBrandAssetDataUrl('/hirna-sidebar-skyline.png', 'the Hirna cover artwork'),
  ]);
  const blob = createPdfBlob({ ...report, brandLogoDataUrl, brandCoverDataUrl });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return fileName;
}
