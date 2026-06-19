import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent
out = root.parent / "whatsapp-gateway-vps-2026-06-01.zip"

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

print(f"Created: {out}")
print(f"Size: {out.stat().st_size} bytes")
