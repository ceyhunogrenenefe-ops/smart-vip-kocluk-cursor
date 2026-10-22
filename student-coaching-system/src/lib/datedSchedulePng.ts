/**
 * Tarihli ders programı PNG'si — Ders Program Planlayıcısı PNG'si ile aynı görünüm
 * (logo, başlık, renkli gün başlıkları, ders renkleri, açıklama), sütunlar tarih.
 */
import { subjectTheme } from './classScheduleBrandedPng';
import { rasterizeHtmlElementForPdf } from './pdfLiveWeekGrid';

const BRAND_NAVY = '#1F478F';
const BRAND_RED = '#FC3232';
const BRAND_NAVY_SOFT = '#E9F0FB';
const BORDER = '#B9C4DA';
const DAY_COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0891B2', '#65A30D'];

export type DatedPngDay = { iso: string; title: string; subtitle: string };
export type DatedPngRow = { key: string; time: string };
export type DatedPngLesson = {
  dayIso: string;
  rowKey: string;
  subject: string;
  teacher?: string | null;
  time: string;
  badge?: string | null;
};

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fontlariYukle(): Promise<void> {
  const id = 'smartkocluk-planner-png-fonts';
  if (!document.getElementById(id)) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Fraunces:opsz,wght@9..144,600&display=swap';
    document.head.appendChild(link);
  }
  try {
    await document.fonts?.load('600 30px Fraunces');
    await document.fonts?.load('600 14px Inter');
    await document.fonts?.ready;
  } catch {
    /* sistem fontu */
  }
}

function resimBekle(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((r) => {
    img.onload = () => r();
    img.onerror = () => r();
  });
}

export async function downloadDatedSchedulePng(opts: {
  title: string;
  subtitle: string;
  rangeLabel: string;
  days: DatedPngDay[];
  rows: DatedPngRow[];
  lessons: DatedPngLesson[];
  filename: string;
  logoUrl?: string | null;
}): Promise<void> {
  const { days, rows, lessons } = opts;
  if (!days.length || !rows.length || !lessons.length) throw new Error('PNG için ders yok.');
  await fontlariYukle();

  const hucre = (dayIso: string, rowKey: string) =>
    lessons
      .filter((l) => l.dayIso === dayIso && l.rowKey === rowKey)
      .map((l) => {
        const t = subjectTheme(l.subject);
        return `<div class="lchip" style="background:${t.bg};border-left-color:${t.bd};color:${t.fg}">
          <span class="subj">${esc(l.subject)}</span>
          ${l.badge ? `<span class="badge" style="border-color:${t.bd}">${esc(l.badge)}</span>` : ''}
          <span class="ptime">${esc(l.time)}</span>
          ${l.teacher ? `<span class="tch">${esc(l.teacher)}</span>` : ''}
        </div>`;
      })
      .join('');

  const satirlar = rows
    .map(
      (r) => `<tr>
        <td class="pcol"><div class="pt">${esc(r.time)}</div></td>
        ${days
          .map((d) => {
            const ic = hucre(d.iso, r.key);
            return ic ? `<td class="cellh lcell">${ic}</td>` : `<td class="cellh ecell"></td>`;
          })
          .join('')}
      </tr>`
    )
    .join('');

  const dersler = [...new Set(lessons.map((l) => l.subject.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
  const legend = dersler.length
    ? `<div class="legend">${dersler
        .map((s) => {
          const t = subjectTheme(s);
          return `<span style="background:${t.bg};color:${t.fg};border:2px solid ${t.bd}">${esc(s)}</span>`;
        })
        .join('')}</div>`
    : '';

  const sheetW = Math.max(1112, 120 + days.length * 165);
  const logoSrc = String(opts.logoUrl || '').trim() || `${window.location.origin}/ders-program-planner/logo.png`;
  const stage = document.createElement('div');
  // html2canvas sayfa dışına (left:-100000px) konan düğümü bulamıyor; transform ile gizle
  stage.style.cssText = `position:fixed;left:0;top:0;transform:translate(-12000px,0);background:#fff;width:${sheetW + 68}px;z-index:0;pointer-events:none;`;
  stage.innerHTML = `
    <style>
      .png-sheet{font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1A1D26;background:#fff;width:${sheetW + 68}px;padding:34px;box-sizing:border-box}
      .png-sheet .topbar{height:10px;border-radius:6px;margin-bottom:22px;background:linear-gradient(90deg,#3B82F6 0%,#10B981 20%,#F59E0B 40%,#EF4444 60%,#8B5CF6 80%,#EC4899 100%)}
      .png-sheet .ph{text-align:center;margin-bottom:18px;padding-bottom:14px;border-bottom:3px solid ${BRAND_RED}}
      .png-sheet .ph img{height:88px;width:auto;max-width:320px;margin:0 auto 12px;display:block;object-fit:contain}
      .png-sheet .ph .tt{font-family:"Fraunces",Georgia,serif;font-size:30px;font-weight:600;color:${BRAND_NAVY};line-height:1.2}
      .png-sheet .ph .sb{color:${BRAND_RED};font-weight:700;text-transform:uppercase;letter-spacing:.05em;font-size:15px;margin-top:6px}
      .png-sheet .ph .rg{color:#475569;font-weight:600;font-size:14px;margin-top:4px}
      .png-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;overflow-wrap:anywhere}
      .png-sheet th,.png-sheet td{border:1px solid ${BORDER};padding:9px 11px;font-size:14px;text-align:left;vertical-align:top}
      .png-sheet .pcol{width:120px;background:${BRAND_NAVY_SOFT}}
      .png-sheet thead th.pcol{background:${BRAND_NAVY_SOFT};color:${BRAND_NAVY};font-weight:700}
      .png-sheet .pcol .pt{font-weight:700;color:${BRAND_NAVY};font-size:13px}
      .png-sheet thead th.dayh{text-align:center;color:#fff;border:2px solid #fff;padding:8px 6px}
      .png-sheet thead th.dayh .d1{display:block;font-size:15px;font-weight:700}
      .png-sheet thead th.dayh .d2{display:block;font-size:12px;font-weight:600;opacity:.9;margin-top:1px}
      .png-sheet .cellh{height:54px;background:#fff}
      .png-sheet td.lcell{padding:5px}
      .png-sheet td.ecell{background:#F8FAFC}
      .png-sheet .lchip{border-radius:10px;padding:8px 10px;border-left:6px solid;min-height:40px}
      .png-sheet .lchip + .lchip{margin-top:5px}
      .png-sheet .lchip .subj{display:block;color:inherit;font-size:15px;font-weight:700}
      .png-sheet .lchip .badge{display:inline-block;margin-top:3px;padding:1px 7px;border:1.5px solid;border-radius:999px;font-size:11px;font-weight:700;background:#fff}
      .png-sheet .lchip .ptime{display:block;font-size:12px;font-weight:600;margin-top:3px;opacity:.85}
      .png-sheet .lchip .tch{display:block;color:#334155;font-size:12px;margin-top:2px}
      .png-sheet .legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;justify-content:center}
      .png-sheet .legend span{display:inline-block;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700}
    </style>
    <div class="png-sheet">
      <div class="topbar"></div>
      <div class="ph">
        <img src="${esc(logoSrc)}" alt="" crossorigin="anonymous" />
        <div class="tt">${esc(opts.title)}</div>
        <div class="sb">${esc(opts.subtitle)}</div>
        <div class="rg">${esc(opts.rangeLabel)}</div>
      </div>
      <table>
        <thead><tr>
          <th class="pcol">Saat</th>
          ${days
            .map(
              (d, i) =>
                `<th class="dayh" style="background:${DAY_COLORS[i % DAY_COLORS.length]}"><span class="d1">${esc(d.title)}</span><span class="d2">${esc(d.subtitle)}</span></th>`
            )
            .join('')}
        </tr></thead>
        <tbody>${satirlar}</tbody>
      </table>
      ${legend}
    </div>`;
  document.body.appendChild(stage);
  try {
    const img = stage.querySelector('img') as HTMLImageElement | null;
    if (img) {
      await resimBekle(img);
      if (!img.naturalWidth) img.remove();
    }
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise((r) => setTimeout(r, 100));
    const sheet = stage.querySelector('.png-sheet') as HTMLElement | null;
    if (!sheet) throw new Error('PNG şablonu oluşturulamadı');
    const canvas = await rasterizeHtmlElementForPdf(sheet, 2);
    if (!canvas.width || !canvas.height) throw new Error('PNG boş üretildi');
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = opts.filename.endsWith('.png') ? opts.filename : `${opts.filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    stage.remove();
  }
}
