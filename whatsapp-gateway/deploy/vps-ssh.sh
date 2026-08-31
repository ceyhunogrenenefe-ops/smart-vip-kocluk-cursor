#!/bin/bash
# Cursor ajanı → Phoenix VPS. Anahtar: /cursor/stores/self/vps/id_ed25519
# Şifre bu dosyada yok. SSH henüz pubkey ile açılmadıysa çıkış kodu 255.
set -euo pipefail
KEY="${VPS_SSH_KEY:-}"
if [ -z "$KEY" ]; then
  for cand in /home/ubuntu/.ssh/phoenix_wa /root/.ssh/phoenix_wa /cursor/stores/self/vps/id_ed25519; do
    if [ -f "$cand" ]; then KEY="$cand"; break; fi
  done
fi
HOST="${VPS_HOST:-89.252.179.128}"
USER="${VPS_USER:-root}"
if [ -z "$KEY" ] || [ ! -f "$KEY" ]; then
  echo "SSH anahtarı yok (phoenix_wa / id_ed25519)" >&2
  exit 2
fi
chmod 600 "$KEY" 2>/dev/null || true
exec ssh -4 -i "$KEY" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=20 "${USER}@${HOST}" "$@"
