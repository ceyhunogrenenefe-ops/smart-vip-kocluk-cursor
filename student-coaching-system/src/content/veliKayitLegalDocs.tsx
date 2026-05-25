import React from 'react';

/**
 * Veli kayıt / imza akışındaki yasal metinler.
 * Metinleri güncellemek için bu dosyayı düzenlemeniz yeterli; env veya CMS gerekmez.
 */

export function VeliKayitKvkkBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      <p className="font-medium text-slate-900">6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında bilgilendirme</p>
      <p>
        Kurumunuzun KVKK aydınlatma ve açık rıza metinlerini buraya ekleyin (veri sorumlusu, işlenen veriler,
        amaçlar, aktarımlar, haklar ve başvuru yolları vb.). Şu an yer tutucu metindir; yayına almadan önce hukuk
        danışmanınızla güncelleyin.
      </p>
    </div>
  );
}

export function VeliKayitSatisOnbilgiBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      <p className="font-medium text-slate-900">Mesafeli satış ön bilgilendirme ve satış sözleşmesi</p>
      <p>
        Mesafeli satış ön bilgilendirme ve satış sözleşmesi metninizi buraya ekleyin (hizmet kapsamı, bedel, ödeme,
        cayma, uyuşmazlık ve iletişim vb.). Şu an yer tutucu metindir; yayına almadan önce hukuk danışmanınızla
        güncelleyin.
      </p>
    </div>
  );
}
