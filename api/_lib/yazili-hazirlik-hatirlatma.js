/**
 * Yazılıya hazırlık — PDF yüklemeyen öğretmene WhatsApp hatırlatması.
 *
 * Kimlere: yazılıya hazırlık dersi planlanmış (canlı derste "(Yazılıya Hazırlık)"
 * eki olan, bugün veya sonrası) ve o sınıfa henüz hiç PDF yüklememiş öğretmenler.
 * Ders adı eşleşmesi aranmaz: öğretmen o sınıfa herhangi bir PDF yüklediyse
 * hatırlatma gitmez (ör. "Edebiyat" dersi "Türk Dili ve Edebiyatı" olarak yüklenmiş olabilir).
 *
 * Gönderim, öğretmen ders hatırlatmalarıyla aynı hattan çıkar (panelde seçilen
 * hat → süper admin hattı). Mesaj düz metindir; Meta şablon onayı gerekmez.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { getIstanbulDateString } from './istanbul-time.js';
import { normalizePhoneToE164 } from './phone-whatsapp.js';
import { renderMessageTemplate } from './template-engine.js';
import { insertWhatsAppAutomationLog } from './message-log.js';
import { waitAutoSendGap } from './whatsapp-gateway-send.js';
import { YAZILI_HAZIRLIK_TABLE } from './yazili-hazirlik.js';
import {
  dispatchTeacherReminder,
  loadTeacherReminderSettings,
  loadTeachersById,
  resolveTeacherReminderSession
} from './teacher-lesson-reminder-job.js';

export const YAZILI_HATIRLATMA_KIND = 'yazili_hazirlik_pdf_hatirlatma';
export const HAZIRLIK_EKI = '(Yazılıya Hazırlık)';
export const MAX_TEK_GONDERIM = 40;

export const VARSAYILAN_METIN = `Değerli Öğretmenimiz {{ogretmen_adi}},
Yazılıya hazırlık PDF çalışmalarınızın henüz sisteme yüklenmediği görülmektedir. PDF'lerinizi en kısa sürede sisteme yüklemenizi ve yükleme sonrasında bilgi vermenizi önemle rica ederiz.
Online VIP Dershane Yönetimi`;

/** "CEYHUN ÖĞRENENEFE" / "HURİ  BALCI" → "Ceyhun Öğrenenefe" / "Huri Balcı" */
export function ogretmenAdiBicimle(ad) {
  return String(ad || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((k) => {
      const kucuk = k.toLocaleLowerCase('tr');
      return kucuk.charAt(0).toLocaleUpperCase('tr') + kucuk.slice(1);
    })
    .join(' ');
}

export function dersAdi(subject) {
  return String(subject || '')
    .replace(HAZIRLIK_EKI, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Saf hesap (DB'siz, test edilir).
 * @returns {{ teacher_id, teacher_name, phone_ok, eksikler: {class_id,class_name,ders,ilk_ders}[], last_sent }[]}
 */
export function hatirlatmaListesi({ sessions, files, classes, users, sonGonderim = new Map() }) {
  const sinif = new Map(classes.map((c) => [String(c.id), c]));
  const kullanici = new Map(users.map((u) => [String(u.id), u]));
  const yukleyen = new Set(files.map((f) => `${f.class_id}::${f.teacher_user_id}`));

  const ogretmenler = new Map();
  for (const s of sessions) {
    const tid = String(s.teacher_id || '').trim();
    const cid = String(s.class_id || '').trim();
    if (!tid || !cid || !sinif.has(cid)) continue;
    const u = kullanici.get(tid);
    if (!u || u.is_active === false) continue;
    if (yukleyen.has(`${cid}::${tid}`)) continue;

    if (!ogretmenler.has(tid)) {
      ogretmenler.set(tid, {
        teacher_id: tid,
        teacher_name: String(u.name || '').trim() || 'Öğretmen',
        phone_ok: Boolean(normalizePhoneToE164(u.phone || '')),
        eksikler: new Map(),
        last_sent: sonGonderim.get(tid) || null
      });
    }
    const o = ogretmenler.get(tid);
    const ders = dersAdi(s.subject);
    const k = `${cid}::${ders.toLocaleLowerCase('tr')}`;
    const tarih = String(s.lesson_date || '').slice(0, 10);
    const mevcut = o.eksikler.get(k);
    if (!mevcut) {
      o.eksikler.set(k, { class_id: cid, class_name: sinif.get(cid)?.name || 'Sınıf', ders, ilk_ders: tarih || null });
    } else if (tarih && (!mevcut.ilk_ders || tarih < mevcut.ilk_ders)) {
      mevcut.ilk_ders = tarih;
    }
  }

  return [...ogretmenler.values()]
    .map((o) => ({
      ...o,
      eksikler: [...o.eksikler.values()].sort(
        (a, b) =>
          String(a.ilk_ders || '').localeCompare(String(b.ilk_ders || '')) ||
          a.class_name.localeCompare(b.class_name, 'tr', { numeric: true })
      )
    }))
    .sort(
      (a, b) =>
        String(a.eksikler[0]?.ilk_ders || '').localeCompare(String(b.eksikler[0]?.ilk_ders || '')) ||
        a.teacher_name.localeCompare(b.teacher_name, 'tr')
    );
}

async function sonGonderimleri(teacherIds) {
  const out = new Map();
  if (!teacherIds.length) return out;
  const { data, error } = await supabaseAdmin
    .from('message_logs')
    .select('related_id,sent_at')
    .eq('kind', YAZILI_HATIRLATMA_KIND)
    .eq('status', 'sent')
    .in('related_id', teacherIds)
    .order('sent_at', { ascending: false })
    .limit(1000);
  if (error) {
    console.warn('[yazili-hatirlatma] son gönderim okunamadı', error.message);
    return out;
  }
  for (const r of data || []) {
    const id = String(r.related_id || '');
    if (id && !out.has(id)) out.set(id, r.sent_at || null);
  }
  return out;
}

/** Yönetici: kurumundaki (süper admin: tüm) hatırlatılacak öğretmenler. */
export async function yaziliHatirlatmaListesi({ institutionId = null, allInstitutions = false } = {}) {
  let cq = supabaseAdmin.from('classes').select('id,name,institution_id');
  if (!allInstitutions) cq = cq.eq('institution_id', institutionId);
  const { data: classes, error: ce } = await cq;
  if (ce) throw ce;
  const classIds = (classes || []).map((c) => String(c.id));
  if (!classIds.length) return { teachers: [], template: VARSAYILAN_METIN };

  const bugun = getIstanbulDateString();
  const sessions = [];
  const files = [];
  for (let i = 0; i < classIds.length; i += 300) {
    const grup = classIds.slice(i, i + 300);
    const { data: s, error: se } = await supabaseAdmin
      .from('class_sessions')
      .select('class_id,teacher_id,subject,lesson_date,status')
      .in('class_id', grup)
      .ilike('subject', `%${HAZIRLIK_EKI}%`)
      .eq('status', 'scheduled')
      .gte('lesson_date', bugun);
    if (se) throw se;
    sessions.push(...(s || []));
    const { data: f, error: fe } = await supabaseAdmin
      .from(YAZILI_HAZIRLIK_TABLE)
      .select('class_id,teacher_user_id')
      .in('class_id', grup);
    if (fe) throw fe;
    files.push(...(f || []));
  }

  const teacherIds = [...new Set(sessions.map((s) => String(s.teacher_id || '')).filter(Boolean))];
  const users = [];
  for (let i = 0; i < teacherIds.length; i += 300) {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id,name,phone,is_active')
      .in('id', teacherIds.slice(i, i + 300));
    if (error) throw error;
    users.push(...(data || []));
  }
  // users.phone boşsa koç kaydındaki telefona bakılır (ders hatırlatmasıyla aynı kural)
  const telefonlu = await loadTeachersById(teacherIds);
  for (const u of users) {
    const t = telefonlu.get(String(u.id));
    if (t?.phone && !normalizePhoneToE164(u.phone || '')) u.phone = t.phone;
  }

  const sonGonderim = await sonGonderimleri(teacherIds);
  const teachers = hatirlatmaListesi({
    sessions: sessions.map((s) => ({ ...s, class_id: String(s.class_id), teacher_id: String(s.teacher_id || '') })),
    files: files.map((f) => ({ class_id: String(f.class_id), teacher_user_id: String(f.teacher_user_id) })),
    classes: classes || [],
    users,
    sonGonderim
  });
  return { teachers, template: VARSAYILAN_METIN };
}

/**
 * Seçilen öğretmenlere gönderir. Yalnızca o anki listede olanlara gider
 * (başka kurumun öğretmenine veya PDF'ini yüklemiş öğretmene gönderilemez).
 */
export async function yaziliHatirlatmaGonder({ institutionId, allInstitutions, teacherIds, metin, gonderenId }) {
  const icerik = String(metin || '').trim() || VARSAYILAN_METIN;
  const { teachers } = await yaziliHatirlatmaListesi({ institutionId, allInstitutions });
  const listede = new Map(teachers.map((t) => [t.teacher_id, t]));
  const istenen = [...new Set((teacherIds || []).map((x) => String(x || '').trim()).filter(Boolean))];
  if (!istenen.length) return { ok: false, error: 'Öğretmen seçilmedi.' };
  if (istenen.length > MAX_TEK_GONDERIM) {
    return { ok: false, error: `Tek seferde en fazla ${MAX_TEK_GONDERIM} öğretmene gönderilebilir.` };
  }

  const settings = await loadTeacherReminderSettings();
  if (settings.channel !== 'meta') {
    const oturum = await resolveTeacherReminderSession(settings);
    if (!oturum.sessionId) {
      return {
        ok: false,
        error:
          'Gönderim için bağlı WhatsApp hattı yok. Süper admin hesabından WhatsApp hattını QR ile bağlayın veya Öğretmen Ders Hatırlatma ayarlarından bir hat seçin.'
      };
    }
    settings.resolvedSessionId = oturum.sessionId;
  }

  const telefonlar = await loadTeachersById(istenen);
  const logDate = getIstanbulDateString();
  const sonuclar = [];
  let ilk = true;
  for (const id of istenen) {
    const t = listede.get(id);
    if (!t) {
      sonuclar.push({ teacher_id: id, ok: false, error: 'Listede değil (PDF yüklemiş veya planlı dersi yok).' });
      continue;
    }
    const phone = normalizePhoneToE164(telefonlar.get(id)?.phone || '');
    if (!phone) {
      sonuclar.push({ teacher_id: id, teacher_name: t.teacher_name, ok: false, error: 'Öğretmenin telefon numarası kayıtlı değil.' });
      continue;
    }
    const text = renderMessageTemplate(icerik, { ogretmen_adi: ogretmenAdiBicimle(t.teacher_name) }).trim();
    if (!ilk) await waitAutoSendGap();
    ilk = false;
    let r;
    try {
      r = await dispatchTeacherReminder({ phone, text, settings });
    } catch (e) {
      r = { ok: false, error: e instanceof Error ? e.message : 'Gönderilemedi' };
    }
    await insertWhatsAppAutomationLog({
      studentId: null,
      relatedId: id,
      kind: YAZILI_HATIRLATMA_KIND,
      message: text,
      status: r.ok ? 'sent' : 'failed',
      logCode: r.ok ? null : r.errorCode || 'SEND_FAILED',
      error: r.ok ? null : `${r.error || 'Gönderilemedi'}${gonderenId ? ` · gönderen=${gonderenId}` : ''}`,
      phone,
      logDate,
      meta_message_id: r.sid || r.meta_message_id || null
    });
    sonuclar.push({
      teacher_id: id,
      teacher_name: t.teacher_name,
      ok: Boolean(r.ok),
      error: r.ok ? undefined : r.error || 'Gönderilemedi'
    });
  }

  return {
    ok: true,
    gonderilen: sonuclar.filter((s) => s.ok).length,
    basarisiz: sonuclar.filter((s) => !s.ok).length,
    sonuclar
  };
}
