/**
 * CRM modülü — kurum bazlı lisans (açma / kapama).
 *
 * Platform kurumu (Online VIP Dershane) için CRM her zaman AÇIKTIR; bu kural kodda
 * sabittir, yanlışlıkla kapanamaz. Diğer kurumlarda süper admin açana kadar kapalıdır.
 * Süper admin kapalı kurumda da CRM'e girebilir (kurulum ve deneme için).
 */
import { supabaseAdmin } from './supabase-admin.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';
import { errorMessage } from './error-msg.js';

export function crmModuleAlwaysOn(institutionId) {
  const id = String(institutionId || '').trim();
  return !id || id === PLATFORM_PRIMARY_INSTITUTION_ID;
}

/** @returns {Promise<boolean>} */
export async function isCrmModuleEnabled(institutionId) {
  const id = String(institutionId || '').trim();
  if (crmModuleAlwaysOn(id)) return true;
  try {
    const { data, error } = await supabaseAdmin
      .from('institution_features')
      .select('crm_module')
      .eq('institution_id', id)
      .maybeSingle();
    if (error) {
      // tablo / kolon yoksa kapalı say
      if (['42P01', '42703', 'PGRST204'].includes(String(error.code))) return false;
      throw error;
    }
    return data?.crm_module === true;
  } catch (e) {
    console.warn('[crm-module] okunamadı:', errorMessage(e));
    return false;
  }
}

export async function describeCrmModule(institutionId) {
  const id = String(institutionId || '').trim();
  return {
    institution_id: id || null,
    enabled: await isCrmModuleEnabled(id),
    always_on: crmModuleAlwaysOn(id)
  };
}

/** Süper admin kurum için CRM'i açar / kapatır. */
export async function setCrmModule(institutionId, enabled, actorId = null) {
  const id = String(institutionId || '').trim();
  if (!id) throw new Error('institution_required');
  if (crmModuleAlwaysOn(id)) throw new Error('crm_always_on_for_platform');
  const { error } = await supabaseAdmin.from('institution_features').upsert(
    {
      institution_id: id,
      crm_module: Boolean(enabled),
      updated_by: actorId ? String(actorId) : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'institution_id' }
  );
  if (error) throw error;
  return describeCrmModule(id);
}

/**
 * Handler koruması. Süper admin her zaman geçer; diğerleri kurumda CRM açıksa geçer.
 * @returns {Promise<boolean>} true = istek sürebilir
 */
export async function assertCrmModule(res, { institutionId, isSuperAdmin = false } = {}) {
  if (isSuperAdmin) return true;
  if (await isCrmModuleEnabled(institutionId)) return true;
  res.status(403).json({
    error: 'crm_module_disabled',
    message: 'CRM bu kurumda açık değil. Açılması için yöneticinizle iletişime geçin.'
  });
  return false;
}
