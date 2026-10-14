/**
 * Mağaza siparişleri — misafir (öğrenciye bağlanmamış) siparişlerin
 * kuruma atfedilmesi.
 *
 * SORUN
 * staff.orders siparişleri yalnız `.in('student_id', studentIds)` ile
 * çekiyordu. SQL'de IN listesi NULL ile eşleşmez; bu yüzden site
 * üzerinden misafir olarak verilen siparişler Mağaza ekranında HİÇ
 * görünmüyordu. Ölçüldü: 132 siparişin 65'inde student_id boş, bunların
 * 45'i ödenmiş/onaylı gerçek para.
 *
 * ATIF KURALLARI (sırayla)
 *   1) order.institution_id doluysa ve kurumla eşleşiyorsa  -> 'kurum'
 *   2) e-posta kapsamdaki bir öğrenci/kullanıcıyla eşleşiyorsa -> 'eposta'
 *   3) telefon eşleşiyorsa                                  -> 'telefon'
 * Hiçbiri tutmazsa sipariş listeye GİRMEZ: başka kuruma ait olabilir,
 * tahmin ederek göstermek yanlış kuruma ciro yazmak olur.
 *
 * KOÇ KAPSAMI
 * Koç yalnız kendi öğrencilerini görür. Bu yüzden koç kapsamında
 * 1. kural uygulanmaz — yoksa koç tüm kurumun misafir siparişlerini
 * görürdü. Koç için yalnız kendi öğrencilerinin iletişim bilgileriyle
 * eşleşen siparişler gelir.
 */

/** Telefonun son 10 hanesi — biçim farkları (+90, boşluk, parantez) eşitlensin */
export function telefonAnahtari(ham) {
  const rakam = String(ham == null ? '' : ham).replace(/[^0-9]/g, '');
  if (rakam.length < 10) return '';
  return rakam.slice(-10);
}

/** E-posta anahtarı — büyük/küçük ve boşluk farkını yok sayar */
export function epostaAnahtari(ham) {
  return String(ham == null ? '' : ham).trim().toLowerCase();
}

/**
 * Kapsamdaki kişilerden (öğrenci + kullanıcı) iletişim kümeleri üretir.
 * @param {Array} kisiler {email, phone, parent_phone, parent_email}
 */
export function iletisimKumeleri(kisiler) {
  const epostalar = new Set();
  const telefonlar = new Set();
  for (const k of Array.isArray(kisiler) ? kisiler : []) {
    for (const e of [k?.email, k?.parent_email]) {
      const a = epostaAnahtari(e);
      if (a) epostalar.add(a);
    }
    for (const t of [k?.phone, k?.parent_phone]) {
      const a = telefonAnahtari(t);
      if (a) telefonlar.add(a);
    }
  }
  return { epostalar, telefonlar };
}

/**
 * Misafir sipariş bu kapsama ait mi?
 * @returns {{ait: boolean, neden: 'kurum'|'eposta'|'telefon'|null}}
 */
export function misafirSiparisAtfi(order, { institutionId, epostalar, telefonlar, kocKapsami }) {
  if (!order) return { ait: false, neden: null };

  const siparisKurum = String(order.institution_id || '').trim();
  if (!kocKapsami && siparisKurum && institutionId && siparisKurum === String(institutionId)) {
    return { ait: true, neden: 'kurum' };
  }
  // Başka kuruma yazılmış siparişi iletişim eşleşmesiyle çalmayalım
  if (siparisKurum && institutionId && siparisKurum !== String(institutionId)) {
    return { ait: false, neden: null };
  }

  const e = epostaAnahtari(order.customer_email);
  if (e && epostalar && epostalar.has(e)) return { ait: true, neden: 'eposta' };

  const t = telefonAnahtari(order.customer_phone);
  if (t && telefonlar && telefonlar.has(t)) return { ait: true, neden: 'telefon' };

  return { ait: false, neden: null };
}

/** Misafir siparişleri süzer ve atıf nedenini satıra yazar */
export function misafirSiparisleriSuz(orders, kapsam) {
  const out = [];
  for (const o of Array.isArray(orders) ? orders : []) {
    if (o?.student_id) continue; // öğrenciye bağlı sipariş ana sorgudan gelir
    const { ait, neden } = misafirSiparisAtfi(o, kapsam);
    if (ait) out.push({ ...o, misafir_siparis: true, misafir_atif: neden });
  }
  return out;
}

/**
 * İki listeyi birleştirir: kimliğe göre tekilleştirir, tarihe göre
 * yeniden eskiye sıralar ve limit uygular.
 */
export function siparisleriBirlestir(ogrenciSiparisleri, misafirSiparisleri, limit) {
  const gorulen = new Set();
  const hepsi = [];
  for (const o of [...(ogrenciSiparisleri || []), ...(misafirSiparisleri || [])]) {
    const id = String(o?.id || '');
    if (!id || gorulen.has(id)) continue;
    gorulen.add(id);
    hepsi.push(o);
  }
  hepsi.sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? hepsi.slice(0, n) : hepsi;
}
