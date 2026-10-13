# -*- coding: utf-8 -*-
"""
Mağaza simgesi ile cihaz simgelerinin aynı olduğunu doğrular.

Google Play reddinin nedeni ikisinin FARKLI olmasıydı; bu yüzden
"düzelttim" demek yetmez, ölçmek gerekir. Her simge ortak bir boyuta
indirilip mağaza simgesiyle piksel farkı hesaplanır.

Kullanım:  python scripts/ikon-dogrula.py
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw

BURASI = os.path.dirname(os.path.abspath(__file__))
PROJE = os.path.join(BURASI, "..")
MAGAZA = os.path.join(PROJE, "brand", "play-store-icon-512.png")
RES = os.path.join(PROJE, "android", "app", "src", "main", "res")

YOGUNLUKLAR = ["mipmap-mdpi", "mipmap-hdpi", "mipmap-xhdpi", "mipmap-xxhdpi", "mipmap-xxxhdpi"]
KARSILASTIRMA = 64  # ortak karşılaştırma boyutu

# Aynı sayılma eşiği: yeniden örnekleme ve JPEG benzeri kayıplar için pay
ESIK_ORT = 6.0   # ortalama kanal farkı (0-255)


def beyaza_otur(im: Image.Image) -> Image.Image:
    duz = Image.new("RGBA", im.size, (255, 255, 255, 255))
    duz.alpha_composite(im.convert("RGBA"))
    return duz.convert("RGB")


def fark(a: Image.Image, b: Image.Image) -> float:
    a = beyaza_otur(a).resize((KARSILASTIRMA, KARSILASTIRMA), Image.LANCZOS)
    b = beyaza_otur(b).resize((KARSILASTIRMA, KARSILASTIRMA), Image.LANCZOS)
    pa, pb = a.load(), b.load()
    toplam = 0
    for y in range(KARSILASTIRMA):
        for x in range(KARSILASTIRMA):
            r1, g1, b1 = pa[x, y]
            r2, g2, b2 = pb[x, y]
            toplam += abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)
    return toplam / (KARSILASTIRMA * KARSILASTIRMA * 3)


def daire_maskeli(im: Image.Image) -> Image.Image:
    """Yuvarlak simgeyi karşılaştırırken mağaza simgesine de aynı maske uygulanır."""
    m = Image.new("L", im.size, 0)
    ImageDraw.Draw(m).ellipse((0, 0, im.width - 1, im.height - 1), fill=255)
    out = Image.new("RGBA", im.size, (255, 255, 255, 255))
    out.paste(im.convert("RGBA"), (0, 0), m)
    return out


def main() -> int:
    if not os.path.exists(MAGAZA):
        print("Mağaza simgesi yok: " + MAGAZA)
        return 1
    magaza = Image.open(MAGAZA).convert("RGBA")
    print("Mağaza simgesi: %dx%d\n" % magaza.size)

    satirlar = []
    basarisiz = 0

    for k in YOGUNLUKLAR:
        d = os.path.join(RES, k)

        kare_yol = os.path.join(d, "ic_launcher.png")
        f = fark(magaza, Image.open(kare_yol))
        ok = f <= ESIK_ORT
        basarisiz += 0 if ok else 1
        satirlar.append((k, "ic_launcher", f, ok))

        yuv_yol = os.path.join(d, "ic_launcher_round.png")
        f2 = fark(daire_maskeli(magaza), Image.open(yuv_yol))
        ok2 = f2 <= ESIK_ORT
        basarisiz += 0 if ok2 else 1
        satirlar.append((k, "ic_launcher_round", f2, ok2))

    print("%-16s %-20s %8s  %s" % ("YOĞUNLUK", "DOSYA", "FARK", "SONUÇ"))
    print("-" * 56)
    for k, ad, f, ok in satirlar:
        print("%-16s %-20s %8.2f  %s" % (k, ad, f, "AYNI" if ok else "FARKLI"))

    # Adaptive ön plan ayrı kural: aynı olması beklenmez (güvenli alana küçültülür),
    # ama İÇERİĞİ aynı logo olmalı ve güvenli dairede kalmalı.
    print("\nAdaptive ön plan (küçültülmüş, saydam zemin — birebir aynılık beklenmez):")
    for k in YOGUNLUKLAR:
        p = os.path.join(RES, k, "ic_launcher_foreground.png")
        im = Image.open(p).convert("RGBA")
        bbox = im.getbbox()
        if not bbox:
            print("  %-16s İÇERİK YOK" % k)
            basarisiz += 1
            continue
        x0, y0, x1, y1 = bbox
        r = math.hypot((x1 - x0) / 2, (y1 - y0) / 2)
        guvenli = 0.3055 * im.width
        ok = r <= guvenli
        basarisiz += 0 if ok else 1
        print("  %-16s içerik %3dx%-3d · yarıçap %5.1f / güvenli %5.1f  %s"
              % (k, x1 - x0, y1 - y0, r, guvenli, "GÜVENLİ" if ok else "TAŞIYOR"))

    print("\n%s" % ("TÜM KONTROLLER GEÇTİ" if basarisiz == 0 else "%d KONTROL BAŞARISIZ" % basarisiz))
    return 0 if basarisiz == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
