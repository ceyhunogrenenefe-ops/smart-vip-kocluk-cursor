import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import { consumePasswordResetToken } from '../api/_lib/password-reset.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token) return res.status(400).json({ error: 'token_required' });
    if (password.length < 6) {
      return res.status(400).json({ error: 'password_too_short', message: 'Şifre en az 6 karakter olmalı' });
    }

    const consumed = await consumePasswordResetToken(token);
    if (!consumed.ok) {
      const msg =
        consumed.reason === 'expired_token'
          ? 'Bağlantının süresi dolmuş. Lütfen yeniden şifre sıfırlama isteyin.'
          : 'Geçersiz veya kullanılmış bağlantı.';
      return res.status(400).json({ error: consumed.reason, message: msg });
    }

    const now = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin
      .from('users')
      .update({ password_hash: password, updated_at: now })
      .eq('id', consumed.userId);
    if (upErr) throw upErr;

    return res.status(200).json({
      ok: true,
      message: 'Şifreniz güncellendi. Giriş sayfasından yeni şifrenizle giriş yapabilirsiniz.'
    });
  } catch (e) {
    return res.status(500).json({ error: errorMessage(e) });
  }
}
