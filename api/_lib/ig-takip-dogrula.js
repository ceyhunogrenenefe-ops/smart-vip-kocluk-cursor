/**
 * Instagram takip durumu doğrulama — Meta Graph API.
 *
 * KAYNAK: Meta "Instagram User Profile" ucu. `is_user_follow_business`
 * alanı resmî olarak desteklenir. Koşul: kullanıcı işletmeye MESAJ
 * göndermiş (veya icebreaker/kalıcı menüye dokunmuş) olmalı; yalnız
 * yorum yapmışsa API "user consent is required" hatası döner.
 *
 * Bu yüzden akış, kullanıcı "Takip Ettim" butonuna bastıktan SONRA
 * sorgular: butona basmak bir mesajdır ve onayı oluşturur.
 *
 * SCRAPING YOK: yalnızca resmî Graph API çağrısı yapılır. Oturum
 * bilgisi, çerez veya üçüncü taraf servis kullanılmaz.
 */
import { resolveMetaConnection } from './crm-meta-connection.js';

function graphVer() {
  return String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
}

/** Hata metninden "doğrulama desteklenmiyor" durumunu ayırır */
export function desteklenmiyorMu(hataMetni, kod) {
  const m = String(hataMetni || '').toLowerCase();
  if (Number(kod) === 190) return true; // token geçersiz / süresi dolmuş
  if (Number(kod) === 10 || Number(kod) === 200) return true; // izin yok
  return (
    m.includes('consent') ||
    m.includes('permission') ||
    m.includes('not have enough') ||
    m.includes('unsupported') ||
    m.includes('does not exist') ||
    m.includes('nonexisting field')
  );
}

/**
 * Kullanıcının hesabı takip edip etmediğini sorar.
 * @returns {{takipEdiyor: boolean|null, desteklenmiyor: boolean, hata?: string, username?: string}}
 */
export async function takipDurumunuOku({ institutionId, igsid }) {
  const kullanici = String(igsid || '').trim();
  if (!kullanici) {
    return { takipEdiyor: null, desteklenmiyor: true, hata: 'Instagram kullanıcı kimliği yok.' };
  }

  let baglanti;
  try {
    baglanti = await resolveMetaConnection(institutionId);
  } catch (e) {
    return {
      takipEdiyor: null,
      desteklenmiyor: true,
      hata: `Meta bağlantısı okunamadı: ${e instanceof Error ? e.message : String(e)}`
    };
  }

  const token = String(baglanti?.instagram?.token || '').trim();
  if (!token) {
    return {
      takipEdiyor: null,
      desteklenmiyor: true,
      hata: 'Instagram bağlantısı tanımlı değil; takip durumu sorgulanamaz.'
    };
  }

  const url =
    `https://graph.facebook.com/${graphVer()}/${encodeURIComponent(kullanici)}` +
    `?fields=name,username,is_user_follow_business`;

  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || j?.error) {
      const mesaj = String(j?.error?.message || `HTTP ${r.status}`);
      const kod = j?.error?.code;
      return {
        takipEdiyor: null,
        desteklenmiyor: desteklenmiyorMu(mesaj, kod),
        hata: mesaj
      };
    }

    // Alan hiç dönmediyse "takip etmiyor" sanmayalım; desteklenmiyor diyelim
    if (typeof j?.is_user_follow_business !== 'boolean') {
      return {
        takipEdiyor: null,
        desteklenmiyor: true,
        hata: 'API yanıtında is_user_follow_business alanı yok.',
        username: j?.username || undefined
      };
    }

    return {
      takipEdiyor: j.is_user_follow_business === true,
      desteklenmiyor: false,
      username: j?.username || undefined
    };
  } catch (e) {
    return {
      takipEdiyor: null,
      desteklenmiyor: true,
      hata: `Meta isteği başarısız: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}

/**
 * Yönetici paneli için yetenek denetimi.
 * Takip doğrulaması bu kurulumda çalışır mı, çalışmıyorsa NEDEN?
 * Hiçbir mesaj göndermez.
 */
export async function takipDogrulamaYetenegi(institutionId) {
  const sonuc = {
    baglanti_var: false,
    token_calisiyor: false,
    alan_destekleniyor: null,
    ig_username: null,
    neden: null,
    oneri: null
  };

  let baglanti;
  try {
    baglanti = await resolveMetaConnection(institutionId);
  } catch (e) {
    sonuc.neden = `Meta bağlantısı okunamadı: ${e instanceof Error ? e.message : String(e)}`;
    return sonuc;
  }

  const token = String(baglanti?.instagram?.token || '').trim();
  const igUserId = String(baglanti?.instagram?.igUserId || '').trim();
  sonuc.ig_username = baglanti?.instagram?.username || null;
  if (!token || !igUserId) {
    sonuc.neden = 'Instagram bağlantısı tanımlı değil.';
    sonuc.oneri = 'CRM → Ayarlar → Meta bağlantısından Instagram hesabını bağlayın.';
    return sonuc;
  }
  sonuc.baglanti_var = true;

  // 1) Token çalışıyor mu
  try {
    const r = await fetch(
      `https://graph.facebook.com/${graphVer()}/${encodeURIComponent(igUserId)}?fields=id,username`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) {
      sonuc.neden = `Instagram jetonu çalışmıyor: ${j?.error?.message || `HTTP ${r.status}`}`;
      sonuc.oneri = 'Meta bağlantısını yeniden doğrulayın (jeton süresi dolmuş olabilir).';
      return sonuc;
    }
    sonuc.token_calisiyor = true;
    if (j?.username) sonuc.ig_username = j.username;
  } catch (e) {
    sonuc.neden = `Meta isteği başarısız: ${e instanceof Error ? e.message : String(e)}`;
    return sonuc;
  }

  /**
   * 2) Alan desteği: gerçek bir konuşma katılımcısı olmadan kesin
   * ölçülemez, çünkü Meta kullanıcı onayı şartı koyuyor. Son
   * konuşmalardan bir kullanıcı bulunursa onun üzerinden denenir.
   */
  try {
    const r = await fetch(
      `https://graph.facebook.com/${graphVer()}/${encodeURIComponent(igUserId)}/conversations` +
        `?platform=instagram&fields=participants&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const j = await r.json().catch(() => ({}));
    const katilimcilar = j?.data?.[0]?.participants?.data || [];
    const karsiTaraf = katilimcilar.find((p) => String(p?.id || '') !== igUserId);
    if (!karsiTaraf?.id) {
      sonuc.alan_destekleniyor = null;
      sonuc.neden =
        'Henüz Instagram konuşması yok; takip alanı gerçek bir kullanıcı üzerinde sınanamadı.';
      sonuc.oneri =
        'Meta, takip durumunu yalnızca işletmeye MESAJ GÖNDERMİŞ kullanıcılar için verir. ' +
        'Otomasyon zaten önce DM gönderip butona bastırdığı için akış buna uygundur; ' +
        'ilk gerçek kullanıcıda durum CRM’de görünecektir.';
      return sonuc;
    }
    const p = await takipDurumunuOku({ institutionId, igsid: karsiTaraf.id });
    sonuc.alan_destekleniyor = !p.desteklenmiyor;
    if (p.desteklenmiyor) {
      sonuc.neden = p.hata || 'Takip alanı okunamadı.';
      sonuc.oneri =
        'instagram_manage_messages ve pages_read_engagement izinleri ile ' +
        'MODERATE yetkili bir sayfa jetonu gerekir.';
    }
  } catch (e) {
    sonuc.alan_destekleniyor = null;
    sonuc.neden = `Konuşma listesi okunamadı: ${e instanceof Error ? e.message : String(e)}`;
  }

  return sonuc;
}
