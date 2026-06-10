import { supabaseAdmin } from '../api/_lib/supabase-admin.js';

function publicBaseUrl() {
  const u = process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || process.env.APP_PUBLIC_URL;
  if (u && String(u).trim()) return String(u).replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}`;
  return 'https://www.dersonlinevipkocluk.com';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const token = String(req.query.signing_token || req.query.token || '').trim();
  if (!token) return res.status(400).send('missing token');

  let institutionName = '';
  let studentLabel = '';
  let isKayitForm = true;

  try {
    const { data: row, error } = await supabaseAdmin
      .from('parent_sign_contracts')
      .select('ogrenci_ad,ogrenci_soyad,institution_id,kayit_formu_json,status,signed_at')
      .eq('signing_token', token)
      .maybeSingle();
    if (error) throw error;
    if (!row) return res.status(404).send('not found');

    if (row.institution_id) {
      const { data: inst } = await supabaseAdmin
        .from('institutions')
        .select('name')
        .eq('id', row.institution_id)
        .maybeSingle();
      institutionName = String(inst?.name || '').trim();
    }

    studentLabel = `${row.ogrenci_ad || ''} ${row.ogrenci_soyad || ''}`.trim();
    const kj = row.kayit_formu_json && typeof row.kayit_formu_json === 'object' ? row.kayit_formu_json : {};
    const phase = String(kj.phase || '');
    const signed = String(row.status || '').toLowerCase() === 'signed' || Boolean(row.signed_at);
    isKayitForm = phase === 'needs_form' && !signed;
  } catch {
    return res.status(500).send('error');
  }

  const kurum = institutionName || 'Kurum';
  const baslik = isKayitForm ? 'Kayıt formu' : 'Veli onayı';
  const title = `${kurum} — ${baslik}`;
  const description = studentLabel
    ? `${studentLabel} için ${baslik.toLowerCase()}`
    : `${kurum} veli kayıt bağlantısı`;

  const base = publicBaseUrl();
  const pageUrl = `${base}/veli-imza/${encodeURIComponent(token)}`;

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
