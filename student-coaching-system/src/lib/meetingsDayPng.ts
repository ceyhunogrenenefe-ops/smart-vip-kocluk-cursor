import type { CoachingMeetingRecord } from '../types';
import { ensureNotoSansForPdfCapture, rasterizeHtmlElementForPdf } from './pdfLiveWeekGrid';

export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  if (status === 'completed') return { bg: '#d1fae5', fg: '#065f46', label: 'Tamamlandı' };
  if (status === 'missed') return { bg: '#fee2e2', fg: '#991b1b', label: 'Kaçırıldı' };
  return { bg: '#fef3c7', fg: '#92400e', label: 'Planlı' };
}

export type MeetingsDayPngItem = {
  meeting: CoachingMeetingRecord;
  studentLabel: string;
  coachLabel: string;
};

export function buildMeetingsDayExportElement(opts: {
  dayLabel: string;
  isoKey: string;
  items: MeetingsDayPngItem[];
  title?: string;
}): HTMLDivElement {
  const root = document.createElement('div');
  root.className = 'pdf-capture-root';
  root.style.cssText =
    'width:520px;box-sizing:border-box;padding:28px 24px;background:#ffffff;color:#0f172a;font-family:"Noto Sans","Segoe UI",system-ui,sans-serif;';

  const cards =
    opts.items.length === 0
      ? '<p style="margin:16px 0 0;font-size:14px;color:#64748b">Bu gün için planlı görüşme yok.</p>'
      : opts.items
          .map(({ meeting: m, studentLabel, coachLabel }) => {
            const start = new Date(m.start_time);
            const end = new Date(m.end_time);
            const time = `${start.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
            const st = statusStyle(m.status);
            const link = String(m.meet_link || m.join_link || '').trim();
            return `
              <div style="margin-top:12px;padding:14px 16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
                <div style="font-size:15px;font-weight:600;color:#0f172a">${escapeHtml(time)}</div>
                <div style="margin-top:6px;font-size:13px;color:#475569">${escapeHtml(studentLabel)} · ${escapeHtml(coachLabel)}</div>
                <span style="display:inline-block;margin-top:8px;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:600;background:${st.bg};color:${st.fg}">${st.label}</span>
                ${link ? `<div style="margin-top:10px;font-size:11px;color:#059669;word-break:break-all">${escapeHtml(link)}</div>` : ''}
              </div>`;
          })
          .join('');

  root.innerHTML = `
    <div style="border-bottom:2px solid #10b981;padding-bottom:12px">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#059669">Online Görüşmeler</div>
      <div style="margin-top:6px;font-size:20px;font-weight:700">${escapeHtml(opts.dayLabel)}</div>
      ${opts.title ? `<div style="margin-top:4px;font-size:12px;color:#64748b">${escapeHtml(opts.title)}</div>` : ''}
    </div>
    ${cards}
  `;
  return root;
}

export async function downloadMeetingsDayPng(opts: {
  dayLabel: string;
  isoKey: string;
  items: MeetingsDayPngItem[];
  title?: string;
}): Promise<void> {
  await ensureNotoSansForPdfCapture();
  const el = buildMeetingsDayExportElement(opts);
  const canvas = await rasterizeHtmlElementForPdf(el, 2);
  const link = document.createElement('a');
  link.download = `gorusmeler-${opts.isoKey}.png`;
  link.href = canvas.toDataURL('image/png', 0.95);
  link.click();
}
