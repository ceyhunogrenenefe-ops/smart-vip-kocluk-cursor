/**
 * Ders Program Planlayıcısı PNG stili — logo + sınıf adı + haftalık tablo.
 * Kaynak: public/ders-program-planner/index.html → exportPNG()
 */
import { rasterizeHtmlElementForPdf } from './pdfLiveWeekGrid';

const BRAND_NAVY = '#1F478F';
const BRAND_RED = '#FC3232';
const BRAND_NAVY_SOFT = '#E9F0FB';
const BORDER = '#B9C4DA';

const DAY_LABELS_TR = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'] as const;

/** Her gün başlığı ayrı renk */
const DAY_COLORS = ['#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#0891B2'];

type SubjectTheme = { bg: string; bd: string; fg: string };
const SUBJECT_THEMES: Array<[RegExp, SubjectTheme]> = [
  [/matemat|geometri/, { bg: '#DBEAFE', bd: '#2563EB', fg: '#1E3A8A' }],
  [/fizik/, { bg: '#EDE9FE', bd: '#7C3AED', fg: '#4C1D95' }],
  [/kimya/, { bg: '#FEF3C7', bd: '#D97706', fg: '#78350F' }],
  [/biyoloji|fen bil/, { bg: '#DCFCE7', bd: '#16A34A', fg: '#14532D' }],
  [/türk|edebiyat|paragraf|dil bilgisi/, { bg: '#FEE2E2', bd: '#DC2626', fg: '#7F1D1D' }],
  [/tarih|inkılap/, { bg: '#FFEDD5', bd: '#EA580C', fg: '#7C2D12' }],
  [/coğrafya/, { bg: '#CCFBF1', bd: '#0D9488', fg: '#134E4A' }],
  [/ingilizce|english|almanca|yabancı/, { bg: '#FCE7F3', bd: '#DB2777', fg: '#831843' }],
  [/felsefe|psikoloji|sosyoloji|mantık/, { bg: '#E0E7FF', bd: '#4F46E5', fg: '#312E81' }],
  [/din kült|değerler/, { bg: '#ECFCCB', bd: '#65A30D', fg: '#365314' }],
  [/sosyal/, { bg: '#FFE4E6', bd: '#E11D48', fg: '#881337' }],
  [/rehber|koçluk|etüt|deneme/, { bg: '#F1F5F9', bd: '#475569', fg: '#1E293B' }]
];
const FALLBACK_THEMES: SubjectTheme[] = [
  { bg: '#E0F2FE', bd: '#0284C7', fg: '#0C4A6E' },
  { bg: '#FAE8FF', bd: '#C026D3', fg: '#701A75' },
  { bg: '#FEF9C3', bd: '#CA8A04', fg: '#713F12' },
  { bg: '#D1FAE5', bd: '#059669', fg: '#064E3B' },
  { bg: '#FFEDD5', bd: '#F97316', fg: '#7C2D12' },
  { bg: '#E0E7FF', bd: '#6366F1', fg: '#312E81' }
];

/** Ders adına göre sabit renk (aynı ders her yerde aynı renk) */
export function subjectTheme(subject: string): SubjectTheme {
  const key = String(subject || '').toLocaleLowerCase('tr').trim();
  for (const [re, theme] of SUBJECT_THEMES) if (re.test(key)) return theme;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_THEMES[h % FALLBACK_THEMES.length];
}

export type BrandedScheduleSlot = {
  day_of_week: number; // 1=Pzt … 7=Paz
  start_time: string;
  end_time: string;
  subject: string;
  teacher_name?: string | null;
};

export type BrandedSchedulePeriod = {
  label: string;
  time: string;
  startKey: string;
};

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtHm(t: string): string {
  const raw = String(t || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return raw.slice(0, 5);
  return `${String(Number(m[1])).padStart(2, '0')}:${m[2]}`;
}

function periodKey(start: string, end: string): string {
  return `${fmtHm(start)}|${fmtHm(end)}`;
}

/** Haftalık şablondan 1. Ders / 2. Ders satırları (Pzt–Cum, Pzt–Cmt veya Pzt–Paz). */
export function buildBrandedPeriodsFromSlots(slots: BrandedScheduleSlot[]): {
  periods: BrandedSchedulePeriod[];
  dayCount: number;
} {
  const weekdaySlots = (slots || []).filter((s) => {
    const d = Number(s.day_of_week);
    return d >= 1 && d <= 7;
  });
  const hasSun = weekdaySlots.some((s) => Number(s.day_of_week) === 7);
  const hasSat = weekdaySlots.some((s) => Number(s.day_of_week) === 6);
  const dayCount = hasSun ? 7 : hasSat ? 6 : 5;

  const seen = new Map<string, BrandedSchedulePeriod>();
  const ordered: BrandedSchedulePeriod[] = [];
  const sorted = [...weekdaySlots].sort((a, b) => {
    const sa = fmtHm(a.start_time);
    const sb = fmtHm(b.start_time);
    if (sa !== sb) return sa.localeCompare(sb);
    return fmtHm(a.end_time).localeCompare(fmtHm(b.end_time));
  });

  for (const s of sorted) {
    const d = Number(s.day_of_week);
    if (d < 1 || d > dayCount) continue;
    const key = periodKey(s.start_time, s.end_time);
    if (seen.has(key)) continue;
    const time = `${fmtHm(s.start_time)}–${fmtHm(s.end_time)}`;
    const row: BrandedSchedulePeriod = {
      label: `${ordered.length + 1}. Ders`,
      time,
      startKey: key
    };
    seen.set(key, row);
    ordered.push(row);
  }

  return { periods: ordered, dayCount };
}

function cellFor(
  slots: BrandedScheduleSlot[],
  dayOfWeek: number,
  startKey: string
): { subject: string; teacher: string } | null {
  const hit = slots.find(
    (s) => Number(s.day_of_week) === dayOfWeek && periodKey(s.start_time, s.end_time) === startKey
  );
  if (!hit) return null;
  const subject = String(hit.subject || '').trim();
  if (!subject) return null;
  return {
    subject,
    teacher: String(hit.teacher_name || '').trim()
  };
}

async function ensurePlannerFonts(): Promise<void> {
  if (typeof document === 'undefined') return;
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
    await document.fonts?.load('400 14px Inter');
    await document.fonts?.ready;
  } catch {
    /* sistem fontuna düş */
  }
}

function resolveLogoUrl(preferred?: string | null): string {
  const p = String(preferred || '').trim();
  if (p) return p;
  return `${window.location.origin}/ders-program-planner/logo.png`;
}

function waitImg(img: HTMLImageElement): Promise<void> {
  if (img.complete && img.naturalWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
}

function triggerDownload(dataUrl: string, filename: string): void {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Planlayıcıdaki PNG ile aynı düzen: logo, sınıf adı, HAFTALIK DERS PROGRAMI, tablo.
 */
export async function downloadBrandedClassSchedulePng(opts: {
  className: string;
  slots: BrandedScheduleSlot[];
  logoUrl?: string | null;
  /** Kurum logosu yoksa başlıkta kurumun kendi adı yazılır (platform logosu düşmesin) */
  institutionName?: string | null;
  filename?: string;
}): Promise<void> {
  const className = String(opts.className || 'Sınıf').trim() || 'Sınıf';
  const slots = opts.slots || [];
  if (!slots.length) {
    throw new Error('Bu sınıfta indirilecek ders yok. Tarihli oturum veya haftalık şablon ekleyin.');
  }

  const { periods, dayCount } = buildBrandedPeriodsFromSlots(slots);
  if (!periods.length) {
    throw new Error('Programda ders saati bulunamadı.');
  }

  await ensurePlannerFonts();

  const days = DAY_LABELS_TR.slice(0, dayCount);
  const rowsHtml = periods
    .map((p) => {
      const cells = days
        .map((_, di) => {
          const dayOfWeek = di + 1;
          const v = cellFor(slots, dayOfWeek, p.startKey);
          if (!v) return `<td class="cellh ecell"></td>`;
          const t = subjectTheme(v.subject);
          return `<td class="cellh lcell"><div class="lchip" style="background:${t.bg};border-left-color:${t.bd};color:${t.fg}">
            <span class="subj">${esc(v.subject)}</span>
            <span class="ptime">${esc(p.time)}</span>
            ${v.teacher ? `<span class="tch">${esc(v.teacher)}</span>` : ''}
          </div></td>`;
        })
        .join('');
      return `<tr>
        <td class="pcol"><div class="pl">${esc(p.label)}</div><div class="pt">${esc(p.time)}</div></td>
        ${cells}
      </tr>`;
    })
    .join('');

  const sheetW = Math.max(1112, 120 + days.length * 165);
  const usedSubjects = [
    ...new Set(
      slots
        .filter((s) => Number(s.day_of_week) >= 1 && Number(s.day_of_week) <= days.length)
        .map((s) => String(s.subject || '').trim())
        .filter(Boolean)
    )
  ].sort((a, b) => a.localeCompare(b, 'tr'));
  const legendHtml = usedSubjects.length
    ? `<div class="legend">${usedSubjects
        .map((s) => {
          const t = subjectTheme(s);
          return `<span style="background:${t.bg};color:${t.fg};border:2px solid ${t.bd}">${esc(s)}</span>`;
        })
        .join('')}</div>`
    : '';

  const ownLogo = String(opts.logoUrl || '').trim();
  const institutionName = String(opts.institutionName || '').trim();
  // Kurumun logosu yoksa ve adı biliniyorsa platform logosu yerine kurum adı yazılır
  const useNameHeader = !ownLogo && Boolean(institutionName);
  const logoSrc = resolveLogoUrl(opts.logoUrl);
  const stage = document.createElement('div');
  stage.setAttribute('data-branded-schedule-png', '1');
  // html2canvas left:-100000px ile düğümü sayfada bulamıyor (boş PNG / «Node not in page»).
  stage.style.cssText =
    'position:fixed;left:0;top:0;transform:translate(-12000px,0);background:#fff;padding:0;width:' + (sheetW + 68) + 'px;z-index:0;pointer-events:none;';
  stage.innerHTML = `
    <style>
      .png-sheet{font-family:"Inter",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1A1D26;background:#fff;width:${sheetW + 68}px;padding:34px;box-sizing:border-box}
      .png-sheet .topbar{height:10px;border-radius:6px;margin-bottom:22px;background:linear-gradient(90deg,#3B82F6 0%,#10B981 20%,#F59E0B 40%,#EF4444 60%,#8B5CF6 80%,#EC4899 100%)}
      .png-sheet .ph{text-align:center;margin-bottom:18px;padding-bottom:14px;border-bottom:3px solid ${BRAND_RED}}
      .png-sheet .ph img{height:88px;width:auto;max-width:320px;margin:0 auto 12px;display:block;background:transparent;object-fit:contain}
      .png-sheet .ph .tt{font-family:"Fraunces","Noto Sans",Georgia,serif;font-size:30px;font-weight:600;color:${BRAND_NAVY};letter-spacing:-0.01em;line-height:1.2}
      .png-sheet .ph .brandname{font-family:"Fraunces","Noto Sans",Georgia,serif;font-size:26px;font-weight:600;color:${BRAND_NAVY};margin-bottom:8px}
      .png-sheet .ph .sb{color:${BRAND_RED};font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:14px;margin-top:5px}
      .png-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;overflow-wrap:anywhere}
      .png-sheet th,.png-sheet td{border:1px solid ${BORDER};padding:9px 11px;font-size:14px;text-align:left;vertical-align:top}
      .png-sheet thead th{background:${BRAND_NAVY};color:#fff;font-weight:600;border-color:${BRAND_NAVY}}
      .png-sheet .pcol{width:120px;background:${BRAND_NAVY_SOFT}}
      .png-sheet thead th.pcol{background:${BRAND_NAVY};color:#fff}
      .png-sheet .pcol .pl{font-weight:600;color:${BRAND_NAVY}}
      .png-sheet .pcol .pt{color:#5C6B86;font-size:12px;margin-top:2px}
      .png-sheet .subj{font-weight:600;display:block;color:${BRAND_NAVY}}
      .png-sheet .tch{color:#444;font-size:12px;display:block;margin-top:3px}
      .png-sheet .cellh{height:54px;background:#fff}
      .png-sheet thead th.dayh{text-align:center;font-size:15px;font-weight:700;border:2px solid #fff}
      .png-sheet thead th.pcol{background:${BRAND_NAVY_SOFT};color:${BRAND_NAVY};border-color:${BORDER}}
      .png-sheet td.lcell{padding:5px}
      .png-sheet td.ecell{background:#F8FAFC}
      .png-sheet .lchip{border-radius:10px;padding:8px 10px;border-left:6px solid;min-height:40px}
      .png-sheet .lchip .subj{color:inherit;font-size:15px;font-weight:700}
      .png-sheet .lchip .ptime{display:block;font-size:12px;font-weight:600;margin-top:2px;color:inherit;opacity:.85}
      .png-sheet .lchip .tch{color:#334155}
      .png-sheet .legend{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;justify-content:center}
      .png-sheet .legend span{display:inline-block;padding:6px 12px;border-radius:999px;font-size:13px;font-weight:700}
    </style>
    <div class="png-sheet">
      <div class="topbar"></div>
      <div class="ph">
        ${
          useNameHeader
            ? `<div class="brandname">${esc(institutionName)}</div>`
            : `<img src="${esc(logoSrc)}" alt="${esc(institutionName || 'Kurum logosu')}" crossorigin="anonymous" />`
        }
        <div class="tt">${esc(className)}</div>
        <div class="sb">Haftalık Ders Programı</div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="pcol">Saat</th>
            ${days.map((d, di) => `<th class="dayh" style="background:${DAY_COLORS[di % DAY_COLORS.length]}">${esc(d)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${legendHtml}
    </div>
  `;

  document.body.appendChild(stage);
  try {
    const img = useNameHeader ? null : (stage.querySelector('img') as HTMLImageElement | null);
    if (img) {
      await waitImg(img);
      if (!img.naturalWidth) {
        img.removeAttribute('crossorigin');
        img.src = `${window.location.origin}/ders-program-planner/logo.png`;
        await waitImg(img);
      }
    }
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    await new Promise((r) => setTimeout(r, 100));

    const sheet = stage.querySelector('.png-sheet') as HTMLElement | null;
    if (!sheet) throw new Error('PNG şablonu oluşturulamadı');

    const canvas = await rasterizeHtmlElementForPdf(sheet, 2);

    if (!canvas.width || !canvas.height) {
      throw new Error('PNG görüntüsü boş üretildi');
    }

    const safeName = className.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'ders-programi';
    const filename =
      String(opts.filename || '').trim() || `${safeName} - ders programi.png`;
    triggerDownload(canvas.toDataURL('image/png'), filename.endsWith('.png') ? filename : `${filename}.png`);
  } finally {
    stage.remove();
  }
}
