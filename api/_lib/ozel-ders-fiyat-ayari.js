/**
 * Kurum varsayılan özel ders ücreti — okuma/yazma.
 * Ayar satırı yoksa null döner; çözümleyici bu durumda "fiyat yok" der.
 */
import { supabaseAdmin } from './supabase-admin.js';

const TABLO = 'private_lesson_pricing_settings';

/**
 * Platform geneli varsayılan satırının anahtarı.
 * institution_id birincil anahtar olduğu için NULL olamaz; kurumun kendi
 * ayarı yoksa bu satıra düşülür.
 */
export const PLATFORM_ANAHTARI = '__platform__';

function anahtar(institutionId) {
  const s = String(institutionId || '').trim();
  return s || PLATFORM_ANAHTARI;
}

/** Ayar tablosu henüz kurulmamışsa site çökmemeli */
function tabloYokMu(e) {
  const m = String(e?.message || e || '');
  return /does not exist|schema cache|PGRST205|relation/i.test(m);
}

export async function fiyatAyariniOku(institutionId) {
  try {
    const { data, error } = await supabaseAdmin
      .from(TABLO)
      .select('*')
      .eq('institution_id', anahtar(institutionId))
      .maybeSingle();
    if (error) {
      if (tabloYokMu(error)) return null;
      throw error;
    }
    if (data) return data;
  } catch (e) {
    if (tabloYokMu(e)) return null;
    throw e;
  }
  // Kurum kendi ayarını girmediyse platform geneline düş
  if (String(institutionId || '').trim()) {
    try {
      const { data } = await supabaseAdmin
        .from(TABLO)
        .select('*')
        .eq('institution_id', PLATFORM_ANAHTARI)
        .maybeSingle();
      return data || null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function fiyatAyariniYaz(institutionId, { defaultFeeTl, defaultDurationMin, actorSub }) {
  const satir = {
    institution_id: anahtar(institutionId),
    updated_at: new Date().toISOString(),
    updated_by: actorSub || null
  };
  if (defaultFeeTl !== undefined) satir.default_fee_tl = defaultFeeTl;
  if (defaultDurationMin !== undefined) satir.default_duration_min = defaultDurationMin;
  const { data, error } = await supabaseAdmin
    .from(TABLO)
    .upsert(satir, { onConflict: 'institution_id' })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data;
}
