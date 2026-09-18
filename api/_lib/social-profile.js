/**
 * FAZ 1 — Instagram / Facebook gönderen profili (ad, kullanıcı adı, fotoğraf).
 * Meta User Profile API: IG → name, username, profile_pic; Messenger → name, profile_pic.
 * Gelişmiş Erişim yoksa Meta çoğu kullanıcı için hata döner; nedeni profile_error'a yazılır
 * ve kayıt belirli aralıkla yeniden denenir. Webhook / token yapısına dokunmaz.
 */
import { supabaseAdmin } from './supabase-admin.js';
import { loadMetaWhatsAppSecretsFromDb } from './meta-whatsapp.js';
import { resolveSocialToken } from './meta-social-inbound.js';

const GRAPH = () => String(process.env.META_GRAPH_API_VERSION || 'v21.0').trim() || 'v21.0';
const OK_TTL_MS = 6 * 60 * 60 * 1000;
const ERR_TTL_MS = 5 * 60 * 1000;
const FB_PREFIX = 'fb:';
const cache = new Map();

/** Yer tutucu isimler (otomatik lead / eski kayıt) gerçek isimle değiştirilebilir */
export function isPlaceholderName(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  if (/^\d{6,}$/.test(s)) return true;
  return /^(instagram|facebook|whatsapp)\s+(lead|kullanıcısı)\b/i.test(s) || /^(ig|fb|wa)$/i.test(s);
}

/** Liste / kart başlığı: ad → @kullanıcı → "Instagram kullanıcısı ·…1234" */
export function socialDisplayName({ name, username, channel, id }) {
  const n = String(name || '').trim();
  if (n && !isPlaceholderName(n)) return n;
  const u = String(username || '').trim().replace(/^@/, '');
  if (u) return `@${u}`;
  const label = channel === 'facebook' ? 'Facebook kullanıcısı' : 'Instagram kullanıcısı';
  const tail = String(id || '').replace(/\D/g, '').slice(-4);
  return tail ? `${label} ·…${tail}` : label;
}

function stripFb(id) {
  const s = String(id || '').trim();
  return s.startsWith(FB_PREFIX) ? s.slice(FB_PREFIX.length) : s;
}

/**
 * @returns {Promise<{ name: string|null, username: string|null, profile_pic: string|null, error: string|null }>}
 */
export async function lookupSocialProfile(scopedId, { channel = 'instagram' } = {}) {
  const id = stripFb(scopedId);
  if (!id) return { name: null, username: null, profile_pic: null, error: 'id_missing' };
  const key = `${channel}:${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (hit.value.error ? ERR_TTL_MS : OK_TTL_MS)) return hit.value;

  await loadMetaWhatsAppSecretsFromDb().catch(() => null);
  const tok = resolveSocialToken().token;
  if (!tok) {
    const value = { name: null, username: null, profile_pic: null, error: 'page_token_missing' };
    cache.set(key, { at: Date.now(), value });
    return value;
  }
  const fields = channel === 'facebook' ? 'name,first_name,last_name,profile_pic' : 'name,username,profile_pic';
  let value;
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH()}/${encodeURIComponent(id)}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${tok}` }
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      const fullName =
        String(json?.name || [json?.first_name, json?.last_name].filter(Boolean).join(' ') || '').trim() || null;
      value = {
        name: fullName,
        username: json?.username ? String(json.username).trim() : null,
        profile_pic: json?.profile_pic ? String(json.profile_pic) : null,
        error: null
      };
    } else {
      const e = json?.error || {};
      value = {
        name: null,
        username: null,
        profile_pic: null,
        error: `${e.code || res.status}${e.error_subcode ? `/${e.error_subcode}` : ''}: ${String(e.message || 'graph_error').slice(0, 200)}`
      };
    }
  } catch (e) {
    value = { name: null, username: null, profile_pic: null, error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Konuşma kaydına profil yaz (mevcut gerçek ismi ezmez) */
export async function applyConversationProfile(conversationId, profile, { usernameHint = null } = {}) {
  if (!conversationId) return;
  const { data: conv } = await supabaseAdmin
    .from('crm_conversations')
    .select('id, contact_name, contact_username, contact_avatar_url, lead_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return;
  const username = profile?.username || usernameHint || null;
  const patch = { profile_checked_at: new Date().toISOString(), profile_error: profile?.error || null };
  if (profile?.name && isPlaceholderName(conv.contact_name)) patch.contact_name = profile.name;
  else if (!conv.contact_name && username) patch.contact_name = `@${username}`;
  if (username && username !== conv.contact_username) patch.contact_username = username;
  if (profile?.profile_pic) patch.contact_avatar_url = profile.profile_pic;
  const { error } = await supabaseAdmin.from('crm_conversations').update(patch).eq('id', conv.id);
  if (error && !/contact_username|profile_|contact_avatar|column/i.test(error.message || '')) {
    console.warn('[social-profile] conversation:', error.message);
  }
  if (conv.lead_id) await applyLeadProfile({ leadId: conv.lead_id }, { ...profile, username });
}

/** Aday kartına profil yaz: yer tutucu isim gerçek isimle değişir, kullanıcı adı ve fotoğraf eklenir */
export async function applyLeadProfile({ leadId = null, scopedId = null }, profile) {
  if (!profile || (!profile.name && !profile.username && !profile.profile_pic)) return;
  let q = supabaseAdmin
    .from('registration_leads')
    .select('id, first_name, last_name, full_name, parent_full_name, instagram_username, contact_avatar_url')
    .is('deleted_at', null)
    .limit(1);
  if (leadId) q = q.eq('id', leadId);
  else if (scopedId) q = q.eq('instagram_scoped_id', stripFb(scopedId));
  else return;
  const { data } = await q;
  const lead = data?.[0];
  if (!lead) return;
  const patch = {};
  const current = lead.parent_full_name || lead.full_name || [lead.first_name, lead.last_name].join(' ');
  if (profile.name && (isPlaceholderName(current) || /^(lead|instagram lead|facebook lead)$/i.test(String(lead.first_name || '')))) {
    const parts = profile.name.split(/\s+/).filter(Boolean);
    patch.parent_full_name = profile.name.slice(0, 160);
    patch.first_name = (parts[0] || profile.name).slice(0, 80);
    patch.last_name = (parts.slice(1).join(' ') || '-').slice(0, 80);
  }
  if (profile.username && profile.username !== lead.instagram_username) patch.instagram_username = profile.username;
  if (profile.profile_pic && profile.profile_pic !== lead.contact_avatar_url) patch.contact_avatar_url = profile.profile_pic;
  if (!Object.keys(patch).length) return;
  patch.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin.from('registration_leads').update(patch).eq('id', lead.id);
  if (error) console.warn('[social-profile] lead:', error.message);
}

/** Cron: ismi / kullanıcı adı eksik IG-FB konuşmalarını yeniden dene (webhook akışından bağımsız) */
export async function refreshMissingSocialProfiles({ limit = 15 } = {}) {
  const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('crm_conversations')
    .select('id, channel, contact_identifier, contact_name, contact_username, profile_checked_at, ad_source_data')
    .in('channel', ['instagram', 'facebook'])
    .is('contact_username', null)
    .or(`profile_checked_at.is.null,profile_checked_at.lt.${staleBefore}`)
    .order('last_message_at', { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  let updated = 0;
  const errors = {};
  for (const c of data || []) {
    const isFb =
      c.channel === 'facebook' ||
      String(c.contact_identifier || '').startsWith(FB_PREFIX) ||
      c.ad_source_data?.source_platform === 'facebook';
    const profile = await lookupSocialProfile(c.contact_identifier, { channel: isFb ? 'facebook' : 'instagram' });
    await applyConversationProfile(c.id, profile, { usernameHint: c.ad_source_data?.username || null });
    if (profile.name || profile.username) updated += 1;
    else if (profile.error) {
      const k = profile.error.split(':')[0];
      errors[k] = (errors[k] || 0) + 1;
    }
  }
  return { ok: true, scanned: (data || []).length, updated, errors };
}
