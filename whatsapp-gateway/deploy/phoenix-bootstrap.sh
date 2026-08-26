#!/bin/bash
# app.phoenixdms.com (89.252.179.128) — WhatsApp gateway kurulum.
# Şifre/secret YAZMAYIN. Env: GATEWAY_API_KEY, APP_JWT_SECRET
# Kullanım (ajan, key ile):
#   ssh -4 -i /cursor/stores/self/vps/id_ed25519 root@89.252.179.128 'bash -s' < whatsapp-gateway/deploy/phoenix-bootstrap.sh
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive
GATEWAY_DIR="${GATEWAY_DIR:-/opt/whatsapp-gateway}"
DOMAIN="${DOMAIN:-app.phoenixdms.com}"

apt-get update -y
apt-get install -y curl unzip ca-certificates gnupg ufw fail2ban nginx

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE 'v2[0-9]'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

mkdir -p "$GATEWAY_DIR" /var/www/certbot
# Kaynak bu script ile aynı repodan kopyalanmış olmalı (rsync/scp ayrı adım).

if [ -f "$GATEWAY_DIR/package.json" ]; then
  cd "$GATEWAY_DIR"
  npm ci --omit=dev || npm install --omit=dev
fi

if [ ! -f "$GATEWAY_DIR/.env" ]; then
  echo "EKSİK: $GATEWAY_DIR/.env — GATEWAY_API_KEY ve APP_JWT_SECRET Vercel ile aynı olmalı." >&2
  exit 2
fi

grep -q '^PORT=' "$GATEWAY_DIR/.env" || echo 'PORT=4010' >> "$GATEWAY_DIR/.env"
grep -q '^SILENCE_SIGNAL_SESSION_LOGS=' "$GATEWAY_DIR/.env" || echo 'SILENCE_SIGNAL_SESSION_LOGS=1' >> "$GATEWAY_DIR/.env"

cd "$GATEWAY_DIR"
pm2 delete whatsapp-gateway >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
# 4010 dışarı kapalı
ufw --force enable || true

echo "OK bootstrap. Health: curl -s http://127.0.0.1:4010/health"
pm2 status
curl -sS http://127.0.0.1:4010/health || true
echo
curl -sS http://127.0.0.1:4010/ready || true
echo
