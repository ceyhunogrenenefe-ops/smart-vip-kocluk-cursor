/**
 * Sözleşme kapsama denetimi: sınıflarda tanımlı olup sözleşmesi olmayan
 * öğrencileri bulur.
 *
 * NEDEN AD EŞLEŞMESİ DE GEREKİYOR
 * parent_sign_contracts.student_id çoğu satırda dolu değil (ölçüldü:
 * 83 sözleşmenin 66'sında dolu). Yalnız student_id'ye bakılırsa, adı
 * geçen ama bağı kurulmamış sözleşmeler "yok" sayılır ve öğretmene
 * zaten var olan sözleşme için ikinci kez kayıt açtırılır. Bu yüzden
 * student_id VE normalleştirilmiş ad-soyad birlikte kontrol edilir.
 *
 * Denetim salt okunurdur; hiçbir sözleşme otomatik oluşturulmaz.
 * Sözleşme ücret, taksit ve veli beyanı içeren bir belgedir; eksik
 * veriyle toplu üretilirse geçersiz belge yığını oluşur.
 */

/** Sözleşmesi olması beklenmeyen kayıt durumları */
const KAPSAM_DISI_DURUM = new Set(['withdrawn', 'cancelled', 'canceled', 'passive', 'inactive']);

/**
 * Ad-soyad karşılaştırma anahtarı.
 * Türkçe büyük/küçük ("İSMAİL" ↔ "ismail"), çoklu boşluk ve
 * noktalama farkları aynı kişiyi iki ayrı kişi göstermesin.
 */
export function adAnahtari(ham) {
  const t = String(ham == null ? '' : ham).trim();
  if (!t) return '';
  return t
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sözleşme satırından öğrenci ad anahtarı */
export function sozlesmeAdAnahtari(contract) {
  const ad = String(contract?.ogrenci_ad || '').trim();
  const soyad = String(contract?.ogrenci_soyad || '').trim();
  return adAnahtari(`${ad} ${soyad}`);
}

/**
 * Eksik sözleşmeleri hesaplar. Saf fonksiyon — test edilebilir olsun diye
 * veritabanı erişimi dışarıda bırakıldı.
 *
 * @param {object} girdi
 * @param {Array} girdi.students         {id, name, class_level, enrollment_status}
 * @param {Array} girdi.classStudents    {class_id, student_id}
 * @param {Array} girdi.contracts        {student_id, ogrenci_ad, ogrenci_soyad, status}
 * @param {Array} girdi.paymentRecords   {student_id, external_student_name, installment_group_id}
 */
export function kapsamaHesapla({ students = [], classStudents = [], contracts = [], paymentRecords = [] }) {
  const sozlesmeStudentId = new Set();
  const sozlesmeAd = new Set();
  for (const c of contracts) {
    const sid = String(c?.student_id || '').trim();
    if (sid) sozlesmeStudentId.add(sid);
    const ad = sozlesmeAdAnahtari(c);
    if (ad) sozlesmeAd.add(ad);
  }

  // Öğrencinin ödemesi / taksiti var mı
  const odemesiVar = new Set();
  const taksitiVar = new Set();
  for (const p of paymentRecords) {
    const sid = String(p?.student_id || '').trim();
    const adi = adAnahtari(p?.external_student_name);
    for (const k of [sid, adi]) {
      if (!k) continue;
      odemesiVar.add(k);
      if (p?.installment_group_id || Number(p?.installment_no) > 0) taksitiVar.add(k);
    }
  }

  const ogrenciById = new Map();
  for (const s of students) {
    const id = String(s?.id || '').trim();
    if (id) ogrenciById.set(id, s);
  }

  // Aynı öğrenci birkaç sınıfta olabilir; tek satır üretilir
  const sinifIdleri = new Map();
  for (const cs of classStudents) {
    const sid = String(cs?.student_id || '').trim();
    if (!sid) continue;
    if (!sinifIdleri.has(sid)) sinifIdleri.set(sid, new Set());
    const ci = String(cs?.class_id || '').trim();
    if (ci) sinifIdleri.get(sid).add(ci);
  }

  const eksik = [];
  let kapsamDisi = 0;
  let sozlesmeli = 0;

  for (const [sid, classIds] of sinifIdleri) {
    const st = ogrenciById.get(sid);
    if (!st) continue; // sınıfta kalmış artık kaydı olmayan öğrenci
    const durum = String(st.enrollment_status || '').trim().toLowerCase();
    const ad = adAnahtari(st.name);

    if (sozlesmeStudentId.has(sid) || (ad && sozlesmeAd.has(ad))) {
      sozlesmeli += 1;
      continue;
    }
    if (KAPSAM_DISI_DURUM.has(durum)) {
      kapsamDisi += 1;
      continue;
    }
    eksik.push({
      student_id: sid,
      name: String(st.name || '').trim() || '(İsimsiz)',
      class_level: st.class_level != null ? String(st.class_level) : null,
      enrollment_status: durum || null,
      class_count: classIds.size,
      odemesi_var: odemesiVar.has(sid) || (ad ? odemesiVar.has(ad) : false),
      taksiti_var: taksitiVar.has(sid) || (ad ? taksitiVar.has(ad) : false)
    });
  }

  // Taksiti olan en üstte: kullanıcının açıkça istediği öncelik
  eksik.sort((a, b) => {
    if (a.taksiti_var !== b.taksiti_var) return a.taksiti_var ? -1 : 1;
    if (a.odemesi_var !== b.odemesi_var) return a.odemesi_var ? -1 : 1;
    return String(a.name).localeCompare(String(b.name), 'tr');
  });

  return {
    sinifta_tanimli: sinifIdleri.size,
    sozlesmeli,
    kapsam_disi: kapsamDisi,
    eksik_toplam: eksik.length,
    taksiti_var_sozlesmesiz: eksik.filter((x) => x.taksiti_var).length,
    odemesi_var_sozlesmesiz: eksik.filter((x) => x.odemesi_var).length,
    eksik
  };
}

/** Denetimi veritabanından besler. Yalnızca SELECT yapar. */
export async function fetchSozlesmeKapsama({ institutionId, limit = 600 } = {}) {
  const n = Math.min(2000, Math.max(50, Number(limit) || 600));
  // Tembel yukleme: saf hesaplama (kapsamaHesapla) veritabani ortam
  // degiskeni olmadan da yuklenebilsin; testler ve dogrulama betikleri
  // supabase-admin'e bagimli kalmasin.
  const { supabaseAdmin } = await import('./supabase-admin.js');

  let sq = supabaseAdmin
    .from('students')
    .select('id,name,class_level,enrollment_status,institution_id')
    .limit(n);
  if (institutionId) sq = sq.eq('institution_id', institutionId);
  const { data: students, error: sErr } = await sq;
  if (sErr) throw sErr;

  const ids = (students || []).map((s) => String(s.id)).filter(Boolean);
  let classStudents = [];
  if (ids.length) {
    const { data, error } = await supabaseAdmin
      .from('class_students')
      .select('class_id,student_id')
      .in('student_id', ids)
      .limit(4000);
    if (error) throw error;
    classStudents = data || [];
  }

  let cq = supabaseAdmin
    .from('parent_sign_contracts')
    .select('id,student_id,ogrenci_ad,ogrenci_soyad,status')
    .limit(2000);
  if (institutionId) cq = cq.eq('institution_id', institutionId);
  const { data: contracts, error: cErr } = await cq;
  if (cErr) throw cErr;

  let pq = supabaseAdmin
    .from('student_payment_records')
    .select('student_id,external_student_name,installment_group_id,installment_no')
    .limit(4000);
  if (institutionId) pq = pq.eq('institution_id', institutionId);
  const { data: payments, error: pErr } = await pq;
  if (pErr) throw pErr;

  return kapsamaHesapla({
    students: students || [],
    classStudents,
    contracts: contracts || [],
    paymentRecords: payments || []
  });
}
