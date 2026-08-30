#!/usr/bin/env bash
# Inject wa-float / trial-float / assessment-cta into marketing HTML pages.
set -euo pipefail
ROOT="${1:-.}"
ROOT="$(cd "$ROOT" && pwd)"

inject() {
  local file="$1"
  local scripts="$2"
  [[ -f "$file" ]] || return 0
  if grep -q 'trial-float.js' "$file" && grep -q 'wa-float.js' "$file" && grep -q 'assessment-cta.js' "$file"; then
    echo "skip $file"
    return 0
  fi
  python3 - "$file" "$scripts" <<'PY'
import pathlib, re, sys
path = pathlib.Path(sys.argv[1])
scripts = sys.argv[2]
text = path.read_text(encoding='utf-8')
text = re.sub(
    r'\s*<script src="(?:\.\./)?assets/(?:wa-float|trial-float|assessment-cta)\.js[^"]*" defer></script>\s*',
    '\n',
    text,
)
if '</body>' not in text:
    raise SystemExit(f'no </body> in {path}')
path.write_text(text.replace('</body>', scripts + '</body>', 1), encoding='utf-8')
print('ok', path)
PY
}

ROOT_SCRIPTS='<script src="assets/wa-float.js" defer></script>
<script src="assets/trial-float.js" defer></script>
<script src="assets/assessment-cta.js" defer></script>
'

PROG_SCRIPTS='<script src="../assets/wa-float.js" defer></script>
<script src="../assets/trial-float.js" defer></script>
<script src="../assets/assessment-cta.js" defer></script>
'

for f in basarilarimiz.html kayit.html iletisim.html blog.html kadromuz.html videolar.html \
  ozel-ders.html premium-paketler.html ogretmenler.html kariyer.html sepet.html index.html; do
  inject "$ROOT/$f" "$ROOT_SCRIPTS"
done

shopt -s nullglob
for f in "$ROOT"/programlar/*.html; do
  inject "$f" "$PROG_SCRIPTS"
done

echo "Done. Review git diff, then commit & push to deploy."
