/**
 * Otomatik WhatsApp cron mesajları — öğrenci + kurum bayrakları.
 * Kolon yoksa (eski DB) varsayılan: gönderime izin ver.
 */

export async function loadInstitutionWhatsappAutomationMap(supabaseAdmin) {
  const map = new Map();
  try {
    const { data, error } = await supabaseAdmin
      .from('institutions')
      .select('id, whatsapp_automation_enabled');
    if (error) {
      if (/whatsapp_automation_enabled|column/i.test(String(error.message || ''))) return map;
      throw error;
    }
    for (const row of data || []) {
      map.set(String(row.id), row.whatsapp_automation_enabled !== false);
    }
  } catch {
    /* noop — tüm kurumlar açık kabul */
  }
  return map;
}

export function studentAllowsWhatsappAutomation(studentRow, institutionFlags) {
  if (!studentRow) return false;
  if (studentRow.whatsapp_automation_enabled === false) return false;
  const iid = String(studentRow.institution_id || '').trim();
  if (iid && institutionFlags instanceof Map && institutionFlags.has(iid)) {
    if (institutionFlags.get(iid) === false) return false;
  }
  return true;
}
