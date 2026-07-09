# WhatsApp Gateway — Teknik Servis Kurulum / Güncelleme

**Sürüm:** 2026-07-06 (`sendReady` durum alanı, mesaj gönderim hazırlığı)

## Bu paket ne içerir?

- Güncel `src/server.js` (otomatik yeniden bağlanma, `sendReady` API alanı, strict oturum gönderimi)
- PM2 yapılandırması (`ecosystem.config.cjs`)
- Bağımlılık listesi (`package.json`, `package-lock.json`)

**Dahil değil:** `node_modules`, `.env`, `data/` (oturum dosyaları sunucuda kalır)

## Gereksinimler

- Node.js **20+**
- PM2
- Port **4010** açık
- Mevcut `.env` dosyası korunmalı (Vercel ile aynı secret'lar)

## İlk kurulum

```bash
cd /root/whatsapp-gateway
unzip -o whatsapp-gateway-vps-2026-06-01.zip
npm ci
cp .env.example .env   # sadece ilk kurulumda; .env değerlerini Vercel'den doldurun
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## Güncelleme (mevcut sunucu)

```bash
cd /root/whatsapp-gateway
pm2 stop whatsapp-gateway
# Zip'i açın — mevcut .env ve data/ klasörüne DOKUNMAYIN
unzip -o whatsapp-gateway-vps-2026-06-01.zip
npm ci
pm2 restart whatsapp-gateway
pm2 logs whatsapp-gateway --lines 50
```

## .env — önerilen ek değişkenler (opsiyonel)

```env
WA_RECONNECT_TIMEOUT_MS=180000
WA_SESSION_WATCHDOG_MS=45000
WA_MAX_RECONNECT_ATTEMPTS=24
SILENCE_SIGNAL_SESSION_LOGS=1
```

## Doğrulama

```bash
curl http://127.0.0.1:4010/health
```

Beklenen örnek yanıt:

```json
{"ok":true,"service":"whatsapp-gateway","sessions":1,"connected":1,"reconnecting":0}
```

## Sorun giderme

| Belirti | Çözüm |
|---------|--------|
| `logged_out` / Connection Failure | Panelden «Oturumu sıfırla ve QR al», telefonda eski Bağlı cihazı kaldır |
| PM2 sürekli restart | `pm2 logs whatsapp-gateway` — `.env` içinde `APP_JWT_SECRET` ve `GATEWAY_API_KEY` kontrol |
| Vercel'den erişilemiyor | Firewall'da 4010 açık mı, `WHATSAPP_GATEWAY_UPSTREAM` doğru IP:4010 mi |

Detaylı rehber: `VPS-KURULUM.md`
