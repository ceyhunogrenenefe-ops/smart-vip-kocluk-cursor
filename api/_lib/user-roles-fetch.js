import { supabaseAdmin } from './supabase-admin.js';

/** `users.roles` JSON + tek `role` — JWT ile uyumlu küçük harf küme */
export async function normalizedUserRolesFromDb(userSub) {
  const sub = String(userSub || '').trim();
  if (!sub || sub === 'anonymous') return [];
  const { data } = await supabaseAdmin.from('users').select('role,roles').eq('id', sub).maybeSingle();
  const set = new Set();
  if (data?.role) set.add(String(data.role || '').trim().toLowerCase());
  if (Array.isArray(data?.roles)) data.roles.forEach((r) => set.add(String(r || '').trim().toLowerCase()));
  return [...set];
}
