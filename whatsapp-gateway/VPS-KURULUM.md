# WhatsApp Gateway — VPS Kurulum Rehberi

Bu rehber, `whatsapp-gateway` servisini sıfırdan bir Ubuntu/Debian VPS üzerinde çalıştırmanız için adım adım talimatlar içerir.

> **Windows notu:** Gateway Windows makinede (ör. `DESKTOP-I99I2SE`) çalışacaksa Vercel `WHATSAPP_GATEWAY_UPSTREAM` değeri **VPS IP değil**, Windows makinenizin internetten erişilen public IP/DNS + `:4010` olmalıdır.

## Gereksinimler

- Ubuntu 22.04 / 24.04 veya Debian 12 (root veya sudo yetkili kullanıcı)
- Node.js **20+** (LTS önerilir)
- PM2 (process manager)
- Port **4010** dışarıya açık (veya reverse proxy arkasında)

## 1. Zip dosyasını VPS'e yükleyin

Yerel bilgisayarınızdan (PowerShell veya terminal):

```bash
scp whatsapp-gateway-vps.zip root@SUNUCU_IP:/root/
```

`SUNUCU_IP` yerine VPS IP adresinizi yazın.

## 2. VPS'te temel paketler ve Node.js 20

SSH ile bağlanın:

```bash
ssh root@SUNUCU_IP
```

Node.js 20 kurulumu (NodeSource):

```bash
apt update && apt install -y curl unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # v20.x görmelisiniz
npm -v
```

PM2 kurulumu:

```bash
npm install -g pm2
```

## 3. Zip'i açın ve bağımlılıkları kurun

```bash
cd /root
unzip -o whatsapp-gateway-vps.zip -d whatsapp-gateway
cd whatsapp-gateway
npm ci
```

`npm ci` başarısız olursa: `npm install --omit=dev`

## 4. `.env` dosyasını oluşturun

Şablonu kopyalayın:

```bash
cp .env.example .env
nano .env
```

**Zorunlu değerler** (Vercel production ile **birebir aynı** olmalı):

| Değişken | Açıklama |
|----------|----------|
| `PORT` | `4010` |
| `GATEWAY_API_KEY` | Vercel'deki `GATEWAY_API_KEY` ile aynı |
| `APP_JWT_SECRET` | Vercel'deki `APP_JWT_SECRET` ile aynı |
| `CORS_ALLOWED_ORIGINS` | Panel origin'leri (virgülle ayrılmış) |
| `SILENCE_SIGNAL_SESSION_LOGS` | `1` (önerilir) — `Closing session: SessionEntry` stdout spam satırlarını bastırır |

Örnek `.env` (gerçek secret'ları Vercel dashboard'dan alın):

```env
PORT=4010
WHATSAPP_DATA_DIR=./data
LOG_LEVEL=info
APP_JWT_SECRET=<Vercel APP_JWT_SECRET ile aynı>
GATEWAY_API_KEY=<Vercel GATEWAY_API_KEY ile aynı>
CORS_ALLOWED_ORIGINS=https://www.dersonlinevipkocluk.com,https://smart-kocluk-ceyhu.vercel.app,http://localhost:5173
WA_CONNECTING_TIMEOUT_MS=75000
WA_RESTORE_BLOCK_MS=86400000
SEND_MESSAGE_TIMEOUT_MS=45000
WA_SEND_READY_DELAY_MS=500
WA_SEND_WAIT_READY_MS=12000
WA_SEND_WAIT_POLL_MS=200
WA_SKIP_ON_WHATSAPP_CHECK=1
WA_ON_WHATSAPP_TIMEOUT_MS=3500
WA_SEND_MESSAGE_RETRIES=1
SILENCE_SIGNAL_SESSION_LOGS=1
```

> **Önemli:** `GATEWAY_API_KEY` ve `APP_JWT_SECRET` Vercel production ortam değişkenleriyle eşleşmezse panelden gateway'e istekler reddedilir.
>
> **Önemli (Windows):** `WHATSAPP_GATEWAY_UPSTREAM` gateway'in gerçekten çalıştığı hostu göstermelidir. Windows'ta çalışıyorsa `http://WINDOWS_PUBLIC_IP:4010` kullanın; VPS IP yanlışsa panel "mesaj bekleniyor" veya timeout verir.

### Hızlı senkron (opsiyonel)

Projede `vps-env-sync.sh` varsa, yerel makineden tek komutla `.env` güncelleyip PM2'yi yeniden başlatabilirsiniz:

```bash
ssh root@SUNUCU_IP 'bash -s' < vps-env-sync.sh
```

Belirli bir koç oturumunu silmek (Connection Failure sonrası):

```bash
PURGE_COACH_SESSION=user-XXXX ssh root@SUNUCU_IP 'bash -s' < vps-env-sync.sh
```

## 5. PM2 ile başlatın

```bash
cd /root/whatsapp-gateway
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Son komutun verdiği `sudo env PATH=...` satırını kopyalayıp çalıştırın (sunucu reboot sonrası otomatik başlatma).

Log izleme:

```bash
pm2 logs whatsapp-gateway
pm2 status
```

## 6. Firewall (port 4010)

UFW kullanıyorsanız:

```bash
ufw allow 4010/tcp
ufw reload
ufw status
```

Sadece belirli IP'den erişim istiyorsanız:

```bash
ufw allow from SIZIN_IP to any port 4010
```

## 7. Sağlık kontrolleri

VPS üzerinde:

```bash
curl -s http://127.0.0.1:4010/health
curl -s http://127.0.0.1:4010/ready
```

Beklenen:

- `/health` → `{"ok":true}` benzeri yanıt
- `/ready` → JWT ve CORS yapılandırması hazırsa `ok: true`

Dışarıdan (panel domain'inizden veya test makinenizden):

```bash
curl -s http://SUNUCU_IP:4010/health
```

## 8. Vercel tarafı

Vercel production environment variables:

- `WHATSAPP_GATEWAY_URL` → `http://SUNUCU_IP:4010` (veya HTTPS reverse proxy URL)
- `GATEWAY_API_KEY` → gateway `.env` ile aynı
- `APP_JWT_SECRET` → gateway `.env` ile aynı

Frontend (Vite build):

- `VITE_WHATSAPP_GATEWAY_URL` → panelin gateway'e erişeceği public URL

## 9. Connection Failure / bozuk oturum temizliği

WhatsApp'ta "Connection Failure" görürseniz:

1. Telefonda **Bağlı cihazlar** → eski oturumu kaldırın
2. Panelde **Oturumu sıfırla ve QR al**
3. Gerekirse VPS'te koç klasörünü silin:

```bash
rm -rf /root/whatsapp-gateway/data/KOÇ_ID
rm -f /root/whatsapp-gateway/data/KOÇ_ID.meta.json
pm2 restart whatsapp-gateway
```

veya `PURGE_COACH_SESSION=KOÇ_ID` ile `vps-env-sync.sh` kullanın.

## 10. Yararlı komutlar

```bash
pm2 restart whatsapp-gateway
pm2 stop whatsapp-gateway
pm2 delete whatsapp-gateway
cd /root/whatsapp-gateway && npm ci && pm2 restart whatsapp-gateway
```

## Dosya yapısı

```
whatsapp-gateway/
├── src/server.js          # Ana servis (Baileys QR + mesaj)
├── package.json
├── package-lock.json
├── ecosystem.config.cjs   # PM2 config
├── .env.example           # Şablon
├── vps-env-sync.sh        # .env + oturum temizliği scripti
├── data/                  # Oturum dosyaları (runtime'da oluşur)
└── VPS-KURULUM.md         # Bu dosya
```
