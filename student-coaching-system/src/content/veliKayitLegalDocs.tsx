import React from 'react';

/**
 * Veli kayıt / imza akışındaki yasal metinler.
 * Satış ve kullanıcı metinleri onlinevipdershane.com ile uyumlu özet/yedek içeriktir;
 * veli formundaki asıl linkler resmi site sayfalarına gider.
 */

export function VeliKayitKvkkBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      <p className="font-medium text-slate-900">6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında bilgilendirme</p>
      <p>
        Online VIP Dershanecilik Eğitim ve Danışmanlık Hizmetleri Limited Şirketi (“Veri Sorumlusu”), eğitim
        hizmetinin sunulması, kayıt ve sözleşme süreçlerinin yürütülmesi, iletişim ve bilgilendirme amacıyla kimlik,
        iletişim, öğrenci ve veli bilgilerinizi işleyebilir.
      </p>
      <p>
        Verileriniz, yasal yükümlülükler ve hizmetin ifası kapsamında saklanır; açık rızanız veya kanuni sebepler
        olmaksızın üçüncü kişilere aktarılmaz. KVKK md. 11 kapsamındaki haklarınız için{' '}
        <a className="font-semibold text-blue-700 underline" href="mailto:info@onlinevipdershane.com">
          info@onlinevipdershane.com
        </a>{' '}
        adresine başvurabilirsiniz.
      </p>
    </div>
  );
}

export function VeliKayitSatisOnbilgiBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      <p className="font-medium text-slate-900">Mesafeli satış sözleşmesi — özet</p>
      <p>
        Satıcı: ONLİNE VIP DERSHANECİLİK EĞİTİM VE DANIŞMANLIK HİZMETLERİ LİMİTED ŞİRKETİ. Bu sözleşme, 6502 sayılı
        Kanun ve Mesafeli Sözleşmeler Yönetmeliği kapsamında online eğitim hizmetlerinin satış ve kullanım şartlarını
        düzenler.
      </p>
      <p>
        Hizmetler dijital/online sunulur; bedel kayıt sırasında belirlenir. Hizmetin ifasına başlanmışsa cayma hakkı
        kullanılamayabilir. Tam metin:{' '}
        <a
          className="font-semibold text-blue-700 underline"
          href="https://onlinevipdershane.com/satis.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          onlinevipdershane.com/satis.html
        </a>
      </p>
    </div>
  );
}

export function VeliKayitKullaniciBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      <p className="font-medium text-slate-900">Kullanıcı sözleşmesi — özet</p>
      <p>
        Platforma kaydolmak veya hizmetlerden yararlanmak, Online VIP Dershane kullanıcı sözleşmesini kabul etmek
        anlamına gelir. İçerikler kişisel kullanım içindir; ders kayıtları ve materyaller izinsiz paylaşılamaz.
      </p>
      <p>
        Tam metin:{' '}
        <a
          className="font-semibold text-blue-700 underline"
          href="https://onlinevipdershane.com/kullanici.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          onlinevipdershane.com/kullanici.html
        </a>
      </p>
    </div>
  );
}
