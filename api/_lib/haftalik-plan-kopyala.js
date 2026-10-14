/**
 * Haftalık planı başka bir haftaya kopyalama.
 *
 * NE KOPYALANIR
 *   ders/branş (subject), görev başlığı, çalışma saatleri (start/end),
 *   soru çözüm hedefi (planned_quantity) ve günün hafta içindeki yeri.
 *
 * NE KOPYALANMAZ — ve nedeni
 *   completed_quantity, status  : geçmiş haftanın gerçekleşmesi. Yeni
 *                                 haftanın görevi başlangıç durumunda açılır.
 *   weekly_entry_id             : o haftanın gerçekleşen çalışma kaydı.
 *   homework_id                 : ödev kaydı kendi haftasına ait; bağ
 *                                 taşınırsa yeni görev eski ödeve işler.
 *   coach_goal_id               : coach_weekly_goals.week_start_date ile
 *                                 haftaya bağlı; taşınırsa yeni haftanın
 *                                 çalışması eski haftanın hedefine yazılır.
 *
 * Tarihler metin olarak kaydırılır (YYYY-AA-GG). Date nesnesiyle gün
 * eklemek saat dilimi ve yaz saati yüzünden bir gün kaydırabiliyor.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Yerel takvimde gün ekler; saat dilimine bağlı değildir. */
export function tarihKaydir(ymd, gun) {
  const s = String(ymd || '').slice(0, 10);
  if (!YMD.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + Math.round(Number(gun) || 0));
  const yy = t.getUTCFullYear();
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(t.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Haftanın pazartesisi (hafta pazartesi başlar) */
export function haftaBasi(ymd) {
  const s = String(ymd || '').slice(0, 10);
  if (!YMD.test(s)) return null;
  const [y, m, d] = s.split('-').map((x) => parseInt(x, 10));
  const t = new Date(Date.UTC(y, m - 1, d));
  const gun = t.getUTCDay(); // 0 pazar
  const geri = gun === 0 ? 6 : gun - 1;
  return tarihKaydir(s, -geri);
}

/** İki tarih arasındaki gün farkı */
export function gunFarki(a, b) {
  const x = String(a || '').slice(0, 10);
  const y = String(b || '').slice(0, 10);
  if (!YMD.test(x) || !YMD.test(y)) return null;
  const [ay, am, ad] = x.split('-').map((n) => parseInt(n, 10));
  const [by, bm, bd] = y.split('-').map((n) => parseInt(n, 10));
  const t1 = Date.UTC(ay, am - 1, ad);
  const t2 = Date.UTC(by, bm - 1, bd);
  return Math.round((t2 - t1) / 86400000);
}

function dakika(t) {
  const s = String(t || '').trim();
  const [h, m] = s.split(':').map((x) => parseInt(String(x || '0'), 10));
  if (!Number.isFinite(h)) return null;
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

/** İki görevin saatleri çakışıyor mu (aynı gün varsayılır) */
export function zamanCakisiyorMu(a, b) {
  const a1 = dakika(a?.start_time);
  const a2 = dakika(a?.end_time);
  const b1 = dakika(b?.start_time);
  const b2 = dakika(b?.end_time);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  return a1 < b2 && b1 < a2;
}

/**
 * Kaynak haftadaki görevlerden hedef hafta için yeni kayıtlar üretir.
 *
 * @param {Array} satirlar weekly_planner_entries satırları
 * @param {object} secenek
 * @param {string} secenek.hedefHaftaBasi YYYY-AA-GG (pazartesi)
 * @param {string} [secenek.kaynakHaftaBasi] verilmezse satırlardan bulunur
 * @param {() => string} [secenek.idUret] test edilebilirlik için
 */
export function planKopyasiUret(satirlar, secenek = {}) {
  const liste = Array.isArray(satirlar) ? satirlar : [];
  const hedef = String(secenek.hedefHaftaBasi || '').slice(0, 10);
  if (!YMD.test(hedef)) return { kopyalar: [], atlanan: liste.length, hata: 'hedef_hafta_gecersiz' };

  let kaynak = String(secenek.kaynakHaftaBasi || '').slice(0, 10);
  if (!YMD.test(kaynak)) {
    const ilk = liste.map((r) => String(r?.planner_date || '').slice(0, 10)).filter((d) => YMD.test(d)).sort()[0];
    kaynak = ilk ? haftaBasi(ilk) : null;
  }
  if (!kaynak) return { kopyalar: [], atlanan: liste.length, hata: 'kaynak_hafta_bulunamadi' };

  const kayma = gunFarki(kaynak, hedef);
  const idUret =
    typeof secenek.idUret === 'function'
      ? secenek.idUret
      : () => `wpe-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  const kopyalar = [];
  let atlanan = 0;
  for (const r of liste) {
    const d = String(r?.planner_date || '').slice(0, 10);
    if (!YMD.test(d) || !r?.start_time || !r?.end_time) {
      atlanan += 1;
      continue;
    }
    const plan = Number(r.planned_quantity);
    kopyalar.push({
      id: idUret(),
      student_id: r.student_id,
      institution_id: r.institution_id ?? null,
      subject: r.subject ?? '',
      title: r.title ?? '',
      planned_quantity: Number.isFinite(plan) && plan >= 0 ? plan : 0,
      planner_date: tarihKaydir(d, kayma),
      start_time: r.start_time,
      end_time: r.end_time,
      // Geçmiş haftanın gerçekleşmesi taşınmaz
      completed_quantity: 0,
      status: 'planned',
      coach_goal_id: null,
      weekly_entry_id: null,
      homework_id: null,
      /** Önizlemede "nereden geldi" gösterimi için; veritabanına yazılmaz */
      _kaynak_id: r.id,
      _kaynak_tarih: d
    });
  }
  return { kopyalar, atlanan, kaynakHaftaBasi: kaynak, hedefHaftaBasi: hedef, kayma };
}

/**
 * Hedef haftada zaten görev varsa çakışanları ayırır.
 * 'birlestir' kipinde yalnız çakışmayanlar eklenir.
 */
export function cakismalariAyikla(kopyalar, mevcutlar) {
  const mevcutGune = new Map();
  for (const m of Array.isArray(mevcutlar) ? mevcutlar : []) {
    const d = String(m?.planner_date || '').slice(0, 10);
    if (!d) continue;
    if (!mevcutGune.has(d)) mevcutGune.set(d, []);
    mevcutGune.get(d).push(m);
  }
  const eklenecek = [];
  const cakisan = [];
  for (const k of Array.isArray(kopyalar) ? kopyalar : []) {
    const ayniGun = mevcutGune.get(k.planner_date) || [];
    const carpisan = ayniGun.find((m) => zamanCakisiyorMu(k, m));
    if (carpisan) cakisan.push({ kopya: k, mevcut: carpisan });
    else eklenecek.push(k);
  }
  return { eklenecek, cakisan };
}

/** Veritabanına yazılmayan yardımcı alanları temizler */
export function yazimIcinSadele(kopya) {
  const { _kaynak_id, _kaynak_tarih, ...temiz } = kopya;
  return temiz;
}
