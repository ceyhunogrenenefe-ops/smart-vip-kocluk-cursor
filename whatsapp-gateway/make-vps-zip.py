import zipfile
from pathlib import Path
from datetime import date

root = Path(__file__).resolve().parent
# İndirilenler klasörüne de kopyala — kolay erişim
stamp = date.today().isoformat()
out = root.parent / f"whatsapp-gateway-vps-{stamp}.zip"
downloads = Path.home() / "Downloads" / f"whatsapp-gateway-vps-{stamp}.zip"

files = [
    "src/server.js",
    "package.json",
    "package-lock.json",
    "ecosystem.config.cjs",
    ".env.example",
    "README.md",
    "VPS-KURULUM.md",
    "TEKNIK-SERVIS-KURULUM.md",
    "vps-env-sync.sh",
]

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for rel in files:
        path = root / rel
        if path.exists():
            zf.write(path, rel.replace("\\", "/"))
        else:
            print(f"SKIP missing: {rel}")

downloads.write_bytes(out.read_bytes())
print(f"Created: {out}")
print(f"Downloads: {downloads}")
print(f"Size: {out.stat().st_size} bytes")
