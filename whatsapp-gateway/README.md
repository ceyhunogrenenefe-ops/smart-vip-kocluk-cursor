# WhatsApp Gateway (QR Session Service)

Bu servis koç bazlı WhatsApp oturumu açar, QR üretir ve mesaj gönderir.

## Kurulum

```bash
cd whatsapp-gateway
npm install
npm run dev
```

## Ortam Değişkenleri

- `PORT` (varsayılan: `4010`)
- `WHATSAPP_DATA_DIR` (varsayılan: `./data`)
- `LOG_LEVEL` (varsayılan: `info`)
- `APP_JWT_SECRET` (zorunlu, ana API ile aynı secret)
- `CORS_ALLOWED_ORIGINS` (zorunlu, virgül ile origin listesi)
- `GATEWAY_API_KEY` (opsiyonel ama önerilir)

## Endpointler

- `GET /health`
- `GET /ready` (prod readiness: jwt + cors config)
- `POST /sessions/:coachId/start`
- `GET /sessions/:coachId/status`
- `POST /sessions/:coachId/logout`
- `POST /sessions/:coachId/send` body: `{ "phone": "90555...", "message": "..." }`

## Notlar

- Bu servis Vercel serverless yerine sürekli çalışan bir sunucuda host edilmelidir.
- Frontend içinde `VITE_WHATSAPP_GATEWAY_URL` ile erişim adresi verin.

## Production (PM2)

1. `.env` oluşturun (`.env.example` baz alın).
2. Kurulum:
   - `npm ci`
3. PM2 ile başlatma:
   - `pm2 start ecosystem.config.cjs`
   - `pm2 save`
   - `pm2 startup`
4. Sağlık kontrolleri:
   - `GET /health`
   - `GET /ready`

## Güvenlik Modeli

- CORS allowlist dışında origin kabul edilmez.
- Tüm session endpointleri JWT ister (`Authorization: Bearer ...`).
- Koç kendi `:coachId` dışındaki oturumları yönetemez (`coach_scope_mismatch`).
- Opsiyonel ikinci katman: `x-gateway-key` header (`GATEWAY_API_KEY`).
