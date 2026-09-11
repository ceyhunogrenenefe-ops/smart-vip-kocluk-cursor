/**
 * Canlı özel ders — öğrenci haftalık programı PNG (veli paylaşımı).
 * Ekran UI’sız temiz tablo + kurum logosu + başlık; html2canvas scale:2, beyaz zemin.
 */
import {
  WEEKDAY_SHORT_MON_FIRST,
  buildHeaderElement,
  buildShareableWeekCalendarElement,
  ensureNotoSansForPdfCapture,
  formatDdMmYyyyDots,
  rasterizeHtmlElementForPdf,
  type PdfBranding,
  type ShareableWeekCard,
  type WeekGridColumn
} from './pdfLiveWeekGrid';

export type PrivateLessonWeekPngLesson = {
  date: string;
  start_time: string;
  end_time?: string | null;
  duration_minutes?: number | null;
  title: string;
  teacher_id?: string | null;
  teacher_name?: string | null;
  status?: string | null;
};

export type PrivateLessonWeekPngOpts = {
  studentName: string;
  weekStartIso: string;
  lessons: PrivateLessonWeekPngLesson[];
  teacherNameById?: Map<string, string> | Record<string, string>;
  branding?: PdfBranding;
  filename?: string;
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function fmtHm(t: string): string {
  const raw = String(t || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw.slice(0, 5) || '09:00';
  return `${pad2(Number(m[1]))}:${m[2]}`;
}

function lessonTimeRange(lesson: PrivateLessonWeekPngLesson): string {
  const st = fmtHm(lesson.start_time || '09:00');
  if (lesson.end_time) return `${st}–${fmtHm(lesson.end_time)}`;
  const dm = Number(lesson.duration_minutes ?? 60);
  const [h, m] = st.split(':').map((x) => Number(x || 0));
  const startM = (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0);
  const endM = startM + (Number.isFinite(dm) && dm > 0 ? dm : 60);
  return `${st}–${pad2(Math.floor(endM / 60) % 24)}:${pad2(endM % 60)}`;
}

function startHour(lesson: PrivateLessonWeekPngLesson): number {
  return Number(fmtHm(lesson.start_time || '09:00').slice(0, 2)) || 0;
}

export function slugifyForPngFilename(name: string): string {
  const base = String(name || 'Ogrenci')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ğ/gi, 'g')
    .replace(/ü/gi, 'u')
    .replace(/ş/gi, 's')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'I')
    .replace(/ö/gi, 'o')
    .replace(/ç/gi, 'c')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return (base || 'Ogrenci').slice(0, 64);
}

function triggerPngDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('PNG oluşturulamadı'));
        else resolve(blob);
      },
      'image/png',
      0.95
    );
  });
}

function resolveTeacherMap(
  teacherNameById?: Map<string, string> | Record<string, string>
): Map<string, string> {
  if (teacherNameById instanceof Map) return teacherNameById;
  return new Map(Object.entries(teacherNameById || {}));
}

function buildWeekExportModel(opts: {
  weekStartIso: string;
  lessons: PrivateLessonWeekPngLesson[];
  teacherNameById?: Map<string, string> | Record<string, string>;
}): {
  columns: WeekGridColumn[];
  hours: number[];
  cells: ShareableWeekCard[][][];
  weekEndIso: string;
} {
  const weekStart = new Date(`${opts.weekStartIso}T12:00:00`);
  if (Number.isNaN(weekStart.getTime())) {
    throw new Error('Geçersiz hafta başlangıcı');
  }

  const teacherMap = resolveTeacherMap(opts.teacherNameById);

  const columns: WeekGridColumn[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return {
      iso,
      headLine: WEEKDAY_SHORT_MON_FIRST[i] || `G${i + 1}`,
      subLine: formatDdMmYyyyDots(iso)
    };
  });
  const weekEndIso = columns[6]?.iso || opts.weekStartIso;
  const isoIndex = new Map(columns.map((c, i) => [c.iso, i]));

  const active = (opts.lessons || []).filter((l) => {
    if (String(l.status || '').toLowerCase() === 'cancelled') return false;
    return isoIndex.has(String(l.date || '').slice(0, 10));
  });

  const hourSet = new Set<number>();
  for (const l of active) hourSet.add(startHour(l));
  let hours = Array.from(hourSet).sort((a, b) => a - b);
  if (!hours.length) {
    hours = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  } else {
    const minH = Math.min(...hours);
    const maxH = Math.max(...hours);
    hours = [];
    for (let h = minH; h <= maxH; h++) hours.push(h);
  }

  const cells: ShareableWeekCard[][][] = hours.map(() =>
    Array.from({ length: 7 }, () => [] as ShareableWeekCard[])
  );

  for (const l of active) {
    const di = isoIndex.get(String(l.date || '').slice(0, 10));
    if (di == null) continue;
    const hi = hours.indexOf(startHour(l));
    if (hi < 0) continue;
    const tid = String(l.teacher_id || '').trim();
    const teacher =
      String(l.teacher_name || '').trim() ||
      (tid ? teacherMap.get(tid) || '' : '') ||
      undefined;
    cells[hi][di].push({
      timeRange: lessonTimeRange(l),
      subject: String(l.title || 'Ders').trim() || 'Ders',
      teacher,
      kind: 'session'
    });
  }

  for (const row of cells) {
    for (const dayCards of row) {
      dayCards.sort((a, b) => a.timeRange.localeCompare(b.timeRange));
    }
  }

  return { columns, hours, cells, weekEndIso };
}

async function renderPrivateLessonWeekScheduleCanvas(
  opts: PrivateLessonWeekPngOpts
): Promise<{ canvas: HTMLCanvasElement; weekEndIso: string }> {
  await ensureNotoSansForPdfCapture();

  const studentName = String(opts.studentName || '').trim() || 'Öğrenci';
  const { columns, hours, cells, weekEndIso } = buildWeekExportModel({
    weekStartIso: opts.weekStartIso,
    lessons: opts.lessons,
    teacherNameById: opts.teacherNameById
  });

  const createdLabel = new Date().toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const weekLabel = `${formatDdMmYyyyDots(opts.weekStartIso)} – ${formatDdMmYyyyDots(weekEndIso)}`;

  const sheet = document.createElement('div');
  sheet.setAttribute('data-pdf-font-root', '1');
  sheet.style.boxSizing = 'border-box';
  sheet.style.width = '1320px';
  sheet.style.padding = '28px';
  sheet.style.background = '#ffffff';
  sheet.style.fontFamily = '"Noto Sans", "Segoe UI", system-ui, sans-serif';

  const header = await buildHeaderElement(
    `${studentName} - Haftalık Ders Programı`,
    [`Hafta: ${weekLabel}`, `Oluşturulma: ${createdLabel}`],
    opts.branding
  );
  header.style.width = '100%';
  header.style.marginBottom = '18px';
  sheet.appendChild(header);

  const calendar = buildShareableWeekCalendarElement({
    columns,
    hours,
    cells,
    title: 'Haftalık canlı özel ders programı'
  });
  calendar.style.width = '100%';
  calendar.style.border = '1px solid #e2e8f0';
  sheet.appendChild(calendar);

  const note = document.createElement('div');
  note.textContent =
    'Bu görsel veli paylaşımı içindir. Canlı derse katılım için uygulamadaki bağlantıları kullanın.';
  note.style.marginTop = '14px';
  note.style.fontSize = '11px';
  note.style.color = '#64748b';
  note.style.lineHeight = '1.45';
  sheet.appendChild(note);

  const canvas = await rasterizeHtmlElementForPdf(sheet, 2);
  if (!canvas.width || !canvas.height) {
    throw new Error('PNG görüntüsü boş üretildi');
  }
  return { canvas, weekEndIso };
}

export function buildPrivateLessonWeekPngFilename(opts: {
  studentName: string;
  weekStartIso: string;
  weekEndIso?: string;
}): string {
  const slug = slugifyForPngFilename(opts.studentName);
  const from = formatDdMmYyyyDots(opts.weekStartIso).replace(/\./g, '-');
  const to = opts.weekEndIso
    ? formatDdMmYyyyDots(opts.weekEndIso).replace(/\./g, '-')
    : from;
  return `${slug}_Hafta_${from}_${to}_Ders_Programi.png`;
}

/** Öğrenci haftalık özel ders programını yüksek çözünürlüklü PNG olarak indirir. */
export async function downloadPrivateLessonWeekSchedulePng(
  opts: PrivateLessonWeekPngOpts
): Promise<string> {
  const { canvas, weekEndIso } = await renderPrivateLessonWeekScheduleCanvas(opts);
  const filename =
    String(opts.filename || '').trim() ||
    buildPrivateLessonWeekPngFilename({
      studentName: opts.studentName,
      weekStartIso: opts.weekStartIso,
      weekEndIso
    });
  triggerPngDownload(canvas.toDataURL('image/png'), filename);
  return filename;
}

/** Aynı görseli panoya PNG olarak kopyalar (destekleyen tarayıcılarda). */
export async function copyPrivateLessonWeekSchedulePng(
  opts: PrivateLessonWeekPngOpts
): Promise<void> {
  const { canvas } = await renderPrivateLessonWeekScheduleCanvas(opts);
  const blob = await canvasToPngBlob(canvas);
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
    throw new Error('Bu tarayıcı görsel panoya kopyalamayı desteklemiyor. PNG indirmeyi kullanın.');
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
