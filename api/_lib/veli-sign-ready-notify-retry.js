import { supabaseAdmin } from './supabase-admin.js';
import { errorMessage } from './error-msg.js';
import { notifyVeliSignReady, VELI_SIGN_READY_TEMPLATE_TYPE } from './veli-sign-ready-notify.js';

const MAX_CONTRACTS = 40;

/**
 * ready_to_sign aşamasında imza bildirimi gitmemiş sözleşmeleri yeniden dener.
 */
export async function runVeliSignReadyNotifyRetryJob() {
  const { data: rows, error } = await supabaseAdmin
    .from('parent_sign_contracts')
    .select(
      'id,institution_id,signing_token,ogrenci_ad,ogrenci_soyad,veli_ad,veli_soyad,telefon,ucret,taksit_sayisi,para_birimi,kayit_formu_json,status,signed_at,updated_at'
    )
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  const candidates = (rows || []).filter((row) => {
    const j = row?.kayit_formu_json && typeof row.kayit_formu_json === 'object' ? row.kayit_formu_json : {};
    if (String(j.phase || '') !== 'ready_to_sign') return false;
    const done = String(row.status || '').toLowerCase() === 'signed' || Boolean(row.signed_at);
    if (done) return false;
    const pricedAt = j.admin_priced_at ? Date.parse(String(j.admin_priced_at)) : NaN;
    if (!Number.isFinite(pricedAt)) return true;
    return Date.now() - pricedAt <= 14 * 24 * 60 * 60 * 1000;
  });

  const summary = [];
  let processed = 0;

  for (const contract of candidates.slice(0, MAX_CONTRACTS)) {
    const contractId = String(contract.id || '').trim();
    if (!contractId) continue;

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
      const out = await notifyVeliSignReady({ contract, institution });
      if (out.skipped !== 'already_sent') processed += 1;
      summary.push({
        contract_id: contractId,
        ok: out.ok,
        skipped: out.skipped || null,
        phone: out.phone || null,
        sign_url: out.signUrl || null
      });
    } catch (e) {
      summary.push({ contract_id: contractId, error: errorMessage(e) });
    }
  }

  return {
    ok: true,
    scanned: candidates.length,
    processed,
    template_type: VELI_SIGN_READY_TEMPLATE_TYPE,
    summary
  };
}
