#!/usr/bin/env bash
# WhatsApp gateway session yedeği (silmeden önce çalıştırın)
# Kullanım: bash scripts/backup-wa-sessions.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${WHATSAPP_DATA_DIR:-$ROOT/whatsapp-gateway/data}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${1:-$ROOT/whatsapp-gateway/backups/sessions-$STAMP}"
mkdir -p "$(dirname "$DEST")"
if [[ ! -d "$DATA" ]]; then
  echo "DATA yok: $DATA"
  exit 1
fi
cp -a "$DATA" "$DEST"
echo "Yedek alındı: $DEST"
echo "Not: QR/session dosyaları hassastır; paylaşmayın."
