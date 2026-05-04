/** FK kaldırıldıysa demo JWT ile integrations_google yazımına izin (yalnızca bilinçli test için). */
export function integrationsGoogleSkipUserRowCheck() {
  return /^(1|true|yes)$/i.test(String(process.env.INTEGRATIONS_GOOGLE_NO_USER_FK || '').trim());
}
