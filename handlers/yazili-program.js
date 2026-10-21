/**
 * Yazılıya hazırlık programı (Ders Programı Planlayıcısı → Yazılıya hazırlık sekmesi).
 * Yalnız yönetici / süper admin.
 *
 * GET                       — sınıflar, sınıf-ders satırları (yazılı tarihi + öğretmen), taslak/yayınlanmış
 *                             dersler, meşguliyet (haftalık program + tarihli oturumlar), ayarlar
 * POST ?op=save-exam        — sınıf-ders yazılı tarihi / öğretmeni
 * POST ?op=save-settings    — tarih aralığı, saat blokları
 * POST ?op=add-item         — taslak ders ekle
 * POST ?op=update-item      — taslağı taşı / öğretmen değiştir
 * POST ?op=delete-item      — taslağı sil; yayınlanmışsa canlı dersi de iptal eder
 * POST ?op=clear-drafts     — tüm taslakları sil
 * POST ?op=suggest          — otomatik yerleştir (taslak oluşturur)
 * POST ?op=mark-published   — yayınlanan taslağa oturum id yaz
 */
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { actorRoleSet, roleSetHasAdmin, roleSetHasSuperAdmin } from '../api/_lib/actor-roles.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  YAZILI_TAKVIMI,
  ayariTemizle,
  blokCoz,
  dersAnahtari,
  otomatikYerlestir,
  sinifSeviyesi,
  takvimSinavlari,
  yaziliDersiMi
} from '../api/_lib/yazili-program.js';

const T_SINAV = 'yazili_program_sinav';
const T_DERS = 'yazili_program_ders';
const T_AYAR = 'yazili_program_ayar';
const PLATFORM_KURUM = '73323d75-eea1-4552-8bba-d50555423589';

function parseBody(req) {
  const b = req.body;
  if (Buffer.isBuffer(b)) {
    try {
      return JSON.parse(b.toString('utf8') || '{}');
    } catch {
      return {};
    }
  }
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

const hata = (res, status, error, hint) => res.status(status).json({ error, hint: hint || error });
const tarihMi = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const saat = (v) => String(v || '').slice(0, 5);

async function kurumBelirle(req, actor, superAdmin) {
  const istenen = String(req.query?.institution_id || '').trim();
  if (!superAdmin) return String(actor.institution_id || '').trim();
  return istenen || String(actor.institution_id || '').trim() || PLATFORM_KURUM;
}

async function ayarOku(kurumId) {
  const { data } = await supabaseAdmin.from(T_AYAR).select('payload').eq('institution_id', kurumId).maybeSingle();
  return ayariTemizle(data?.payload || {});
}

async function sinifiDogrula(kurumId, classId) {
  const { data } = await supabaseAdmin.from('classes').select('id,institution_id').eq('id', classId).maybeSingle();
  return Boolean(data && String(data.institution_id) === String(kurumId));
}

/** Kurumun tüm verisini okur ve sınıf-ders satırlarını kurar */
async function durumOku(kurumId) {
  const ayar = await ayarOku(kurumId);

  const { data: classRows, error: cErr } = await supabaseAdmin
    .from('classes')
    .select('id,name,class_level')
    .eq('institution_id', kurumId)
    .order('name');
  if (cErr) throw cErr;
  const classIds = (classRows || []).map((c) => c.id);

  const ogrenciSayisi = new Map();
  const slots = [];
  if (classIds.length) {
    const { data: members } = await supabaseAdmin.from('class_students').select('class_id').in('class_id', classIds);
    for (const m of members || []) ogrenciSayisi.set(m.class_id, (ogrenciSayisi.get(m.class_id) || 0) + 1);
    const { data: sl, error: sErr } = await supabaseAdmin
      .from('class_weekly_slots')
      .select('class_id,teacher_id,subject,day_of_week,start_time,end_time')
      .in('class_id', classIds);
    if (sErr) throw sErr;
    slots.push(...(sl || []));
  }

  // "Tüm aktif sınıflar": öğrencisi olan sınıflar
  const classes = (classRows || [])
    .filter((c) => (ogrenciSayisi.get(c.id) || 0) > 0)
    .map((c) => ({
      id: c.id,
      name: c.name || 'Sınıf',
      level: sinifSeviyesi(c.class_level, c.name),
      class_level: c.class_level || '',
      student_count: ogrenciSayisi.get(c.id) || 0
    }));
  const aktifIds = new Set(classes.map((c) => c.id));

  const { data: teacherRows } = await supabaseAdmin
    .from('users')
    .select('id,name,role,roles,is_active')
    .eq('institution_id', kurumId);
  const teachers = (teacherRows || [])
    .filter((u) => u.is_active !== false)
    .filter((u) => {
      const tags = new Set([u.role, ...(Array.isArray(u.roles) ? u.roles : [])].map((r) => String(r || '').toLowerCase()));
      return tags.has('teacher') || tags.has('coach');
    })
    .map((u) => ({ id: u.id, name: u.name || 'Öğretmen' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const teacherIds = teachers.map((t) => t.id);

  const { data: saved } = await supabaseAdmin.from(T_SINAV).select('*').eq('institution_id', kurumId);
  const { data: itemRows } = await supabaseAdmin
    .from(T_DERS)
    .select('*')
    .eq('institution_id', kurumId)
    .order('lesson_date')
    .order('start_time');
  const items = (itemRows || [])
    .filter((i) => aktifIds.has(i.class_id))
    .map((i) => ({ ...i, start_time: saat(i.start_time), end_time: saat(i.end_time) }));
  const yayinliOturum = new Set(items.map((i) => i.session_id).filter(Boolean));

  // Program aralığındaki tarihli oturumlar (kendi yayınladıklarımız hariç — onlar items'ta)
  const sessions = [];
  const oturumEkle = (rows) => {
    for (const s of rows || []) {
      if (yayinliOturum.has(s.id) || sessions.some((x) => x.id === s.id)) continue;
      sessions.push({ ...s, start_time: saat(s.start_time), end_time: saat(s.end_time) });
    }
  };
  const oturumSec = 'id,class_id,teacher_id,subject,lesson_date,start_time,end_time,status';
  if (classIds.length) {
    const { data } = await supabaseAdmin
      .from('class_sessions')
      .select(oturumSec)
      .in('class_id', classIds)
      .gte('lesson_date', ayar.baslangic)
      .lte('lesson_date', ayar.bitis)
      .neq('status', 'cancelled');
    oturumEkle(data);
  }
  if (teacherIds.length) {
    const { data } = await supabaseAdmin
      .from('class_sessions')
      .select(oturumSec)
      .in('teacher_id', teacherIds)
      .gte('lesson_date', ayar.baslangic)
      .lte('lesson_date', ayar.bitis)
      .neq('status', 'cancelled');
    oturumEkle(data);
  }
  const sessionsSade = sessions.map(({ id, class_id, teacher_id, subject, lesson_date, start_time, end_time }) => ({
    id,
    class_id,
    teacher_id,
    subject,
    lesson_date,
    start_time,
    end_time
  }));
  const slotsSade = slots
    .filter((s) => aktifIds.has(s.class_id) || teacherIds.includes(s.teacher_id))
    .map((s) => ({
      class_id: s.class_id,
      teacher_id: s.teacher_id,
      subject: s.subject,
      day_of_week: s.day_of_week,
      start_time: saat(s.start_time),
      end_time: saat(s.end_time)
    }));

  // Sınıf-ders satırları
  const rows = [];
  for (const c of classes) {
    const map = new Map();
    // 1) Haftalık programdaki dersler (en sık öğretmen)
    const sayac = new Map();
    for (const s of slots) {
      if (s.class_id !== c.id || !yaziliDersiMi(s.subject)) continue;
      const k = dersAnahtari(s.subject);
      if (!map.has(k)) {
        map.set(k, {
          class_id: c.id,
          class_name: c.name,
          subject: String(s.subject).trim(),
          subject_key: k,
          default_teacher_id: null,
          in_program: true,
          takvim_tarih: null,
          takvim_not: null
        });
      }
      if (s.teacher_id) {
        const tk = `${k}|${s.teacher_id}`;
        sayac.set(tk, (sayac.get(tk) || 0) + 1);
      }
    }
    for (const [k, row] of map) {
      let enIyi = null;
      let enCok = 0;
      for (const [tk, n] of sayac) {
        const [kk, tid] = tk.split('|');
        if (kk === k && n > enCok) {
          enIyi = tid;
          enCok = n;
        }
      }
      row.default_teacher_id = enIyi;
    }
    // 2) Ortak yazılı takvimi
    for (const sinav of takvimSinavlari(c.level)) {
      const row = map.get(sinav.key);
      if (row) {
        row.takvim_tarih = sinav.tarih;
        row.takvim_not = sinav.not || null;
      } else {
        map.set(sinav.key, {
          class_id: c.id,
          class_name: c.name,
          subject: sinav.ad,
          subject_key: sinav.key,
          default_teacher_id: null,
          in_program: false,
          takvim_tarih: sinav.tarih,
          takvim_not: sinav.not || null
        });
      }
    }
    // 3) Kaydedilmiş seçimler
    for (const s of saved || []) {
      if (s.class_id !== c.id) continue;
      const row = map.get(s.subject_key) || {
        class_id: c.id,
        class_name: c.name,
        subject: s.subject,
        subject_key: s.subject_key,
        default_teacher_id: null,
        in_program: false,
        takvim_tarih: null,
        takvim_not: null
      };
      row.saved = true;
      row.saved_exam_date = s.exam_date || null;
      row.saved_teacher_id = s.teacher_id;
      map.set(s.subject_key, row);
    }
    for (const row of map.values()) {
      const exam_date = row.saved ? row.saved_exam_date : row.takvim_tarih;
      const teacher_id = row.saved && row.saved_teacher_id != null ? row.saved_teacher_id || null : row.default_teacher_id;
      rows.push({
        class_id: row.class_id,
        class_name: row.class_name,
        subject: row.subject,
        subject_key: row.subject_key,
        in_program: row.in_program,
        teacher_id,
        exam_date,
        takvim_tarih: row.takvim_tarih,
        takvim_not: row.takvim_not,
        saved: Boolean(row.saved)
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.class_name.localeCompare(b.class_name, 'tr', { numeric: true }) ||
      String(a.exam_date || '9999').localeCompare(String(b.exam_date || '9999')) ||
      a.subject.localeCompare(b.subject, 'tr')
  );

  return { ayar, classes, teachers, rows, items, slots: slotsSade, sessions: sessionsSade };
}

export default async function handler(req, res) {
  try {
    const actor = requireAuthenticatedActor(req);
    const roles = await actorRoleSet(actor);
    const superAdmin = roleSetHasSuperAdmin(roles);
    if (!superAdmin && !roleSetHasAdmin(roles)) return hata(res, 403, 'forbidden', 'Bu sayfa yalnız yöneticiler içindir.');
    const kurumId = await kurumBelirle(req, actor, superAdmin);
    if (!kurumId) return hata(res, 400, 'kurum_yok', 'Hesabınız bir kuruma bağlı değil.');

    const op = String(req.query?.op || '').trim();

    if (req.method === 'GET') {
      const durum = await durumOku(kurumId);
      let institutions = [];
      if (superAdmin) {
        const { data } = await supabaseAdmin.from('institutions').select('id,name').order('name');
        institutions = (data || []).map((k) => ({ id: String(k.id), name: k.name || 'Kurum' }));
      }
      return res.status(200).json({
        institution_id: kurumId,
        institutions,
        takvim_adi: YAZILI_TAKVIMI.ad,
        ...durum
      });
    }

    if (req.method !== 'POST') return hata(res, 405, 'method_not_allowed');
    const body = parseBody(req);
    const simdi = new Date().toISOString();

    if (op === 'save-settings') {
      const ayar = ayariTemizle(body.ayar || body);
      const { error } = await supabaseAdmin
        .from(T_AYAR)
        .upsert({ institution_id: kurumId, payload: ayar, updated_by: actor.sub, updated_at: simdi });
      if (error) throw error;
      return res.status(200).json({ ayar });
    }

    if (op === 'save-exam') {
      const classId = String(body.class_id || '').trim();
      const subject = String(body.subject || '').replace(/\s+/g, ' ').trim().slice(0, 80);
      if (!classId || !subject) return hata(res, 400, 'eksik_alan', 'Sınıf ve ders gerekli.');
      if (!(await sinifiDogrula(kurumId, classId))) return hata(res, 403, 'forbidden');
      const examDate = body.exam_date ? String(body.exam_date).slice(0, 10) : null;
      if (examDate && !tarihMi(examDate)) return hata(res, 400, 'tarih_gecersiz', 'Yazılı tarihi geçersiz.');
      const { error } = await supabaseAdmin.from(T_SINAV).upsert(
        {
          institution_id: kurumId,
          class_id: classId,
          subject,
          subject_key: dersAnahtari(subject),
          exam_date: examDate,
          teacher_id: body.teacher_id == null ? null : String(body.teacher_id).trim(),
          updated_by: actor.sub,
          updated_at: simdi
        },
        { onConflict: 'class_id,subject_key' }
      );
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (op === 'add-item' || op === 'update-item') {
      const blok = blokCoz(`${saat(body.start_time)}-${saat(body.end_time)}`);
      if (!blok) return hata(res, 400, 'saat_gecersiz', 'Başlangıç ve bitiş saati geçersiz.');
      const lessonDate = String(body.lesson_date || '').slice(0, 10);
      if (!tarihMi(lessonDate)) return hata(res, 400, 'tarih_gecersiz', 'Ders tarihi geçersiz.');
      const teacherId = body.teacher_id ? String(body.teacher_id).trim() : null;
      if (op === 'add-item') {
        const classId = String(body.class_id || '').trim();
        const subject = String(body.subject || '').trim().slice(0, 80);
        if (!classId || !subject) return hata(res, 400, 'eksik_alan', 'Sınıf ve ders gerekli.');
        if (!(await sinifiDogrula(kurumId, classId))) return hata(res, 403, 'forbidden');
        const { data, error } = await supabaseAdmin
          .from(T_DERS)
          .insert({
            institution_id: kurumId,
            class_id: classId,
            subject,
            subject_key: dersAnahtari(subject),
            teacher_id: teacherId,
            lesson_date: lessonDate,
            start_time: blok.start,
            end_time: blok.end,
            status: 'draft',
            created_by: actor.sub
          })
          .select()
          .single();
        if (error) throw error;
        return res.status(200).json({ data });
      }
      const id = String(body.id || '').trim();
      const { data: mevcut } = await supabaseAdmin.from(T_DERS).select('*').eq('id', id).eq('institution_id', kurumId).maybeSingle();
      if (!mevcut) return hata(res, 404, 'not_found');
      if (mevcut.status !== 'draft') {
        return hata(res, 409, 'yayinlanmis', 'Yayınlanmış ders taşınamaz. Önce kaldırıp yeniden ekleyin.');
      }
      const { data, error } = await supabaseAdmin
        .from(T_DERS)
        .update({ lesson_date: lessonDate, start_time: blok.start, end_time: blok.end, teacher_id: teacherId, updated_at: simdi })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (op === 'delete-item') {
      const id = String(body.id || '').trim();
      const { data: mevcut } = await supabaseAdmin.from(T_DERS).select('*').eq('id', id).eq('institution_id', kurumId).maybeSingle();
      if (!mevcut) return hata(res, 404, 'not_found');
      if (mevcut.session_id) {
        const { error: cErr } = await supabaseAdmin
          .from('class_sessions')
          .update({ status: 'cancelled', updated_at: simdi })
          .eq('id', mevcut.session_id)
          .neq('status', 'cancelled');
        if (cErr) throw cErr;
      }
      const { error } = await supabaseAdmin.from(T_DERS).delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true, cancelled_session: Boolean(mevcut.session_id) });
    }

    if (op === 'clear-drafts') {
      const { data, error } = await supabaseAdmin
        .from(T_DERS)
        .delete()
        .eq('institution_id', kurumId)
        .eq('status', 'draft')
        .select('id');
      if (error) throw error;
      return res.status(200).json({ deleted: (data || []).length });
    }

    if (op === 'suggest') {
      const durum = await durumOku(kurumId);
      const { yeni, yerlesmeyen } = otomatikYerlestir({
        satirlar: durum.rows.map((r) => ({ ...r, target: durum.ayar.dersBasinaHazirlik })),
        ayar: durum.ayar,
        slots: durum.slots,
        sessions: durum.sessions,
        items: durum.items
      });
      if (yeni.length) {
        const { error } = await supabaseAdmin.from(T_DERS).insert(
          yeni.map((i) => ({ ...i, institution_id: kurumId, status: 'draft', created_by: actor.sub }))
        );
        if (error) throw error;
      }
      const sinifAd = new Map(durum.classes.map((c) => [c.id, c.name]));
      return res.status(200).json({
        eklenen: yeni.length,
        yerlesmeyen: yerlesmeyen.map((y) => ({ ...y, class_name: sinifAd.get(y.class_id) || 'Sınıf' }))
      });
    }

    if (op === 'mark-published') {
      const id = String(body.id || '').trim();
      const sessionId = String(body.session_id || '').trim();
      if (!id || !sessionId) return hata(res, 400, 'eksik_alan');
      const { data: oturum } = await supabaseAdmin.from('class_sessions').select('id,class_id').eq('id', sessionId).maybeSingle();
      const { data: mevcut } = await supabaseAdmin.from(T_DERS).select('id,class_id').eq('id', id).eq('institution_id', kurumId).maybeSingle();
      if (!oturum || !mevcut || oturum.class_id !== mevcut.class_id) return hata(res, 400, 'eslesmiyor');
      const { error } = await supabaseAdmin
        .from(T_DERS)
        .update({ status: 'published', session_id: sessionId, updated_at: simdi })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return hata(res, 400, 'bilinmeyen_islem');
  } catch (e) {
    const msg = errorMessage(e);
    if (/missing token|invalid token|token expired|invalid signature/i.test(msg)) {
      return res.status(401).json({ error: msg });
    }
    console.error('[yazili-program]', req.method, String(req.query?.op || ''), msg);
    return res.status(500).json({ error: msg, hint: msg });
  }
}
