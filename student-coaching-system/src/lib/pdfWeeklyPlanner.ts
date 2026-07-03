import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { jsPDF } from 'jspdf';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import {
  addCanvasFillLandscapePage,
  buildHeaderElement,
  ensureNotoSansForPdfCapture,
  formatDdMmYyyyDots,
  rasterizeHtmlElementForPdf,
  type WeekGridColumn,
} from './pdfLiveWeekGrid';
import { buildPlannerTimeSlots, entryMatchesPlannerSlot, timeToMinutes } from './weeklyPlannerTimeSlots';
import {
  buildWeeklyMotivationMessages,
  evaluatePreviousWeekPlanner,
} from './weeklyPlannerPdfMotivation';

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
/** PDF tek sayfaya sığsın diye dışa aktarımda 1 saatlik dilim */
const PDF_GRID_STEP_MINUTES = 60;
/** A4 yatay (297×210 mm) — tek sayfaya sığdırma için hedef piksel boyutu */
const PDF_LANDSCAPE_WIDTH_PX = 1100;
const PDF_LANDSCAPE_HEIGHT_PX = Math.round(PDF_LANDSCAPE_WIDTH_PX / (297 / 210));
const PDF_PAGE_MARGIN_MM = 1;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function subjectPdfStyle(subject: string, quantityUnit?: string): { bg: string; border: string; text: string } {
  const u = String(quantityUnit || '').toLowerCase();
  const s = `${subject} ${u}`.toLowerCase();
  if (u === 'sayfa' || /kitap|okuma/.test(s)) {
    return { bg: '#fef3c7', border: '#f59e0b', text: '#451a03' };
  }
  if (u === 'dakika' || /dakika|süre|sure/.test(s)) {
    return { bg: '#cffafe', border: '#0891b2', text: '#083344' };
  }
  if (/paragraf\s*çözme/i.test(s)) {
    return { bg: '#fae8ff', border: '#c026d3', text: '#701a75' };
  }
  if (/problem\s*çözme/i.test(s)) {
    return { bg: '#ffe4e6', border: '#e11d48', text: '#881337' };
  }
  if (/matematik|mat\./.test(s)) {
    return { bg: '#e0f2fe', border: '#0284c7', text: '#0c4a6e' };
  }
  if (/fizik/.test(s)) {
    return { bg: '#ede9fe', border: '#7c3aed', text: '#4c1d95' };
  }
  if (/kimya/.test(s)) {
    return { bg: '#d1fae5', border: '#059669', text: '#064e3b' };
  }
  if (/biyoloji|bio/.test(s)) {
    return { bg: '#ffedd5', border: '#ea580c', text: '#7c2d12' };
  }
  return { bg: '#f1f5f9', border: '#64748b', text: '#0f172a' };
}

export function buildParentWeeklyGoalsMessage(opts: {
  studentName: string;
  weekStart: string;
  weekEnd: string;
  goals: CoachWeeklyGoalRow[];
  entries: WeeklyPlannerEntryRow[];
}): string {
  const { studentName, weekStart, weekEnd, goals, entries } = opts;
  const coachGoals = goals.filter((g) => g.coach_id);
  const weekGoals = coachGoals.length > 0 ? coachGoals : goals;
  const rangeLabel = `${formatDdMmYyyyDots(weekStart)} – ${formatDdMmYyyyDots(weekEnd)}`;

  const goalLines = weekGoals.map(
    (g) => `• ${g.subject} — ${g.title}: ${g.target_quantity} ${g.quantity_unit}`
  );

  const planned = entries
    .filter((e) => {
      const d = String(e.planner_date || '').slice(0, 10);
      return d >= weekStart && d <= weekEnd;
    })
    .sort((a, b) => {
      const da = `${a.planner_date} ${a.start_time || ''}`;
      const db = `${b.planner_date} ${b.start_time || ''}`;
      return da.localeCompare(db);
    });

  const planLines = planned.slice(0, 15).map((e) => {
    const day = (() => {
      try {
        return format(parseISO(String(e.planner_date).slice(0, 10)), 'EEE d MMM', { locale: tr });
      } catch {
        return String(e.planner_date).slice(0, 10);
      }
    })();
    const time = String(e.start_time || '').slice(0, 5);
    return `• ${day}${time ? ` ${time}` : ''} — ${e.subject}: ${e.title} (${e.planned_quantity})`;
  });

  return (
    `Merhaba,\n\n${studentName} için ${rangeLabel} haftalık çalışma hedeflerini paylaşıyorum.\n\n` +
    (goalLines.length ? `📌 Koç hedefleri:\n${goalLines.join('\n')}\n\n` : '') +
    (planLines.length
      ? `📅 Takvimde planlanan görevler:\n${planLines.join('\n')}${planned.length > 15 ? `\n… ve ${planned.length - 15} görev daha` : ''}\n\n`
      : planLines.length === 0 && goalLines.length
        ? 'Takvim planı henüz oluşturulmadı; hedefler öğrenci tarafından haftalık plana yerleştirilecek.\n\n'
        : '') +
    `Smart VIP Koçluk`
  );
}

export function buildParentWeeklyPlanPdfCaption(opts: {
  studentName: string;
  weekStart: string;
  weekEnd: string;
}): string {
  const { studentName, weekStart, weekEnd } = opts;
  const rangeLabel = `${formatDdMmYyyyDots(weekStart)} – ${formatDdMmYyyyDots(weekEnd)}`;
  return (
    `Merhaba,\n\n${studentName} için ${rangeLabel} haftalık çalışma planı ektedir.\n` +
    `• 1. sayfa: haftalık hedefler\n` +
    `• 2. sayfa: çalışma takvimi\n\n` +
    `Smart VIP Koçluk`
  );
}

type GridCellEntry = WeeklyPlannerEntryRow;

function pdfPlannerHoursRange(entries: WeeklyPlannerEntryRow[]): { startHour: number; endHour: number } {
  let minM = Infinity;
  let maxM = -Infinity;
  let has = false;
  for (const e of entries) {
    const m = timeToMinutes(String(e.start_time || ''));
    if (m == null) continue;
    has = true;
    minM = Math.min(minM, m);
    const endM = timeToMinutes(String(e.end_time || '')) ?? m + 60;
    maxM = Math.max(maxM, endM);
  }
  if (!has) return { startHour: 8, endHour: 18 };
  const startHour = Math.max(7, Math.floor((minM - 30) / 60));
  const endHour = Math.min(22, Math.ceil((maxM + 30) / 60));
  return { startHour, endHour: Math.max(endHour, startHour + 3) };
}

/** PDF’de yalnızca planlı saatler (+1 saat tampon) — satır yüksekliği ve okunaklı yazı için */
function trimPdfGridRows(
  rows: { hourLabel: string; cells: GridCellEntry[][] }[]
): { hourLabel: string; cells: GridCellEntry[][] }[] {
  let first = -1;
  let last = -1;
  rows.forEach((row, i) => {
    if (row.cells.some((c) => c.length > 0)) {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0) return rows;
  const from = Math.max(0, first - 1);
  const to = Math.min(rows.length, last + 2);
  return rows.slice(from, to);
}

function pdfCellFontSizes(rowHeightPx: number, entryCount: number): { main: number; sub: number; qty: number } {
  const solo = entryCount <= 1;
  const main = Math.max(12, Math.min(15, Math.floor(rowHeightPx * (solo ? 0.36 : 0.3))));
  return { main, sub: Math.max(11, main - 1), qty: Math.max(10, main - 1) };
}

function truncatePdfText(text: string, maxLen: number): string {
  const t = String(text || '').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function buildGridFromEntries(dayDates: string[], entries: WeeklyPlannerEntryRow[]): {
  columns: WeekGridColumn[];
  rows: { hourLabel: string; cells: GridCellEntry[][] }[];
} {
  const columns: WeekGridColumn[] = dayDates.map((iso, i) => {
    let subLine = iso;
    try {
      subLine = format(parseISO(iso), 'd MMM', { locale: tr });
    } catch {
      /* keep iso */
    }
    return { iso, headLine: DAY_LABELS[i] ?? iso, subLine };
  });

  const { startHour, endHour } = pdfPlannerHoursRange(entries);
  const timeSlots = buildPlannerTimeSlots({
    stepMinutes: PDF_GRID_STEP_MINUTES,
    startHour,
    endHour,
  });
  const rows = trimPdfGridRows(
    timeSlots.map((slot) => {
      const cells = dayDates.map((date) =>
        entries.filter(
          (e) =>
            String(e.planner_date || '').slice(0, 10) === date &&
            entryMatchesPlannerSlot(String(e.start_time || ''), slot)
        )
      );
      return { hourLabel: slot.label, cells };
    })
  );

  return { columns, rows };
}

function buildGoalsSection(goals: CoachWeeklyGoalRow[]): HTMLElement {
  const section = document.createElement('div');
  section.style.marginTop = '20px';
  section.style.marginBottom = '8px';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '10px';
  titleRow.style.marginBottom = '12px';

  const emoji = document.createElement('span');
  emoji.textContent = '🎯';
  emoji.style.fontSize = '22px';
  titleRow.appendChild(emoji);

  const title = document.createElement('div');
  title.textContent = 'Bu haftanın hedefleri';
  title.style.fontSize = '17px';
  title.style.fontWeight = '600';
  title.style.color = '#312e81';
  titleRow.appendChild(title);
  section.appendChild(titleRow);

  const grid = document.createElement('div');
  grid.style.display = 'flex';
  grid.style.flexWrap = 'wrap';
  grid.style.gap = '10px';

  for (const g of goals) {
    const style = subjectPdfStyle(g.subject, g.quantity_unit);
    const chip = document.createElement('div');
    chip.style.background = style.bg;
    chip.style.border = `2px solid ${style.border}`;
    chip.style.borderRadius = '12px';
    chip.style.padding = '10px 14px';
    chip.style.minWidth = '180px';
    chip.style.maxWidth = '280px';
    chip.style.boxShadow = '0 4px 14px rgba(49, 46, 129, 0.08)';

    const subj = document.createElement('div');
    subj.textContent = g.subject;
    subj.style.fontSize = '11px';
    subj.style.fontWeight = '700';
    subj.style.textTransform = 'uppercase';
    subj.style.letterSpacing = '0.05em';
    subj.style.color = style.text;
    subj.style.opacity = '0.85';
    chip.appendChild(subj);

    const name = document.createElement('div');
    name.textContent = g.title;
    name.style.fontSize = '14px';
    name.style.fontWeight = '600';
    name.style.color = style.text;
    name.style.marginTop = '4px';
    chip.appendChild(name);

    const qty = document.createElement('div');
    qty.textContent = `${g.target_quantity} ${g.quantity_unit}`;
    qty.style.fontSize = '13px';
    qty.style.fontWeight = '600';
    qty.style.color = style.border;
    qty.style.marginTop = '6px';
    chip.appendChild(qty);

    grid.appendChild(chip);
  }

  section.appendChild(grid);
  return section;
}

function buildGridTable(
  columns: WeekGridColumn[],
  rows: { hourLabel: string; cells: GridCellEntry[][] }[],
  rowHeightPx: number,
  theadHeightPx: number
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.flex = '1';
  wrap.style.minHeight = '0';
  wrap.style.height = `${theadHeightPx + rowHeightPx * rows.length}px`;
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';

  const cellFont = Math.max(12, Math.min(14, Math.round(rowHeightPx * 0.34)));
  const titleFont = Math.max(11, cellFont - 1);
  const timeFont = Math.max(11, cellFont - 1);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.height = '100%';
  table.style.tableLayout = 'fixed';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = `${cellFont}px`;
  table.style.borderRadius = '8px';
  table.style.overflow = 'hidden';
  table.style.boxShadow = '0 4px 16px rgba(49, 46, 129, 0.08)';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.style.height = `${theadHeightPx}px`;

  const thTime = document.createElement('th');
  thTime.textContent = 'Saat';
  thTime.style.padding = '6px 4px';
  thTime.style.fontWeight = '700';
  thTime.style.fontSize = `${timeFont}px`;
  thTime.style.color = '#eef2ff';
  thTime.style.background = 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)';
  thTime.style.borderBottom = '1px solid #312e81';
  thTime.style.width = '52px';
  hr.appendChild(thTime);

  columns.forEach((c) => {
    const th = document.createElement('th');
    th.style.padding = '5px 3px';
    th.style.fontWeight = '700';
    th.style.background = 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)';
    th.style.borderBottom = '1px solid #312e81';
    th.style.color = '#eef2ff';
    th.style.textAlign = 'center';

    const day = document.createElement('div');
    day.textContent = c.headLine;
    day.style.fontSize = `${titleFont + 1}px`;
    th.appendChild(day);

    const sub = document.createElement('div');
    sub.textContent = c.subLine;
    sub.style.fontSize = `${titleFont - 1}px`;
    sub.style.fontWeight = '400';
    sub.style.opacity = '0.9';
    sub.style.marginTop = '1px';
    th.appendChild(sub);

    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    tr.style.background = ri % 2 === 0 ? '#faf5ff' : '#ffffff';
    tr.style.height = `${rowHeightPx}px`;

    const tdTime = document.createElement('td');
    tdTime.textContent = row.hourLabel;
    tdTime.style.padding = '3px 3px';
    tdTime.style.fontWeight = '700';
    tdTime.style.fontSize = `${timeFont}px`;
    tdTime.style.color = '#4338ca';
    tdTime.style.background = '#ede9fe';
    tdTime.style.borderBottom = '1px solid #e9d5ff';
    tdTime.style.verticalAlign = 'top';
    tdTime.style.whiteSpace = 'nowrap';
    tr.appendChild(tdTime);

    row.cells.forEach((cellEntries) => {
      const td = document.createElement('td');
      td.style.padding = '3px 3px';
      td.style.verticalAlign = 'top';
      td.style.borderBottom = '1px solid #e9d5ff';
      td.style.borderLeft = '1px solid #f3e8ff';
      td.style.height = `${rowHeightPx}px`;
      td.style.overflow = 'hidden';

      if (!cellEntries.length) {
        const empty = document.createElement('div');
        empty.textContent = '—';
        empty.style.color = '#cbd5e1';
        empty.style.textAlign = 'center';
        empty.style.padding = '4px 0';
        empty.style.fontSize = `${titleFont}px`;
        td.appendChild(empty);
      } else {
        const fonts = pdfCellFontSizes(rowHeightPx, cellEntries.length);
        const cardGap = cellEntries.length > 1 ? 3 : 0;
        const cardH =
          cellEntries.length > 1
            ? Math.floor((rowHeightPx - 6 - cardGap * (cellEntries.length - 1)) / cellEntries.length)
            : rowHeightPx - 6;

        cellEntries.forEach((e, ei) => {
          const style = subjectPdfStyle(e.subject, e.quantity_unit);
          const card = document.createElement('div');
          card.style.background = style.bg;
          card.style.border = `1.5px solid ${style.border}`;
          card.style.borderRadius = '5px';
          card.style.padding = '4px 5px';
          card.style.marginBottom = ei < cellEntries.length - 1 ? `${cardGap}px` : '0';
          card.style.boxSizing = 'border-box';
          card.style.height = cellEntries.length === 1 ? `${rowHeightPx - 6}px` : `${Math.max(28, cardH)}px`;
          card.style.display = 'flex';
          card.style.flexDirection = 'column';
          card.style.justifyContent = 'center';
          card.style.color = style.text;
          card.style.overflow = 'hidden';

          const konuRaw = String(e.title || '').trim();
          const dersRaw = String(e.subject || '').trim();
          const konuText = truncatePdfText(konuRaw || dersRaw || '—', cellEntries.length > 1 ? 34 : 50);

          const konu = document.createElement('div');
          konu.textContent = konuText;
          konu.style.fontWeight = '700';
          konu.style.fontSize = `${fonts.main}px`;
          konu.style.lineHeight = '1.2';
          konu.style.letterSpacing = '0.01em';
          konu.style.wordBreak = 'break-word';
          konu.style.overflow = 'hidden';
          konu.style.display = '-webkit-box';
          konu.style.webkitLineClamp = cellEntries.length > 1 ? '2' : '3';
          konu.style.webkitBoxOrient = 'vertical';
          card.appendChild(konu);

          if (dersRaw && dersRaw !== konuRaw) {
            const ders = document.createElement('div');
            ders.textContent = truncatePdfText(dersRaw, 18);
            ders.style.fontWeight = '600';
            ders.style.fontSize = `${fonts.sub}px`;
            ders.style.lineHeight = '1.2';
            ders.style.marginTop = '2px';
            ders.style.opacity = '0.85';
            card.appendChild(ders);
          }

          const qtyUnit = String(e.quantity_unit || '').trim();
          const qtyText = qtyUnit
            ? `${e.planned_quantity} ${qtyUnit}`
            : String(e.planned_quantity);
          const q = document.createElement('div');
          q.textContent = qtyText;
          q.style.fontSize = `${fonts.qty}px`;
          q.style.fontWeight = '600';
          q.style.marginTop = '3px';
          q.style.opacity = '0.9';
          card.appendChild(q);

          td.appendChild(card);
        });
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function buildMotivationSection(studentName: string, messages: string[]): HTMLElement {
  const foot = document.createElement('div');
  foot.style.marginTop = '14px';
  foot.style.padding = '14px 16px';
  foot.style.borderRadius = '12px';
  foot.style.background = 'linear-gradient(90deg, #ede9fe 0%, #fce7f3 50%, #fef3c7 100%)';
  foot.style.border = '1px solid #c4b5fd';
  foot.style.flexShrink = '0';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '8px';
  titleRow.style.marginBottom = '8px';

  const icon = document.createElement('span');
  icon.textContent = '✨';
  icon.style.fontSize = '22px';
  titleRow.appendChild(icon);

  const title = document.createElement('div');
  title.textContent = 'Bu hafta için motivasyon';
  title.style.fontSize = '14px';
  title.style.fontWeight = '700';
  title.style.color = '#4338ca';
  titleRow.appendChild(title);
  foot.appendChild(titleRow);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';

  for (const msg of messages) {
    const line = document.createElement('div');
    line.style.fontSize = '12px';
    line.style.lineHeight = '1.45';
    line.style.color = '#4c1d95';
    line.textContent = `• ${msg}`;
    list.appendChild(line);
  }

  foot.appendChild(list);
  return foot;
}

async function buildWeeklyPlannerGoalsPage(opts: {
  studentName: string;
  weekStart: string;
  weekEnd: string;
  goals: CoachWeeklyGoalRow[];
  motivationMessages: string[];
  institutionName?: string;
  logoUrl?: string | null;
}): Promise<HTMLElement> {
  const { studentName, weekStart, weekEnd, goals, motivationMessages, institutionName, logoUrl } = opts;
  const root = document.createElement('div');
  root.className = 'pdf-capture-root';
  root.setAttribute('data-pdf-font-root', '1');
  root.style.boxSizing = 'border-box';
  root.style.width = `${PDF_LANDSCAPE_WIDTH_PX}px`;
  root.style.height = `${PDF_LANDSCAPE_HEIGHT_PX}px`;
  root.style.padding = '10px 14px 12px';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
  root.style.background = 'linear-gradient(180deg, #f5f3ff 0%, #ffffff 8%, #fafafa 100%)';
  root.style.overflow = 'hidden';

  const header = await buildHeaderElement(`${studentName} — Haftalık Çalışma Planı`, [
    `${formatDdMmYyyyDots(weekStart)} – ${formatDdMmYyyyDots(weekEnd)}`,
    'Sayfa 1: Hedefler',
  ], {
    institutionName: institutionName || '',
    logoUrl,
  });
  header.style.marginBottom = '6px';
  header.style.flexShrink = '0';
  root.appendChild(header);

  if (goals.length) {
    const goalsEl = buildGoalsSection(goals);
    goalsEl.style.flex = '1';
    goalsEl.style.minHeight = '0';
    goalsEl.style.overflow = 'hidden';
    root.appendChild(goalsEl);
  } else {
    const empty = document.createElement('p');
    empty.textContent = 'Bu hafta için tanımlı hedef bulunmuyor.';
    empty.style.color = '#64748b';
    empty.style.fontSize = '14px';
    root.appendChild(empty);
  }

  root.appendChild(buildMotivationSection(studentName, motivationMessages));
  return root;
}

function computePdfGridLayout(rowCount: number): { rowHeightPx: number; theadHeightPx: number } {
  const paddingY = 10 + 12;
  const headerH = 72 + 4;
  const theadHeightPx = 36;
  const bodyBudget = PDF_LANDSCAPE_HEIGHT_PX - paddingY - headerH - theadHeightPx;
  const rowHeightPx = rowCount > 0 ? Math.max(44, Math.floor(bodyBudget / rowCount)) : 48;
  return { rowHeightPx, theadHeightPx };
}

async function buildWeeklyPlannerGridPage(opts: {
  studentName: string;
  weekStart: string;
  weekEnd: string;
  columns: WeekGridColumn[];
  rows: { hourLabel: string; cells: GridCellEntry[][] }[];
  institutionName?: string;
  logoUrl?: string | null;
}): Promise<HTMLElement> {
  const { studentName, weekStart, weekEnd, columns, rows, institutionName, logoUrl } = opts;
  const { rowHeightPx, theadHeightPx } = computePdfGridLayout(rows.length);
  const root = document.createElement('div');
  root.className = 'pdf-capture-root';
  root.setAttribute('data-pdf-font-root', '1');
  root.style.boxSizing = 'border-box';
  root.style.width = `${PDF_LANDSCAPE_WIDTH_PX}px`;
  root.style.height = `${PDF_LANDSCAPE_HEIGHT_PX}px`;
  root.style.padding = '10px 14px 12px';
  root.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
  root.style.background = '#ffffff';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.overflow = 'hidden';

  const header = await buildHeaderElement(`${studentName} — Çalışma Takvimi`, [
    `${formatDdMmYyyyDots(weekStart)} – ${formatDdMmYyyyDots(weekEnd)}`,
    'Sayfa 2: Haftalık takvim',
  ], {
    institutionName: institutionName || '',
    logoUrl,
  });
  header.style.marginBottom = '4px';
  header.style.flexShrink = '0';
  root.appendChild(header);
  root.appendChild(buildGridTable(columns, rows, rowHeightPx, theadHeightPx));
  return root;
}

/** Noto Sans + html2canvas — Türkçe karakterler, kurum logosu, öğrenci dostu tasarım */
export async function buildWeeklyPlannerPdfBlob(opts: {
  calendarElement?: HTMLElement | null;
  studentName: string;
  weekStart: string;
  weekEnd: string;
  dayDates: string[];
  goals: CoachWeeklyGoalRow[];
  entries: WeeklyPlannerEntryRow[];
  institutionName?: string;
  logoUrl?: string | null;
  preferGridFallback?: boolean;
  /** WhatsApp gönderimi için daha küçük dosya (JPEG + düşük çözünürlük) */
  compactForShare?: boolean;
  /** Önceki hafta plan verisi — motive edici metin için */
  prevWeekStart?: string;
  prevWeekEnd?: string;
  prevWeekEntries?: WeeklyPlannerEntryRow[];
}): Promise<{ blob: Blob; filename: string }> {
  void opts.calendarElement;
  void opts.preferGridFallback;

  const {
    studentName,
    weekStart,
    weekEnd,
    dayDates,
    goals,
    entries,
    institutionName,
    logoUrl,
    compactForShare = false,
    prevWeekStart,
    prevWeekEnd,
    prevWeekEntries = [],
  } = opts;

  const prevReview =
    prevWeekStart && prevWeekEnd
      ? evaluatePreviousWeekPlanner(prevWeekEntries, prevWeekStart, prevWeekEnd)
      : null;
  const motivationMessages = buildWeeklyMotivationMessages({
    studentName,
    review: prevReview,
  });

  /** İndirme: yüksek çözünürlük. Veli/WhatsApp: compactForShare ile küçük JPEG. */
  const rasterScale = compactForShare ? 1.25 : 2.5;
  const imageFormat = compactForShare ? 'JPEG' : 'PNG';
  const jpegQuality = compactForShare ? 0.72 : 0.92;

  await ensureNotoSansForPdfCapture();

  const safeName = studentName.replace(/\s+/g, '_').replace(/[^\w\-]/g, '') || 'ogrenci';
  const filename = `Haftalik_Plan_${safeName}_${weekStart}.pdf`;

  const weekEntries = entries.filter((e) => {
    const d = String(e.planner_date || '').slice(0, 10);
    return d >= weekStart && d <= weekEnd;
  });

  const { columns, rows } = buildGridFromEntries(dayDates, weekEntries);
  if (columns.length !== 7 || !rows.length) {
    throw new Error('Bu hafta için PDF oluşturulacak plan verisi yok.');
  }

  const docEl = await buildWeeklyPlannerGoalsPage({
    studentName,
    weekStart,
    weekEnd,
    goals,
    motivationMessages,
    institutionName,
    logoUrl,
  });
  const gridEl = await buildWeeklyPlannerGridPage({
    studentName,
    weekStart,
    weekEnd,
    columns,
    rows,
    institutionName,
    logoUrl,
  });

  const [goalsCanvas, gridCanvas] = await Promise.all([
    rasterizeHtmlElementForPdf(docEl, rasterScale),
    rasterizeHtmlElementForPdf(gridEl, rasterScale),
  ]);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const margin = PDF_PAGE_MARGIN_MM;
  addCanvasFillLandscapePage(doc, goalsCanvas, margin, false, imageFormat, jpegQuality);
  addCanvasFillLandscapePage(doc, gridCanvas, margin, true, imageFormat, jpegQuality);
  const blob = doc.output('blob');
  return { blob, filename };
}

export async function downloadWeeklyPlannerPdf(opts: {
  calendarElement?: HTMLElement | null;
  studentName: string;
  weekStart: string;
  weekEnd: string;
  dayDates: string[];
  goals: CoachWeeklyGoalRow[];
  entries: WeeklyPlannerEntryRow[];
  institutionName?: string;
  logoUrl?: string | null;
  preferGridFallback?: boolean;
  prevWeekStart?: string;
  prevWeekEnd?: string;
  prevWeekEntries?: WeeklyPlannerEntryRow[];
}): Promise<void> {
  const { blob, filename } = await buildWeeklyPlannerPdfBlob(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
