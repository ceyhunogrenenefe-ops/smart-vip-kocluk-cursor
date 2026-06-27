import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { normalizePhoneToE164 } from '../api/_lib/phone-whatsapp.js';
import {
  buildAwaitingAdminPriceHtml,
  buildParentContractHtml,
  buildRegistrationPlaceholderHtml,
  buildTaksitPlan,
  mergeTaksitPlans,
  contractNumber,
  institutionCodeFromRow,
  kayitDetayForHtml,
  normalizeDersSatirlari,
  normalizeSozlesmeTuru,
  randomToken,
  resolveSozlesmeBasligi,
  splitAdSoyad,
  suggestHoursAndFeeFromSinif,
  sumDersHours,
  normalizeParaBirimi,
  paraBirimiLabel,
  resolveRowParaBirimi
} from '../api/_lib/parent-sign-defaults.js';
import { institutionLegalHtmlForContract, loadInstitutionLegal } from '../api/_lib/parent-sign-legal.js';
import { resolveLegalDocHrefs, resolveOptionalDocUrl } from '../api/_lib/veli-kayit-legal-url.js';
import { notifyTaksitMarkedPaid } from '../api/_lib/taksit-whatsapp-notify.js';
import { resolveSinifFromVeliKayit } from '../api/_lib/veli-kayit-class-level.js';
import { provisionStudentFromParentSignContract } from '../api/_lib/provision-student-from-parent-sign.js';
import { notifyAdminsOnVeliKayitForm } from '../api/_lib/veli-kayit-admin-notify.js';
import { notifyVeliSignReady } from '../api/_lib/veli-sign-ready-notify.js';

const ODEME_SEKLI_SET = new Set(['aylik_taksit', 'kredi_karti_tek', 'kredi_karti_otomatik']);
const ODEME_TERCİHİ_VELİ_SET = new Set(['henuz_odemedi', 'kredi_karti_odendi', 'aylik_taksit_istiyorum']);

function normalizeOdemeSekli(v) {
  const s = String(v || '').trim();
  return ODEME_SEKLI_SET.has(s) ? s : 'aylik_taksit';
}

function normalizeOdemeTercihiVeli(v) {
  const s = String(v || '').trim();
  return ODEME_TERCİHİ_VELİ_SET.has(s) ? s : 'henuz_odemedi';
}

function odemeSekliLabelTr(sekli) {
  if (sekli === 'kredi_karti_tek') return 'KK tek çekim';
  if (sekli === 'kredi_karti_otomatik') return 'KK aylık otomatik';
  return 'Aylık taksit';
}

function odemeTercihiVeliLabelTr(tercih) {
  if (tercih === 'kredi_karti_odendi') return 'Veli: KK ile ödedim';
  if (tercih === 'aylik_taksit_istiyorum') return 'Veli: aylık taksit istiyor';
  return 'Veli: henüz ödemedi';
}

function applyKkTahsilToPlan(cards, odeme_sekli, kkTahsil) {
  const list = Array.isArray(cards) ? [...cards] : [];
  if (odeme_sekli === 'kredi_karti_tek' && kkTahsil && list[0]) {
    list[0] = {
      ...list[0],
      odendi: true,
      odeme_notu: String(list[0].odeme_notu || 'KK tek çekim').slice(0, 200) || 'KK tek çekim',
      odendi_tarihi: new Date().toISOString().slice(0, 10)
    };
  }
  return list;
}

const VELI_KAYIT_MAX_PROGRAMS = 2;

function splitVeliProgramAdi(s) {
  return String(s || '')
    .split(/\s*\+\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseVeliProgramForms(body) {
  const rawArr = body.program_formlar;
  if (Array.isArray(rawArr) && rawArr.length) {
    return rawArr.map((x) => String(x || '').trim()).filter(Boolean);
  }
  const single = String(body.program_form || '').trim();
  if (!single) return [];
  return splitVeliProgramAdi(single);
}

const VELI_KAYIT_PROGRAM_SET = new Set([
  '3. Sınıf dönem programı',
  '4. Sınıf dönem programı',
  '5, 6, 7. Sınıf dönem programı',
  'LGS dönem programı',
  'YÖS dönem programı',
  '9, 10, 11. Sınıf dönem programı',
  'TYT dönem programı',
  'AYT dönem programı',
  'TYT + AYT dönem programı',
  'TYT Maarif Model yaz kampı',
  'TYT yaz kampı',
  'LGS yaz kampı',
  '5, 6, 7. Sınıf yaz kampı',
  'Kitap Okuma Atölyesi',
  '3 ve 4. Sınıf yaz kampı'
]);

function pickFirstNonEmpty(...vals) {
  for (const v of vals) {
    const t = String(v ?? '').trim();
    if (t) return t;
  }
  return '';
}

/** Yazma: gövdedeki institution_id öncelikli; admin/koçta JWT kurumu veya erişilebilir kurum. */
function resolveWriteInstitutionId(actor, bodyInstitutionId) {
  const role = String(actor.role || '');
  const bodyId = String(bodyInstitutionId || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') {
    return bodyId || actorId;
  }
  if (bodyId && hasInstitutionAccess(actor, bodyId)) return bodyId;
  return actorId;
}

/** Okuma (query): admin/koç üst çubuktan gelen institution_id ile şablon/öğrenci listesi. */
function resolveReadInstitutionId(actor, queryInstitutionId) {
  const role = String(actor.role || '');
  const q = String(queryInstitutionId || '').trim();
  const actorId = String(actor.institution_id || '').trim();
  if (role === 'super_admin') return q;
  if (q && hasInstitutionAccess(actor, q)) return q;
  return actorId;
}

function userRowIsStudentLike(row) {
  if (!row) return false;
  const r = String(row.role || '')
    .toLowerCase()
    .trim();
  if (r === 'super_admin' || r === 'admin') return false;
  if (r === 'student') return true;
  const arr = Array.isArray(row.roles) ? row.roles : [];
  return arr.some((x) => String(x || '')
    .toLowerCase()
    .trim() === 'student');
}

function parseBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b || '{}');
    } catch {
      return {};
    }
  }
  return {};
}

function publicBaseUrl() {
  const u = process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL || process.env.APP_PUBLIC_URL;
  if (u && String(u).trim()) return String(u).replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}`;
  return '';
}

/** Veli sözleşme HTML'ini mevcut satır + güncel kayıt JSON ile yeniden üretir (taksit vade düzenlemesi vb.). */
async function rebuildContractMergedHtml(existing, kayitJson) {
  const institutionId = String(existing.institution_id || '').trim();
  const { data: inst, error: iErr } = await supabaseAdmin
    .from('institutions')
    .select('id,name')
    .eq('id', institutionId)
    .maybeSingle();
  if (iErr) throw iErr;

  const verifyToken = String(existing.verify_token || '');
  const base = publicBaseUrl();
  const verifyUrl = verifyToken && base ? `${base}/verify-document?t=${encodeURIComponent(verifyToken)}` : '#';
  const kurum_kodu = institutionCodeFromRow(inst || { id: institutionId });
  const sozlesme_turu = normalizeSozlesmeTuru(existing.sozlesme_turu);
  const sozlesme_basligi =
    String(existing.sozlesme_basligi || '').trim() || resolveSozlesmeBasligi(sozlesme_turu, '', '');
  const institution_legal_html = await institutionLegalHtmlForContract(institutionId, sozlesme_turu);
  const dersSnapshot = normalizeDersSatirlari(existing.ders_programi_snapshot);
  const para_birimi = normalizeParaBirimi(existing.para_birimi);
  const kj = kayitJson && typeof kayitJson === 'object' ? kayitJson : {};
  const taksit_kartlari = Array.isArray(kj.taksit_kartlari) ? kj.taksit_kartlari : [];
  const taksit_sayisi = Math.max(
    1,
    Math.min(48, Math.round(Number(existing.taksit_sayisi) || taksit_kartlari.length || 1))
  );

  return buildParentContractHtml({
    ogrenci_ad: String(existing.ogrenci_ad || ''),
    ogrenci_soyad: String(existing.ogrenci_soyad || ''),
    veli_ad: String(existing.veli_ad || ''),
    veli_soyad: String(existing.veli_soyad || ''),
    telefon: String(existing.telefon || ''),
    adres: String(existing.adres || ''),
    sinif: String(existing.sinif || ''),
    program_adi: String(existing.program_adi || ''),
    baslangic_tarihi: String(existing.baslangic_tarihi || '').slice(0, 10),
    bitis_tarihi: String(existing.bitis_tarihi || '').slice(0, 10),
    haftalik_ders_saati: Number(existing.haftalik_ders_saati) || 0,
    ucret: Number(existing.ucret) || 0,
    taksit_sayisi,
    para_birimi,
    kurum_kodu,
    contract_number: String(existing.contract_number || ''),
    kurum_adi: inst?.name || '',
    verify_url: verifyUrl || '#',
    document_title: sozlesme_basligi,
    extra_detail_plain: String(existing.sablon_ek_detay_snapshot || ''),
    ders_satirlari: dersSnapshot,
    kayit_formu_detay: kj,
    taksit_kartlari,
    institution_legal_html
  });
}

const PLATFORM_INSTITUTION_ID = '73323d75-eea1-4552-8bba-d50555423589';

function verifyPublicFormKey(req) {
  const expected = String(process.env.BOOK_ORDER_FORM_SECRET || '').trim();
  if (!expected) return false;
  const header = String(req.headers['x-form-key'] || req.headers['x-book-order-key'] || '').trim();
  const query = String(req.query?.key || '').trim();
  return header === expected || query === expected;
}

/** Veli kayıt formu — gizli anahtar veya izinli kurum kimliği */
function verifyPublicFormSubmit(req, body) {
  if (verifyPublicFormKey(req)) return true;
  const allowed = new Set(
    [PLATFORM_INSTITUTION_ID, String(process.env.BOOK_ORDER_INSTITUTION_ID || '').trim()].filter(Boolean)
  );
  return allowed.has(String(body?.institution_id || '').trim());
}

function defaultProgramPeriodDates() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= 9 ? y : y - 1;
  const endYear = startYear + 1;
  return {
    baslangic_tarihi: `${startYear}-09-01`,
    bitis_tarihi: `${endYear}-06-30`
  };
}

/** Veli kayıt formu alanları — hata kodu veya normalize edilmiş kayıt verisi */
function parsePublicRegistrationFields(body) {
  const T = (k) => String(body[k] ?? '').trim();
  if (!body.kvkk_form_ok) return { error: 'kvkk_form_required', status: 400 };
  if (!body.satis_kvkk_form_ok) return { error: 'satis_kvkk_form_required', status: 400 };

  const ogrenci_ad = T('ogrenci_ad');
  const ogrenci_soyad = T('ogrenci_soyad');
  const veli_ad = T('veli_ad');
  const veli_soyad = T('veli_soyad');
  let tcDigits = T('tc_kimlik').replace(/\D/g, '');
  const dogum_tarihi = T('dogum_tarihi').slice(0, 10);
  const okul_adi = T('okul_adi');
  const eposta = T('eposta');
  const il = T('il');
  const ilce = T('ilce');
  let veli_tel = normalizePhoneToE164(T('veli_tel'));
  veli_tel = veli_tel ? veli_tel.replace(/\D/g, '') : '';
  let ogrenci_tel = normalizePhoneToE164(T('ogrenci_tel'));
  ogrenci_tel = ogrenci_tel ? ogrenci_tel.replace(/\D/g, '') : '';
  const sinif_form = T('sinif_form');
  const adres_aciklama = T('adres_aciklama');
  const programs = parseVeliProgramForms(body);

  if (!ogrenci_ad || !ogrenci_soyad || !veli_ad || !veli_soyad) {
    return { error: 'names_required', status: 400 };
  }
  if (tcDigits.length > 0 && tcDigits.length !== 11) return { error: 'tc_invalid', status: 400 };
  if (!eposta || !eposta.includes('@')) return { error: 'eposta_invalid', status: 400 };
  if (programs.length < 1 || programs.length > VELI_KAYIT_MAX_PROGRAMS) {
    return { error: 'program_invalid', status: 400 };
  }
  for (const p of programs) {
    if (!VELI_KAYIT_PROGRAM_SET.has(p)) return { error: 'program_invalid', status: 400 };
  }
  if (!veli_tel || veli_tel.length < 10 || veli_tel.length > 15) return { error: 'veli_tel_invalid', status: 400 };
  if (!ogrenci_tel || ogrenci_tel.length < 10 || ogrenci_tel.length > 15) return { error: 'ogrenci_tel_invalid', status: 400 };
  if (!adres_aciklama) return { error: 'adres_required', status: 400 };
  if (!il) return { error: 'il_required', status: 400 };
  if (!ilce) return { error: 'ilce_required', status: 400 };

  const program_adi = programs.join(' + ');
  let sinif = pickFirstNonEmpty(sinif_form);
  for (const p of programs) {
    sinif = resolveSinifFromVeliKayit(p, sinif) || sinif;
  }
  if (!sinif || !program_adi) return { error: 'sinif_program_required', status: 400 };

  const adres = [il, ilce, adres_aciklama].map((x) => String(x || '').trim()).join(' · ');
  const odeme_tercihi_veli = normalizeOdemeTercihiVeli(body.odeme_tercihi_veli);
  const muhasebe_ozet = `Kayıt | ${ogrenci_ad} ${ogrenci_soyad} | Program: ${program_adi} | Sınıf: ${sinif} | Ücret: kurum tarafından girilecek | ${odemeTercihiVeliLabelTr(odeme_tercihi_veli)} | E-posta: ${eposta} | Veli tel: ${veli_tel} | Öğr. tel: ${ogrenci_tel}`;

  return {
    data: {
      ogrenci_ad,
      ogrenci_soyad,
      veli_ad,
      veli_soyad,
      telefon: veli_tel,
      veli_tel,
      ogrenci_tel,
      adres,
      sinif,
      program_adi,
      programs,
      tcDigits,
      dogum_tarihi,
      okul_adi,
      eposta,
      il,
      ilce,
      odeme_tercihi_veli,
      muhasebe_ozet
    }
  };
}

export default async function handler(req, res) {
  const verify = String(req.query.verify || '').trim();
  if (req.method === 'GET' && verify) {
    try {
      const { data: row, error } = await supabaseAdmin
        .from('parent_sign_contracts')
        .select(
          'id,contract_number,status,signed_at,ogrenci_ad,ogrenci_soyad,institution_id,created_at'
        )
        .eq('verify_token', verify)
        .maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ ok: false, error: 'not_found' });
      let instName = '';
      if (row.institution_id) {
        const { data: inst } = await supabaseAdmin.from('institutions').select('name').eq('id', row.institution_id).maybeSingle();
        instName = inst?.name || '';
      }
      const studentLabel = `${row.ogrenci_ad || ''} ${row.ogrenci_soyad || ''}`.trim();
      return res.status(200).json({
        ok: true,
        contract_number: row.contract_number,
        status: row.status,
        signed_at: row.signed_at,
        institution_name: instName,
        issued_at: row.created_at,
        student_label: studentLabel
      });
    } catch (e) {
      return res.status(500).json({ ok: false, error: errorMessage(e) });
    }
  }

  const signingToken = String(req.query.signing_token || '').trim();
  if (req.method === 'GET' && signingToken) {
    try {
      const { data: row, error } = await supabaseAdmin
        .from('parent_sign_contracts')
        .select(
          'id,merged_html,contract_number,status,signed_at,institution_id,preset_id,signature_png_base64,kayit_formu_json,program_adi,sinif,baslangic_tarihi,bitis_tarihi,ucret,taksit_sayisi,para_birimi'
        )
        .eq('signing_token', signingToken)
        .maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'not_found' });
      let institution_name = '';
      if (row.institution_id) {
        const { data: inst } = await supabaseAdmin.from('institutions').select('name').eq('id', row.institution_id).maybeSingle();
        institution_name = inst?.name || '';
      }
      const statusSigned = String(row.status || '').toLowerCase() === 'signed';
      const hasSignedAt = Boolean(row.signed_at);
      const alreadySigned = statusSigned || hasSignedAt;
      const sigRaw = row.signature_png_base64 != null ? String(row.signature_png_base64).trim() : '';
      const signature_png_base64 = alreadySigned && sigRaw.length > 80 ? sigRaw : null;
      const kj = row.kayit_formu_json;
      const j = kj && typeof kj === 'object' ? kj : {};
      const needs_student_form = String(j.phase || '') === 'needs_form';
      const awaiting_admin_price = String(j.phase || '') === 'awaiting_admin_price';
      const legalRow = row.institution_id ? await loadInstitutionLegal(row.institution_id) : null;
      const { kvkk_doc_href, satis_doc_href } = resolveLegalDocHrefs(legalRow);
      let program_icerik_href = null;
      const presetIdVeli = String(row.preset_id || '').trim();
      if (presetIdVeli) {
        const { data: pr } = await supabaseAdmin
          .from('parent_sign_class_presets')
          .select('program_icerik_url,institution_id')
          .eq('id', presetIdVeli)
          .maybeSingle();
        if (pr && String(pr.institution_id) === String(row.institution_id || '')) {
          program_icerik_href = resolveOptionalDocUrl(pr.program_icerik_url);
        }
      }
      // Veli sayfası ücret sonrası güncellensin; CDN/tarayıcı GET önbelleği imzayı geciktirmesin.
      res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      return res.status(200).json({
        data: {
          document_id: row.id,
          merged_html: row.merged_html,
          contract_number: row.contract_number,
          already_signed: alreadySigned,
          signed_at: row.signed_at,
          institution_name,
          signature_png_base64,
          needs_student_form,
          awaiting_admin_price,
          kvkk_doc_href,
          satis_doc_href,
          program_icerik_href,
          registration_phase: String(j.phase || '') || null,
          registration_hint: {
            program_adi: row.program_adi,
            sinif: row.sinif,
            baslangic_tarihi: row.baslangic_tarihi,
            bitis_tarihi: row.bitis_tarihi,
            ucret: row.ucret,
            para_birimi: resolveRowParaBirimi(row),
            taksit_sayisi: row.taksit_sayisi
          }
        }
      });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  const hasBearer = String(req.headers.authorization || '').trim().startsWith('Bearer ');
  if (req.method === 'POST' && !hasBearer) {
    const body = parseBody(req);
    const action = String(body.action || '').trim();
    const op = String(req.query.op || '').trim();

    if (action === 'public_register' || op === 'public-register') {
      if (!verifyPublicFormSubmit(req, body)) {
        return res.status(403).json({
          error: 'forbidden',
          hint: 'Form gönderimi için geçerli institution_id veya BOOK_ORDER_FORM_SECRET gerekli.'
        });
      }
      const parsed = parsePublicRegistrationFields(body);
      if (parsed.error) {
        return res.status(parsed.status || 400).json({ error: parsed.error });
      }
      const reg = parsed.data;
      const institutionId = String(body.institution_id || PLATFORM_INSTITUTION_ID).trim();
      try {
        const { data: inst, error: iErr } = await supabaseAdmin
          .from('institutions')
          .select('id,name')
          .eq('id', institutionId)
          .maybeSingle();
        if (iErr) throw iErr;
        if (!inst) return res.status(400).json({ error: 'institution_not_found' });

        const { baslangic_tarihi: bas, bitis_tarihi: bit } = defaultProgramPeriodDates();
        const suggested = suggestHoursAndFeeFromSinif(reg.sinif);
        const sozlesme_turu = normalizeSozlesmeTuru('satis_sozlesmesi');
        const sozlesme_basligi = resolveSozlesmeBasligi(sozlesme_turu, '', '');
        const kurum_kodu = institutionCodeFromRow(inst);
        const cnum = contractNumber(kurum_kodu);
        const verifyToken = randomToken(20);
        const signingTokenNew = randomToken(32);
        const base = publicBaseUrl();
        const now = new Date().toISOString();
        const para_birimi = normalizeParaBirimi('TRY');

        const kayit_formu_json = {
          phase: 'awaiting_admin_price',
          programlar: reg.programs,
          tc_kimlik: reg.tcDigits.length === 11 ? reg.tcDigits : '',
          dogum_tarihi: reg.dogum_tarihi || '',
          okul_adi: reg.okul_adi || '',
          eposta: reg.eposta,
          il: reg.il || '',
          ilce: reg.ilce || '',
          veli_tel: reg.veli_tel,
          ogrenci_tel: reg.ogrenci_tel,
          odeme_tercihi_veli: reg.odeme_tercihi_veli,
          muhasebe_ozet: reg.muhasebe_ozet,
          form_submitted_at: now,
          source: 'public_kayit_formu'
        };

        const merged_html = buildAwaitingAdminPriceHtml({
          kurum_adi: inst?.name || '',
          contract_number: cnum,
          ogrenci_label: `${reg.ogrenci_ad} ${reg.ogrenci_soyad}`.trim(),
          program_adi: reg.program_adi,
          sinif: reg.sinif
        });

        const row = {
          institution_id: institutionId,
          created_by: null,
          ogrenci_ad: reg.ogrenci_ad,
          ogrenci_soyad: reg.ogrenci_soyad,
          veli_ad: reg.veli_ad,
          veli_soyad: reg.veli_soyad,
          telefon: reg.telefon,
          adres: reg.adres,
          sinif: reg.sinif,
          program_adi: reg.program_adi,
          baslangic_tarihi: bas,
          bitis_tarihi: bit,
          haftalik_ders_saati: suggested.hours,
          ucret: 0,
          taksit_sayisi: 1,
          para_birimi,
          kurum_kodu,
          contract_number: cnum,
          verify_token: verifyToken,
          signing_token: signingTokenNew,
          status: 'draft',
          merged_html,
          sozlesme_turu,
          sozlesme_basligi,
          sablon_ek_detay_snapshot: '',
          ders_programi_snapshot: [],
          kayit_formu_json,
          created_at: now,
          updated_at: now
        };

        const { data: created, error: insErr } = await supabaseAdmin
          .from('parent_sign_contracts')
          .insert(row)
          .select()
          .single();
        if (insErr) {
          console.error('[parent-sign-contracts public_register]', insErr);
          return res.status(500).json({ error: errorMessage(insErr) });
        }
        const signPath = `/veli-imza/${encodeURIComponent(signingTokenNew)}`;
        const signUrl = base ? `${base}${signPath}` : signPath;
        void notifyAdminsOnVeliKayitForm({
          contract: created,
          reg,
          institution: inst,
          signUrl
        }).catch((e) => {
          console.warn('[parent-sign-contracts public_register notify]', errorMessage(e));
        });
        return res.status(200).json({
          ok: true,
          sign_url: signUrl,
          contract_number: cnum,
          data: { ...created, sign_url: signUrl }
        });
      } catch (e) {
        console.error('[parent-sign-contracts public_register]', errorMessage(e), e);
        return res.status(500).json({ error: errorMessage(e) });
      }
    }

    if (action === 'submit_registration_form') {
      const token = String(body.signing_token || signingToken || '').trim();
      if (!token) return res.status(400).json({ error: 'signing_token_required' });
      const parsed = parsePublicRegistrationFields(body);
      if (parsed.error) {
        return res.status(parsed.status || 400).json({ error: parsed.error });
      }
      const reg = parsed.data;
      try {
        const { data: row, error: dErr } = await supabaseAdmin.from('parent_sign_contracts').select('*').eq('signing_token', token).maybeSingle();
        if (dErr) throw dErr;
        if (!row) return res.status(404).json({ error: 'not_found' });
        const kj = row.kayit_formu_json;
        const j = kj && typeof kj === 'object' ? kj : {};
        if (String(j.phase || '') !== 'needs_form') {
          return res.status(400).json({ error: 'registration_form_not_expected' });
        }
        const done = String(row.status || '').toLowerCase() === 'signed' || Boolean(row.signed_at);
        if (done) return res.status(400).json({ error: 'already_processed' });

        let sinif = pickFirstNonEmpty(reg.sinif, row.sinif);
        for (const p of reg.programs) {
          sinif = resolveSinifFromVeliKayit(p, sinif) || sinif;
        }
        const program_adi = reg.program_adi || pickFirstNonEmpty(row.program_adi);
        if (!sinif || !program_adi) return res.status(400).json({ error: 'sinif_program_required' });

        const {
          ogrenci_ad,
          ogrenci_soyad,
          veli_ad,
          veli_soyad,
          veli_tel,
          ogrenci_tel,
          adres,
          programs,
          tcDigits,
          dogum_tarihi,
          okul_adi,
          eposta,
          il,
          ilce,
          odeme_tercihi_veli
        } = reg;

        const muhasebe_ozet = `Kayıt | ${ogrenci_ad} ${ogrenci_soyad} | Program: ${program_adi} | Sınıf: ${sinif} | Ücret: kurum tarafından girilecek | ${odemeTercihiVeliLabelTr(odeme_tercihi_veli)} | E-posta: ${eposta} | Veli tel: ${veli_tel} | Öğr. tel: ${ogrenci_tel}`;

        const nextJson = {
          phase: 'awaiting_admin_price',
          programlar: programs,
          tc_kimlik: tcDigits.length === 11 ? tcDigits : '',
          dogum_tarihi: dogum_tarihi || '',
          okul_adi: okul_adi || '',
          eposta,
          il: il || '',
          ilce: ilce || '',
          veli_tel,
          ogrenci_tel,
          odeme_tercihi_veli,
          muhasebe_ozet,
          form_submitted_at: new Date().toISOString()
        };

        const { data: inst, error: iErr } = await supabaseAdmin
          .from('institutions')
          .select('id,name')
          .eq('id', row.institution_id)
          .maybeSingle();
        if (iErr) throw iErr;

        const merged_html = buildAwaitingAdminPriceHtml({
          kurum_adi: inst?.name || '',
          contract_number: String(row.contract_number || ''),
          ogrenci_label: `${ogrenci_ad} ${ogrenci_soyad}`.trim(),
          program_adi,
          sinif
        });

        const now = new Date().toISOString();
        const { error: uErr } = await supabaseAdmin
          .from('parent_sign_contracts')
          .update({
            ogrenci_ad,
            ogrenci_soyad,
            veli_ad,
            veli_soyad,
            telefon: veli_tel,
            adres,
            sinif,
            program_adi,
            kayit_formu_json: nextJson,
            merged_html,
            updated_at: now
          })
          .eq('id', row.id);
        if (uErr) throw uErr;
        const updatedRow = {
          ...row,
          ogrenci_ad,
          ogrenci_soyad,
          veli_ad,
          veli_soyad,
          telefon: veli_tel,
          adres,
          sinif,
          program_adi,
          kayit_formu_json: nextJson,
          merged_html
        };
        void notifyAdminsOnVeliKayitForm({
          contract: updatedRow,
          reg,
          institution: inst,
          signUrl: publicBaseUrl() ? `${publicBaseUrl()}/veli-imza/${encodeURIComponent(token)}` : ''
        }).catch((e) => {
          console.warn('[parent-sign-contracts registration notify]', errorMessage(e));
        });
        return res.status(200).json({ ok: true });
      } catch (e) {
        console.error('[parent-sign-contracts registration]', errorMessage(e), e);
        return res.status(500).json({ error: errorMessage(e) });
      }
    }

    const token = String(body.signing_token || signingToken || '').trim();
    if (!token) return res.status(400).json({ error: 'signing_token_required' });
    if (!body.kvkk_ok || !body.contract_ok) return res.status(400).json({ error: 'confirmations_required' });
    const png = typeof body.signature_png_base64 === 'string' ? body.signature_png_base64.trim() : '';
    if (!png || png.length < 80) return res.status(400).json({ error: 'signature_required' });
    try {
      const { data: row, error: dErr } = await supabaseAdmin
        .from('parent_sign_contracts')
        .select('*')
        .eq('signing_token', token)
        .maybeSingle();
      if (dErr) throw dErr;
      if (!row) return res.status(404).json({ error: 'not_found' });
      const kj = row.kayit_formu_json;
      const j = kj && typeof kj === 'object' ? kj : {};
      if (String(j.phase || '') === 'needs_form') {
        return res.status(400).json({ error: 'registration_form_required_first' });
      }
      if (String(j.phase || '') === 'awaiting_admin_price') {
        return res.status(400).json({ error: 'admin_price_required_before_sign' });
      }
      const done = String(row.status || '').toLowerCase() === 'signed' || Boolean(row.signed_at);
      if (done) {
        let provision = null;
        try {
          provision = await provisionStudentFromParentSignContract(row, { source: 'veli_imza_signed' });
        } catch (provErr) {
          provision = { ok: false, error: errorMessage(provErr) };
        }
        return res.status(200).json({ ok: true, duplicate: true, provision });
      }

      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '')
        .split(',')[0]
        .trim();
      const ua = String(req.headers['user-agent'] || '');
      const now = new Date().toISOString();

      const { error: uErr } = await supabaseAdmin
        .from('parent_sign_contracts')
        .update({
          status: 'signed',
          signature_png_base64: png.slice(0, 500000),
          terms_accepted_at: now,
          signer_ip: ip || null,
          signer_user_agent: ua || null,
          signed_at: now,
          updated_at: now
        })
        .eq('id', row.id);
      if (uErr) throw uErr;

      let provision = null;
      try {
        provision = await provisionStudentFromParentSignContract(
          { ...row, status: 'signed', signed_at: now },
          { source: 'veli_imza_signed' }
        );
      } catch (provErr) {
        console.error('[parent-sign-contracts provision after sign]', errorMessage(provErr), provErr);
        provision = { ok: false, error: errorMessage(provErr) };
      }

      return res.status(200).json({ ok: true, provision });
    } catch (e) {
      console.error('[parent-sign-contracts POST public]', errorMessage(e), e);
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  let actor;
  try {
    actor = requireAuthenticatedActor(req);
  } catch {
    return res.status(401).json({ error: 'Missing token' });
  }

  const role = String(actor.role || '');
  const canManage = role === 'super_admin' || role === 'admin' || role === 'coach';
  if (!canManage) return res.status(403).json({ error: 'forbidden' });

  try {
    if (req.method === 'GET') {
      if (String(req.query.fill_students || '') === '1') {
        let instId = resolveReadInstitutionId(actor, req.query.institution_id);
        if (!instId) {
          if (role === 'super_admin') return res.status(400).json({ error: 'institution_id_query_required' });
          return res.status(400).json({ error: 'institution_required' });
        }
        if ((role === 'admin' || role === 'coach') && !hasInstitutionAccess(actor, instId)) {
          return res.status(403).json({ error: 'forbidden' });
        }
        const { data: studs, error: sErr } = await supabaseAdmin
          .from('students')
          .select('id,name,parent_name,parent_phone,phone,class_level,user_id,institution_id')
          .eq('institution_id', instId)
          .order('created_at', { ascending: false })
          .limit(400);
        if (sErr) throw sErr;

        const { data: ufetch, error: uErr } = await supabaseAdmin
          .from('users')
          .select('id,name,phone,email,role,roles,institution_id')
          .eq('institution_id', instId)
          .order('name', { ascending: true })
          .limit(400);
        if (uErr) throw uErr;
        const user_students = (ufetch || [])
          .filter(userRowIsStudentLike)
          .map((u) => ({
            id: String(u.id || ''),
            name: String(u.name || '').trim() || '(İsimsiz)',
            phone: u.phone != null ? String(u.phone) : null,
            email: u.email != null ? String(u.email) : null
          }))
          .filter((u) => u.id);

        return res.status(200).json({ data: { students: studs || [], user_students } });
      }

      let q = supabaseAdmin.from('parent_sign_contracts').select('*').order('created_at', { ascending: false }).limit(200);
      if (role === 'admin' && actor.institution_id) {
        q = q.eq('institution_id', actor.institution_id);
      } else if (role === 'coach' && actor.institution_id) {
        q = q.eq('institution_id', actor.institution_id);
      } else if (role !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { data, error } = await q;
      if (error) {
        if (String(error.message || '').includes('relation') || error.code === '42P01') {
          return res.status(200).json({
            data: [],
            hint: 'parent_sign_contracts tablosu için 2026-05-11-parent-sign-contracts.sql çalıştırın.'
          });
        }
        throw error;
      }
      const enriched = (data || []).map((row) => ({
        ...row,
        para_birimi: resolveRowParaBirimi(row)
      }));
      return res.status(200).json({ data: enriched });
    }

    if (req.method === 'DELETE') {
      const id = String(req.query.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });
      const { data: existing, error: fe } = await supabaseAdmin
        .from('parent_sign_contracts')
        .select('id,institution_id')
        .eq('id', id)
        .maybeSingle();
      if (fe) throw fe;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (role !== 'super_admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }
      const { error: de } = await supabaseAdmin.from('parent_sign_contracts').delete().eq('id', id);
      if (de) throw de;
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const id = String(body.id || '').trim();
      if (!id) return res.status(400).json({ error: 'id_required' });

      const { data: existing, error: fe } = await supabaseAdmin.from('parent_sign_contracts').select('*').eq('id', id).maybeSingle();
      if (fe) throw fe;
      if (!existing) return res.status(404).json({ error: 'not_found' });
      if (role !== 'super_admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
      }

      const existingSigned =
        String(existing.status || '').toLowerCase() === 'signed' || Boolean(existing.signed_at);

      const mergeVade = body.taksit_vade_update;
      if (mergeVade && mergeVade !== null && typeof mergeVade === 'object' && mergeVade.index != null) {
        const kjV = existing.kayit_formu_json && typeof existing.kayit_formu_json === 'object' ? { ...existing.kayit_formu_json } : {};
        const tkV = Array.isArray(kjV.taksit_kartlari) ? [...kjV.taksit_kartlari] : [];
        const idxV = Math.max(0, Math.round(Number(mergeVade.index)));
        if (idxV < 0 || idxV >= tkV.length) return res.status(400).json({ error: 'taksit_index_invalid' });
        const vadeRaw = String(mergeVade.vade_tarihi || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(vadeRaw)) return res.status(400).json({ error: 'vade_tarihi_invalid' });
        const curV = tkV[idxV] && typeof tkV[idxV] === 'object' ? { ...tkV[idxV] } : { no: idxV + 1 };
        tkV[idxV] = { ...curV, vade_tarihi: vadeRaw };
        kjV.taksit_kartlari = tkV;
        const nowV = new Date().toISOString();
        const isSignedV =
          String(existing.status || '').toLowerCase() === 'signed' || Boolean(existing.signed_at);
        const updateV = { kayit_formu_json: kjV, updated_at: nowV };
        if (!isSignedV && Number(existing.ucret) > 0) {
          try {
            updateV.merged_html = await rebuildContractMergedHtml(existing, kjV);
          } catch (rebuildErr) {
            console.warn(
              '[parent-sign-contracts] merged_html rebuild on taksit_vade_update',
              rebuildErr instanceof Error ? rebuildErr.message : String(rebuildErr)
            );
          }
        }
        const { data: updV, error: uErrV } = await supabaseAdmin
          .from('parent_sign_contracts')
          .update(updateV)
          .eq('id', id)
          .select()
          .single();
        if (uErrV) throw uErrV;
        return res.status(200).json({ data: updV });
      }

      const mergeTak = body.taksit_odeme_update;
      if (mergeTak && mergeTak !== null && typeof mergeTak === 'object' && mergeTak.index != null) {
        const kjM = existing.kayit_formu_json && typeof existing.kayit_formu_json === 'object' ? { ...existing.kayit_formu_json } : {};
        const tk = Array.isArray(kjM.taksit_kartlari) ? [...kjM.taksit_kartlari] : [];
        const idx = Math.max(0, Math.round(Number(mergeTak.index)));
        if (idx < 0 || idx >= tk.length) return res.status(400).json({ error: 'taksit_index_invalid' });
        const cur = tk[idx] && typeof tk[idx] === 'object' ? { ...tk[idx] } : { no: idx + 1 };
        const wasPaidBefore = Boolean(cur.odendi);
        const paid = Boolean(mergeTak.odendi);
        const todayStr = new Date().toISOString().slice(0, 10);
        tk[idx] = {
          ...cur,
          odendi: paid,
          odendi_tarihi: paid ? String(mergeTak.odendi_tarihi || '').trim().slice(0, 10) || todayStr : '',
          odeme_notu: mergeTak.not != null ? String(mergeTak.not).slice(0, 200) : String(cur.odeme_notu || '')
        };
        kjM.taksit_kartlari = tk;
        const nowM = new Date().toISOString();
        const { data: updM, error: uErrM } = await supabaseAdmin
          .from('parent_sign_contracts')
          .update({ kayit_formu_json: kjM, updated_at: nowM })
          .eq('id', id)
          .select()
          .single();
        if (uErrM) throw uErrM;
        if (paid && !wasPaidBefore) {
          void notifyTaksitMarkedPaid({ ...existing, kayit_formu_json: kjM }, idx, wasPaidBefore).catch((e) => {
            console.warn('[parent-sign-contracts] taksit paid whatsapp', e instanceof Error ? e.message : String(e));
          });
        }
        return res.status(200).json({ data: updM });
      }

      const kjm = body.kayit_json_merge;
      if (kjm && typeof kjm === 'object' && !Array.isArray(kjm) && Object.keys(kjm).length > 0) {
        const baseJ = existing.kayit_formu_json && typeof existing.kayit_formu_json === 'object' ? { ...existing.kayit_formu_json } : {};
        const mergedJ = { ...baseJ, ...kjm };
        const nowJ = new Date().toISOString();
        const { data: updJ2, error: erJ2 } = await supabaseAdmin
          .from('parent_sign_contracts')
          .update({ kayit_formu_json: mergedJ, updated_at: nowJ })
          .eq('id', id)
          .select()
          .single();
        if (erJ2) throw erJ2;
        return res.status(200).json({ data: updJ2 });
      }

      if (existingSigned) {
        return res.status(400).json({ error: 'contract_already_signed' });
      }

      const institutionId = String(existing.institution_id || '').trim();
      let presetRow = null;
      const presetIdExisting = String(existing.preset_id || '').trim();
      if (presetIdExisting) {
        const { data: pr, error: pe } = await supabaseAdmin
          .from('parent_sign_class_presets')
          .select('*')
          .eq('id', presetIdExisting)
          .maybeSingle();
        if (pe) throw pe;
        if (pr && String(pr.institution_id) === institutionId) presetRow = pr;
      }

      const ogrenci_ad = pickFirstNonEmpty(body.ogrenci_ad, existing.ogrenci_ad);
      const ogrenci_soyad = pickFirstNonEmpty(body.ogrenci_soyad, existing.ogrenci_soyad);
      const veli_ad = pickFirstNonEmpty(body.veli_ad, existing.veli_ad);
      const veli_soyad = pickFirstNonEmpty(body.veli_soyad, existing.veli_soyad);
      const telefon = pickFirstNonEmpty(body.telefon, existing.telefon);
      const adres = body.adres !== undefined ? String(body.adres || '').trim() : String(existing.adres || '').trim();
      const program_adi = pickFirstNonEmpty(body.program_adi, existing.program_adi);
      let sinif =
        resolveSinifFromVeliKayit(program_adi, pickFirstNonEmpty(body.sinif, existing.sinif)) ||
        pickFirstNonEmpty(body.sinif, existing.sinif);
      const bas = String(pickFirstNonEmpty(body.baslangic_tarihi, existing.baslangic_tarihi) || '')
        .trim()
        .slice(0, 10);
      const bit = String(pickFirstNonEmpty(body.bitis_tarihi, existing.bitis_tarihi) || '')
        .trim()
        .slice(0, 10);
      if (!ogrenci_ad || !ogrenci_soyad || !veli_ad || !veli_soyad || !telefon || !sinif || !program_adi || !bas || !bit) {
        return res.status(400).json({ error: 'fields_required' });
      }

      const { data: inst, error: iErr } = await supabaseAdmin
        .from('institutions')
        .select('id,name')
        .eq('id', institutionId)
        .maybeSingle();
      if (iErr) throw iErr;

      const sozlesme_turu = normalizeSozlesmeTuru(pickFirstNonEmpty(body.sozlesme_turu, existing.sozlesme_turu));
      const sozlesme_ozel = presetRow ? String(presetRow.sozlesme_ozel_baslik || '') : '';
      const explicitBaslik = String(body.sozlesme_basligi ?? '').trim();
      const sozlesme_basligi = explicitBaslik || resolveSozlesmeBasligi(sozlesme_turu, sozlesme_ozel, '');

      const sablon_ek_detay_snapshot =
        body.sablon_ek_detay_snapshot !== undefined && body.sablon_ek_detay_snapshot !== null
          ? String(body.sablon_ek_detay_snapshot || '').trim()
          : String(existing.sablon_ek_detay_snapshot || '').trim();

      let dersSnapshot =
        body.ders_satirlari !== undefined && body.ders_satirlari !== null
          ? normalizeDersSatirlari(body.ders_satirlari)
          : normalizeDersSatirlari(existing.ders_programi_snapshot);
      if (!dersSnapshot.length && presetRow) {
        dersSnapshot = normalizeDersSatirlari(presetRow.ders_satirlari);
      }

      const hoursRaw = body.haftalik_ders_saati;
      const feeRaw = body.ucret;
      const taksitRaw = body.taksit_sayisi;
      let hoursParsed =
        hoursRaw !== undefined && hoursRaw !== null && String(hoursRaw).trim() !== '' ? Number(hoursRaw) : NaN;
      let feeParsed =
        feeRaw !== undefined && feeRaw !== null && String(feeRaw).trim() !== '' ? Number(feeRaw) : NaN;
      const taksitParsed =
        taksitRaw !== undefined && taksitRaw !== null && String(taksitRaw).trim() !== '' ? Number(taksitRaw) : NaN;

      if (!Number.isFinite(hoursParsed)) {
        if (dersSnapshot.length) hoursParsed = sumDersHours(dersSnapshot);
        else if (presetRow != null) hoursParsed = Number(presetRow.haftalik_ders_saati);
        else hoursParsed = Number(existing.haftalik_ders_saati);
      }

      const suggested = suggestHoursAndFeeFromSinif(sinif);
      const hours = Number.isFinite(hoursParsed)
        ? Math.min(80, Math.max(0, hoursParsed))
        : suggested.hours;
      const fee = Number.isFinite(feeParsed)
        ? Math.min(999999999, Math.max(0, feeParsed))
        : Number.isFinite(Number(existing.ucret))
          ? Number(existing.ucret)
          : suggested.fee;
      const taksit_sayisi = Number.isFinite(taksitParsed)
        ? Math.min(48, Math.max(1, Math.round(taksitParsed)))
        : Number.isFinite(Number(existing.taksit_sayisi))
          ? Math.min(48, Math.max(1, Math.round(Number(existing.taksit_sayisi))))
          : 1;

      const kurum_kodu = institutionCodeFromRow(inst || { id: institutionId });
      const verifyToken = String(existing.verify_token || '');
      const base = publicBaseUrl();
      const verifyUrl = verifyToken && base ? `${base}/verify-document?t=${encodeURIComponent(verifyToken)}` : '#';

      const kj0 = existing.kayit_formu_json && typeof existing.kayit_formu_json === 'object' ? existing.kayit_formu_json : {};
      const phase0 = String(kj0.phase || '');
      let nextKayitJson;

      const MAX_MERGED_HTML = 1_500_000;
      const customMergedRaw =
        body.custom_merged_html !== undefined && body.custom_merged_html !== null
          ? String(body.custom_merged_html).trim()
          : '';
      let merged_html;
      let contractTaksitSayisi = taksit_sayisi;
      if (customMergedRaw.length > 0) {
        if (customMergedRaw.length < 30) {
          return res.status(400).json({ error: 'custom_merged_html_too_short' });
        }
        merged_html = customMergedRaw.slice(0, MAX_MERGED_HTML);
      } else {
        const taksitVadeleriBody = Array.isArray(body.taksit_vadeleri) ? body.taksit_vadeleri : null;
        const taksitTutarlariBody = Array.isArray(body.taksit_tutarlari) ? body.taksit_tutarlari : null;
        const existingTaksit = Array.isArray(kj0.taksit_kartlari) ? kj0.taksit_kartlari : [];
        const feeNum = Number(fee);
        const tN = Math.max(1, Math.min(48, Math.round(Number(taksit_sayisi) || 1)));
        const feeChanged =
          feeRaw !== undefined && feeRaw !== null && String(feeRaw).trim() !== '' && feeNum !== Number(existing.ucret);
        const taksitChanged =
          taksitRaw !== undefined && taksitRaw !== null && String(taksitRaw).trim() !== '' && tN !== Number(existing.taksit_sayisi);
        const basChanged =
          body.baslangic_tarihi !== undefined &&
          String(body.baslangic_tarihi || '').trim().slice(0, 10) !== String(existing.baslangic_tarihi || '').trim().slice(0, 10);

        if (phase0 === 'awaiting_admin_price') {
          if (!(feeNum > 0)) {
            return res.status(400).json({ error: 'ucret_required_before_signature_release' });
          }
          const odeme_sekli = normalizeOdemeSekli(body.odeme_sekli ?? kj0.odeme_sekli);
          const kkTahsil = Boolean(body.kk_tahsil_edildi);
          const planTaksitN = odeme_sekli === 'kredi_karti_tek' ? 1 : taksit_sayisi;
          let taksit_kartlari = buildTaksitPlan(feeNum, planTaksitN, bas, taksitVadeleriBody, taksitTutarlariBody);
          taksit_kartlari = applyKkTahsilToPlan(taksit_kartlari, odeme_sekli, kkTahsil);
          const planN = Math.max(1, taksit_kartlari.length);
          contractTaksitSayisi = planN;
          const ort = planN > 0 ? Math.round(feeNum / planN) : 0;
          const pb = normalizeParaBirimi(body.para_birimi ?? existing.para_birimi);
          const pbLbl = paraBirimiLabel(pb);
          const muhasebe_ozet2 = `Öğrenci: ${ogrenci_ad} ${ogrenci_soyad} | Program: ${program_adi} | Sınıf: ${sinif} | Toplam: ${feeNum} ${pbLbl} | ${odemeSekliLabelTr(odeme_sekli)} | ${planN} taksit | ~${ort} ${pbLbl}/taksit | E-posta: ${String(kj0.eposta || '')}`;
          nextKayitJson = {
            ...kj0,
            phase: 'ready_to_sign',
            para_birimi: pb,
            odeme_sekli,
            admin_priced_at: new Date().toISOString(),
            taksit_kartlari,
            muhasebe_ozet: muhasebe_ozet2
          };
        } else if (
          feeNum > 0 &&
          (taksitVadeleriBody ||
            taksitTutarlariBody ||
            (existingTaksit.length > 0 && (feeChanged || taksitChanged || basChanged)))
        ) {
          const fresh = buildTaksitPlan(feeNum, taksit_sayisi, bas, taksitVadeleriBody, taksitTutarlariBody);
          const taksit_kartlari = mergeTaksitPlans(existingTaksit, fresh);
          const pbUpd = normalizeParaBirimi(body.para_birimi ?? existing.para_birimi);
          nextKayitJson = { ...kj0, taksit_kartlari, para_birimi: pbUpd };
        }
        const para_birimi = normalizeParaBirimi(body.para_birimi ?? existing.para_birimi);
        const institution_legal_html = await institutionLegalHtmlForContract(institutionId, sozlesme_turu);
        const kayitDetayForBuild = nextKayitJson != null ? nextKayitJson : kj0;
        merged_html = buildParentContractHtml({
          ogrenci_ad,
          ogrenci_soyad,
          veli_ad,
          veli_soyad,
          telefon,
          adres,
          sinif,
          program_adi,
          baslangic_tarihi: bas,
          bitis_tarihi: bit,
          haftalik_ders_saati: hours,
          ucret: fee,
          taksit_sayisi: contractTaksitSayisi,
          para_birimi,
          kurum_kodu,
          contract_number: String(existing.contract_number || ''),
          kurum_adi: inst?.name || '',
          verify_url: verifyUrl || '#',
          document_title: sozlesme_basligi,
          extra_detail_plain: sablon_ek_detay_snapshot,
          ders_satirlari: dersSnapshot,
          kayit_formu_detay: kayitDetayForBuild,
          taksit_kartlari: kayitDetayForBuild.taksit_kartlari,
          institution_legal_html
        });
      }

      const now = new Date().toISOString();
      const updatePayload = {
        ogrenci_ad,
        ogrenci_soyad,
        veli_ad,
        veli_soyad,
        telefon,
        adres,
        sinif,
        program_adi,
        baslangic_tarihi: bas,
        bitis_tarihi: bit,
        haftalik_ders_saati: hours,
        ucret: fee,
        taksit_sayisi: contractTaksitSayisi,
        para_birimi: normalizeParaBirimi(body.para_birimi ?? existing.para_birimi),
        kurum_kodu,
        merged_html,
        sozlesme_turu,
        sozlesme_basligi,
        sablon_ek_detay_snapshot,
        ders_programi_snapshot: dersSnapshot,
        updated_at: now
      };
      if (nextKayitJson !== undefined) updatePayload.kayit_formu_json = nextKayitJson;

      const { data: updated, error: uErr } = await supabaseAdmin
        .from('parent_sign_contracts')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      if (uErr) throw uErr;

      if (phase0 === 'awaiting_admin_price' && nextKayitJson?.phase === 'ready_to_sign') {
        void notifyVeliSignReady({ contract: updated, institution: inst }).catch((e) => {
          console.warn('[parent-sign-contracts veli sign ready notify]', errorMessage(e));
        });
      }

      return res.status(200).json({ data: updated });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const postAction = String(body.action || '').trim();

      if (postAction === 'provision_student_account') {
        const id = String(body.id || body.contract_id || '').trim();
        if (!id) return res.status(400).json({ error: 'id_required' });
        const { data: row, error: fErr } = await supabaseAdmin
          .from('parent_sign_contracts')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (fErr) throw fErr;
        if (!row) return res.status(404).json({ error: 'not_found' });
        if (role === 'admin' || role === 'coach') {
          if (!hasInstitutionAccess(actor, row.institution_id)) return res.status(403).json({ error: 'forbidden' });
        }
        try {
          const provision = await provisionStudentFromParentSignContract(row, {
            force: Boolean(body.force),
            createdBy: actor.sub || null,
            source: 'admin_provision_button'
          });
          return res.status(200).json({ data: provision });
        } catch (provErr) {
          console.error('[parent-sign-contracts provision_student_account]', errorMessage(provErr), provErr);
          return res.status(500).json({ error: errorMessage(provErr) });
        }
      }

      const institutionId = resolveWriteInstitutionId(actor, body.institution_id);
      if (!institutionId) return res.status(400).json({ error: 'institution_required' });
      if (role === 'admin' || role === 'coach') {
        if (!hasInstitutionAccess(actor, institutionId)) return res.status(403).json({ error: 'forbidden' });
      }

      const presetId = String(body.preset_id || '').trim();
      const studentId = String(body.student_id || '').trim();
      const ogrenciUserIdRaw = String(body.ogrenci_user_id || '').trim();
      let presetRow = null;
      if (presetId) {
        const { data: pr, error: pe } = await supabaseAdmin
          .from('parent_sign_class_presets')
          .select('*')
          .eq('id', presetId)
          .maybeSingle();
        if (pe) throw pe;
        if (pr && String(pr.institution_id) === institutionId) presetRow = pr;
      }

      let studentRow = null;
      if (studentId) {
        const { data: sr, error: se } = await supabaseAdmin.from('students').select('*').eq('id', studentId).maybeSingle();
        if (se) throw se;
        if (!sr || String(sr.institution_id) !== institutionId) {
          return res.status(400).json({ error: 'student_not_found' });
        }
        studentRow = sr;
      }

      let userRow = null;
      let ogrenciUserId = '';
      if (!studentId && ogrenciUserIdRaw) {
        const { data: ur, error: ue } = await supabaseAdmin.from('users').select('*').eq('id', ogrenciUserIdRaw).maybeSingle();
        if (ue) throw ue;
        if (!ur || String(ur.institution_id) !== institutionId) {
          return res.status(400).json({ error: 'user_not_found' });
        }
        if (!userRowIsStudentLike(ur)) {
          return res.status(400).json({ error: 'user_not_student' });
        }
        userRow = ur;
        ogrenciUserId = ogrenciUserIdRaw;
      } else if (studentId && ogrenciUserIdRaw) {
        // Öğrenci kartı öncelikli; ikisi birden gönderilirse kullanıcı id yok sayılır
        ogrenciUserId = '';
      }

      const stParts = studentRow ? splitAdSoyad(studentRow.name) : { ad: '', soyad: '' };
      const uParts = userRow ? splitAdSoyad(userRow.name) : { ad: '', soyad: '' };
      const velParts = studentRow ? splitAdSoyad(studentRow.parent_name || '') : { ad: '', soyad: '' };

      const regFormFirst = Boolean(body.registration_student_form);

      let ogrenci_ad = pickFirstNonEmpty(body.ogrenci_ad, stParts.ad, uParts.ad);
      let ogrenci_soyad = pickFirstNonEmpty(body.ogrenci_soyad, stParts.soyad, uParts.soyad);
      let veli_ad = pickFirstNonEmpty(body.veli_ad, velParts.ad);
      let veli_soyad = pickFirstNonEmpty(body.veli_soyad, velParts.soyad);
      let telefon = pickFirstNonEmpty(body.telefon, studentRow?.parent_phone, studentRow?.phone, userRow?.phone);
      let adres = String(body.adres || '').trim();
      const program_adi = pickFirstNonEmpty(body.program_adi, presetRow?.program_adi);
      let sinif =
        resolveSinifFromVeliKayit(
          program_adi,
          pickFirstNonEmpty(
            body.sinif,
            studentRow && studentRow.class_level != null && studentRow.class_level !== ''
              ? String(studentRow.class_level)
              : '',
            presetRow?.sinif
          )
        ) ||
        pickFirstNonEmpty(
          body.sinif,
          studentRow && studentRow.class_level != null && studentRow.class_level !== ''
            ? String(studentRow.class_level)
            : '',
          presetRow?.sinif
        );
      const bas = String(body.baslangic_tarihi || '').trim().slice(0, 10);
      const bit = String(body.bitis_tarihi || '').trim().slice(0, 10);

      if (regFormFirst) {
        if (!String(ogrenci_ad).trim()) ogrenci_ad = 'Kayıt';
        if (!String(ogrenci_soyad).trim()) ogrenci_soyad = 'formu bekleniyor';
        if (!String(veli_ad).trim()) veli_ad = 'Veli';
        if (!String(veli_soyad).trim()) veli_soyad = 'formu bekleniyor';
        if (!String(telefon).trim()) telefon = '05000000000';
        if (!adres) adres = 'Kayıt formunda tamamlanacak';
      }

      if (!sinif || !program_adi || !bas || !bit) {
        return res.status(400).json({ error: 'fields_required' });
      }
      if (!regFormFirst && (!ogrenci_ad || !ogrenci_soyad || !veli_ad || !veli_soyad || !telefon)) {
        return res.status(400).json({ error: 'fields_required' });
      }

      const { data: inst, error: iErr } = await supabaseAdmin
        .from('institutions')
        .select('id,name')
        .eq('id', institutionId)
        .maybeSingle();
      if (iErr) throw iErr;

      const sozlesme_turu = normalizeSozlesmeTuru(pickFirstNonEmpty(body.sozlesme_turu, presetRow?.sozlesme_turu));
      const sozlesme_ozel = presetRow ? String(presetRow.sozlesme_ozel_baslik || '') : '';
      const sozlesme_basligi = resolveSozlesmeBasligi(sozlesme_turu, sozlesme_ozel, body.sozlesme_basligi);

      let sablon_ek_detay_snapshot = '';
      if (presetRow) sablon_ek_detay_snapshot = String(presetRow.sablon_ek_detay || '').trim();
      const extraOnly = String(body.sablon_ek_detay_snapshot || '').trim();
      if (extraOnly) {
        sablon_ek_detay_snapshot = sablon_ek_detay_snapshot ? `${sablon_ek_detay_snapshot}\n\n${extraOnly}` : extraOnly;
      }

      const suggested = suggestHoursAndFeeFromSinif(sinif);
      let dersSnapshot = normalizeDersSatirlari(body.ders_satirlari);
      if (!dersSnapshot.length && presetRow) {
        dersSnapshot = normalizeDersSatirlari(presetRow.ders_satirlari);
      }

      const hoursRaw = body.haftalik_ders_saati;
      const feeRaw = body.ucret;
      const taksitRaw = body.taksit_sayisi;
      let hoursParsed =
        hoursRaw !== undefined && hoursRaw !== null && String(hoursRaw).trim() !== '' ? Number(hoursRaw) : NaN;
      let feeParsed =
        feeRaw !== undefined && feeRaw !== null && String(feeRaw).trim() !== '' ? Number(feeRaw) : NaN;
      const taksitParsed =
        taksitRaw !== undefined && taksitRaw !== null && String(taksitRaw).trim() !== '' ? Number(taksitRaw) : NaN;

      if (!Number.isFinite(hoursParsed)) {
        if (dersSnapshot.length) hoursParsed = sumDersHours(dersSnapshot);
        else if (presetRow != null) hoursParsed = Number(presetRow.haftalik_ders_saati);
      }

      const hours = Number.isFinite(hoursParsed)
        ? Math.min(80, Math.max(0, hoursParsed))
        : suggested.hours;
      let fee = Number.isFinite(feeParsed)
        ? Math.min(999999999, Math.max(0, feeParsed))
        : suggested.fee;
      let taksit_sayisi = Number.isFinite(taksitParsed)
        ? Math.min(48, Math.max(1, Math.round(taksitParsed)))
        : 1;
      if (regFormFirst) {
        fee = 0;
        taksit_sayisi = 1;
      }

      const kurum_kodu = institutionCodeFromRow(inst || { id: institutionId });
      const cnum = contractNumber(kurum_kodu);
      const verifyToken = randomToken(20);
      const signingToken = randomToken(32);
      const base = publicBaseUrl();
      const verifyUrl = base ? `${base}/verify-document?t=${encodeURIComponent(verifyToken)}` : '';

      const para_birimi = normalizeParaBirimi(body.para_birimi);
      const institution_legal_html = await institutionLegalHtmlForContract(institutionId, sozlesme_turu);

      const taksitVadeleriPost = Array.isArray(body.taksit_vadeleri) ? body.taksit_vadeleri : null;
      const taksitTutarlariPost = Array.isArray(body.taksit_tutarlari) ? body.taksit_tutarlari : null;
      let merged_html;
      let kayit_formu_json = {};
      const postTaksitKartlari =
        !regFormFirst && fee > 0
          ? buildTaksitPlan(fee, taksit_sayisi, bas, taksitVadeleriPost, taksitTutarlariPost)
          : [];
      if (regFormFirst) {
        merged_html = buildRegistrationPlaceholderHtml({
          kurum_adi: inst?.name || '',
          contract_number: cnum,
          program_adi,
          sinif,
          baslangic_tarihi: bas,
          bitis_tarihi: bit,
          ucret: fee,
          taksit_sayisi,
          para_birimi
        });
        kayit_formu_json = { phase: 'needs_form' };
      } else {
        merged_html = buildParentContractHtml({
          ogrenci_ad,
          ogrenci_soyad,
          veli_ad,
          veli_soyad,
          telefon,
          adres,
          sinif,
          program_adi,
          baslangic_tarihi: bas,
          bitis_tarihi: bit,
          haftalik_ders_saati: hours,
          ucret: fee,
          taksit_sayisi,
          para_birimi,
          kurum_kodu,
          contract_number: cnum,
          kurum_adi: inst?.name || '',
          verify_url: verifyUrl || '#',
          document_title: sozlesme_basligi,
          extra_detail_plain: sablon_ek_detay_snapshot,
          ders_satirlari: dersSnapshot,
          kayit_formu_detay: postTaksitKartlari.length ? { taksit_kartlari: postTaksitKartlari } : {},
          taksit_kartlari: postTaksitKartlari,
          institution_legal_html
        });
        if (postTaksitKartlari.length) {
          kayit_formu_json = { taksit_kartlari: postTaksitKartlari, para_birimi };
        }
      }

      const row = {
        institution_id: institutionId,
        created_by: actor.sub || null,
        ogrenci_ad,
        ogrenci_soyad,
        veli_ad,
        veli_soyad,
        telefon,
        adres,
        sinif,
        program_adi,
        baslangic_tarihi: bas,
        bitis_tarihi: bit,
        haftalik_ders_saati: hours,
        ucret: fee,
        taksit_sayisi,
        para_birimi,
        kurum_kodu,
        contract_number: cnum,
        verify_token: verifyToken,
        signing_token: signingToken,
        status: 'draft',
        merged_html,
        sozlesme_turu,
        sozlesme_basligi,
        preset_id: presetRow ? presetId : null,
        sablon_ek_detay_snapshot,
        student_id: studentRow ? studentId : null,
        ogrenci_user_id: ogrenciUserId || null,
        ders_programi_snapshot: dersSnapshot,
        kayit_formu_json,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: created, error: insErr } = await supabaseAdmin.from('parent_sign_contracts').insert(row).select().single();
      if (insErr) {
        console.error('[parent-sign-contracts insert]', insErr);
        return res.status(500).json({
          error: errorMessage(insErr),
          hint: String(insErr.message || '').includes('ders_programi')
            ? '2026-05-15-parent-sign-preset-ders-programi.sql çalıştırın.'
            : undefined
        });
      }
      const signPath = `/veli-imza/${encodeURIComponent(signingToken)}`;
      const signUrl = base ? `${base}${signPath}` : signPath;
      return res.status(200).json({ data: { ...created, sign_url: signUrl } });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (e) {
    console.error('[parent-sign-contracts]', errorMessage(e), e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
