/**
 * Hesap silme talebi (Google Play veri güvenliği şartı).
 * - POST (oturumlu, uygulama içi "Hesabımı sil") → giriş yapan kullanıcı adına talep
 * - POST (oturumsuz, /hesap-silme web sayfası) → ad + e-posta/telefon ile talep
 * - GET  (süper admin / admin) → talep listesi
 * - PATCH (süper admin) → durum güncelle (completed / rejected); silme işlemi yönetici tarafından yapılır
 * Talep kendiliğinden veri silmez; süper admin'e panel bildirimi düşer.
 */
import { createHash } from 'node:crypto';
import { requireAuthenticatedActor } from '../api/_lib/auth.js';
import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';

const MAX_PER_IP_PER_HOUR = 5;

function tryActor(req) {
  try {
    return requireAuthenticatedActor(req);
  } catch {
    return null;
  }
}

function clientIpHash(req) {
  const raw = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '')
    .split(',')[0]
    .trim();
  return raw ? createHash('sha1').update(raw).digest('hex').slice(0, 20) : null;
}

function clean(v, max) {
  return String(v ?? '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

async function notifySuperAdmins({ title, body }) {
  try {
    const { data: admins } = await supabaseAdmin.from('users').select('id').eq('role', 'super_admin').limit(5);
    for (const a of admins || []) {
      await supabaseAdmin.from('platform_notifications').insert({
        title,
        body: body.slice(0, 4000),
        target_type: 'user',
        target_user_id: String(a.id),
        sender_user_id: 'system',
        sender_role: 'admin',
        institution_id: null,
        priority: 'high',
        link_url: '/admin'
      });
    }
  } catch (e) {
    console.warn('[account-deletion] notify:', errorMessage(e));
  }
}

function isAdmin(actor) {
  const role = String(actor?.role || '').toLowerCase();
  return role === 'super_admin' || role === 'admin';
}

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const actor = tryActor(req);

    if (req.method === 'GET') {
      if (!actor || !isAdmin(actor)) return res.status(403).json({ error: 'forbidden' });
      const { data, error } = await supabaseAdmin
        .from('account_deletion_requests')
        .select('id, user_id, full_name, email, phone, reason, source, status, admin_note, processed_at, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.status(200).json({ items: data || [] });
    }

    if (req.method === 'PATCH') {
      if (!actor || String(actor.role || '').toLowerCase() !== 'super_admin') {
        return res.status(403).json({ error: 'forbidden' });
      }
      const id = clean(body.id, 64);
      const status = clean(body.status, 20);
      if (!id || !['pending', 'completed', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'invalid_request' });
      }
      const { error } = await supabaseAdmin
        .from('account_deletion_requests')
        .update({
          status,
          admin_note: clean(body.admin_note, 500) || null,
          processed_by: String(actor.sub || ''),
          processed_at: status === 'pending' ? null : new Date().toISOString()
        })
        .eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, PATCH');
      return res.status(405).json({ error: 'method_not_allowed' });
    }

    // Bot tuzağı: görünmez alan doluysa sessizce kabul et
    if (clean(body.website, 200)) return res.status(200).json({ ok: true });

    const reason = clean(body.reason, 1000);
    let row;
    if (actor?.sub) {
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, name, email, phone')
        .eq('id', String(actor.sub))
        .maybeSingle();
      row = {
        user_id: String(actor.sub),
        full_name: user?.name || null,
        email: user?.email || null,
        phone: user?.phone || null,
        reason: reason || null,
        source: 'app'
      };
    } else {
      const fullName = clean(body.full_name, 120);
      const email = clean(body.email, 160).toLowerCase();
      const phone = clean(body.phone, 30);
      if (fullName.length < 3) return res.status(400).json({ error: 'name_required', message: 'Ad soyad girin.' });
      if (!email && phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ error: 'contact_required', message: 'Hesabınıza kayıtlı e-posta veya telefon girin.' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: 'email_invalid', message: 'Geçerli bir e-posta girin.' });
      }
      const ipHash = clientIpHash(req);
      if (ipHash) {
        const { count } = await supabaseAdmin
          .from('account_deletion_requests')
          .select('id', { count: 'exact', head: true })
          .eq('ip_hash', ipHash)
          .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
        if ((count || 0) >= MAX_PER_IP_PER_HOUR) {
          return res.status(429).json({ error: 'rate_limited', message: 'Çok fazla talep. Lütfen daha sonra tekrar deneyin.' });
        }
      }
      row = { full_name: fullName, email: email || null, phone: phone || null, reason: reason || null, source: 'web', ip_hash: ipHash };
    }

    // Aynı kullanıcı için açık talep varsa yenisini açma
    if (row.user_id) {
      const { data: open } = await supabaseAdmin
        .from('account_deletion_requests')
        .select('id, created_at')
        .eq('user_id', row.user_id)
        .eq('status', 'pending')
        .limit(1);
      if (open?.length) return res.status(200).json({ ok: true, already_pending: true });
    }

    const { error } = await supabaseAdmin.from('account_deletion_requests').insert(row);
    if (error) throw error;

    await notifySuperAdmins({
      title: 'Hesap silme talebi',
      body: `${row.full_name || 'Kullanıcı'} (${row.email || row.phone || row.user_id || '-'}) hesabının silinmesini istedi. Kaynak: ${
        row.source === 'app' ? 'uygulama' : 'web sayfası'
      }${row.reason ? ` · Neden: ${row.reason}` : ''}`
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[account-deletion]', e);
    return res.status(500).json({ error: 'server_error', message: errorMessage(e) });
  }
}
