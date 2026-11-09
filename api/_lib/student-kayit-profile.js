/** Veli kayıt sözleşmesindeki program, T.C. ve adresi öğrenci satırına taşır. */

export function kayitOverlayFromContract(contract) {
  const j =
    contract?.kayit_formu_json && typeof contract.kayit_formu_json === 'object'
      ? contract.kayit_formu_json
      : {};
  const tc = String(j.tc_kimlik || '').replace(/\D/g, '');
  return {
    enrolled_program: String(contract?.program_adi || '').trim(),
    address: String(contract?.adres || '').trim(),
    tc_identity_no: tc.length === 11 ? tc : ''
  };
}

function stampOf(contract) {
  const n = Date.parse(contract?.updated_at || contract?.created_at || '');
  return Number.isFinite(n) ? n : 0;
}

/** Aynı öğrenciye birden fazla sözleşme düşerse en son güncellenen kazanır. */
export function mergeKayitOntoStudents(rows, contracts) {
  const byKey = new Map();
  for (const contract of contracts || []) {
    const overlay = { ...kayitOverlayFromContract(contract), stamp: stampOf(contract) };
    if (!overlay.enrolled_program && !overlay.address && !overlay.tc_identity_no) continue;
    for (const key of [contract?.student_id, contract?.ogrenci_user_id]) {
      const id = String(key || '').trim();
      if (!id) continue;
      const prev = byKey.get(id);
      if (!prev || overlay.stamp >= prev.stamp) byKey.set(id, overlay);
    }
  }

  return (rows || []).map((row) => {
    const hit =
      byKey.get(String(row?.id || '')) ||
      byKey.get(String(row?.platform_user_id || '')) ||
      byKey.get(String(row?.user_id || ''));
    if (!hit) return row;
    const existingTc = String(row?.tc_identity_no || '').replace(/\D/g, '');
    return {
      ...row,
      enrolled_program: String(row?.enrolled_program || '').trim() || hit.enrolled_program || null,
      address: String(row?.address || '').trim() || hit.address || null,
      tc_identity_no:
        existingTc.length === 11 ? existingTc : hit.tc_identity_no || row?.tc_identity_no || null
    };
  });
}
