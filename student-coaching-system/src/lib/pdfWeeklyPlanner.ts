import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale/tr';
import { jsPDF } from 'jspdf';
import type { CoachWeeklyGoalRow, WeeklyPlannerEntryRow } from './weeklyPlannerApi';
import {
  addCanvasPaginatedToLandscapePdf,
  buildHeaderElement,
  ensureNotoSansForPdfCapture,
  formatDdMmYyyyDots,
  rasterizeHtmlElementForPdf,
  type WeekGridColumn,
  type WeekGridRow,
} from './pdfLiveWeekGrid';

const DAY_LABELS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 8);

function padHour(h: number) {
  return `${String(h).padStart(2, '0')}:00`;
}

function hourFromTime(t: string) {
  const h = parseInt(String(t || '').split(':')[0], 10);
  return Number.isNaN(h) ? null : h;
}

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

type GridCellEntry = WeeklyPlannerEntryRow;

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

  const rows = HOURS.map((hour) => {
    const cells = dayDates.map((date) =>
      entries.filter(
        (e) =>
          String(e.planner_date || '').slice(0, 10) === date &&
          hourFromTime(String(e.start_time || '')) === hour
      )
    );
    return { hourLabel: padHour(hour), cells };
  });

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
  rows: { hourLabel: string; cells: GridCellEntry[][] }[]
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '16px';

  const titleRow = document.createElement('div');
  titleRow.style.display = 'flex';
  titleRow.style.alignItems = 'center';
  titleRow.style.gap = '10px';
  titleRow.style.marginBottom = '12px';

  const emoji = document.createElement('span');
  emoji.textContent = '📅';
  emoji.style.fontSize = '22px';
  titleRow.appendChild(emoji);

  const title = document.createElement('div');
  title.textContent = 'Haftalık çalışma takvimi';
  title.style.fontSize = '17px';
  title.style.fontWeight = '600';
  title.style.color = '#312e81';
  titleRow.appendChild(title);
  wrap.appendChild(titleRow);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'separate';
  table.style.borderSpacing = '0';
  table.style.fontSize = '12px';
  table.style.borderRadius = '12px';
  table.style.overflow = 'hidden';
  table.style.boxShadow = '0 8px 32px rgba(49, 46, 129, 0.1)';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');

  const thTime = document.createElement('th');
  thTime.textContent = 'Saat';
  thTime.style.padding = '12px 8px';
  thTime.style.fontWeight = '700';
  thTime.style.fontSize = '11px';
  thTime.style.color = '#eef2ff';
  thTime.style.background = 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)';
  thTime.style.borderBottom = '2px solid #312e81';
  thTime.style.width = '72px';
  hr.appendChild(thTime);

  columns.forEach((c) => {
    const th = document.createElement('th');
    th.style.padding = '10px 6px';
    th.style.fontWeight = '700';
    th.style.background = 'linear-gradient(180deg, #6366f1 0%, #4338ca 100%)';
    th.style.borderBottom = '2px solid #312e81';
    th.style.color = '#eef2ff';
    th.style.textAlign = 'center';

    const day = document.createElement('div');
    day.textContent = c.headLine;
    day.style.fontSize = '13px';
    th.appendChild(day);

    const sub = document.createElement('div');
    sub.textContent = c.subLine;
    sub.style.fontSize = '10px';
    sub.style.fontWeight = '400';
    sub.style.opacity = '0.9';
    sub.style.marginTop = '2px';
    th.appendChild(sub);

    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  rows.forEach((row, ri) => {
    const tr = document.createElement('tr');
    tr.style.background = ri % 2 === 0 ? '#faf5ff' : '#ffffff';

    const tdTime = document.createElement('td');
    tdTime.textContent = row.hourLabel;
    tdTime.style.padding = '8px 6px';
    tdTime.style.fontWeight = '700';
    tdTime.style.fontSize = '11px';
    tdTime.style.color = '#4338ca';
    tdTime.style.background = '#ede9fe';
    tdTime.style.borderBottom = '1px solid #e9d5ff';
    tdTime.style.verticalAlign = 'top';
    tdTime.style.whiteSpace = 'nowrap';
    tr.appendChild(tdTime);

    row.cells.forEach((cellEntries) => {
      const td = document.createElement('td');
      td.style.padding = '6px 4px';
      td.style.verticalAlign = 'top';
      td.style.borderBottom = '1px solid #e9d5ff';
      td.style.borderLeft = '1px solid #f3e8ff';
      td.style.minHeight = '44px';

      if (!cellEntries.length) {
        const empty = document.createElement('div');
        empty.textContent = '—';
        empty.style.color = '#cbd5e1';
        empty.style.textAlign = 'center';
        empty.style.padding = '8px 0';
        td.appendChild(empty);
      } else {
        cellEntries.forEach((e, ei) => {
          const style = subjectPdfStyle(e.subject, e.quantity_unit);
          const card = document.createElement('div');
          card.style.background = style.bg;
          card.style.border = `1.5px solid ${style.border}`;
          card.style.borderRadius = '8px';
          card.style.padding = '6px 8px';
          card.style.marginBottom = ei < cellEntries.length - 1 ? '4px' : '0';
          card.style.fontSize = '11px';
          card.style.lineHeight = '1.35';
          card.style.color = style.text;

          const subj = document.createElement('div');
          subj.textContent = e.subject;
          subj.style.fontWeight = '700';
          subj.style.fontSize = '10px';
          card.appendChild(subj);

          const t = document.createElement('div');
          t.textContent = e.title;
          t.style.fontWeight = '600';
          t.style.marginTop = '2px';
          card.appendChild(t);

          const q = document.createElement('div');
          q.textContent = String(e.planned_quantity);
          q.style.fontSize = '10px';
          q.style.marginTop = '3px';
          q.style.opacity = '0.85';
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

function buildFooterNote(studentName: string): HTMLElement {
  const foot = document.createElement('div');
  foot.style.marginTop = '24px';
  foot.style.padding = '16px 20px';
  foot.style.borderRadius = '12px';
  foot.style.background = 'linear-gradient(90deg, #ede9fe 0%, #fce7f3 50%, #fef3c7 100%)';
  foot.style.border = '1px solid #c4b5fd';
  foot.style.display = 'flex';
  foot.style.alignItems = 'center';
  foot.style.gap = '14px';

  const icon = document.createElement('span');
  icon.textContent = '✨';
  icon.style.fontSize = '28px';
  foot.appendChild(icon);

  const text = document.createElement('div');
  text.innerHTML = `<strong style="color:#4338ca">${escapeHtml(studentName)}</strong>, küçük adımlar büyük başarıları getirir! Bu hafta planına sadık kal — sen yaparsın! 💪`;
  text.style.fontSize = '13px';
  text.style.lineHeight = '1.5';
  text.style.color = '#4c1d95';
  foot.appendChild(text);

  return foot;
}

async function buildWeeklyPlannerDocument(opts: {
  studentName: string;
  weekStart: string;
  weekEnd: string;
  goals: CoachWeeklyGoalRow[];
  columns: WeekGridColumn[];
  rows: { hourLabel: string; cells: GridCellEntry[][] }[];
  institutionName?: string;
  logoUrl?: string | null;
}): Promise<HTMLElement> {
  const { studentName, weekStart, weekEnd, goals, columns, rows, institutionName, logoUrl } = opts;

  const root = document.createElement('div');
  root.className = 'pdf-capture-root';
  root.setAttribute('data-pdf-font-root', '1');
  root.style.boxSizing = 'border-box';
  root.style.width = '1280px';
  root.style.padding = '20px 24px 32px';
  root.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';
  root.style.background = 'linear-gradient(180deg, #f5f3ff 0%, #ffffff 8%, #fafafa 100%)';

  const titleLine = `${studentName} — Haftalık Çalışma Planı`;
  const subtitleLines = [
    `${formatDdMmYyyyDots(weekStart)} – ${formatDdMmYyyyDots(weekEnd)}`,
    `${goals.length} hedef · ${rows.reduce((n, r) => n + r.cells.reduce((m, c) => m + c.length, 0), 0)} plan bloğu`,
  ];

  const header = await buildHeaderElement(titleLine, subtitleLines, {
    institutionName: institutionName || '',
    logoUrl,
  });
  header.style.marginBottom = '4px';
  root.appendChild(header);

  if (goals.length) {
    root.appendChild(buildGoalsSection(goals));
  }

  root.appendChild(buildGridTable(columns, rows));
  root.appendChild(buildFooterNote(studentName));

  return root;
}

/** Noto Sans + html2canvas — Türkçe karakterler, kurum logosu, öğrenci dostu tasarım */
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
}): Promise<void> {
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
  } = opts;

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

  const docEl = await buildWeeklyPlannerDocument({
    studentName,
    weekStart,
    weekEnd,
    goals,
    columns,
    rows,
    institutionName,
    logoUrl,
  });

  const canvas = await rasterizeHtmlElementForPdf(docEl, 2);

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 8;
  const contentW = pageW - margin * 2;

  addCanvasPaginatedToLandscapePdf(doc, canvas, margin, contentW);
  doc.save(filename);
}
