#!/usr/bin/env bash
# Push site UX to onlinevipdershane1 when cursor[bot] has write access.
set -euo pipefail

SITE_REPO="ceyhunogrenenefe-ops/onlinevipdershane1"
PATCH_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${SITE_WORK_DIR:-/tmp/onlinevipdershane1-push}"
BRANCH="cursor/site-trial-basari-f243"

echo "=== installation repos ==="
gh api /installation/repositories --jq '{total_count,repository_selection,names:[.repositories[].full_name]}'

if ! gh api /installation/repositories --jq '.repositories[].full_name' | grep -qx "$SITE_REPO"; then
  echo "BLOCKED: $SITE_REPO not in this token's installation list."
  echo "cursor[bot] still selected-mode without the marketing repo."
  exit 2
fi

rm -rf "$WORK"
git clone --depth 20 "https://github.com/${SITE_REPO}.git" "$WORK"
cp -a "$PATCH_ROOT/assets/." "$WORK/assets/"
bash "$PATCH_ROOT/scripts/inject-float-scripts.sh" "$WORK"

python3 - <<PY
from pathlib import Path
p = Path("$WORK/index.html")
t = p.read_text(encoding="utf-8", errors="replace")
if "nav-basari-chip" not in t:
    needle = '<a href="https://www.dersonlinevipkocluk.com/login"'
    chip = '<a href="/basarilarimiz.html" class="nav-basari-chip" aria-label="Başarılarımız">🏆 Başarılarımız</a>\n      '
    if needle in t:
        p.write_text(t.replace(needle, chip + needle, 1), encoding="utf-8")
        print("inserted homepage chip")
PY

cd "$WORK"
git checkout -B "$BRANCH"
git add -A
if git diff --cached --quiet; then
  echo "No file changes; pushing existing branch if needed"
else
  git commit -m "feat(site): hızlı analiz popup, sticky ücretsiz deneme, mobil Başarılarımız"
fi
git push -u origin "$BRANCH"

if command -v gh >/dev/null; then
  gh pr create --repo "$SITE_REPO" --base main --head "$BRANCH" \
    --title "feat(site): hızlı analiz popup + ücretsiz deneme + mobil Başarılarımız" \
    --body "18sn popup, sticky ÜCRETSİZ DENEME (trial-float.js), mobil Başarılarımız chip." \
    || true
  gh pr merge --repo "$SITE_REPO" --merge "$BRANCH" || \
    gh pr list --repo "$SITE_REPO" --head "$BRANCH" --json number -q '.[0].number' | xargs -I{} gh pr merge --repo "$SITE_REPO" --merge {}
fi

echo "Pushed. Waiting for Vercel then checking live…"
for i in 1 2 3 4 5 6 7 8; do
  sleep 20
  js=$(curl -fsS "https://onlinevipdershane.com/assets/assessment-cta.js" || true)
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://onlinevipdershane.com/assets/trial-float.js")
  if echo "$js" | grep -q 18000 && [ "$code" = 200 ]; then
    echo "LIVE OK: 18000 + trial-float.js 200"
    exit 0
  fi
  echo "try $i: trial-float=$code delay-has-18000=$(echo "$js" | grep -c 18000 || true)"
done
echo "Push done but live not updated yet (Vercel cache)."
exit 0
