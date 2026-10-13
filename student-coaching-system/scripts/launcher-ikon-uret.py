# -*- coding: utf-8 -*-
"""
Android launcher simgelerini Play Store simgesinden üretir.

NEDEN: Google Play, uygulamayı Misleading Claims kapsamında reddetti —
cihazdaki launcher simgesi Capacitor'ın varsayılan şablonuydu, mağazadaki
hi-res simge ise kurumsal logoydu. Bu betik cihaz simgelerini DOĞRUDAN
mağaza simgesinden üretir, böylece ikisi bir daha ayrışamaz.

Kaynak: brand/play-store-icon-512.png  (Play Console'daki simgenin kendisi)

ÜÇ VARYANT, ÜÇ FARKLI KURAL
  ic_launcher.png            Mağaza simgesinin birebir ölçeklenmişi.
                             Kırpma yok, çerçeveleme aynı.
  ic_launcher_round.png      Aynı görüntü + dairesel maske. Ölçüldü:
                             içeriğin köşegen yarıçapı 232px, tuval
                             yarıçapı 256px — daireye sığıyor, kesilmiyor.
  ic_launcher_foreground.png Adaptive ön plan. Android dış %25'i maskeleyebilir;
                             güvenli daire yarıçapı 156px. İçerik 232px
                             olduğu için 0.66 ile küçültülür, yoksa
                             yuvarlak/squircle cihazlarda logonun kenarları
                             kesilir. Zemin AYRI katman olduğundan saydam.

Kullanım:
    python scripts/launcher-ikon-uret.py
    python scripts/launcher-ikon-uret.py --zemin "#FFFFFF"
"""

from __future__ import annotations

import math
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:  # pragma: no cover
    print("Pillow gerekli:  python -m pip install --user Pillow")
    raise SystemExit(1)

BURASI = os.path.dirname(os.path.abspath(__file__))
PROJE = os.path.join(BURASI, "..")
KAYNAK = os.path.join(PROJE, "brand", "play-store-icon-512.png")
RES = os.path.join(PROJE, "android", "app", "src", "main", "res")

# (klasör, legacy boyut, adaptive ön plan boyutu)
YOGUNLUKLAR = [
    ("mipmap-mdpi", 48, 108),
    ("mipmap-hdpi", 72, 162),
    ("mipmap-xhdpi", 96, 216),
    ("mipmap-xxhdpi", 144, 324),
    ("mipmap-xxxhdpi", 192, 432),
]

# Adaptive güvenli daire: 108dp tuvalde 66dp çap
ADAPTIVE_GUVENLI_ORAN = 0.3055
# Ölçülen değerin biraz altında kalarak pay bırakıyoruz
ADAPTIVE_PAY = 0.98


def hex_rgb(h: str):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def icerik_bbox(im: Image.Image):
    """Beyaz olmayan alanın sınırı."""
    gri = im.convert("L")
    maske = gri.point(lambda p: 255 if p < 245 else 0)
    return maske.getbbox()


def yuvarlakla(img: Image.Image) -> Image.Image:
    maske = Image.new("L", img.size, 0)
    ImageDraw.Draw(maske).ellipse((0, 0, img.width - 1, img.height - 1), fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), maske)
    return out


def main() -> int:
    zemin_hex = "#FFFFFF"
    if "--zemin" in sys.argv:
        zemin_hex = sys.argv[sys.argv.index("--zemin") + 1]
    zemin = hex_rgb(zemin_hex)

    if not os.path.exists(KAYNAK):
        print("Kaynak bulunamadı: " + KAYNAK)
        print("Play Console'daki 512x512 simgeyi buraya koyun.")
        return 1

    kaynak = Image.open(KAYNAK).convert("RGBA")
    if kaynak.size != (512, 512):
        kaynak = kaynak.resize((512, 512), Image.LANCZOS)
    # Saydam kaynak gelirse beyaz zemine otur
    duz = Image.new("RGBA", (512, 512), zemin + (255,))
    duz.alpha_composite(kaynak)
    kaynak = duz

    bbox = icerik_bbox(kaynak)
    if not bbox:
        print("Kaynakta içerik bulunamadı (tamamı beyaz?)")
        return 1
    x0, y0, x1, y1 = bbox
    icerik = kaynak.crop(bbox)
    r = math.hypot((x1 - x0) / 2, (y1 - y0) / 2)
    print("Kaynak 512x512 · içerik %dx%d · köşegen yarıçap %.0f px" % (x1 - x0, y1 - y0, r))

    guvenli_r = ADAPTIVE_GUVENLI_ORAN * 512
    olcek = min(1.0, (guvenli_r * ADAPTIVE_PAY) / r)
    print("Adaptive güvenli yarıçap %.0f px · uygulanan ölçek %.3f" % (guvenli_r, olcek))

    uretilen = []
    for klasor, legacy, fg in YOGUNLUKLAR:
        d = os.path.join(RES, klasor)
        os.makedirs(d, exist_ok=True)

        # 1) Kare: mağaza simgesinin birebir küçültülmüşü
        kare = kaynak.resize((legacy, legacy), Image.LANCZOS).convert("RGBA")
        p = os.path.join(d, "ic_launcher.png")
        kare.convert("RGB").save(p)
        uretilen.append(p)

        # 2) Yuvarlak: aynı görüntü, dairesel maske
        p = os.path.join(d, "ic_launcher_round.png")
        yuvarlakla(kare).save(p)
        uretilen.append(p)

        # 3) Adaptive ön plan: içerik güvenli alana küçültülür, zemin saydam
        hedef_w = max(1, int(round(icerik.width * (fg / 512.0) * olcek)))
        hedef_h = max(1, int(round(icerik.height * (fg / 512.0) * olcek)))
        kucuk = icerik.resize((hedef_w, hedef_h), Image.LANCZOS)
        # Beyaz zemini saydama çevir ki adaptive zemin katmanı görünsün
        kucuk = kucuk.convert("RGBA")
        px = kucuk.load()
        for yy in range(kucuk.height):
            for xx in range(kucuk.width):
                rr, gg, bb, aa = px[xx, yy]
                if rr > 243 and gg > 243 and bb > 243:
                    px[xx, yy] = (rr, gg, bb, 0)
        tuval = Image.new("RGBA", (fg, fg), (0, 0, 0, 0))
        tuval.paste(kucuk, ((fg - hedef_w) // 2, (fg - hedef_h) // 2), kucuk)
        p = os.path.join(d, "ic_launcher_foreground.png")
        tuval.save(p)
        uretilen.append(p)

        print("  %-16s kare/yuvarlak %3dpx · ön plan %3dpx (içerik %dx%d)"
              % (klasor, legacy, fg, hedef_w, hedef_h))

    # Adaptive zemin rengi — mağaza simgesinin zemini ile aynı
    renk_yol = os.path.join(RES, "values", "ic_launcher_background.xml")
    with open(renk_yol, "w", encoding="utf-8", newline="\n") as f:
        f.write(
            '<?xml version="1.0" encoding="utf-8"?>\n'
            "<resources>\n"
            '    <color name="ic_launcher_background">%s</color>\n'
            "</resources>\n" % zemin_hex.upper()
        )
    print("  values/ic_launcher_background.xml -> %s" % zemin_hex.upper())
    print("\n%d simge dosyası üretildi." % len(uretilen))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
