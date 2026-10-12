/**
 * Kurumsal kimlik — dis uygulamalar icin genel okuma ucu.
 *
 * Test Maker (online-vip-test-maker) kurumsal PDF sablonunun logosunu,
 * renklerini ve sloganini buradan okur. Logo panelde tek yerde yonetilir;
 * Test Maker'da ikinci bir kopya tutulmaz, super admin logoyu degistirince
 * yeni uretilen PDF'ler de degisir.
 *
 * Yetki istemez ama yalniz OKUR ve yalniz kurumun kamuya acik kimlik
 * bilgilerini doner: kurum adi, logo, marka renkleri, slogan. Ogrenci,
 * veli, personel ya da baska hicbir kisisel veri bu uctan cikmaz.
 */
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

/** Varsayilan kurum — Test Maker tek kurum icin calisiyor. */
const DEFAULT_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

/** Izinli kaynaklar sabit; joker (*) kullanilmaz. */
const ALLOWED_ORIGINS = new Set([
  'https://online-vip-test-maker.vercel.app',
  'https://onlinevipdershane.com',
  'https://www.onlinevipdershane.com',
  'https://dersonlinevipkocluk.com',
  'https://www.dersonlinevipkocluk.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
]);

function applyCors(req, res) {
  const origin = String(req.headers?.origin || '').trim();
  /**
   * `Vary: Origin` HER ZAMAN gonderilir — eslesme olmasa da. Aksi halde
   * Origin'siz bir istek kenar onbellegine ACAO basligi olmadan dusuyor ve
   * ayni adresi isteyen tarayici o kopyayi alip CORS'tan patliyor.
   */
  res.setHeader('Vary', 'Origin');
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Gercek goruntu bicimini base64 govdesinden tespit eder.
 *
 * Kayitli logonun MIME etiketi "image/jpeg" ama govde PNG imzasiyla
 * basliyor (iVBORw0KGgo = \x89PNG). Tarayici bunu tolere eder, jsPDF
 * etmez: yanlis bicimle cagrilan addImage bozuk cikti verir. Bu yuzden
 * etikete degil govdeye bakip data URL'i duzelterek donuyoruz.
 */
export function sniffImageDataUrl(dataUrl) {
  const s = String(dataUrl || '').trim();
  const m = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(s);
  if (!m) return null;
  const base64 = Boolean(m[2]);
  const payload = m[3] || '';
  if (!base64 || !payload) return null;

  let mime = String(m[1] || '').toLowerCase();
  if (payload.startsWith('iVBORw0KGgo')) mime = 'image/png';
  else if (payload.startsWith('/9j/')) mime = 'image/jpeg';
  else if (payload.startsWith('R0lGOD')) mime = 'image/gif';
  else if (payload.startsWith('UklGR')) mime = 'image/webp';
  else if (payload.startsWith('PHN2Zy') || payload.startsWith('PD94bWw')) mime = 'image/svg+xml';

  return { mime, dataUrl: `data:${mime};base64,${payload}` };
}

/** Kurumsal palet — kurumsal PDF sablonuyla ayni degerler. */
const MARKA_RENKLERI = {
  lacivert: '#173b70',
  lacivertKoyu: '#0f2a52',
  kirmizi: '#d72d42',
  maviAcik: '#eef4fa',
  gri: '#64748b'
};

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const istenen =
      typeof req.query?.institution_id === 'string' && req.query.institution_id.trim()
        ? req.query.institution_id.trim()
        : DEFAULT_INSTITUTION_ID;

    const { data, error } = await supabaseAdmin
      .from('institutions')
      .select('id, name, logo')
      .eq('id', istenen)
      .maybeSingle();
    if (error) throw error;

    const logo = data?.logo ? sniffImageDataUrl(data.logo) : null;

    // Logo degisene kadar onbellekte kalabilir; PDF uretiminde her seferinde
    // indirilmesi gereksiz (203 KB).
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');

    return res.status(200).json({
      institution: { id: data?.id || istenen, name: data?.name || 'Online VIP Dershane' },
      logo: logo ? logo.dataUrl : null,
      logoMime: logo ? logo.mime : null,
      colors: MARKA_RENKLERI,
      slogan: 'Olduğunuz yerden, olmak istediğiniz yere.'
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
