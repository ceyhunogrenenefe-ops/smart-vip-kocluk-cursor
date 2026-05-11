import { requireAuthenticatedActor, hasInstitutionAccess } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  buildParentContractHtml,
  contractNumber,
  institutionCodeFromRow,
  randomToken,
  suggestHoursAndFeeFromSinif
} from '../api/_lib/parent-sign-defaults.js';

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
        .select('id,merged_html,contract_number,status,signed_at')
        .eq('signing_token', signingToken)
        .maybeSingle();
      if (error) throw error;
      if (!row) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json({
        data: {
          document_id: row.id,
          merged_html: row.merged_html,
          contract_number: row.contract_number,
          already_signed: row.status === 'signed',
          signed_at: row.signed_at
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

    if (req.method === 'POST') {
      const body = parseBody(req);
      const institutionId =
        role === 'super_admin' ? String(body.institution_id || '').trim() : String(actor.institution_id || '').trim();
      if (!institutionId) return res.status(400).json({ error: 'institution_required' });
      if (role === 'admin' || role === 'coach') {
        if (!hasInstitutionAccess(actor, institutionId)) return res.status(403).json({ error: 'forbidden' });
      }

      const ogrenci_ad = String(body.ogrenci_ad || '').trim();
      const ogrenci_soyad = String(body.ogrenci_soyad || '').trim();
      const veli_ad = String(body.veli_ad || '').trim();
      const veli_soyad = String(body.veli_soyad || '').trim();
      const telefon = String(body.telefon || '').trim();
      const adres = String(body.adres || '').trim();
      const sinif = String(body.sinif || '').trim();
      const program_adi = String(body.program_adi || '').trim();
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

      const { hours, fee } = suggestHoursAndFeeFromSinif(sinif);
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
        kurum_kodu,
        contract_number: cnum,
        kurum_adi: inst?.name || '',
        verify_url: verifyUrl || '#'
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
        kurum_kodu,
        contract_number: cnum,
        verify_token: verifyToken,
        signing_token: signingToken,
        status: 'draft',
        merged_html,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: created, error: insErr } = await supabaseAdmin.from('parent_sign_contracts').insert(row).select().single();
      if (insErr) throw insErr;
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
