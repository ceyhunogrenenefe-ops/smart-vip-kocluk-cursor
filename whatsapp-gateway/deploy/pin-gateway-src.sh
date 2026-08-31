#!/bin/bash
# Phoenix'e gateway src pinle. Nginx'e dokunmaz.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/whatsapp-gateway/src/server.js"
KEY="${VPS_SSH_KEY:-/home/ubuntu/.ssh/phoenix_wa}"
HOST="${VPS_HOST:-89.252.179.128}"
MARKER="${GATEWAY_PIN_MARKER:-wa-qr-start-wait-2026-08-31}"

test -f "$SRC"
test -f "$KEY"
chmod 600 "$KEY" 2>/dev/null || true

ssh -4 -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=20 "root@${HOST}" \
  "cp -a /opt/whatsapp-gateway/src/server.js /opt/whatsapp-gateway/src/server.js.bak-pin-\$(date -u +%Y%m%d%H%M)"

scp -4 -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 \
  "$SRC" "root@${HOST}:/opt/whatsapp-gateway/src/server.js"

ssh -4 -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 "root@${HOST}" bash -s <<REMOTE
set -euo pipefail
node --check /opt/whatsapp-gateway/src/server.js
grep -q '$MARKER' /opt/whatsapp-gateway/src/server.js
echo '$MARKER' > /opt/whatsapp-gateway/PINNED
pm2 restart whatsapp-gateway
sleep 3
curl -sS http://127.0.0.1:4010/health | grep -q '$MARKER'
echo PIN_OK
REMOTE
