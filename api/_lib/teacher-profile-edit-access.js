/**
 * Öğretmen/koç vitrin profil düzenleme erişimi (saf kurallar, DB bağımlılığı yok).
 */

/**
 * Pasif/silinmiş hariç her zaman düzenlenebilir.
 * editing_enabled artık zorunlu kapı değil — admin tekrar açmak zorunda değil.
 */
export function canEditProfile(profile) {
  if (!profile) return false;
  if (profile.status === 'passive' || profile.status === 'deleted') return false;
  if (profile.deleted_at) return false;
  return true;
}
