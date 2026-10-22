/**
 * Yazılıya hazırlık programı — saf yardımcılar (DB'siz, test edilebilir).
 * - Ders adı eşleme (programdaki "FEN BİLGİSİ" = takvimdeki "Fen Bilimleri")
 * - 2026-2027 1. dönem 1. yazılı ortak takvimi
 * - Varsayılan ayarlar ve otomatik yerleştirme
 */

const TR_MAP = { ı: 'i', İ: 'i', ç: 'c', ş: 's', ğ: 'g', ö: 'o', ü: 'u', â: 'a', î: 'i', û: 'u' };

export function normalizeDers(value) {
  return String(value || '')
    .toLocaleLowerCase('tr')
    .replace(/[ıİçşğöüâîû]/g, (h) => TR_MAP[h] || h)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Takvimdeki dersler ve programda karşılık gelebilecek adları */
const DERS_ESLEME = {
  fen: ['fen bilimleri', 'fen bilgisi', 'fen'],
  matematik: ['matematik', 'mat'],
  sosyal: ['sosyal bilgiler', 'sosyal'],
  turkce: ['turkce'],
  ingilizce: ['ingilizce'],
  din: ['din kulturu', 'din kulturu ve ahlak bilgisi', 'din'],
  biyoloji: ['biyoloji'],
  kimya: ['kimya'],
  tarih: ['tarih'],
  fizik: ['fizik'],
  felsefe: ['felsefe'],
  cografya: ['cografya'],
  edebiyat: ['turk dili ve edebiyati', 'edebiyat', 'tde', 'turk edebiyati']
};

/** Ders adının ortak anahtarı (eşleşmezse normalize edilmiş adın kendisi) */
export function dersAnahtari(value) {
  const n = normalizeDers(value);
  for (const [k, adlar] of Object.entries(DERS_ESLEME)) if (adlar.includes(n)) return k;
  return n;
}

/** Yazılı ile ilgisi olmayan program satırları */
export function yaziliDersiMi(value) {
  const n = normalizeDers(value);
  if (!n) return false;
  return !/(deneme|etut|rehberlik|odev|kitap okuma|analiz|kodlama|sinif dersi|soru cozum)/.test(n);
}

/**
 * 2026-2027 1. dönem 1. ortak yazılı takvimi (kurumun paylaştığı görsellerden).
 * levels: sınıf seviyesi. not: ekranda gösterilecek kısa açıklama.
 */
export const YAZILI_TAKVIMI = {
  ad: '2026-2027 1. dönem 1. yazılı',
  sinavlar: [
    { key: 'fen', ad: 'Fen Bilimleri', tarih: '2026-11-03', levels: [5, 6, 7] },
    { key: 'matematik', ad: 'Matematik', tarih: '2026-11-05', levels: [5, 7] },
    { key: 'sosyal', ad: 'Sosyal Bilgiler', tarih: '2026-11-06', levels: [5, 6, 7] },
    { key: 'turkce', ad: 'Türkçe', tarih: '2026-11-10', levels: [5, 6, 7], not: '4. ders saatinde' },
    { key: 'matematik', ad: 'Matematik', tarih: '2026-11-11', levels: [6], not: 'Ülke geneli' },
    { key: 'ingilizce', ad: 'İngilizce', tarih: '2026-11-12', levels: [5, 6], not: '7. sınıfta ortak yazılı yok' },
    { key: 'din', ad: 'Din Kültürü ve Ahlak Bilgisi', tarih: '2026-11-13', levels: [5, 6, 7] },
    { key: 'biyoloji', ad: 'Biyoloji', tarih: '2026-11-03', levels: [9, 10, 11] },
    { key: 'kimya', ad: 'Kimya', tarih: '2026-11-04', levels: [9, 10, 11] },
    { key: 'tarih', ad: 'Tarih', tarih: '2026-11-04', levels: [9, 10, 11] },
    { key: 'matematik', ad: 'Matematik', tarih: '2026-11-05', levels: [9, 10, 11] },
    { key: 'fizik', ad: 'Fizik', tarih: '2026-11-06', levels: [9, 10, 11] },
    { key: 'felsefe', ad: 'Felsefe', tarih: '2026-11-06', levels: [9, 10, 11] },
    { key: 'cografya', ad: 'Coğrafya', tarih: '2026-11-10', levels: [9, 10, 11], not: '4. ders saatinde' },
    { key: 'edebiyat', ad: 'Türk Dili ve Edebiyatı', tarih: '2026-11-11', levels: [9, 11] },
    { key: 'din', ad: 'Din Kültürü ve Ahlak Bilgisi', tarih: '2026-11-11', levels: [9, 10, 11] },
    { key: 'edebiyat', ad: 'Türk Dili ve Edebiyatı', tarih: '2026-11-12', levels: [10], not: 'Ülke geneli' },
    { key: 'ingilizce', ad: 'İngilizce', tarih: '2026-11-13', levels: [9, 10], not: '11. sınıfta ortak yazılı yok' }
  ]
};

/** '9', '10. sınıf', 'LGS' → sayı; bilinmiyorsa null */
export function sinifSeviyesi(classLevel, className = '') {
  const s = String(classLevel || '').trim().toUpperCase();
  if (s === 'LGS') return 8;
  const m = s.match(/^(\d{1,2})/);
  if (m) return Number(m[1]);
  const n = String(className || '').match(/(?:^|\D)(\d{1,2})\s*[-.]?\s*[A-ZÇĞİÖŞÜ]?\b/i);
  return n ? Number(n[1]) : null;
}

export function takvimSinavlari(seviye) {
  if (!seviye) return [];
  return YAZILI_TAKVIMI.sinavlar.filter((s) => s.levels.includes(seviye));
}

export const VARSAYILAN_AYAR = {
  baslangic: '2026-10-31',
  bitis: '2026-11-08',
  haftasonu: ['10:00-11:00', '11:10-12:10', '12:20-13:20', '14:00-15:00', '15:10-16:10', '16:20-17:20', '17:30-18:30', '18:40-19:40', '19:50-20:50'],
  haftaici: ['17:00-17:40', '17:50-18:30', '18:40-19:20', '19:30-20:10', '20:20-21:00', '21:10-21:50'],
  gunlukEnFazla: 3,
  dersBasinaHazirlik: 1,
  /** 'haftasonu': önce yazılıdan önceki hafta sonları; 'yakin': yazılıya en yakın gün */
  oncelik: 'haftasonu'
};

export function ayariTemizle(input = {}) {
  const tarih = (v, d) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : d);
  const bloklar = (v, d) => {
    const list = (Array.isArray(v) ? v : String(v || '').split(/[\n,]+/))
      .map((x) => String(x).trim())
      .filter((x) => blokCoz(x));
    return list.length ? [...new Set(list)].sort((a, b) => dakika(blokCoz(a).start) - dakika(blokCoz(b).start)) : d;
  };
  const sayi = (v, d, min, max) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  const a = {
    baslangic: tarih(input.baslangic, VARSAYILAN_AYAR.baslangic),
    bitis: tarih(input.bitis, VARSAYILAN_AYAR.bitis),
    haftasonu: bloklar(input.haftasonu, VARSAYILAN_AYAR.haftasonu),
    haftaici: bloklar(input.haftaici, VARSAYILAN_AYAR.haftaici),
    gunlukEnFazla: sayi(input.gunlukEnFazla, VARSAYILAN_AYAR.gunlukEnFazla, 1, 8),
    dersBasinaHazirlik: sayi(input.dersBasinaHazirlik, VARSAYILAN_AYAR.dersBasinaHazirlik, 1, 4),
    oncelik: input.oncelik === 'yakin' ? 'yakin' : 'haftasonu',
    baglar: baglariTemizle(input.baglar)
  };
  if (a.bitis < a.baslangic) a.bitis = a.baslangic;
  return a;
}

/**
 * Ortak program: tarih aralığında birlikte düzenlenen sınıflar (ör. 11A + 11B).
 * Birinde yapılan taşıma / ekleme / iptal diğerine de uygulanır (planlayıcı ekranında).
 */
export function baglariTemizle(v) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const tarihMi = (x) => /^\d{4}-\d{2}-\d{2}$/.test(String(x || ''));
  const out = [];
  for (const b of Array.isArray(v) ? v.slice(0, 20) : []) {
    const siniflar = [...new Set((Array.isArray(b?.siniflar) ? b.siniflar : []).map(String).filter((x) => uuid.test(x)))].slice(0, 6);
    if (siniflar.length < 2 || !tarihMi(b?.baslangic) || !tarihMi(b?.bitis)) continue;
    const [bas, bit] = b.baslangic <= b.bitis ? [b.baslangic, b.bitis] : [b.bitis, b.baslangic];
    out.push({ siniflar, baslangic: bas, bitis: bit });
  }
  return out;
}

export function dakika(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

export function saatYaz(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function blokCoz(text) {
  const m = String(text || '').match(/^\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*$/);
  if (!m) return null;
  const s = dakika(m[1]);
  const e = dakika(m[2]);
  if (!(s >= 0 && e > s && e <= 24 * 60)) return null;
  return { start: saatYaz(s), end: saatYaz(e) };
}

/** ISO tarihin haftanın günü: 1=Pazartesi … 7=Pazar (class_weekly_slots ile aynı) */
export function haftaGunu(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const g = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return g === 0 ? 7 : g;
}

export function gunler(baslangic, bitis) {
  const out = [];
  const [y, m, d] = baslangic.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 62; i += 1) {
    const iso = t.toISOString().slice(0, 10);
    if (iso > bitis) break;
    out.push(iso);
    t.setUTCDate(t.getUTCDate() + 1);
  }
  return out;
}

export function gununBloklari(iso, ayar) {
  const liste = haftaGunu(iso) >= 6 ? ayar.haftasonu : ayar.haftaici;
  return liste.map(blokCoz).filter(Boolean);
}

const cakisir = (a, b) => dakika(a.start) < dakika(b.end) && dakika(b.start) < dakika(a.end);

/**
 * Meşguliyet listesi: weekly slot'lar (haftanın günü) + tarihli oturumlar + programdaki dersler.
 * @returns {(tur:'class'|'teacher', id:string, iso:string) => {start:string,end:string}[]}
 */
export function mesguliyetOlustur({ slots = [], sessions = [], items = [] }) {
  const map = new Map();
  const ekle = (tur, id, anahtar, aralik) => {
    if (!id) return;
    const k = `${tur}|${id}|${anahtar}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(aralik);
  };
  for (const s of slots) {
    const a = { start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5) };
    ekle('class', s.class_id, `dow${s.day_of_week}`, a);
    ekle('teacher', s.teacher_id, `dow${s.day_of_week}`, a);
  }
  for (const s of [...sessions, ...items]) {
    const a = { start: String(s.start_time).slice(0, 5), end: String(s.end_time).slice(0, 5) };
    ekle('class', s.class_id, s.lesson_date, a);
    ekle('teacher', s.teacher_id, s.lesson_date, a);
  }
  return (tur, id, iso) => [
    ...(map.get(`${tur}|${id}|dow${haftaGunu(iso)}`) || []),
    ...(map.get(`${tur}|${id}|${iso}`) || [])
  ];
}

/**
 * Otomatik yerleştirme.
 * Her sınıf-ders için yazılıdan ÖNCEKİ günlerden boş bir saate ders koyar: varsayılan olarak önce
 * hafta sonları (sınava yakın olan önce), sonra hafta içi; `oncelik: 'yakin'` ise sınava en yakın gün.
 * Sınavı en erken olan önce yerleşir (en az seçeneği olan). Sınıf ve öğretmen çakışmaz;
 * bir sınıfa günde en fazla `gunlukEnFazla` hazırlık dersi konur.
 * @returns {{ yeni: object[], yerlesmeyen: {class_id, subject, sebep}[] }}
 */
export function otomatikYerlestir({ satirlar, ayar, slots = [], sessions = [], items = [] }) {
  const tumGunler = gunler(ayar.baslangic, ayar.bitis);
  const yeni = [];
  const yerlesmeyen = [];
  const gunlukSayi = new Map();
  for (const it of items) {
    const k = `${it.class_id}|${it.lesson_date}`;
    gunlukSayi.set(k, (gunlukSayi.get(k) || 0) + 1);
  }
  const sirali = [...satirlar]
    .filter((r) => r.exam_date)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date) || String(a.class_name || '').localeCompare(String(b.class_name || ''), 'tr'));

  for (const r of sirali) {
    if (!r.teacher_id) {
      yerlesmeyen.push({ class_id: r.class_id, subject: r.subject, subject_key: r.subject_key, sebep: 'Öğretmen seçilmemiş' });
      continue;
    }
    const mevcut = items.filter((i) => i.class_id === r.class_id && i.subject_key === r.subject_key).length +
      yeni.filter((i) => i.class_id === r.class_id && i.subject_key === r.subject_key).length;
    let gerek = Math.max(0, (r.target || ayar.dersBasinaHazirlik) - mevcut);
    const once = tumGunler.filter((g) => g < r.exam_date).reverse(); // sınava en yakın önce
    const adaylar =
      ayar.oncelik === 'yakin'
        ? once
        : [...once.filter((g) => haftaGunu(g) >= 6), ...once.filter((g) => haftaGunu(g) < 6)];
    if (gerek > 0 && adaylar.length === 0) {
      yerlesmeyen.push({ class_id: r.class_id, subject: r.subject, subject_key: r.subject_key, sebep: 'Yazılı, program aralığından önce' });
      continue;
    }
    for (const gun of adaylar) {
      if (gerek === 0) break;
      const gk = `${r.class_id}|${gun}`;
      if ((gunlukSayi.get(gk) || 0) >= ayar.gunlukEnFazla) continue;
      if (yeni.some((i) => i.class_id === r.class_id && i.subject_key === r.subject_key && i.lesson_date === gun)) continue;
      const mesgul = mesguliyetOlustur({ slots, sessions, items: [...items, ...yeni] });
      const sinifMesgul = mesgul('class', r.class_id, gun);
      const ogretmenMesgul = mesgul('teacher', r.teacher_id, gun);
      const blok = gununBloklari(gun, ayar).find(
        (b) => !sinifMesgul.some((x) => cakisir(x, b)) && !ogretmenMesgul.some((x) => cakisir(x, b))
      );
      if (!blok) continue;
      yeni.push({
        class_id: r.class_id,
        subject: r.subject,
        subject_key: r.subject_key,
        teacher_id: r.teacher_id,
        lesson_date: gun,
        start_time: blok.start,
        end_time: blok.end
      });
      gunlukSayi.set(gk, (gunlukSayi.get(gk) || 0) + 1);
      gerek -= 1;
    }
    if (gerek > 0) {
      yerlesmeyen.push({ class_id: r.class_id, subject: r.subject, subject_key: r.subject_key, sebep: 'Yazılıdan önce uygun boş saat kalmadı' });
    }
  }
  return { yeni, yerlesmeyen };
}
