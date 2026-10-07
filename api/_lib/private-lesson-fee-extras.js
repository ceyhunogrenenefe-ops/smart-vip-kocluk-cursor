/**
 * Özel ders ücretlerinde ders dışı kalemler.
 *
 * Öğrenci yalnız özel ders almıyor: rehberlik görüşmesi, deneme sınavı,
 * kitap/kaynak gibi kalemler de aynı veli hesabına giriyor. Bunlar
 * "ders saati × birim ücret" formülüne sığmadığı için satırın kendi
 * kalem listesinde tutulur; satır toplamı ders tutarı + kalemlerin toplamıdır.
 *
 * Tutar her zaman adet × birim ücretten yeniden hesaplanır; istemcinin
 * gönderdiği tutara güvenilmez, yoksa ekranda görünen ile kaydedilen ayrışır.
 */

/** Hazır kalemler — listede seçilir, "diğer" serbest ad alır. */
export const EXTRA_ITEM_KINDS = [
  { id: 'rehberlik', label: 'Rehberlik', unit: 'görüşme' },
  { id: 'deneme', label: 'Deneme Sınavı', unit: 'adet' },
  { id: 'kaynak', label: 'Kitap / Kaynak', unit: 'adet' },
  { id: 'etut', label: 'Etüt', unit: 'saat' },
  { id: 'yazili', label: 'Yazılıya Hazırlık', unit: 'saat' },
  { id: 'kayit', label: 'Kayıt / Hizmet Bedeli', unit: 'adet' },
  { id: 'other', label: 'Diğer', unit: 'adet' }
];

const KIND_IDS = new Set(EXTRA_ITEM_KINDS.map((k) => k.id));
const MAX_ITEMS = 30;

export function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function labelForKind(kind) {
  return EXTRA_ITEM_KINDS.find((k) => k.id === kind)?.label || '';
}

/** Kalemin kendi kimliği — satır silip eklerken karışmasın diye saklanır. */
function itemId(raw, index) {
  const given = String(raw?.id || '').trim();
  if (given) return given.slice(0, 60);
  return `k${index + 1}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Gelen listeyi kaydedilebilir hâle getirir.
 * Adı ve tutarı olmayan (adet 0 ve ücret 0) kalemler atılır — boş satır kaydedilmez.
 */
export function normalizeExtraItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let i = 0; i < raw.length && out.length < MAX_ITEMS; i += 1) {
    const it = raw[i];
    if (!it || typeof it !== 'object') continue;
    const kind = KIND_IDS.has(String(it.kind || '').trim()) ? String(it.kind).trim() : 'other';
    const label = String(it.label || '').trim().slice(0, 120) || labelForKind(kind) || 'Diğer';
    const quantity = Math.max(0, Math.min(9999, money(it.quantity)));
    const unitPrice = Math.max(0, Math.min(10000000, money(it.unit_price_tl ?? it.unit_price)));
    const amount = money(quantity * unitPrice);
    // Hem adet hem ücret sıfırsa taşınacak bilgi yok
    if (quantity <= 0 && unitPrice <= 0) continue;
    out.push({
      id: itemId(it, i),
      kind,
      label,
      quantity,
      unit_price_tl: unitPrice,
      amount_tl: amount,
      note: String(it.note || '').trim().slice(0, 300) || null
    });
  }
  return out;
}

/** Kalemlerin tutar toplamı. */
export function extraItemsTotal(items) {
  const list = Array.isArray(items) ? items : [];
  let sum = 0;
  for (const it of list) sum += money(it?.amount_tl ?? money(it?.quantity) * money(it?.unit_price_tl));
  return money(sum);
}

/**
 * Veritabanından okunan değeri listeye çevirir.
 * Kolon henüz yoksa (migration çalıştırılmadıysa) undefined gelir → boş liste.
 */
export function readExtraItems(value) {
  if (Array.isArray(value)) return normalizeExtraItems(value);
  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizeExtraItems(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}
