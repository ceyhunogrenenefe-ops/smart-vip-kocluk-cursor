/**
 * Yönetici tarafı — aylık beyanlar ve sistem kayıtlarıyla karşılaştırma.
 *
 * Beyan sistem kaydını EZMEZ: ikisi yan yana durur, fark işaretlenir, kararı
 * yönetici verir. Hakediş hesabı mevcut teacher-payroll modülünde kalır;
 * burada ona dokunulmaz.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizedUserRolesFromDb } from '../api/_lib/user-roles-fetch.js';
import {
  DECLARATION_KINDS,
  DECLARATION_STATUSES,
  compareDetails,
  compareTotals,
  periodLabel,
  previousPeriod,
  sumByKind,
  summarizeDeclarations
} from '../api/_lib/teacher-declaration-core.js';
import {
  loadTeacherSystemWork,
  loadTeacherSystemWorkBatch
} from '../api/_lib/teacher-declaration-system.js';
import {
  ensureDeclarationsForPeriod,
  loadActiveWorkerIds,
  loadDeclarationSettings,
  sendDeclarationMessages
} from '../api/_lib/teacher-declaration-notify.js';

const DECL = 'teacher_month_declarations';
const LINES = 'teacher_declaration_lines';
const MSGS = 'teacher_declaration_messages';

function isManager(actor, tags) {
  const r = String(actor?.role || '').toLowerCase();
  const t = Array.isArray(tags) ? tags : [];
  const ok = ['admin', 'super_admin'];
  return ok.includes(r) || t.some((x) => ok.includes(String(x)));
}

function normalizePeriod(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(0, 7)}-01`;
  return previousPeriod(new Date());
}

export default async function handler(req, res) {
  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }
  const tags = await normalizedUserRolesFromDb(actor.sub).catch(() => []);
  if (!isManager(actor, tags)) return res.status(403).json({ error: 'forbidden' });

  const op = String(req.query?.op || '').trim();
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const period = normalizePeriod(req.query?.period || body.period);
  const institutionId = actor.institution_id || null;

  try {
    /** Dönem listesi + özet */
    if (req.method === 'GET' && (op === '' || op === 'list')) {
      // Dönem ilk kez açılıyorsa beyan kayıtları (token dahil) burada doğar;
      // yönetici cron'u beklemeden listeyi görebilsin
      await ensureDeclarationsForPeriod({ period, institutionId }).catch((e) =>
        console.warn('[teacher-declarations] kayit acma:', errorMessage(e))
      );

      let dq = supabaseAdmin.from(DECL).select('*').eq('period_month', period).limit(500);
      if (institutionId) dq = dq.eq('institution_id', institutionId);
      const { data: decls, error } = await dq;
      if (error) throw error;

      const ids = (decls || []).map((d) => d.id);
      const teacherIds = (decls || []).map((d) => d.teacher_id);

      const [{ data: lines }, { data: msgs }, { data: teachers }] = await Promise.all([
        ids.length
          ? supabaseAdmin.from(LINES).select('*').in('declaration_id', ids)
          : Promise.resolve({ data: [] }),
        ids.length
          ? supabaseAdmin.from(MSGS).select('declaration_id, kind, sent_at').in('declaration_id', ids)
          : Promise.resolve({ data: [] }),
        teacherIds.length
          ? supabaseAdmin.from('users').select('id, name, phone, role').in('id', teacherIds)
          : Promise.resolve({ data: [] })
      ]);

      const linesBy = new Map();
      for (const l of lines || []) {
        if (!linesBy.has(l.declaration_id)) linesBy.set(l.declaration_id, []);
        linesBy.get(l.declaration_id).push(l);
      }
      const msgBy = new Map();
      for (const m of msgs || []) {
        const cur = msgBy.get(m.declaration_id) || { count: 0, last: null };
        cur.count += 1;
        if (!cur.last || new Date(m.sent_at) > new Date(cur.last)) cur.last = m.sent_at;
        msgBy.set(m.declaration_id, cur);
      }
      const teacherBy = Object.fromEntries((teachers || []).map((t) => [String(t.id), t]));
      // O dönemde fiilen derse/koçluğa girenler — otomatik mesaj bunlara gider
      const activeIds = await loadActiveWorkerIds({ period, institutionId }).catch(() => new Set());

      // Sistem kayıtları TEK seferde taranır. Öğretmen başına ayrı sorgu atmak
      // 48 kişilik listede yüzlerce gidiş-dönüş demekti ve sayfa geç açılıyordu.
      let systemByTeacher = new Map();
      try {
        systemByTeacher = await loadTeacherSystemWorkBatch({
          period,
          teacherIds: teacherIds,
          institutionId
        });
      } catch (e) {
        console.warn('[teacher-declarations] sistem taramasi:', errorMessage(e));
      }

      const rows = [];
      for (const d of decls || []) {
        const dl = linesBy.get(d.id) || [];
        const sys = systemByTeacher.get(String(d.teacher_id));
        const system = sys?.totals || { group: 0, private: 0, guidance: 0 };
        const unassigned = sys?.unassigned || { count: 0, units: 0 };
        const msg = msgBy.get(d.id) || { count: 0, last: null };
        rows.push({
          id: d.id,
          teacher_id: d.teacher_id,
          teacher_name: teacherBy[String(d.teacher_id)]?.name || 'Öğretmen',
          teacher_role: teacherBy[String(d.teacher_id)]?.role || '',
          has_phone: Boolean(String(teacherBy[String(d.teacher_id)]?.phone || '').trim()),
          active_in_period: activeIds.has(String(d.teacher_id)),
          status: d.status,
          opened_at: d.opened_at,
          submitted_at: d.submitted_at,
          edit_allowed: d.edit_allowed,
          message_count: msg.count,
          last_message_at: msg.last,
          declared: sumByKind(dl),
          system,
          unassigned,
          comparison: compareTotals(dl, system)
        });
      }

      rows.sort((a, b) => {
        const rank = (r) => (r.comparison.state === 'mismatch' && r.status === 'submitted' ? 0 : r.status === 'pending' ? 1 : 2);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        return String(a.teacher_name).localeCompare(String(b.teacher_name), 'tr');
      });

      return res.status(200).json({
        ok: true,
        period,
        period_label: periodLabel(period),
        rows,
        summary: summarizeDeclarations(rows),
        meta: { kinds: DECLARATION_KINDS, statuses: DECLARATION_STATUSES }
      });
    }

    /** Tek öğretmenin detayı — satır satır karşılaştırma */
    if (req.method === 'GET' && op === 'detail') {
      const id = String(req.query?.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: d } = await supabaseAdmin.from(DECL).select('*').eq('id', id).maybeSingle();
      if (!d) return res.status(404).json({ error: 'not_found' });

      const [{ data: lines }, { data: teacher }, sys] = await Promise.all([
        supabaseAdmin.from(LINES).select('*').eq('declaration_id', id).order('created_at'),
        supabaseAdmin.from('users').select('id, name, phone').eq('id', d.teacher_id).maybeSingle(),
        loadTeacherSystemWork({
          teacherId: d.teacher_id,
          period: d.period_month,
          institutionId: d.institution_id || institutionId
        })
      ]);

      // Beyan satırlarına okunur etiket: sınıf/öğrenci adı
      const classIds = [...new Set((lines || []).map((l) => l.class_id).filter(Boolean))];
      const studentIds = [...new Set((lines || []).map((l) => l.student_id).filter(Boolean))];
      const [{ data: cls }, { data: stu }] = await Promise.all([
        classIds.length ? supabaseAdmin.from('classes').select('id, name').in('id', classIds) : Promise.resolve({ data: [] }),
        studentIds.length ? supabaseAdmin.from('students').select('id, name').in('id', studentIds) : Promise.resolve({ data: [] })
      ]);
      const clsName = Object.fromEntries((cls || []).map((c) => [String(c.id), c.name || '']));
      const stuName = Object.fromEntries((stu || []).map((s) => [String(s.id), s.name || '']));
      const named = (lines || []).map((l) => ({
        ...l,
        label: l.label || clsName[String(l.class_id)] || stuName[String(l.student_id)] || ''
      }));

      return res.status(200).json({
        ok: true,
        declaration: {
          id: d.id,
          teacher_id: d.teacher_id,
          teacher_name: teacher?.name || 'Öğretmen',
          period: d.period_month,
          period_label: periodLabel(d.period_month),
          status: d.status,
          submitted_at: d.submitted_at,
          opened_at: d.opened_at,
          edit_allowed: d.edit_allowed,
          note: d.note
        },
        lines: named,
        system_rows: sys.rows,
        unassigned: sys.unassigned,
        comparison: compareTotals(named, sys.totals),
        details: compareDetails(named, sys.rows),
        meta: { kinds: DECLARATION_KINDS }
      });
    }

    /**
     * Seçilen öğretmenlere formu gönder.
     *
     * Aylık otomatik gönderimi beklemeden, yalnız istenen öğretmenlere.
     * Formunu zaten göndermiş öğretmene varsayılan olarak gidilmez;
     * yönetici özellikle isterse `include_submitted` ile gider.
     */
    if (req.method === 'POST' && op === 'send') {
      // Beyan kimlikleri uuid; kullanıcı kimlikleri değil. Burada süzülen
      // beyan kimliğidir, öğretmen kimliği değil
      const ids = Array.isArray(body.ids)
        ? body.ids.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
      if (!ids.length) return res.status(400).json({ error: 'ids_required', message: 'Öğretmen seçilmedi.' });

      const r = await sendDeclarationMessages({
        period,
        declarationIds: ids,
        institutionId,
        includeSubmitted: body.include_submitted === true,
        kind: body.kind === 'reminder' ? 'reminder' : 'initial'
      });

      if (r.error) return res.status(400).json({ ok: false, error: 'send_failed', message: r.error });

      const parcalar = [`${r.sent} öğretmene gönderildi`];
      if (r.failed) parcalar.push(`${r.failed} gönderilemedi`);
      return res.status(200).json({
        ok: true,
        sent: r.sent,
        failed: r.failed,
        errors: r.errors || [],
        message: parcalar.join(' · ')
      });
    }

    /** Mesaj şablonu ve otomatik gönderim ayarları */
    if (req.method === 'GET' && op === 'settings') {
      const st = await loadDeclarationSettings();
      return res.status(200).json({ ok: true, settings: st });
    }

    if (req.method === 'POST' && op === 'save-settings') {
      const days = Array.isArray(body.reminder_days)
        ? [...new Set(body.reminder_days.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 28))]
            .sort((a, b) => a - b)
        : null;
      const patch = {
        is_active: body.is_active === true,
        message_text: String(body.message_text || '').trim().slice(0, 2000) || null,
        form_base_url: String(body.form_base_url || '').trim().slice(0, 300) || null,
        updated_by: actor.sub || null,
        updated_at: new Date().toISOString()
      };
      if (days && days.length) patch.reminder_days = days;

      const { error } = await supabaseAdmin
        .from('teacher_declaration_settings')
        .update(patch)
        .eq('id', true);
      if (error) return res.status(500).json({ error: error.message });
      const st = await loadDeclarationSettings();
      return res.status(200).json({
        ok: true,
        settings: st,
        message: st.is_active
          ? 'Kaydedildi. Her ayın 1’inde otomatik gönderim açık.'
          : 'Kaydedildi. Otomatik gönderim kapalı.'
      });
    }

    /** Öğretmene düzeltme izni ver */
    if (req.method === 'POST' && op === 'allow-edit') {
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { error } = await supabaseAdmin
        .from(DECL)
        .update({
          edit_allowed: true,
          edit_allowed_by: actor.sub || null,
          edit_allowed_at: new Date().toISOString(),
          status: 'reopened',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true, message: 'Öğretmen formunu düzeltebilir.' });
    }

    /** Formun bağlantısını yöneticiye göster — öğretmene elden iletmek için */
    if (req.method === 'GET' && op === 'link') {
      const id = String(req.query?.id || '').trim();
      const { data: d } = await supabaseAdmin.from(DECL).select('token').eq('id', id).maybeSingle();
      if (!d) return res.status(404).json({ error: 'not_found' });
      const { buildDeclarationFormUrl } = await import('../api/_lib/teacher-declaration-notify.js');
      return res.status(200).json({ ok: true, url: await buildDeclarationFormUrl(d.token) });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    // Sebebi gunluge yaz: istemciye yalniz mesaj doner, teshis burada kalir
    console.error('[teacher-declarations] hata', { op, period, error: errorMessage(e) });
    return res.status(500).json({ error: errorMessage(e) });
  }
}
