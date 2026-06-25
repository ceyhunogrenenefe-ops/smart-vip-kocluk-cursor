/** Idempotent kitap set seeds for veli sipariş formu (platform institution). */
export const PLATFORM_BOOK_INSTITUTION = '73323d75-eea1-4552-8bba-d50555423589';

export const KITAP_SET_SEEDS = [
  {
    institution_id: PLATFORM_BOOK_INSTITUTION,
    name: "7. Sınıf Classmate 5'li Deneme",
    kitap_icerigi:
      '5 deneme — sözel (Türkçe, Sosyal Bilgiler, Din Kültürü, İngilizce) ve sayısal (Matematik, Fen) bölümler ayrı (Okyanus Classmate)',
    siniflar: ['7'],
    sort_order: 306,
    product_url: 'https://okyanusokulkitap.com/Urun/19245/7-Sinif-Classmate-5li-Deneme'
  }
];

export async function ensureKitapSetSeeds(supabaseAdmin, { only } = {}) {
  const seeds = only?.length
    ? KITAP_SET_SEEDS.filter((s) => only.includes(s.name))
    : KITAP_SET_SEEDS;
  const results = [];
  const now = new Date().toISOString();

  for (const seed of seeds) {
    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('kitap_siparis_setleri')
      .select('id, name, is_active')
      .eq('institution_id', seed.institution_id)
      .eq('name', seed.name)
      .maybeSingle();
    if (fetchErr) throw fetchErr;

    if (existing) {
      results.push({ name: seed.name, status: 'exists', id: existing.id, is_active: existing.is_active });
      continue;
    }

    const { data, error } = await supabaseAdmin
      .from('kitap_siparis_setleri')
      .insert({
        institution_id: seed.institution_id,
        name: seed.name,
        kitap_icerigi: seed.kitap_icerigi,
        siniflar: seed.siniflar,
        sort_order: seed.sort_order,
        product_url: seed.product_url || null,
        is_active: true,
        created_at: now,
        updated_at: now
      })
      .select('id, name')
      .maybeSingle();
    if (error) throw error;
    results.push({ name: seed.name, status: 'created', id: data?.id });
  }

  return results;
}
