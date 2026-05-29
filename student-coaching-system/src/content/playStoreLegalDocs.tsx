import React from 'react';

/** Play Store + mobil uygulama için genel gizlilik metni (KVKK uyumlu taslak). */
export function MobileAppPrivacyBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      <p className="text-xs text-slate-500">Son güncelleme: Mayıs 2026</p>
      <p className="font-medium text-slate-900">Online VIP Ders ve Koçluk — Gizlilik Politikası</p>
      <p>
        Bu metin, <strong>Online VIP Ders ve Koçluk</strong> Android uygulaması (
        <code>com.dersonlinevipkocluk.student</code>) ve{' '}
        <a href="https://www.dersonlinevipkocluk.com" className="text-blue-700 underline">
          www.dersonlinevipkocluk.com
        </a>{' '}
        web hizmeti için geçerlidir. Hizmeti sunan veri sorumlusu ile iletişim:{' '}
        <a href="mailto:destek@smartkocluk.com" className="text-blue-700 underline">
          destek@smartkocluk.com
        </a>
        .
      </p>

      <h2 className="pt-2 text-base font-semibold text-slate-900">1. Toplanan veriler</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Hesap bilgileri: ad, e-posta, telefon (varsa), rol (öğrenci / koç / yönetici)</li>
        <li>Öğrenci takip verileri: ders çalışma kayıtları, deneme sonuçları, haftalık hedefler, konu ilerlemesi</li>
        <li>Koçluk ve iletişim: görüşme planları, mesaj şablonları (kullanıldığında)</li>
        <li>Teknik veriler: oturum kimliği (JWT), cihaz/OS bilgisi (standart HTTPS günlükleri)</li>
      </ul>

      <h2 className="pt-2 text-base font-semibold text-slate-900">2. Verilerin kullanım amacı</h2>
      <p>
        Veriler; kimlik doğrulama, öğrenci koçluk hizmetinin sunulması, raporlama, kurum/ koç yönetimi ve yasal
        yükümlülüklerin yerine getirilmesi amacıyla işlenir. Pazarlama amaçlı üçüncü taraf satışı yapılmaz.
      </p>

      <h2 className="pt-2 text-base font-semibold text-slate-900">3. Hizmet sağlayıcılar</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <strong>Supabase</strong> — veritabanı ve kimlik altyapısı (AB / uygun bölge; sözleşmeye tabi)
        </li>
        <li>
          <strong>Vercel</strong> — API ve web arayüzü barındırma
        </li>
        <li>
          <strong>Google</strong> — isteğe bağlı Google Takvim / Meet entegrasyonu (yalnızca web panelinde, koç
          onayı ile)
        </li>
      </ul>

      <h2 className="pt-2 text-base font-semibold text-slate-900">4. Saklama ve güvenlik</h2>
      <p>
        Veriler TLS (HTTPS) ile iletilir. Erişim rol tabanlıdır. Hesabınız kurum/koç tarafından yönetiliyorsa silme
        talebinizi önce kurumunuza, gerekirse destek@smartkocluk.com adresine iletebilirsiniz.
      </p>

      <h2 className="pt-2 text-base font-semibold text-slate-900">5. KVKK haklarınız</h2>
      <p>
        6698 sayılı Kanun kapsamında; verilerinize erişim, düzeltme, silme, işlemenin kısıtlanması ve itiraz haklarına
        sahipsiniz. Başvuru: destek@smartkocluk.com. Detaylı aydınlatma için{' '}
        <a href="/veli-kayit-metin/kvkk" className="text-blue-700 underline">
          KVKK bilgilendirme
        </a>{' '}
        sayfasına bakınız.
      </p>

      <h2 className="pt-2 text-base font-semibold text-slate-900">6. Çocuklar</h2>
      <p>
        Uygulama eğitim amaçlıdır; öğrenci hesapları veli/kurum/koç onayı ile oluşturulur. 13 yaş altı çocuklardan
        bilerek doğrudan kayıt alınmaz.
      </p>

      <h2 className="pt-2 text-base font-semibold text-slate-900">7. Değişiklikler</h2>
      <p>
        Politika güncellenebilir; önemli değişiklikler web sitesi veya uygulama içi bildirim ile duyurulur. Güncel
        sürüm her zaman bu URL&apos;de yayımlanır.
      </p>
    </div>
  );
}

export function MobileAppTermsBody() {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-700">
      <p className="text-xs text-slate-500">Son güncelleme: Mayıs 2026</p>
      <p className="font-medium text-slate-900">Online VIP Ders ve Koçluk — Kullanım Koşulları</p>
      <p>
        Bu koşullar Online VIP Ders ve Koçluk mobil uygulaması ve ilişkili web panelinin kullanımını düzenler.
        Uygulamayı indirerek
        veya giriş yaparak bu koşulları kabul etmiş sayılırsınız.
      </p>
      <h2 className="pt-2 text-base font-semibold text-slate-900">Hizmet</h2>
      <p>
        Platform; öğrenci koçluk takibi, hedef planlama, deneme ve raporlama araçları sunar. Hizmet &quot;olduğu gibi&quot;
        sağlanır; kesintisiz erişim garanti edilmez.
      </p>
      <h2 className="pt-2 text-base font-semibold text-slate-900">Hesap güvenliği</h2>
      <p>
        Giriş bilgilerinizi gizli tutmak sizin sorumluluğunuzdadır. Yetkisiz kullanım şüphesinde destek@smartkocluk.com
        ile iletişime geçin.
      </p>
      <h2 className="pt-2 text-base font-semibold text-slate-900">Kabul edilemez kullanım</h2>
      <p>
        Sisteme zarar verme, başkalarının verilerine yetkisiz erişim, spam veya yasa dışı içerik yüklemek yasaktır.
        İhlal durumunda hesap askıya alınabilir.
      </p>
      <h2 className="pt-2 text-base font-semibold text-slate-900">Fikri mülkiyet</h2>
      <p>Yazılım, marka ve arayüz unsurları hizmet sağlayıcıya aittir; izinsiz kopyalanamaz.</p>
      <h2 className="pt-2 text-base font-semibold text-slate-900">Uygulanacak hukuk</h2>
      <p>Türkiye Cumhuriyeti kanunları uygulanır. Uyuşmazlıklarda İstanbul mahkemeleri yetkilidir (tüketici hakları saklı).</p>
    </div>
  );
}
