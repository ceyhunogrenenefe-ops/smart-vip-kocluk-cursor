/**
 * Vercel Cron (30 dk): gönderim WABA'sındaki (0506) otomasyon şablonlarının
 * Meta'daki GERÇEK kategorisini ve onay durumunu okur, commerce_settings.meta
 * altında `whatsapp_template_category_audit` olarak saklar.
 *
 * Yalnız okur; Meta'da hiçbir şey oluşturmaz/değiştirmez. Başarılı bir
 * okumadan sonra kendini kapatır (`done`). Yeniden çalıştırmak için
 * state'te `done` false yapılır.
 */
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb } from '../api/_lib/meta-whatsapp.js';
import { resolvePrimaryWabaId } from '../api/_lib/meta-templates-sync.js';
import { URGENT_TEMPLATE_NAMES } from '../api/_lib/meta-template-copy.js';

const STATE_KEY = 'whatsapp_template_category_audit';
const EXTRA_NAMES = ['coach_attendance_report', 'class_camera_off_notice_staff'];
const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';

async function readState() {
  const { data } = await supabaseAdmin.from('commerce_settings').select('id, meta').is('institution_id', null).maybeSingle();
  const meta = data?.meta && typeof data.meta === 'object' ? data.meta : {};
  const state = meta[STATE_KEY] && typeof meta[STATE_KEY] === 'object' ? meta[STATE_KEY] : {};
  return { id: data?.id || null, meta, state };
}

async function writeState(row, patch) {
  if (!row.id) return;
  const state = { ...row.state, ...patch, updated_at: new Date().toISOString() };
  await supabaseAdmin.from('commerce_settings').update({ meta: { ...row.meta, [STATE_KEY]: state } }).eq('id', row.id);
}

async function listTemplates(waba, tok) {
  const rows = [];
  let url = `https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(waba)}/message_templates?fields=name,status,category,language,quality_score,rejected_reason&limit=250`;
  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: String(json?.error?.message || `http_${res.status}`), code: json?.error?.code || null };
    rows.push(...(json.data || []));
    url = json.paging?.next || null;
  }
  return { ok: true, templates: rows };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  const row = await readState();
  if (row.state.done) return res.status(200).json({ ok: true, skipped: 'done' });

  try {
    await loadMetaWhatsAppSecretsFromDb();
    const tok = String(process.env.META_WHATSAPP_TOKEN || '').trim();
    if (!tok) throw new Error('META_WHATSAPP_TOKEN yok');
    const { waba_id: waba } = await resolvePrimaryWabaId(tok);
    if (!waba) throw new Error('Gönderim WABA bulunamadı');

    const list = await listTemplates(waba, tok);
    if (!list.ok) {
      await writeState(row, { last_error: list.error, last_error_at: new Date().toISOString() });
      await recordCronRun({ jobKey: 'wa_template_category_audit', ok: false, error: list.error });
      return res.status(200).json({ ok: false, error: list.error });
    }

    const watched = new Set([...URGENT_TEMPLATE_NAMES, ...EXTRA_NAMES]);
    const all = list.templates.map((t) => ({
      name: t.name,
      language: t.language,
      status: t.status,
      category: t.category,
      quality: t.quality_score?.score || null,
      rejected_reason: t.rejected_reason && t.rejected_reason !== 'NONE' ? t.rejected_reason : null
    }));
    const urgent = all.filter((t) => watched.has(t.name));
    const missing = [...watched].filter((n) => !all.some((t) => t.name === n));
    const counts = all.reduce((acc, t) => {
      const k = `${t.category || '?'}:${t.status || '?'}`;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    await writeState(row, { done: true, waba_id: waba, audited_at: new Date().toISOString(), urgent, missing, counts, last_error: null });
    await recordCronRun({ jobKey: 'wa_template_category_audit', ok: true, processed: all.length });
    return res.status(200).json({ ok: true, urgent: urgent.length, total: all.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await writeState(row, { last_error: msg, last_error_at: new Date().toISOString() });
    await recordCronRun({ jobKey: 'wa_template_category_audit', ok: false, error: msg });
    return res.status(200).json({ ok: false, error: msg });
  }
}
