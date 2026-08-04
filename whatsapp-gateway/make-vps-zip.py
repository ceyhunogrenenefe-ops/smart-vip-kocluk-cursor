import zipfile
from pathlib import Path
from datetime import date

root = Path(__file__).resolve().parent
stamp = date.today().isoformat()
# deploy-server-to-vps.ps1 bu sabit adı bekler
out_stable = root.parent / "whatsapp-gateway-vps.zip"
out_dated = root.parent / f"whatsapp-gateway-vps-{stamp}.zip"
downloads = Path.home() / "Downloads" / f"whatsapp-gateway-vps-{stamp}.zip"

# KÖK: message-store.js zip'e GİRMEZSE VPS'te getMessage boş kalır → «Mesaj bekleniyor»
files = [
    "src/server.js",
    "src/message-store.js",
    "src/message-store.test.js",
    "package.json",
    "package-lock.json",
    "ecosystem.config.cjs",
    ".env.example",
    "README.md",
    "VPS-KURULUM.md",
    "TEKNIK-SERVIS-KURULUM.md",
    "vps-env-sync.sh",
]

# Tüm src/*.js (gelecekteki modüller kaçmasın)
src_dir = root / "src"
if src_dir.is_dir():
    for p in sorted(src_dir.glob("*.js")):
        rel = f"src/{p.name}"
        if rel not in files:
            files.append(rel)

with zipfile.ZipFile(out_stable, "w", zipfile.ZIP_DEFLATED) as zf:
    for rel in files:
        path = root / rel
        if path.exists():
            zf.write(path, rel.replace("\\", "/"))
            print(f"  + {rel}")
        else:
            print(f"SKIP missing: {rel}")

out_dated.write_bytes(out_stable.read_bytes())
try:
    downloads.parent.mkdir(parents=True, exist_ok=True)
    downloads.write_bytes(out_stable.read_bytes())
    print(f"Downloads: {downloads}")
except OSError as e:
    print(f"Downloads copy skipped: {e}")

print(f"Created: {out_stable}")
print(f"Dated:   {out_dated}")
print(f"Size: {out_stable.stat().st_size} bytes")
# Doğrulama: message-store zip içinde mi?
with zipfile.ZipFile(out_stable, "r") as zf:
    names = zf.namelist()
    assert "src/message-store.js" in names, "FATAL: message-store.js missing from zip"
    assert "src/server.js" in names, "FATAL: server.js missing from zip"
print("OK: src/server.js + src/message-store.js in zip")
