import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { resolveGuestJoinShortCode } from '../api/_lib/guest-join-short-link.js';
import { publicAppBaseUrl } from '../api/_lib/bbb-guest-token.js';
import { formatTrLessonDate } from '../api/_lib/guest-join-share-text.js';

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadPreviewMeta(kind, id) {
  if (kind === 'private') {
    const { data } = await supabaseAdmin
      .from('teacher_lessons')
      .select('title,date,start_time,status')
      .eq('id', id)
      .maybeSingle();
    if (!data) return null;
    return {
      title: String(data.title || 'Canlı özel ders').trim(),
      lessonDate: String(data.date || '').slice(0, 10),
      lessonTime: String(data.start_time || '').slice(0, 5),
      status: data.status
    };
  }
  const { data } = await supabaseAdmin
    .from('class_sessions')
    .select('subject,lesson_date,start_time,status')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return {
    title: String(data.subject || 'Grup dersi').trim(),
    lessonDate: String(data.lesson_date || '').slice(0, 10),
    lessonTime: String(data.start_time || '').slice(0, 5),
    status: data.status
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const code = String(req.query.code || '').trim().toLowerCase();
  if (!code) return res.status(400).send('missing code');

  const row = await resolveGuestJoinShortCode(code);
  if (!row) return res.status(404).send('not found');

  const meta = await loadPreviewMeta(row.kind === 'private' ? 'private' : 'class', row.resource_id);
  if (!meta) return res.status(404).send('not found');

  const base = publicAppBaseUrl();
  const pageUrl = `${base}/d/${encodeURIComponent(code)}`;
  const datePart = formatTrLessonDate(meta.lessonDate);
  const timePart = meta.lessonTime ? meta.lessonTime.slice(0, 5) : '';
  const when = [datePart, timePart ? `saat ${timePart}` : ''].filter(Boolean).join(' · ');
  const title = `Canlı ders: ${meta.title}`;
  const description = when ? `${meta.title} — ${when}` : meta.title;

  const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(pageUrl)}" />
</head>
<body>
  <p>${escapeHtml(description)}</p>
  <p><a href="${escapeHtml(pageUrl)}">${escapeHtml(title)}</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send(html);
}
