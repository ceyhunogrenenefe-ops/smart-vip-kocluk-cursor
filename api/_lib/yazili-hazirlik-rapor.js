/**
 * Yazılıya hazırlık — yönetici takip raporu.
 * Kurum bazında: sınıfa atanmış her öğretmen ve yükleme yapan herkes, kaç çalışma yüklediği,
 * hangi dönem/yazılıya yüklediği ve son yükleme zamanı. Hiç yüklemeyenler de 0 ile listelenir.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { YAZILI_HAZIRLIK_TABLE } from './yazili-hazirlik.js';

const SAYFA = 1000;

async function hepsiniOku(build) {
  const out = [];
  for (let from = 0; ; from += SAYFA) {
    const { data, error } = await build().range(from, from + SAYFA - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < SAYFA) break;
  }
  return out;
}

function parcala(list, size = 300) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Saf hesap: test edilebilir (DB'siz). */
export function raporuOlustur({ institutions, classes, classTeachers, users, files }) {
  const kurumAd = new Map(institutions.map((k) => [String(k.id), k.name || 'Kurum']));
  const sinif = new Map(classes.map((c) => [String(c.id), c]));
  const kullanici = new Map(users.map((u) => [String(u.id), u]));

  const anahtar = (kurumId, ogretmenId) => `${kurumId}::${ogretmenId}`;
  const satirlar = new Map();
  const satirAl = (kurumId, ogretmenId) => {
    const k = anahtar(kurumId, ogretmenId);
    if (!satirlar.has(k)) {
      const u = kullanici.get(ogretmenId);
      satirlar.set(k, {
        institution_id: kurumId,
        institution_name: kurumAd.get(kurumId) || 'Kurum',
        teacher_id: ogretmenId,
        teacher_name: u?.name || 'Bilinmeyen kullanıcı',
        teacher_active: u ? u.is_active !== false : false,
        classes: new Set(),
        subjects: new Set(),
        total: 0,
        by_slot: { '1-1': 0, '1-2': 0, '2-1': 0, '2-2': 0 },
        last_upload: null
      });
    }
    return satirlar.get(k);
  };

  for (const ct of classTeachers) {
    const c = sinif.get(String(ct.class_id));
    if (!c) continue;
    const u = kullanici.get(String(ct.teacher_id));
    if (!u || u.is_active === false) continue;
    const satir = satirAl(String(c.institution_id || ''), String(ct.teacher_id));
    satir.classes.add(c.name || 'Sınıf');
  }

  const dosyalar = [];
  for (const f of files) {
    const c = sinif.get(String(f.class_id));
    const kurumId = String(c?.institution_id || f.institution_id || '');
    const satir = satirAl(kurumId, String(f.teacher_user_id));
    if (c?.name) satir.classes.add(c.name);
    satir.subjects.add(f.subject);
    satir.total += 1;
    const yk = `${f.donem}-${f.yazili}`;
    if (yk in satir.by_slot) satir.by_slot[yk] += 1;
    const t = f.updated_at || f.created_at;
    if (t && (!satir.last_upload || t > satir.last_upload)) satir.last_upload = t;
    dosyalar.push({
      id: f.id,
      institution_id: kurumId,
      teacher_id: String(f.teacher_user_id),
      class_name: c?.name || 'Sınıf',
      subject: f.subject,
      donem: f.donem,
      yazili: f.yazili,
      calisma: f.calisma,
      file_name: f.file_name,
      updated_at: t
    });
  }

  const teachers = [...satirlar.values()]
    .map((s) => ({
      ...s,
      classes: [...s.classes].sort((a, b) => a.localeCompare(b, 'tr')),
      subjects: [...s.subjects].sort((a, b) => a.localeCompare(b, 'tr'))
    }))
    .sort(
      (a, b) =>
        a.institution_name.localeCompare(b.institution_name, 'tr') ||
        b.total - a.total ||
        a.teacher_name.localeCompare(b.teacher_name, 'tr')
    );

  const kullanilanKurumlar = new Set(teachers.map((t) => t.institution_id));
  return {
    institutions: institutions
      .filter((k) => kullanilanKurumlar.has(String(k.id)))
      .map((k) => ({ id: String(k.id), name: k.name || 'Kurum' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    teachers,
    files: dosyalar.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  };
}

export async function yaziliHazirlikRaporu({ institutionId = null, allInstitutions = false } = {}) {
  const classes = await hepsiniOku(() => {
    let q = supabaseAdmin.from('classes').select('id,name,institution_id').order('id');
    if (!allInstitutions) q = q.eq('institution_id', institutionId);
    return q;
  });
  const classIds = classes.map((c) => c.id);

  const classTeachers = [];
  const files = [];
  for (const grup of parcala(classIds)) {
    classTeachers.push(
      ...(await hepsiniOku(() =>
        supabaseAdmin.from('class_teachers').select('class_id,teacher_id').in('class_id', grup).order('class_id')
      ))
    );
    files.push(
      ...(await hepsiniOku(() =>
        supabaseAdmin
          .from(YAZILI_HAZIRLIK_TABLE)
          .select('id,class_id,institution_id,teacher_user_id,subject,donem,yazili,calisma,file_name,created_at,updated_at')
          .in('class_id', grup.map(String))
          .order('id')
      ))
    );
  }

  const userIds = [
    ...new Set([...classTeachers.map((r) => r.teacher_id), ...files.map((f) => f.teacher_user_id)].filter(Boolean).map(String))
  ];
  const users = [];
  for (const grup of parcala(userIds)) {
    const { data, error } = await supabaseAdmin.from('users').select('id,name,is_active').in('id', grup);
    if (error) throw error;
    users.push(...(data || []));
  }

  const kurumIds = [...new Set(classes.map((c) => c.institution_id).filter(Boolean).map(String))];
  const institutions = [];
  for (const grup of parcala(kurumIds)) {
    const { data, error } = await supabaseAdmin.from('institutions').select('id,name').in('id', grup);
    if (error) throw error;
    institutions.push(...(data || []));
  }

  return raporuOlustur({ institutions, classes, classTeachers, users, files });
}
