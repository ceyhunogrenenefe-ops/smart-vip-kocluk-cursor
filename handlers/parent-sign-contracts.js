import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  buildParentContractHtml,
  buildRegistrationPlaceholderHtml,
  contractNumber,
  institutionCodeFromRow,
  kayitDetayForHtml,
  normalizeDersSatirlari,
  normalizeSozlesmeTuru,
  randomToken,
  resolveSozlesmeBasligi,
  splitAdSoyad,
  suggestHoursAndFeeFromSinif,
  sumDersHours
} from '../api/_lib/parent-sign-defaults.js';

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
  const u = process.env.PUBLIC_APP_URL || process.env.VITE_APP_URL;
  if (u && String(u).trim()) return String(u).replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}`;
  return '';
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
          'id,merged_html,contract_number,status,signed_at,institution_id,signature_png_base64,kayit_formu_json,program_adi,sinif,baslangic_tarihi,bitis_tarihi,ucret,taksit_sayisi'
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
          registration_hint: {
            program_adi: row.program_adi,
            sinif: row.sinif,
            baslangic_tarihi: row.baslangic_tarihi,
            bitis_tarihi: row.bitis_tarihi,
            ucret: row.ucret,
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

    if (action === 'submit_registration_form') {
      const token = String(body.signing_token || signingToken || '').trim();
      if (!token) return res.status(400).json({ error: 'signing_token_required' });
      if (!body.kvkk_form_ok) return res.status(400).json({ error: 'kvkk_form_required' });
      const T = (k) => String(body[k] ?? '').trim();
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

        const ogrenci_ad = T('ogrenci_ad');
        const ogrenci_soyad = T('ogrenci_soyad');
        const veli_ad = T('veli_ad');
        const veli_soyad = T('veli_soyad');
        const tcDigits = T('tc_kimlik').replace(/\D/g, '');
        const dogum_tarihi = T('dogum_tarihi').slice(0, 10);
        const okul_adi = T('okul_adi');
        const eposta = T('eposta');
        const il = T('il');
        const ilce = T('ilce');
        const veli_tel = T('veli_tel').replace(/\D/g, '');
        const ogrenci_tel = T('ogrenci_tel').replace(/\D/g, '');
        const sinif_form = T('sinif_form');
        const program_form = T('program_form');
        const adres_aciklama = T('adres_aciklama');

        if (!ogrenci_ad || !ogrenci_soyad || !veli_ad || !veli_soyad) {
          return res.status(400).json({ error: 'names_required' });
        }
        if (tcDigits.length !== 11) return res.status(400).json({ error: 'tc_invalid' });
        if (!dogum_tarihi) return res.status(400).json({ error: 'dogum_required' });
        if (!okul_adi) return res.status(400).json({ error: 'okul_required' });
        if (!eposta || !eposta.includes('@')) return res.status(400).json({ error: 'eposta_invalid' });
        if (!il || !ilce) return res.status(400).json({ error: 'il_ilce_required' });
        if (veli_tel.length < 10) return res.status(400).json({ error: 'veli_tel_invalid' });
        if (ogrenci_tel.length < 10) return res.status(400).json({ error: 'ogrenci_tel_invalid' });

        const sinif = pickFirstNonEmpty(sinif_form, row.sinif);
        const program_adi = pickFirstNonEmpty(program_form, row.program_adi);
        if (!sinif || !program_adi) return res.status(400).json({ error: 'sinif_program_required' });

        const adresParts = [il, ilce, adres_aciklama].filter(Boolean);
        const adres = adresParts.join(' · ') || String(row.adres || '');

        const taksitN = Math.max(1, Math.min(48, Math.round(Number(row.taksit_sayisi) || 1)));
        const ucretNum = Number(row.ucret);
        const ort =
          Number.isFinite(ucretNum) && ucretNum > 0 && taksitN > 0 ? Math.round(ucretNum / taksitN) : null;
        const muhasebe_ozet = `Öğrenci: ${ogrenci_ad} ${ogrenci_soyad} | Program: ${program_adi} | Sınıf: ${sinif} | Toplam ücret: ${row.ucret} TL | Taksit: ${taksitN}${
          ort != null ? ` | Yaklaşık taksit: ${ort} TL` : ''
        } | E-posta: ${eposta} | Veli tel: ${veli_tel} | Öğr. tel: ${ogrenci_tel}`;

        const nextJson = {
          phase: 'ready_to_sign',
          tc_kimlik: tcDigits,
          dogum_tarihi,
          okul_adi,
          eposta,
          il,
          ilce,
          veli_tel,
          ogrenci_tel,
          muhasebe_ozet,
          form_submitted_at: new Date().toISOString()
        };

        const { data: inst, error: iErr } = await supabaseAdmin
          .from('institutions')
          .select('id,name')
          .eq('id', row.institution_id)
          .maybeSingle();
        if (iErr) throw iErr;

        const kurum_kodu = institutionCodeFromRow(inst || { id: row.institution_id });
        const verifyToken = String(row.verify_token || '');
        const base = publicBaseUrl();
        const verifyUrl = verifyToken && base ? `${base}/verify-document?t=${encodeURIComponent(verifyToken)}` : '#';

        const sozlesme_basligi = String(row.sozlesme_basligi || '').trim() || 'Satış sözleşmesi';

        const merged_html = buildParentContractHtml({
          ogrenci_ad,
          ogrenci_soyad,
          veli_ad,
          veli_soyad,
          telefon: veli_tel,
          adres,
          sinif,
          program_adi,
          baslangic_tarihi: String(row.baslangic_tarihi || '').trim().slice(0, 10),
          bitis_tarihi: String(row.bitis_tarihi || '').trim().slice(0, 10),
          haftalik_ders_saati: Number(row.haftalik_ders_saati) || 0,
          ucret: Number(row.ucret) || 0,
          taksit_sayisi: taksitN,
          kurum_kodu,
          contract_number: String(row.contract_number || ''),
          kurum_adi: inst?.name || '',
          verify_url: verifyUrl || '#',
          document_title: sozlesme_basligi,
          extra_detail_plain: String(row.sablon_ek_detay_snapshot || ''),
          ders_satirlari: row.ders_programi_snapshot,
          kayit_formu_detay: nextJson
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
        .select('id,status,signed_at,kayit_formu_json')
        .eq('signing_token', token)
        .maybeSingle();
      if (dErr) throw dErr;
      if (!row) return res.status(404).json({ error: 'not_found' });
      const kj = row.kayit_formu_json;
      const j = kj && typeof kj === 'object' ? kj : {};
      if (String(j.phase || '') === 'needs_form') {
        return res.status(400).json({ error: 'registration_form_required_first' });
      }
      const done = String(row.status || '').toLowerCase() === 'signed' || Boolean(row.signed_at);
      if (done) return res.status(200).json({ ok: true, duplicate: true });

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
      return res.status(200).json({ ok: true });
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
      return res.status(200).json({ data: data || [] });
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
      const existingSigned =
        String(existing.status || '').toLowerCase() === 'signed' || Boolean(existing.signed_at);
      if (existingSigned) {
        return res.status(400).json({ error: 'contract_already_signed' });
      }
      if (role !== 'super_admin' && !hasInstitutionAccess(actor, existing.institution_id)) {
        return res.status(403).json({ error: 'forbidden' });
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
      const sinif = pickFirstNonEmpty(body.sinif, existing.sinif);
      const program_adi = pickFirstNonEmpty(body.program_adi, existing.program_adi);
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

      const MAX_MERGED_HTML = 1_500_000;
      const customMergedRaw =
        body.custom_merged_html !== undefined && body.custom_merged_html !== null
          ? String(body.custom_merged_html).trim()
          : '';
      let merged_html;
      if (customMergedRaw.length > 0) {
        if (customMergedRaw.length < 30) {
          return res.status(400).json({ error: 'custom_merged_html_too_short' });
        }
        merged_html = customMergedRaw.slice(0, MAX_MERGED_HTML);
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
          kurum_kodu,
          contract_number: String(existing.contract_number || ''),
          kurum_adi: inst?.name || '',
          verify_url: verifyUrl || '#',
          document_title: sozlesme_basligi,
          extra_detail_plain: sablon_ek_detay_snapshot,
          ders_satirlari: dersSnapshot,
          kayit_formu_detay: existing.kayit_formu_json || {}
        });
      }

      const now = new Date().toISOString();
      const { data: updated, error: uErr } = await supabaseAdmin
        .from('parent_sign_contracts')
        .update({
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
          kurum_kodu,
          merged_html,
          sozlesme_turu,
          sozlesme_basligi,
          sablon_ek_detay_snapshot,
          ders_programi_snapshot: dersSnapshot,
          updated_at: now
        })
        .eq('id', id)
        .select()
        .single();
      if (uErr) throw uErr;
      return res.status(200).json({ data: updated });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
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
      const sinif = pickFirstNonEmpty(
        body.sinif,
        studentRow && studentRow.class_level != null && studentRow.class_level !== ''
          ? String(studentRow.class_level)
          : '',
        presetRow?.sinif
      );
      const program_adi = pickFirstNonEmpty(body.program_adi, presetRow?.program_adi);
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
      const fee = Number.isFinite(feeParsed)
        ? Math.min(999999999, Math.max(0, feeParsed))
        : suggested.fee;
      const taksit_sayisi = Number.isFinite(taksitParsed)
        ? Math.min(48, Math.max(1, Math.round(taksitParsed)))
        : 1;

      const kurum_kodu = institutionCodeFromRow(inst || { id: institutionId });
      const cnum = contractNumber(kurum_kodu);
      const verifyToken = randomToken(20);
      const signingToken = randomToken(32);
      const base = publicBaseUrl();
      const verifyUrl = base ? `${base}/verify-document?t=${encodeURIComponent(verifyToken)}` : '';

      let merged_html;
      let kayit_formu_json = {};
      if (regFormFirst) {
        merged_html = buildRegistrationPlaceholderHtml({
          kurum_adi: inst?.name || '',
          contract_number: cnum,
          program_adi,
          sinif,
          baslangic_tarihi: bas,
          bitis_tarihi: bit,
          ucret: fee,
          taksit_sayisi
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
          kurum_kodu,
          contract_number: cnum,
          kurum_adi: inst?.name || '',
          verify_url: verifyUrl || '#',
          document_title: sozlesme_basligi,
          extra_detail_plain: sablon_ek_detay_snapshot,
          ders_satirlari: dersSnapshot,
          kayit_formu_detay: {}
        });
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
