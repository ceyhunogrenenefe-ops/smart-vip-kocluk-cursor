import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  buildParentContractHtml,
  contractNumber,
  institutionCodeFromRow,
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
        .select('id,merged_html,contract_number,status,signed_at,institution_id')
        .eq('signing_token', signingToken)
        .maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'not_found' });
      let institution_name = '';
      if (row.institution_id) {
        const { data: inst } = await supabaseAdmin.from('institutions').select('name').eq('id', row.institution_id).maybeSingle();
        institution_name = inst?.name || '';
      }
      return res.status(200).json({
        data: {
          document_id: row.id,
          merged_html: row.merged_html,
          contract_number: row.contract_number,
          already_signed: row.status === 'signed',
          signed_at: row.signed_at,
          institution_name
        }
      });
    } catch (e) {
      return res.status(500).json({ error: errorMessage(e) });
    }
  }

  const hasBearer = String(req.headers.authorization || '').trim().startsWith('Bearer ');
  if (req.method === 'POST' && !hasBearer) {
    const body = parseBody(req);
    const token = String(body.signing_token || signingToken || '').trim();
    if (!token) return res.status(400).json({ error: 'signing_token_required' });
    if (!body.kvkk_ok || !body.contract_ok) return res.status(400).json({ error: 'confirmations_required' });
    const png = typeof body.signature_png_base64 === 'string' ? body.signature_png_base64.trim() : '';
    if (!png || png.length < 80) return res.status(400).json({ error: 'signature_required' });
    try {
      const { data: row, error: dErr } = await supabaseAdmin
        .from('parent_sign_contracts')
        .select('id,status')
        .eq('signing_token', token)
        .maybeSingle();
      if (dErr) throw dErr;
      if (!row) return res.status(404).json({ error: 'not_found' });
      if (row.status === 'signed') return res.status(200).json({ ok: true, duplicate: true });

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

      const ogrenci_ad = pickFirstNonEmpty(body.ogrenci_ad, stParts.ad, uParts.ad);
      const ogrenci_soyad = pickFirstNonEmpty(body.ogrenci_soyad, stParts.soyad, uParts.soyad);
      const veli_ad = pickFirstNonEmpty(body.veli_ad, velParts.ad);
      const veli_soyad = pickFirstNonEmpty(body.veli_soyad, velParts.soyad);
      const telefon = pickFirstNonEmpty(body.telefon, studentRow?.parent_phone, studentRow?.phone, userRow?.phone);
      const adres = String(body.adres || '').trim();
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
      if (!ogrenci_ad || !ogrenci_soyad || !veli_ad || !veli_soyad || !telefon || !sinif || !program_adi || !bas || !bit) {
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

      const merged_html = buildParentContractHtml({
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
        ders_satirlari: dersSnapshot
      });

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
