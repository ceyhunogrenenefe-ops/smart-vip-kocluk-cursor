/**
 * Ödev modülü — kurum bazlı açma / kapama.
 *
 * Modül yalnız platform dışı kurumlar içindir. Online VIP Dershane (platform) ve
 * Online VIP Ders ve Koçluk kurumlarında veritabanında ne yazarsa yazsın KAPALIDIR;
 * bu kural kodda sabittir, yanlışlıkla açılamaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { PLATFORM_PRIMARY_INSTITUTION_ID } from './quota-enforce.js';
import { errorMessage } from './error-msg.js';

/** Ders & Koçluk kurumu — ödev modülü burada da kapalı. */
export const COACHING_INSTITUTION_ID = 'f5dc4906-5fa5-4a7b-ac39-88e14d48d1a2';

const BLOCKED_INSTITUTION_IDS = new Set([PLATFORM_PRIMARY_INSTITUTION_ID, COACHING_INSTITUTION_ID]);

/** Kurum ödev modülünü hiç kullanamaz mı? (platform / ders & koçluk) */
export function homeworkModuleBlocked(institutionId) {
  const id = String(institutionId || '').trim();
  return !id || BLOCKED_INSTITUTION_IDS.has(id);
}

/**
 * Kurumda ödev modülü açık mı?
 * @returns {Promise<boolean>}
 */
export async function isHomeworkModuleEnabled(institutionId) {
  const id = String(institutionId || '').trim();
  if (homeworkModuleBlocked(id)) return false;
  try {
    const { data, error } = await supabaseAdmin
      .from('institution_features')
      .select('homework_module')
      .eq('institution_id', id)
      .maybeSingle();
    if (error) {
      if (String(error.code) === '42P01') return false; // tablo yoksa kapalı say
      throw error;
    }
    return Boolean(data?.homework_module);
  } catch (e) {
    console.warn('[homework-module] okunamadı:', errorMessage(e));
    return false;
  }
}

/** Panelde gösterilecek durum. */
export async function describeHomeworkModule(institutionId) {
  const id = String(institutionId || '').trim();
  return {
    institution_id: id || null,
    enabled: await isHomeworkModuleEnabled(id),
    blocked: homeworkModuleBlocked(id),
    reason: homeworkModuleBlocked(id) ? 'platform_or_coaching_institution' : null
  };
}

/** Süper admin kurum için modülü açar / kapatır. */
export async function setHomeworkModule(institutionId, enabled, actorId = null) {
  const id = String(institutionId || '').trim();
  if (!id) throw new Error('institution_required');
  if (homeworkModuleBlocked(id)) throw new Error('module_not_available_for_institution');
  const { error } = await supabaseAdmin.from('institution_features').upsert(
    {
      institution_id: id,
      homework_module: Boolean(enabled),
      updated_by: actorId ? String(actorId) : null,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'institution_id' }
  );
  if (error) throw error;
  return describeHomeworkModule(id);
}

/**
 * Handler koruması: modül kapalıysa isteği reddeder.
 * @returns {Promise<boolean>} true = istek sürebilir
 */
export async function assertHomeworkModule(res, institutionId) {
  if (await isHomeworkModuleEnabled(institutionId)) return true;
  res.status(404).json({
    error: 'homework_module_disabled',
    message: 'Ödev modülü bu kurumda kapalı.'
  });
  return false;
}
