# Resend ile şifre sıfırlama

Kod hazır. Yalnızca Resend + Vercel ortam değişkenleri gerekir.

## 1. Resend hesabı

1. [resend.com](https://resend.com) → kayıt / giriş  
2. **Domains** → `dersonlinevipkocluk.com` ekleyin → DNS kayıtlarını domain panelinize girin → **Verified** olana kadar bekleyin  
3. **API Keys** → Create API Key → kopyalayın (`re_...`)

> Domain doğrulanmadan canlıda mail gitmez. Test için Resend’in verdiği `onboarding@resend.dev` yalnızca hesabınızdaki test e-postasına gider.

## 2. Supabase (bir kez)

SQL Editor:

`student-coaching-system/sql/2026-05-39-password-reset-tokens.sql`

## 3. Vercel ortam değişkenleri (Production)

| Değişken | Örnek |
|----------|--------|
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `EMAIL_FROM` | `noreply@dersonlinevipkocluk.com` (doğrulanmış domain) |
| `EMAIL_FROM_NAME` | `Smart VIP Koçluk` |
| `APP_PUBLIC_URL` | `https://www.dersonlinevipkocluk.com` |

Terminal (anahtarı yapıştırınca sorar):

```powershell
cd "c:\Users\ceyhu\Downloads\student-coaching-system (12)"
vercel env add RESEND_API_KEY production
vercel env add EMAIL_FROM production
vercel env add EMAIL_FROM_NAME production
vercel env add APP_PUBLIC_URL production
vercel --prod
```

Veya Vercel Dashboard → Project → Settings → Environment Variables.

## 4. Test

1. `https://www.dersonlinevipkocluk.com/forgot-password`  
2. **Supabase `users` tablosunda kayıtlı** bir e-posta girin  
3. Gelen mail → **Yeni şifre belirle** → giriş

Hata `email_not_configured` → `RESEND_API_KEY` yok veya deploy sonrası yenilenmedi.  
Hata `email_send_failed` → Resend loglarında domain / gönderen adresi kontrol edin.

## 5. API

- `POST /api/auth-forgot-password` — `{ "email": "..." }`
- `POST /api/auth-reset-password` — `{ "token": "...", "password": "..." }`

Bağlantı süresi: **1 saat**.
