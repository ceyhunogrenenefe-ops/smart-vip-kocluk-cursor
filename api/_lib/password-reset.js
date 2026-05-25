import crypto from 'crypto';
import { supabaseAdmin } from './supabase-admin.js';

const TOKEN_BYTES = 32;
const TTL_MS = 60 * 60 * 1000; // 1 saat

export function generateResetToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

export function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export async function createPasswordResetToken(userId) {
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  await supabaseAdmin
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('used_at', null);

  const { error } = await supabaseAdmin.from('password_reset_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt
  });
  if (error) throw error;
  return { token, expiresAt };
}

export async function consumePasswordResetToken(rawToken) {
  const tokenHash = hashResetToken(rawToken);
  const now = new Date().toISOString();

  const { data: row, error } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!row || row.used_at) return { ok: false, reason: 'invalid_token' };
  if (row.expires_at < now) return { ok: false, reason: 'expired_token' };

  const { error: markErr } = await supabaseAdmin
    .from('password_reset_tokens')
    .update({ used_at: now })
    .eq('id', row.id);
  if (markErr) throw markErr;

  return { ok: true, userId: row.user_id };
}

export function buildResetEmailHtml({ name, resetUrl }) {
  const safeName = String(name || 'Kullanıcı').replace(/</g, '&lt;');
  return `
<!DOCTYPE html>
<html lang="tr">
<body style="font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Şifre sıfırlama</h1>
    <p style="color:#475569;line-height:1.5;">Merhaba ${safeName},</p>
    <p style="color:#475569;line-height:1.5;">Smart VIP Koçluk hesabınız için şifre sıfırlama talebi aldık. Aşağıdaki düğmeye tıklayarak yeni şifrenizi belirleyebilirsiniz. Bağlantı <strong>1 saat</strong> geçerlidir.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${resetUrl}" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">Yeni şifre belirle</a>
    </p>
    <p style="font-size:12px;color:#94a3b8;word-break:break-all;">Bağlantı çalışmazsa: ${resetUrl}</p>
    <p style="font-size:12px;color:#94a3b8;margin-top:20px;">Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.</p>
  </div>
</body>
</html>`;
}
