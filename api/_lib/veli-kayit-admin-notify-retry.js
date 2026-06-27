import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { notifyAdminsOnVeliKayitForm, VELI_KAYIT_ADMIN_TEMPLATE_TYPE } from './veli-kayit-admin-notify.js';

const MAX_CONTRACTS = 40;

/**
 * Ücret bekleyen sözleşmelerde admin Meta bildirimi hiç gitmediyse veya başarısız kaldıysa yeniden dener.
 */
export async function runVeliKayitAdminNotifyRetryJob() {
  const { data: rows, error } = await supabaseAdmin
    .from('parent_sign_contracts')
    .select(
      'id,institution_id,contract_number,ogrenci_ad,ogrenci_soyad,veli_ad,veli_soyad,telefon,sinif,program_adi,kayit_formu_json,updated_at'
    )
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  const candidates = (rows || []).filter((row) => {
    const j = row?.kayit_formu_json && typeof row.kayit_formu_json === 'object' ? row.kayit_formu_json : {};
    if (String(j.phase || '') !== 'awaiting_admin_price') return false;
    const submittedAt = j.form_submitted_at ? Date.parse(String(j.form_submitted_at)) : NaN;
    if (!Number.isFinite(submittedAt)) return true;
    return Date.now() - submittedAt <= 7 * 24 * 60 * 60 * 1000;
  });

  const summary = [];
  let processed = 0;

  for (const contract of candidates.slice(0, MAX_CONTRACTS)) {
    const contractId = String(contract.id || '').trim();
    if (!contractId) continue;

    const j =
      contract.kayit_formu_json && typeof contract.kayit_formu_json === 'object'
        ? contract.kayit_formu_json
        : {};
    const reg = {
      ogrenci_ad: contract.ogrenci_ad,
      ogrenci_soyad: contract.ogrenci_soyad,
      veli_ad: contract.veli_ad,
      veli_soyad: contract.veli_soyad,
      veli_tel: j.veli_tel || contract.telefon,
      ogrenci_tel: j.ogrenci_tel || '',
      eposta: j.eposta || '',
      sinif: contract.sinif,
      program_adi: contract.program_adi,
      odeme_tercihi_veli: j.odeme_tercihi_veli
    };

    let institution = null;
    if (contract.institution_id) {
      const { data: inst } = await supabaseAdmin
        .from('institutions')
        .select('id,name')
        .eq('id', contract.institution_id)
        .maybeSingle();
      institution = inst;
    }

    try {
      const out = await notifyAdminsOnVeliKayitForm({
        contract,
        reg,
        institution,
        signUrl: '',
        retryMode: true
      });
      processed += 1;
      summary.push({
        contract_id: contractId,
        ok: out.ok,
        skipped: out.skipped || null,
        whatsapp_sent: (out.whatsapp || []).filter((x) => x.ok).length,
        email_sent: (out.emails || []).filter((x) => x.ok).length
      });
    } catch (e) {
      summary.push({ contract_id: contractId, error: errorMessage(e) });
    }
  }

  return {
    ok: true,
    scanned: candidates.length,
    processed,
    template_type: VELI_KAYIT_ADMIN_TEMPLATE_TYPE,
    summary
  };
}
