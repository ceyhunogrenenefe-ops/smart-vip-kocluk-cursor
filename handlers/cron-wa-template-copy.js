/**
 * Vercel Cron (30 dk): kapanan 0850 hesabındaki ACİL şablonları 0506 hesabına kopyalar.
 *
 * Meta'nın WABA başına saatlik istek sınırı (#80008) dolduğunda bir sonraki
 * çalışmada kaldığı yerden devam eder. Yoklama şablonları önce gider.
 * Tüm acil şablonlar yeni hesapta oluşunca `done` işaretlenir ve görev artık
 * Meta'ya hiç istek atmaz.
 */
import { authorizeVercelOrCronSecret } from '../api/_lib/cron-auth.js';
import { recordCronRun } from '../api/_lib/cron-run-log.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { copyTemplatesFromLegacyWaba } from '../api/_lib/meta-template-copy.js';

const STATE_KEY = 'whatsapp_template_copy';
const ATTENDANCE_RE = /absent|camera|attendance|yoklama|class_lesson|coach_lesson_attendance/i;

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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = authorizeVercelOrCronSecret(req);
  if (!auth.ok) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const row = await readState();
    if (row.state.done) return res.status(200).json({ ok: true, skipped: 'done' });

    const failed = new Set(Array.isArray(row.state.failed_keys) ? row.state.failed_keys : []);
    const plan = await copyTemplatesFromLegacyWaba({ dry_run: true, scope: 'urgent' });
    const log = (entry) => [...(row.state.runs || []).slice(-11), { at: new Date().toISOString(), ...entry }];

    if (!plan.ok) {
      await writeState(row, { runs: log({ stage: 'plan', rate_limited: Boolean(plan.rate_limited), wait_minutes: plan.wait_minutes ?? null, error: plan.error }) });
      await recordCronRun({ jobKey: 'wa_template_copy', ok: Boolean(plan.rate_limited), error: plan.error });
      return res.status(200).json({ ok: false, ...plan });
    }

    const pending = (plan.pending || [])
      .filter((t) => !failed.has(t.key))
      .sort((a, b) => Number(ATTENDANCE_RE.test(b.name)) - Number(ATTENDANCE_RE.test(a.name)));

    if (!pending.length) {
      await writeState(row, { done: true, runs: log({ stage: 'done', already_in_target: plan.already_in_target, failed: [...failed] }) });
      await recordCronRun({ jobKey: 'wa_template_copy', ok: true, processed: 0, detail: { done: true } });
      return res.status(200).json({ ok: true, done: true });
    }

    const r = await copyTemplatesFromLegacyWaba({ templates: pending.slice(0, 10) });
    const results = r.results || [];
    for (const x of results) if (!x.ok) failed.add(x.key);
    const copied = results.filter((x) => x.ok).map((x) => x.name);
    await writeState(row, {
      failed_keys: [...failed],
      copied: [...new Set([...(row.state.copied || []), ...copied])],
      errors: { ...(row.state.errors || {}), ...Object.fromEntries(results.filter((x) => !x.ok).map((x) => [x.name, x.error])) },
      runs: log({
        stage: 'copy',
        copied,
        failed: results.filter((x) => !x.ok).map((x) => x.name),
        remaining: pending.length - results.length,
        rate_limited: Boolean(r.rate_limited),
        wait_minutes: r.wait_minutes ?? null
      })
    });
    await recordCronRun({
      jobKey: 'wa_template_copy',
      ok: true,
      processed: results.length,
      messages_sent: copied.length,
      messages_failed: results.length - copied.length,
      detail: { rate_limited: Boolean(r.rate_limited), remaining: pending.length - results.length }
    });
    return res.status(200).json({ ok: true, copied, remaining: pending.length - results.length, rate_limited: Boolean(r.rate_limited) });
  } catch (e) {
    await recordCronRun({ jobKey: 'wa_template_copy', ok: false, error: String(e?.message || e) }).catch(() => {});
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
