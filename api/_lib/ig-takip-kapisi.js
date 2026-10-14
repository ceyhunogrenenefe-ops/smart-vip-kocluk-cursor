/**
 * Instagram yorum otomasyonu — takip kontrolü aşaması (saf mantık).
 *
 * META API GERÇEĞİ
 * Takip durumu, Instagram kullanıcı profili ucundaki `is_user_follow_business`
 * alanıyla okunur. Meta'nın belgesine göre bu alan ancak kullanıcı işletmeye
 * MESAJ GÖNDERDİKTEN (veya bir icebreaker/kalıcı menü öğesine dokunduktan)
 * sonra okunabilir; yalnızca yorum yapmak yetmez, API "user consent is
 * required" hatası döner.
 *
 * Akış tam da bu yüzden iki adımlı:
 *   yorum -> davet DM'i (buton) -> kullanıcı butona basar (= mesaj, onay
 *   oluşur) -> ancak O ZAMAN takip durumu okunabilir.
 *
 * DEĞİŞMEZ KURALLAR
 *   1. Butona basmak "takip ediyor" demek DEĞİLDİR. Kullanıcı beyanı
 *      'user_claimed'dır; 'verified' yalnızca API'den gelir.
 *   2. PDF bağlantısı (dm_text) doğrulama öncesinde HİÇBİR mesajda,
 *      butonda veya önizlemede geçmez.
 *   3. Doğrulama teknik olarak yapılamıyorsa durum 'unsupported' olur;
 *      PDF gönderilmez ve yöneticiye neden gösterilir.
 *   4. Yorum altına "PDF gönderdik" yanıtı yalnız PDF gerçekten
 *      gönderildikten sonra verilir.
 */

/** Spec 6'daki izlenebilir aşamalar */
export const DURUMLAR = [
  'invite_sent',
  'user_claimed',
  'verified',
  'unverified',
  'unsupported',
  'pdf_sent',
  'failed'
];

export const DURUM_ETIKET = {
  invite_sent: 'Takip daveti gönderildi',
  user_claimed: 'Kullanıcı takip ettiğini belirtti',
  verified: 'Takip doğrulandı',
  unverified: 'Takip doğrulanamadı',
  unsupported: 'Doğrulama desteklenmiyor',
  pdf_sent: 'PDF gönderildi',
  failed: 'Gönderim başarısız'
};

export const VARSAYILAN_METINLER = {
  follow_invite_text:
    'Merhaba! 👋 İstediğiniz PDF\'yi sizinle paylaşmaktan mutluluk duyarız.\n' +
    'PDF bağlantınıza ulaşabilmeniz için öncelikle hesabımızı takip etmeniz gerekiyor. ❤️\n' +
    'Takip ettikten sonra aşağıdaki "Takip Ettim" butonuna dokunabilirsiniz.',
  follow_button_text: '✅ Takip Ettim',
  follow_retry_text:
    'Henüz takip ettiğinizi doğrulayamadık. 😊\n' +
    'PDF\'nize ulaşmak için hesabımızı takip edip tekrar kontrol edebilirsiniz.',
  follow_retry_button_text: '🔄 Tekrar Kontrol Et'
};

/** Buton yükü: hangi otomasyon, hangi aşama */
export function butonYuku(automationId, adim) {
  return `ig_follow_gate:${String(automationId || '')}:${adim === 'retry' ? 'retry' : 'claim'}`;
}

/** Gelen postback yükünü çözer; bize ait değilse null */
export function butonYukunuCoz(payload) {
  const s = String(payload || '').trim();
  if (!s.startsWith('ig_follow_gate:')) return null;
  const parcalar = s.split(':');
  if (parcalar.length < 3) return null;
  const automationId = parcalar[1];
  const adim = parcalar[2] === 'retry' ? 'retry' : 'claim';
  if (!automationId) return null;
  return { automationId, adim };
}

/**
 * Yorum geldiğinde ne yapılacak?
 * Takip kapısı kapalıysa mevcut davranış korunur: doğrudan dm_text.
 */
export function yorumIcinPlan(automation) {
  const kapiAcik = automation?.follow_gate_enabled === true;
  if (!kapiAcik) {
    return { aksiyon: 'send_pdf', text: automation?.dm_text || '', durum: null };
  }
  return {
    aksiyon: 'send_invite',
    text: String(automation?.follow_invite_text || '').trim() || VARSAYILAN_METINLER.follow_invite_text,
    buttonText:
      String(automation?.follow_button_text || '').trim() || VARSAYILAN_METINLER.follow_button_text,
    payload: butonYuku(automation?.id, 'claim'),
    durum: 'invite_sent'
  };
}

/**
 * Takip sorgusunun sonucuna göre ne yapılacak?
 *
 * @param {object} sonuc
 * @param {boolean|null} sonuc.takipEdiyor  API'den gelen is_user_follow_business
 * @param {boolean} sonuc.desteklenmiyor    izin/onay yok, okunamadı
 * @param {object} automation
 */
export function dogrulamaSonrasiPlan(sonuc, automation) {
  if (sonuc?.desteklenmiyor) {
    return {
      aksiyon: 'none',
      durum: 'unsupported',
      // PDF GÖNDERİLMEZ: doğrulanmamış kullanıcıya bağlantı verilmez
      text: '',
      yoneticiNotu:
        sonuc?.hata ||
        'Takip durumu okunamadı (Meta izni veya kullanıcı onayı yok). PDF gönderilmedi.'
    };
  }
  if (sonuc?.takipEdiyor === true) {
    return {
      aksiyon: 'send_pdf',
      durum: 'verified',
      text: String(automation?.dm_text || '')
    };
  }
  return {
    aksiyon: 'send_retry',
    durum: 'unverified',
    text:
      String(automation?.follow_retry_text || '').trim() || VARSAYILAN_METINLER.follow_retry_text,
    buttonText:
      String(automation?.follow_retry_button_text || '').trim() ||
      VARSAYILAN_METINLER.follow_retry_button_text,
    payload: butonYuku(automation?.id, 'retry')
  };
}

/**
 * Yorum altına yanıt verilebilir mi?
 * Spec: "PDF henüz gönderilmemişse 'PDF gönderdik' yanıtı verilmesin."
 */
export function yorumYanitiVerilebilirMi(log) {
  const metin = String(log?.reply_comment_text ?? '').trim();
  void metin;
  return String(log?.follow_state || '') === 'pdf_sent' || log?.dm_status === 'sent';
}

/**
 * Aynı kullanıcıya gereksiz tekrar mesaj gönderilmesini engeller.
 * @param {object|null} oncekiLog aynı otomasyon + aynı ig kullanıcısı
 * @param {string} adim 'invite' | 'claim' | 'retry'
 */
export function tekrarEngeli(oncekiLog, adim) {
  const durum = String(oncekiLog?.follow_state || '');
  if (!oncekiLog) return { engelle: false };

  // PDF zaten gittiyse hiçbir adım tekrar edilmez
  if (durum === 'pdf_sent') {
    return { engelle: true, neden: 'pdf_zaten_gonderildi' };
  }
  // Davet zaten gönderildiyse ikinci davet gönderilmez
  if (adim === 'invite' && (durum === 'invite_sent' || durum === 'user_claimed' || durum === 'unverified')) {
    return { engelle: true, neden: 'davet_zaten_gonderildi' };
  }
  return { engelle: false };
}

/** Takip kapısı açıkken ayarların eksiksiz olup olmadığını denetler */
export function ayarlariDogrula(automation) {
  const eksik = [];
  if (automation?.follow_gate_enabled !== true) return { gecerli: true, eksik };
  if (!String(automation?.dm_text || '').trim()) {
    eksik.push('PDF mesajı (doğrulamadan sonra gönderilecek) boş olamaz.');
  }
  return { gecerli: eksik.length === 0, eksik };
}
