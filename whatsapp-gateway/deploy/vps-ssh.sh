#!/bin/bash
# Cursor ajanı → Phoenix VPS. Anahtar: /cursor/stores/self/vps/id_ed25519
# Şifre bu dosyada yok. SSH henüz pubkey ile açılmadıysa çıkış kodu 255.
set -euo pipefail
KEY="${VPS_SSH_KEY:-/cursor/stores/self/vps/id_ed25519}"
HOST="${VPS_HOST:-89.252.179.128}"
USER="${VPS_USER:-root}"
if [ ! -f "$KEY" ]; then
  echo "SSH anahtarı yok: $KEY" >&2
  exit 2
fi
exec ssh -4 -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=20 "${USER}@${HOST}" "$@"
