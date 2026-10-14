/**
 * Deneme sınavı gerçekleşme durumu.
 *
 * TEMEL KURAL: tarihi geçen sınav kendiliğinden "yapıldı" sayılmaz.
 * Takvimdeki satırla gerçek sınav sonuçları arasında veritabanı düzeyinde
 * bir bağ yok (exam_calendar'a işaret eden yabancı anahtar bulunmuyor),
 * bu yüzden gerçekleşmeyi veriden türetmek uydurma olurdu. Tarihi geçmiş
 * ve işaretlenmemiş sınav "yapılmadı" sayılır; "yapıldı" yalnızca
 * yöneticinin işaretlemesiyle oluşur.
 *
 * status sütunu NULL olabilir ve NULL "işaretlenmedi" demektir —
 * "yapılmadı" demek değildir. Ayrım önemli: eski 117 kaydın hiçbiri
 * elle işaretlenmedi, ama gelecek tarihliler "planlandı" görünmeli.
 */

export const DURUMLAR = ['yapildi', 'yapilmadi', 'planlandi'];

export const DURUM_ETIKET = {
  yapildi: 'Yapıldı',
  yapilmadi: 'Yapılmadı',
  planlandi: 'Planlandı'
};

/** Gövdeden gelen durumu doğrular. '' ve null "işareti kaldır" demektir. */
export function durumuTemizle(ham) {
  if (ham === null || ham === undefined) return { value: null };
  const s = String(ham).trim().toLowerCase();
  if (!s || s === 'otomatik' || s === 'auto') return { value: null };
  if (!DURUMLAR.includes(s)) {
    return { error: `Geçersiz durum. Geçerli değerler: ${DURUMLAR.join(', ')}.` };
  }
  return { value: s };
}

/** Istanbul saatine göre bugünün YYYY-AA-GG değeri */
export function bugunYmd() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Satırın ekranda görünecek durumu.
 * @param {{status?: string|null, exam_date?: string}} row
 * @param {string} bugun YYYY-AA-GG
 */
export function etkinDurum(row, bugun = bugunYmd()) {
  const isaretli = String(row?.status || '').trim().toLowerCase();
  if (DURUMLAR.includes(isaretli)) return isaretli;
  const tarih = String(row?.exam_date || '').slice(0, 10);
  if (!tarih) return 'planlandi';
  return tarih >= bugun ? 'planlandi' : 'yapilmadi';
}

/** Durum yönetici tarafından mı belirlendi (rozette gösterilir) */
export function elleIsaretli(row) {
  return DURUMLAR.includes(String(row?.status || '').trim().toLowerCase());
}

/** Listeyi durum/sınıf/tarih aralığına göre süzer. Hiçbir satırı silmez. */
export function sinavlariSuz(rows, { durum, level, baslangic, bitis, bugun = bugunYmd() } = {}) {
  const liste = Array.isArray(rows) ? rows : [];
  return liste.filter((r) => {
    if (durum && etkinDurum(r, bugun) !== durum) return false;
    if (level && String(r?.level || '') !== String(level)) return false;
    const t = String(r?.exam_date || '').slice(0, 10);
    if (baslangic && t && t < baslangic) return false;
    if (bitis && t && t > bitis) return false;
    return true;
  });
}

/** Durum sayaçları — filtre düğmelerindeki rakamlar */
export function durumSayaclari(rows, bugun = bugunYmd()) {
  const sayac = { yapildi: 0, yapilmadi: 0, planlandi: 0, toplam: 0 };
  for (const r of Array.isArray(rows) ? rows : []) {
    sayac[etkinDurum(r, bugun)] += 1;
    sayac.toplam += 1;
  }
  return sayac;
}
