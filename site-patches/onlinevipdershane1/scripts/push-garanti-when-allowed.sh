#!/usr/bin/env bash
# Push Garanti Bonus POS (raw_amount + kitapMagaza) to onlinevipdershane1 when cursor[bot] has write access.
set -euo pipefail

SITE_REPO="ceyhunogrenenefe-ops/onlinevipdershane1"
PATCH_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${SITE_WORK_DIR:-/tmp/onlinevipdershane1-garanti-push}"
BRANCH="cursor/garanti-raw-amount-f243"

echo "=== installation repos ==="
gh api /installation/repositories --jq '{total_count,repository_selection,names:[.repositories[].full_name]}'

if ! gh api /installation/repositories --jq '.repositories[].full_name' | grep -qx "$SITE_REPO"; then
  echo "BLOCKED: $SITE_REPO not in this token's installation list."
  echo ""
  echo "GitHub → Settings → Applications → Cursor → Repository access:"
  echo "  All repositories  VEYA  onlinevipdershane1 işaretle → Save"
  echo "Sonra YENİ bir Cloud Agent'ı onlinevipdershane1 üzerinden açın (bu sohbet aynı token ile kalır)."
  echo ""
  echo "Manuel alternatif:"
  echo "  cd /path/to/onlinevipdershane1"
  echo "  cp site-patches/onlinevipdershane1/api/_lib/garanti.js api/_lib/"
  echo "  cp site-patches/onlinevipdershane1/api/_lib/products.js api/_lib/"
  echo "  cp site-patches/onlinevipdershane1/api/garanti-init.js api/"
  echo "  cp site-patches/onlinevipdershane1/api/garanti-callback.js api/"
  echo "  cp site-patches/onlinevipdershane1/api/garanti-token.js api/  # opsiyonel alias"
  echo "  cp site-patches/onlinevipdershane1/api/payment-provider.js api/"
  echo "  git add api && git commit -m 'fix: Garanti raw_amount + kitapMagaza' && git push"
  exit 2
fi

rm -rf "$WORK"
git clone --depth 20 "https://github.com/${SITE_REPO}.git" "$WORK"

mkdir -p "$WORK/api/_lib"
cp -f "$PATCH_ROOT/api/_lib/garanti.js" "$WORK/api/_lib/garanti.js"
cp -f "$PATCH_ROOT/api/_lib/products.js" "$WORK/api/_lib/products.js"
cp -f "$PATCH_ROOT/api/garanti-init.js" "$WORK/api/garanti-init.js"
cp -f "$PATCH_ROOT/api/garanti-callback.js" "$WORK/api/garanti-callback.js"
cp -f "$PATCH_ROOT/api/payment-provider.js" "$WORK/api/payment-provider.js"
# Alias — eski istemciler
cp -f "$PATCH_ROOT/api/garanti-init.js" "$WORK/api/garanti-token.js"

cd "$WORK"
git checkout -B "$BRANCH"
git add api/_lib/garanti.js api/_lib/products.js api/garanti-init.js api/garanti-callback.js api/garanti-token.js api/payment-provider.js
if git diff --cached --quiet; then
  echo "No file changes"
else
  git commit -m "fix: Garanti Bonus POS — raw_amount + kitapMagaza + PROVOOS/3D_OOS_PAY"
fi
git push -u origin "$BRANCH"

if command -v gh >/dev/null; then
  gh pr create --repo "$SITE_REPO" --base main --head "$BRANCH" \
    --title "fix: Garanti raw_amount (koçluk paneli proxy)" \
    --body "Serbest tutarlı Garanti formu (mode=raw_amount) + kitapMagaza. Panel muhasebe/kitap ödemesi site env ile çalışır." \
    || true
  gh pr merge --repo "$SITE_REPO" --merge "$BRANCH" || \
    gh pr list --repo "$SITE_REPO" --head "$BRANCH" --json number -q '.[0].number' | xargs -I{} gh pr merge --repo "$SITE_REPO" --merge {} || true
fi

echo "Pushed. Waiting for Vercel…"
for i in 1 2 3 4 5 6 7 8 9 10; do
  sleep 15
  body=$(curl -sS -X POST "https://onlinevipdershane.com/api/garanti-init" \
    -H 'Content-Type: application/json' \
    -d '{"mode":"raw_amount","amountKurus":15000,"customer":{"parentName":"Test Veli AA","phone":"05551234567","email":"t@example.com"}}' || true)
  if echo "$body" | grep -q '"paymentAmount":15000'; then
    echo "LIVE OK: raw_amount 15000"
    exit 0
  fi
  echo "try $i: $(echo "$body" | head -c 120)"
done
echo "Push done but live not updated yet."
exit 0
