/**
 * Yazılıya hazırlık — yönetici takip raporu.
 * Satır: kurum + sınıf + ders + öğretmen; kaç çalışma yüklendiği, dönem/yazılı dağılımı,
 * son yükleme. Ders programında olup hiç yüklemeyenler de 0 ile listelenir.
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

const dersAnahtari = (d) => String(d || '').trim().toLocaleLowerCase('tr');

/**
 * Saf hesap: test edilebilir (DB'siz).
 * Satır = kurum + sınıf + ders + öğretmen. Ders bilgisi yüklenen dosyadan, yükleme yoksa
 * haftalık ders programından (class_weekly_slots) gelir; programda da yoksa ders boş kalır.
 */
export function raporuOlustur({ institutions, classes, classTeachers, slots = [], users, files }) {
  const kurumAd = new Map(institutions.map((k) => [String(k.id), k.name || 'Kurum']));
  const sinif = new Map(classes.map((c) => [String(c.id), c]));
  const kullanici = new Map(users.map((u) => [String(u.id), u]));
  const aktif = (id) => {
    const u = kullanici.get(String(id));
    return Boolean(u) && u.is_active !== false;
  };

  const satirlar = new Map();
  const satirAl = (classId, ogretmenId, ders) => {
    const c = sinif.get(String(classId));
    const kurumId = String(c?.institution_id || '');
    const k = `${kurumId}::${classId}::${ogretmenId}::${dersAnahtari(ders)}`;
    if (!satirlar.has(k)) {
      const u = kullanici.get(String(ogretmenId));
      satirlar.set(k, {
        key: k,
        institution_id: kurumId,
        institution_name: kurumAd.get(kurumId) || 'Kurum',
        class_id: String(classId),
        class_name: c?.name || 'Sınıf',
        teacher_id: String(ogretmenId),
        teacher_name: u?.name || 'Bilinmeyen kullanıcı',
        subject: String(ders || '').trim(),
        total: 0,
        by_slot: { '1-1': 0, '1-2': 0, '2-1': 0, '2-2': 0 },
        last_upload: null
      });
    }
    return satirlar.get(k);
  };

  // 1) Yüklenen dosyalar
  const dosyalar = [];
  for (const f of files) {
    const satir = satirAl(f.class_id, f.teacher_user_id, f.subject);
    satir.total += 1;
    const yk = `${f.donem}-${f.yazili}`;
    if (yk in satir.by_slot) satir.by_slot[yk] += 1;
    const t = f.updated_at || f.created_at;
    if (t && (!satir.last_upload || t > satir.last_upload)) satir.last_upload = t;
    dosyalar.push({
      id: f.id,
      row_key: satir.key,
      class_name: satir.class_name,
      subject: f.subject,
      donem: f.donem,
      yazili: f.yazili,
      calisma: f.calisma,
      file_name: f.file_name,
      updated_at: t
    });
  }

  // 2) Ders programındaki sınıf-ders-öğretmen (yükleme yoksa 0)
  const programli = new Set();
  for (const sl of slots) {
    if (!sl.teacher_id || !sinif.has(String(sl.class_id)) || !aktif(sl.teacher_id)) continue;
    const ders = String(sl.subject || '').trim();
    if (!ders) continue;
    satirAl(sl.class_id, sl.teacher_id, ders);
    programli.add(`${sl.class_id}::${sl.teacher_id}`);
  }

  // 3) Sınıfa atanmış ama programda dersi olmayan ve hiç yüklememiş öğretmen
  const yukleyen = new Set(files.map((f) => `${f.class_id}::${f.teacher_user_id}`));
  for (const ct of classTeachers) {
    const k = `${ct.class_id}::${ct.teacher_id}`;
    if (!sinif.has(String(ct.class_id)) || !aktif(ct.teacher_id)) continue;
    if (programli.has(k) || yukleyen.has(k)) continue;
    satirAl(ct.class_id, ct.teacher_id, '');
  }

  const rows = [...satirlar.values()].sort(
    (a, b) =>
      a.institution_name.localeCompare(b.institution_name, 'tr') ||
      a.class_name.localeCompare(b.class_name, 'tr', { numeric: true }) ||
      a.subject.localeCompare(b.subject, 'tr') ||
      a.teacher_name.localeCompare(b.teacher_name, 'tr')
  );

  const kullanilanKurumlar = new Set(rows.map((r) => r.institution_id));
  return {
    institutions: institutions
      .filter((k) => kullanilanKurumlar.has(String(k.id)))
      .map((k) => ({ id: String(k.id), name: k.name || 'Kurum' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    rows,
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
  const slots = [];
  const files = [];
  for (const grup of parcala(classIds)) {
    classTeachers.push(
      ...(await hepsiniOku(() =>
        supabaseAdmin.from('class_teachers').select('class_id,teacher_id').in('class_id', grup).order('class_id')
      ))
    );
    slots.push(
      ...(await hepsiniOku(() =>
        supabaseAdmin.from('class_weekly_slots').select('class_id,teacher_id,subject').in('class_id', grup).order('id')
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
    ...new Set(
      [...classTeachers.map((r) => r.teacher_id), ...slots.map((r) => r.teacher_id), ...files.map((f) => f.teacher_user_id)]
        .filter(Boolean)
        .map(String)
    )
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

  return raporuOlustur({ institutions, classes, classTeachers, slots, users, files });
}
