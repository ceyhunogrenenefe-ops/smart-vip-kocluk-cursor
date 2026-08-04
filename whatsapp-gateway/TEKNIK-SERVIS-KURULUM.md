# WhatsApp Gateway — Teknik Servis Kurulum / Güncelleme

**Sürüm:** `2026-08-04-root-pending` («Mesaj bekleniyor» kök çözüm: getMessage + `_msg-cache` + idle hard warm)

## Bu paket ne içerir?

- Güncel `src/server.js` + **`src/message-store.js` (zorunlu — eksikse «Mesaj bekleniyor» geri gelir)**
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
cd /root/whatsapp-gateway   # veya Windows: gateway klasörü
unzip -o whatsapp-gateway-vps.zip
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
unzip -o whatsapp-gateway-vps.zip
# Windows: zip içeriğini gateway klasörüne kopyalayın (src/server.js + src/message-store.js)
npm ci
pm2 restart whatsapp-gateway
pm2 logs whatsapp-gateway --lines 50
```

## .env — önerilen ek değişkenler

```env
WA_RECONNECT_TIMEOUT_MS=180000
WA_SESSION_WATCHDOG_MS=45000
WA_MAX_RECONNECT_ATTEMPTS=24
SILENCE_SIGNAL_SESSION_LOGS=1
# «Mesaj bekleniyor» — idle warm (varsayılan 3 dk; 30 dk YAZMAYIN)
WA_IDLE_WARM_MS=180000
WA_WARM_HARD_FAIL=true
```

**Dikkat:** `WA_IDLE_WARM_MS=1803000` (~30 dk) yazılmışsa soft-idle kalır; **180000** kullanın. Kod artık 10 dk üstünü keser.

## Doğrulama

```bash
curl http://127.0.0.1:4010/health
```

Beklenen alanlar:

```json
{
  "ok": true,
  "message_store_version": "2026-08-04-root-pending",
  "get_message_implemented": true,
  "warm": { "hard_fail": true, "idle_ms": 180000 },
  "connected": 1
}
```

Başlangıç logunda: `"messageStoreVersion":"2026-08-04-root-pending"`, `"warmHardFail":true`.  
`MessageCounterError` / `Key used already` açılışta gürültü olabilir — oturumlar `WhatsApp connected` ise sorun değil.

## Sorun giderme

| Belirti | Çözüm |
|---------|--------|
| `logged_out` / Connection Failure | Panelden «Oturumu sıfırla ve QR al», telefonda eski Bağlı cihazı kaldır |
| PM2 sürekli restart | `pm2 logs whatsapp-gateway` — `.env` içinde `APP_JWT_SECRET` ve `GATEWAY_API_KEY` kontrol |
| Vercel'den erişilemiyor (502) | Gateway **nerede çalışıyorsa** o IP: `WHATSAPP_GATEWAY_UPSTREAM=http://PUBLIC_IP:4010` (Windows makineyse VPS IP değil) |
| `Stream Errored (ack)` / `Bad MAC` / `Connection Closed` | Geçici Baileys hatası — süreç **çökmemeli**, otomatik reconnect |
| Panel 502, gateway Windows’ta açık | Windows firewall 4010 inbound + public IP; Vercel env’yi Windows IP’ye çevirin |
| `idleWarmMs: 1803000` logda | `.env` → `WA_IDLE_WARM_MS=180000`, pm2 restart |
| `message-store.js` yok / import hatası | Zip’te `src/message-store.js` olmalı; sadece `server.js` yetmez |

Detaylı rehber: `VPS-KURULUM.md`
