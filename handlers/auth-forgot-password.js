import { supabaseAdmin } from '../api/_lib/supabase-admin.js';
import { errorMessage } from '../api/_lib/error-msg.js';
import {
  buildResetEmailHtml,
  createPasswordResetToken
} from '../api/_lib/password-reset.js';
import {
  isEmailConfigured,
  logEmailError,
  publicAppOrigin,
  sendTransactionalEmail
} from '../api/_lib/send-email.js';

const GENERIC_OK = {
  ok: true,
  message:
    'Bu e-posta kayıtlıysa şifre sıfırlama bağlantısı birkaç dakika içinde gönderilir.'
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'email_required' });
    }

    if (!isEmailConfigured()) {
      return res.status(503).json({
        error: 'email_not_configured',
        message:
          'E-posta servisi henüz yapılandırılmamış. Yönetici: RESEND_API_KEY veya SENDGRID_API_KEY ekleyin.'
      });
    }

    let { data: user, error: userErr } = await supabaseAdmin
      .from('users')
      .select('id, name, email, is_active')
      .eq('email', email)
      .maybeSingle();

    if (!userErr && !user) {
      const r2 = await supabaseAdmin
        .from('users')
        .select('id, name, email, is_active')
        .ilike('email', email)
        .maybeSingle();
      if (!r2.error) user = r2.data;
      else userErr = r2.error;
    }

    if (userErr) {
      console.error('[auth-forgot-password]', errorMessage(userErr));
      return res.status(200).json(GENERIC_OK);
    }

    if (!user?.id || user.is_active === false) {
      return res.status(200).json(GENERIC_OK);
    }

    const { token } = await createPasswordResetToken(user.id);
    const origin = publicAppOrigin();
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

    try {
      await sendTransactionalEmail({
        to: user.email || email,
        subject: 'Şifre sıfırlama — Smart VIP Koçluk',
        html: buildResetEmailHtml({ name: user.name, resetUrl }),
        text: `Merhaba ${user.name || ''},\n\nŞifrenizi sıfırlamak için bağlantı (1 saat geçerli):\n${resetUrl}\n\nBu talebi siz yapmadıysanız e-postayı yok sayın.`
      });
    } catch (mailErr) {
      logEmailError('auth-forgot-password', mailErr);
      return res.status(503).json({
        error: 'email_send_failed',
        message: 'E-posta gönderilemedi. Lütfen daha sonra tekrar deneyin.'
      });
    }

    return res.status(200).json(GENERIC_OK);
  } catch (e) {
    logEmailError('auth-forgot-password', e);
    return res.status(500).json({ error: errorMessage(e) });
  }
}
