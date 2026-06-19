#!/bin/bash

# VPS'te whatsapp-gateway .env + bozuk oturum temizliği.

#

# Tam senkron:

#   ssh root@SUNUCU_IP 'bash -s' < whatsapp-gateway/vps-env-sync.sh

#

# Belirli koç oturumunu sil (Connection Failure):

#   PURGE_COACH_SESSION=user-1777390290346-2saxl7phn ssh root@SUNUCU_IP 'bash -s' < whatsapp-gateway/vps-env-sync.sh

#

set -euo pipefail



GATEWAY_DIR="${GATEWAY_DIR:-/root/whatsapp-gateway}"

ENV_FILE="${GATEWAY_DIR}/.env"

DATA_DIR="${WHATSAPP_DATA_DIR:-${GATEWAY_DIR}/data}"



mkdir -p "$(dirname "$ENV_FILE")"

touch "$ENV_FILE"



set_kv() {

  local key="$1"

  local val="$2"

  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then

    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"

  else

    echo "${key}=${val}" >> "$ENV_FILE"

  fi

}



# Vercel production ile aynı değerler

set_kv PORT 4010

set_kv GATEWAY_API_KEY "da4e61a780cc364323eb8d722e1bb5996acc38cc9c1cdc3c292cd54cedc3b3ee"

set_kv APP_JWT_SECRET "5CPMiCmfVSIutY2au3DkumMFSX_7U7ZF8TH6q7c-C6danhXDPQ6Eop_bBbhSAh1b"

set_kv CORS_ALLOWED_ORIGINS "https://www.dersonlinevipkocluk.com,https://smart-kocluk-ceyhu.vercel.app,http://localhost:5173"

set_kv WHATSAPP_DATA_DIR "${DATA_DIR}"

set_kv WA_CONNECTING_TIMEOUT_MS 75000

set_kv WA_RESTORE_BLOCK_MS 86400000

set_kv LOG_LEVEL info



if [ -n "${PURGE_COACH_SESSION:-}" ]; then

  echo "Purging coach session: ${PURGE_COACH_SESSION}"

  rm -rf "${DATA_DIR}/${PURGE_COACH_SESSION}"

  rm -f "${DATA_DIR}/${PURGE_COACH_SESSION}.meta.json"

fi



if [ "${PURGE_ALL_SESSIONS:-}" = "1" ]; then

  echo "Purging ALL gateway session data under ${DATA_DIR}"

  rm -rf "${DATA_DIR:?}"/*

fi



cd "$GATEWAY_DIR"

if [ -f package.json ]; then

  npm install --omit=dev 2>/dev/null || npm install

fi

pm2 restart whatsapp-gateway || pm2 start ecosystem.config.cjs

pm2 save



echo "OK — gateway yeniden başlatıldı."

echo "Test: curl -s http://127.0.0.1:4010/health"

echo "Ready: curl -s http://127.0.0.1:4010/ready"

