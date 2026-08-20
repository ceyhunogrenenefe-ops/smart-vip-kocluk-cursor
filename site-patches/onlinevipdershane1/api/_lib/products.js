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
  'ders-5': { id: 'ders-5', name: 'Premium Özel Ders — 5 Ders', price: 4500 },
  'ders-10': { id: 'ders-10', name: 'Premium Özel Ders — 10 Ders', price: 8500 },
  /** Koçluk paneli kitap mağazası — tutar amountKurus (kuruş) ile gelir */
  kitapMagaza: {
    id: 'kitapMagaza',
    name: 'Kitap Mağazası Siparişi',
    price: 0,
  },
};

function resolveLineItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('Sepet boş.');
  }

  return items.map((item) => {
    const product = PRODUCTS[item.id];
    const qty = Math.max(1, Math.min(99, parseInt(item.qty, 10) || 1));
    if (!product) throw new Error('Geçersiz ürün: ' + item.id);

    let unitAmount;
    if (item.amountKurus != null && item.amountKurus !== '') {
      unitAmount = parseInt(String(item.amountKurus), 10);
    } else if (product.id === 'kitapMagaza') {
      throw new Error('Kitap mağazası tutarı eksik.');
    } else {
      // Mevcut katalog: price TL cinsinden → kuruş
      unitAmount = Math.round(product.price * 100);
    }

    if (!Number.isFinite(unitAmount) || unitAmount < 100) {
      throw new Error('Ödeme tutarı geçersiz.');
    }

    return {
      product,
      qty,
      unitAmount,
    };
  });
}

module.exports = { PRODUCTS, resolveLineItems };
