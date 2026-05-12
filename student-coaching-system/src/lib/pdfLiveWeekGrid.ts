import { jsPDF } from 'jspdf';

/** Haftalık takvim sütunları: her zaman Pazartesi → Pazar (0 = Pzt). */
export const WEEKDAY_SHORT_MON_FIRST = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'] as const;

export function formatDdMmYyyyDots(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export type WeekGridColumn = { iso: string; headLine: string; subLine: string };

export type WeekGridRow = { hourLabel: string; cells: string[] };

/**
 * Gün × saat tablosu (yatay A4). Veli/öğrenci ile paylaşım için uygun.
 */
export function downloadLiveWeekGridPdf(opts: {
  filename: string;
  title: string;
  footerNote?: string;
  extraLines?: string[];
  columns: WeekGridColumn[];
  rows: WeekGridRow[];
}): void {
  const { filename, title, footerNote, extraLines = [], columns, rows } = opts;
  if (columns.length !== 7 || !rows.length) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 8;
  const timeColW = 16;
  const usable = pageW - margin * 2 - timeColW;
  const colW = usable / 7;
  let y = margin + 6;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(title, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  for (const line of extraLines) {
    doc.text(line, margin, y);
    y += 4;
  }
  if (extraLines.length) y += 2;

  const headerY = y;
  doc.setFillColor(240, 244, 250);
  doc.rect(margin, headerY - 4, pageW - margin * 2, 12, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Saat', margin + 1, headerY + 3);
  columns.forEach((c, i) => {
    const x = margin + timeColW + i * colW + 1;
    doc.text(c.headLine, x, headerY + 1.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(c.subLine, x, headerY + 5.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
  });
  y = headerY + 10;
  doc.setFont('helvetica', 'normal');

  const rowH = 11;
  for (const row of rows) {
    if (y + rowH > doc.internal.pageSize.getHeight() - margin - 10) {
      doc.addPage();
      y = margin + 8;
    }
    doc.setDrawColor(220, 225, 235);
    doc.rect(margin, y - 3, timeColW, rowH);
    doc.setFontSize(7.5);
    doc.text(row.hourLabel, margin + 2, y + 3);
    row.cells.forEach((cell, ci) => {
      const x = margin + timeColW + ci * colW;
      doc.rect(x, y - 3, colW, rowH);
      doc.setFontSize(6);
      const lines = doc.splitTextToSize(cell || '—', colW - 2);
      let cy = y + 1;
      for (const ln of lines.slice(0, 4)) {
        doc.text(ln, x + 1, cy);
        cy += 3.2;
      }
      if (lines.length > 4) {
        doc.setFontSize(5.5);
        doc.text('…', x + 1, cy);
        doc.setFontSize(6);
      }
    });
    y += rowH;
  }

  if (footerNote) {
    y += 4;
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 90);
    doc.text(footerNote, margin, Math.min(y, doc.internal.pageSize.getHeight() - margin));
    doc.setTextColor(0, 0, 0);
  }

  doc.save(filename);
}
