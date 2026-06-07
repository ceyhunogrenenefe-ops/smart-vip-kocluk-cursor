import { supabaseAdmin } from './supabase-admin.js';
import { institutionLegalSectionsHtml, normalizeParaBirimi } from './parent-sign-defaults.js';

export { normalizeParaBirimi };

export async function loadInstitutionLegal(institutionId) {
  const id = String(institutionId || '').trim();
  if (!id) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('parent_sign_institution_legal')
      .select('satis_sozlesmesi,kullanici_sozlesmesi,gizlilik_politikasi,kvkk_aydinlatma')
      .eq('institution_id', id)
      .maybeSingle();
    if (error) {
      if (String(error.code || '') === '42P01' || String(error.message || '').includes('does not exist')) {
        return null;
      }
      throw error;
    }
    return data || null;
  } catch {
    return null;
  }
}

export async function institutionLegalHtmlForContract(institutionId, sozlesme_turu) {
  const row = await loadInstitutionLegal(institutionId);
  if (!row) return '';
  return institutionLegalSectionsHtml(row, sozlesme_turu);
}
