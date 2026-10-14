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

/* ------------------------------------------------------------------ */
/* Koç haftalık hedefleri                                              */
/* ------------------------------------------------------------------ */

/**
 * Hedefleri hedef haftaya kopyalar.
 *
 * NEDEN HEDEF BAĞI DEĞİL HEDEFİN KENDİSİ KOPYALANIR
 * coach_weekly_goals.week_start_date ile haftaya bağlıdır. Eski hedefin
 * kimliğini yeni haftanın görevine yazmak, yeni haftanın çalışmasını eski
 * haftanın hedefine işler ve iki haftanın raporunu da bozar. Bu yüzden
 * hedefin kopyası çıkarılır ve görevler KOPYAYA bağlanır.
 *
 * goal_start_date / goal_end_date, week_start_date ile aynı olmak zorunda
 * değil (hedef haftayı aşabiliyor). Bu yüzden üçü de AYNI gün farkıyla
 * kaydırılır; göreli aralık korunur.
 *
 * Hedeflerde ilerleme sütunu yok — ilerleme görevlerden hesaplanıyor —
 * bu yüzden sıfırlanacak bir şey yoktur. homework_id taşınmaz.
 */
export function hedefKopyasiUret(hedefler, secenek = {}) {
  const liste = Array.isArray(hedefler) ? hedefler : [];
  const hedefHafta = String(secenek.hedefHaftaBasi || '').slice(0, 10);
  const kaynakHafta = String(secenek.kaynakHaftaBasi || '').slice(0, 10);
  if (!YMD.test(hedefHafta) || !YMD.test(kaynakHafta)) {
    return { kopyalar: [], kimlikEslesmesi: new Map(), atlanan: liste.length };
  }
  const kayma = gunFarki(kaynakHafta, hedefHafta);
  const idUret =
    typeof secenek.idUret === 'function'
      ? secenek.idUret
      : () => `cwg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

  /** Hedef haftada aynı hedef zaten varsa yenisi açılmaz, ona bağlanır */
  const mevcutAnahtar = new Map();
  for (const m of Array.isArray(secenek.mevcutHedefler) ? secenek.mevcutHedefler : []) {
    mevcutAnahtar.set(hedefAnahtari(m), m.id);
  }

  const kopyalar = [];
  const kimlikEslesmesi = new Map();
  let atlanan = 0;

  for (const g of liste) {
    if (!g?.id) {
      atlanan += 1;
      continue;
    }
    const anahtar = hedefAnahtari(g);
    const mevcutId = mevcutAnahtar.get(anahtar);
    if (mevcutId) {
      // Birleştirme: hedef haftada aynısı var, görevler ona bağlanır
      kimlikEslesmesi.set(g.id, mevcutId);
      continue;
    }
    const yeniId = idUret();
    kimlikEslesmesi.set(g.id, yeniId);
    kopyalar.push({
      id: yeniId,
      student_id: g.student_id,
      coach_id: g.coach_id ?? null,
      institution_id: g.institution_id ?? null,
      subject: g.subject ?? '',
      title: g.title ?? '',
      target_quantity: g.target_quantity ?? 0,
      quantity_unit: g.quantity_unit ?? null,
      week_start_date: hedefHafta,
      goal_start_date: g.goal_start_date ? tarihKaydir(g.goal_start_date, kayma) : null,
      goal_end_date: g.goal_end_date ? tarihKaydir(g.goal_end_date, kayma) : null,
      // Ödev kendi haftasına ait; bağ taşınmaz
      homework_id: null,
      _kaynak_id: g.id
    });
  }
  return { kopyalar, kimlikEslesmesi, atlanan };
}

/**
 * Aynı hedefi tanımlayan anahtar: ders + başlık + birim.
 *
 * Türkçe "İ" küçültüldüğünde kimi kaynakta "i", kimisinde "i + birleşen
 * nokta" (U+0307) üretiliyor. Aynı başlık bu yüzden eşleşmeyip hedef
 * haftada mükerrer hedef açılabiliyordu; birleşen işaretler atılıyor.
 */
export function hedefAnahtari(g) {
  const sadelestir = (v) =>
    String(v || '')
      .trim()
      .toLocaleLowerCase('tr')
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/\s+/g, ' ');
  return [sadelestir(g?.subject), sadelestir(g?.title), sadelestir(g?.quantity_unit)].join('|');
}

/** Kopyalanan görevleri, kopyalanan hedeflere bağlar. */
export function gorevleriHedeflereBagla(kopyalar, kimlikEslesmesi, kaynakSatirlar) {
  const kaynakGoreveGoreHedef = new Map();
  for (const r of Array.isArray(kaynakSatirlar) ? kaynakSatirlar : []) {
    if (r?.id) kaynakGoreveGoreHedef.set(r.id, r.coach_goal_id || null);
  }
  return (Array.isArray(kopyalar) ? kopyalar : []).map((k) => {
    const eskiHedef = kaynakGoreveGoreHedef.get(k._kaynak_id) || null;
    const yeniHedef = eskiHedef ? kimlikEslesmesi?.get(eskiHedef) || null : null;
    return { ...k, coach_goal_id: yeniHedef };
  });
}
