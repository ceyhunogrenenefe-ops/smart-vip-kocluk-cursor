/** Site ödeme API — ürün kataloğu + koçluk kitap mağazası dinamik tutar desteği */

const PRODUCTS = {
  lgs: { id: 'lgs', name: 'LGS Hazırlık', price: 112000 },
  yks: { id: 'yks', name: 'YKS TYT-AYT Hazırlık', price: 119000 },
  ortaokul: { id: 'ortaokul', name: '5-6-7. Sınıf VIP Paketi', price: 98000 },
  lise: { id: 'lise', name: '9-10-11. Sınıf Programı', price: 112000 },
  ilkokul: { id: 'ilkokul', name: '3-4. Sınıf Programı', price: 84000 },
  kamplar: { id: 'kamplar', name: 'Yaz Kampları', price: 5000 },
  kamp9Hazirlik: { id: 'kamp9Hazirlik', name: '9. Sınıfa Hazırlık Kampı', price: 5000 },
  kampLgs: { id: 'kampLgs', name: 'LGS Yaz Kampı', price: 24000 },
  kamp56: { id: 'kamp56', name: "5'ten 6. Sınıfa Geçenler Yaz Kampı", price: 24000 },
  kamp910: { id: 'kamp910', name: "9'dan 10'a Geçenler Yaz Kampı", price: 24000 },
  kampMaarifTyt: { id: 'kampMaarifTyt', name: 'Maarif Model TYT Yaz Kampı', price: 24000 },
  kampTyt: { id: 'kampTyt', name: "11'den 12'ye TYT Yaz Kampı", price: 24000 },
  yazili: { id: 'yazili', name: 'Yazılıya Hazırlık', price: 2500 },
  kitap: { id: 'kitap', name: 'Kitap Atölyesi', price: 12000 },
  start: { id: 'start', name: 'VIP Start Paketi', price: 28000 },
  'ders-1': { id: 'ders-1', name: 'Premium Özel Ders — 1 Ders', price: 1100 },
  'ders-3': { id: 'ders-3', name: 'Premium Özel Ders — 3 Ders', price: 3000 },
  'ders-5': { id: 'ders-5', name: 'Premium Özel Ders — 5 Ders', price: 4900 },
  'ders-10': { id: 'ders-10', name: 'Premium Özel Ders — 10 Ders', price: 9500 },
  /** Koçluk paneli kitap mağazası — tutar amountKurus ile gelir */
  kitapMagaza: {
    id: 'kitapMagaza',
    name: 'Kitap Mağazası Siparişi',
    subtitle: 'Online VIP Dershane · Kitap Mağazası',
    price: 0,
  },
};

function resolveLineItems(items) {
  const rows = [];
  for (const item of items || []) {
    const id = String(item?.id || '').trim();
    const product = PRODUCTS[id];
    if (!product) throw new Error(`Ürün bulunamadı: ${id}`);
    const qty = Math.max(1, parseInt(String(item.qty ?? 1), 10) || 1);
    let unitAmount = product.price;
    if (item.amountKurus != null) {
      unitAmount = parseInt(String(item.amountKurus), 10);
    }
    if (!Number.isFinite(unitAmount) || unitAmount < 100) {
      throw new Error('Ödeme tutarı geçersiz.');
    }
    rows.push({ product, qty, unitAmount });
  }
  if (!rows.length) throw new Error('Sepet boş.');
  return rows;
}

module.exports = { PRODUCTS, resolveLineItems };
