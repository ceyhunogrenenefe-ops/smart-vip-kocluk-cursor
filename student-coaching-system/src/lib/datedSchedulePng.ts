/**
 * Tarihli ders programı PNG'si — haftalık kart düzeni.
 * Her satır bir hafta (aralığın ilk gününden başlayan 7 gün), her gün bir kart, dersler kartta alt alta.
 * Sütun sayısı 7'de sabit kaldığı için uzun aralıklarda da yazılar küçülmez.
 */
import { subjectTheme } from './classScheduleBrandedPng';
import { rasterizeHtmlElementForPdf } from './pdfLiveWeekGrid';

const BRAND_NAVY = '#1F478F';

export type DatedPngDay = { iso: string; title: string; subtitle: string };
export type DatedPngLesson = {
  dayIso: string;
  subject: string;
  time: string;
  /** Sıralama için başlangıç (HH:MM) */
  start: string;
  teacher?: string | null;
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
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Fraunces:opsz,wght@9..144,600&display=swap';
    document.head.appendChild(link);
  }
  try {
    await document.fonts?.load('700 14px Inter');
    await document.fonts?.load('800 22px Inter');
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

/** Eylül ve sonrası yeni öğretim yılı: 2026-10-24 → "2026-2027" */
export function ogretimYili(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export async function downloadDatedSchedulePng(opts: {
  /** Ör. "5A | Yazılıya Hazırlık Ders Programı" */
  title: string;
  rangeLabel: string;
  termLabel: string;
  days: DatedPngDay[];
  lessons: DatedPngLesson[];
  filename: string;
  showTeacher?: boolean;
  logoUrl?: string | null;
}): Promise<void> {
  const { days, lessons } = opts;
  if (!days.length || !lessons.length) throw new Error('PNG için ders yok.');
  await fontlariYukle();

  const haftalar: DatedPngDay[][] = [];
  for (let i = 0; i < days.length; i += 7) haftalar.push(days.slice(i, i + 7));

  const kart = (d: DatedPngDay) => {
    const liste = lessons
      .filter((l) => l.dayIso === d.iso)
      .sort((a, b) => a.start.localeCompare(b.start));
    const govde = liste.length
      ? liste
          .map((l) => {
            const t = subjectTheme(l.subject);
            return `<div class="ders" style="background:${t.bg};border-left-color:${t.bd};color:${t.fg}">
              <div class="ad">${esc(l.subject)}</div>
              <div class="saat">${esc(l.time)}</div>
              ${opts.showTeacher && l.teacher ? `<div class="ogr">${esc(l.teacher)}</div>` : ''}
            </div>`;
          })
          .join('')
      : `<div class="bos">Ders belirtilmemiş</div>`;
    return `<div class="gun">
      <div class="gb"><div class="g1">${esc(d.title)}</div><div class="g2">${esc(d.subtitle)}</div></div>
      <div class="gg">${govde}</div>
    </div>`;
  };

  const govde = haftalar
    .map(
      (h) =>
        `<div class="hafta">${h.map(kart).join('')}${Array.from({ length: 7 - h.length })
          .map(() => '<div class="gun yok"></div>')
          .join('')}</div>`
    )
    .join('');

  const W = 1180;
  const logoSrc = String(opts.logoUrl || '').trim() || `${window.location.origin}/ders-program-planner/logo.png`;
  const stage = document.createElement('div');
  // html2canvas sayfa dışına (left:-100000px) konan düğümü bulamıyor; transform ile gizle
  stage.style.cssText = `position:fixed;left:0;top:0;transform:translate(-12000px,0);background:#fff;width:${W}px;z-index:0;pointer-events:none;`;
  stage.innerHTML = `
    <style>
      .ps{font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1A1D26;background:#fff;width:${W}px;padding:26px 28px 30px;box-sizing:border-box}
      .ps .bas{display:flex;align-items:center;gap:22px;margin-bottom:20px}
      .ps .bas img{height:58px;width:auto;object-fit:contain}
      .ps .bas .tt{flex:1;font-size:26px;font-weight:800;color:${BRAND_NAVY};letter-spacing:-0.01em}
      .ps .bas .sag{text-align:right}
      .ps .bas .donem{font-size:15px;font-weight:800;color:#1E293B;letter-spacing:.02em}
      .ps .bas .aralik{font-size:14px;font-weight:600;color:#475569;margin-top:4px}
      .ps .hafta{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:12px}
      .ps .gun{border:1.5px solid #B9C4DA;border-radius:6px;overflow:hidden;background:#fff;min-height:150px;display:flex;flex-direction:column}
      .ps .gun.yok{border:none;background:transparent}
      .ps .gb{background:#D6E4F2;padding:8px 10px 7px;border-bottom:1.5px solid #B9C4DA}
      .ps .g1{font-size:14px;font-weight:700;color:#1E293B}
      .ps .g2{font-size:16px;font-weight:800;color:${BRAND_NAVY};margin-top:1px}
      .ps .gg{padding:6px;display:flex;flex-direction:column;gap:4px;flex:1}
      .ps .ders{border-radius:3px;border-left:4px solid;padding:5px 7px}
      .ps .ders .ad{font-size:12.5px;font-weight:800;line-height:1.2;color:inherit}
      .ps .ders .saat{font-size:12px;font-weight:700;color:#1E293B;margin-top:1px}
      .ps .ders .ogr{font-size:11px;font-weight:500;color:#334155;margin-top:1px}
      .ps .bos{color:#64748B;font-size:12px;padding:16px 4px 0}
    </style>
    <div class="ps">
      <div class="bas">
        <img src="${esc(logoSrc)}" alt="" crossorigin="anonymous" />
        <div class="tt">${esc(opts.title)}</div>
        <div class="sag"><div class="donem">${esc(opts.termLabel)}</div><div class="aralik">${esc(opts.rangeLabel)}</div></div>
      </div>
      ${govde}
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
    const sheet = stage.querySelector('.ps') as HTMLElement | null;
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
