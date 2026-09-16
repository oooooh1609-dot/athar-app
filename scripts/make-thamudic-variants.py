"""Renders training images for the 27 Thamudic reference glyphs.

Two groups are produced from each supplied chart glyph:

  clean     - geometric variants only (scale, slight rotation, stroke weight)
  degraded  - photographic conditions found on real rock inscriptions:
              raking light, a hard cast shadow, surrounding rock texture,
              hairline cracks crossing the sign, blur + sensor noise and
              surface wear that eats part of a stroke.

Output: raw RGBA buffers plus a manifest, consumed by
scripts/train-thamudic.ts, which extracts features with the application's own
segmentation pipeline. No new letters are invented: every image comes from one
of the 27 glyph images in the supplied alphabet pack (AD.pdf chart).
"""

import json
import base64
import io
import os
import random

from PIL import Image, ImageDraw, ImageFilter, ImageOps

OUT = "/tmp/thamudic-variants"
SIZE = 150
PAD = 190

random.seed(7)


def load_glyphs():
    pack = json.load(open("src/lib/alphabet-pack.json"))
    out = []
    for letter in pack["letters"]:
        if not letter["id"].startswith("thamudic"):
            continue
        uri = letter.get("glyph_image_data_uri")
        if not uri:
            continue
        raw = base64.b64decode(uri.split(",", 1)[1])
        img = Image.open(io.BytesIO(raw)).convert("RGBA")
        out.append((letter["id"], letter.get("arabic_display"), img))
    return out


def stamp(glyph, scale=1.0, rotate=0.0, weight=0):
    """Returns an L mask of the glyph: 255 where ink is."""
    a = glyph.split()[3]
    rgb = glyph.convert("L")
    # ink = opaque and dark, or opaque at all when the source is a flat shape
    mask = Image.eval(a, lambda v: 255 if v > 40 else 0)
    dark = Image.eval(rgb, lambda v: 255 if v < 200 else 0)
    mask = ImageOps.invert(ImageOps.invert(mask).point(lambda v: v))
    mask = Image.composite(dark, Image.new("L", mask.size, 0), mask)
    if mask.getbbox() is None:
        mask = Image.eval(a, lambda v: 255 if v > 40 else 0)
    mask = mask.crop(mask.getbbox())
    side = int(SIZE * scale)
    mask = mask.resize((side, side), Image.LANCZOS)
    if weight > 0:
        mask = mask.filter(ImageFilter.MaxFilter(2 * weight + 1))
    elif weight < 0:
        mask = mask.filter(ImageFilter.MinFilter(2 * -weight + 1))
    if rotate:
        mask = mask.rotate(rotate, resample=Image.BICUBIC, expand=True, fillcolor=0)
    return mask


def canvas(mask, bg=228, ink=52):
    w = mask.width + 2 * PAD
    h = mask.height + 2 * PAD
    base = Image.new("L", (w, h), bg)
    base.paste(Image.new("L", mask.size, ink), (PAD, PAD), mask)
    return base


def _mul(a, b):
    """Multiplies two L images, keeping mid-tones readable."""
    return Image.frombytes(
        "L", a.size, bytes(min(255, (p * q) // 190) for p, q in zip(a.tobytes(), b.tobytes()))
    )


def raking_light(img):
    w, h = img.size
    grad = Image.linear_gradient("L").resize((w, h)).rotate(20, resample=Image.BICUBIC)
    grad = grad.point(lambda v: 60 + v // 2)
    return _mul(img, grad)


def cast_shadow(img):
    w, h = img.size
    band = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(band)
    d.polygon([(0, int(h * 0.45)), (w, int(h * 0.2)), (w, h), (0, h)], fill=95)
    band = band.filter(ImageFilter.GaussianBlur(6))
    return _mul(img, band)


def rock_texture(img):
    w, h = img.size
    noise = Image.frombytes("L", (w, h), bytes(random.randint(150, 255) for _ in range(w * h)))
    noise = noise.filter(ImageFilter.GaussianBlur(1.6))
    return _mul(img, noise.point(lambda v: 150 + v // 3))


def cracks(img):
    w, h = img.size
    out = img.copy()
    d = ImageDraw.Draw(out)
    for _ in range(2):
        y = random.randint(int(h * 0.2), int(h * 0.8))
        d.line([(0, y), (w, y + random.randint(-14, 14))], fill=70, width=random.choice([2, 3]))
    x = random.randint(int(w * 0.2), int(w * 0.8))
    d.line([(x, 0), (x + random.randint(-20, 20), h)], fill=80, width=2)
    return out.filter(ImageFilter.GaussianBlur(0.6))


def blur_noise(img):
    out = img.filter(ImageFilter.GaussianBlur(1.8))
    w, h = out.size
    noise = Image.frombytes("L", (w, h), bytes(random.randint(0, 40) for _ in range(w * h)))
    return Image.frombytes(
        "L", (w, h), bytes(max(0, min(255, p - 20 + q)) for p, q in zip(out.tobytes(), noise.tobytes()))
    )


def low_contrast(img):
    return img.point(lambda v: 150 + (v - 150) // 3)


def wear(img, mask):
    """Erases part of a stroke, as weathering does."""
    out = img.copy()
    d = ImageDraw.Draw(out)
    w, h = out.size
    cx = random.randint(PAD, PAD + mask.width)
    cy = random.randint(PAD, PAD + mask.height)
    r = max(8, mask.width // 7)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=224)
    return out.filter(ImageFilter.GaussianBlur(1.0))


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        os.remove(os.path.join(OUT, f))
    manifest = []
    for gid, label, glyph in load_glyphs():
        clean_specs = [
            ("base", 1.0, 0, 0),
            ("small", 0.78, 0, 0),
            ("large", 1.18, 0, 0),
            ("rot_cw", 1.0, -6, 0),
            ("rot_ccw", 1.0, 6, 0),
            ("thick", 1.0, 0, 1),
            ("thin", 1.0, 0, -1),
        ]
        for name, scale, rot, weight in clean_specs:
            mask = stamp(glyph, scale, rot, weight)
            img = canvas(mask)
            write(manifest, gid, label, "clean", name, img)

        base = stamp(glyph)
        degraded = [
            ("raking_light", lambda i, m=base: raking_light(canvas(m))),
            ("cast_shadow", lambda i, m=base: cast_shadow(canvas(m))),
            ("rock_texture", lambda i, m=base: rock_texture(canvas(m))),
            ("cracks", lambda i, m=base: cracks(canvas(m))),
            ("blur_noise", lambda i, m=base: blur_noise(canvas(m))),
            ("low_contrast", lambda i, m=base: low_contrast(canvas(m))),
            ("wear", lambda i, m=base: wear(canvas(m), m)),
            (
                "shadow_cracks",
                lambda i, m=base: cracks(cast_shadow(canvas(stamp(glyph, 1.0, -4, 0)))),
            ),
        ]
        for name, fn in degraded:
            write(manifest, gid, label, "degraded", name, fn(None))

    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), ensure_ascii=False)
    print(f"wrote {len(manifest)} images for {len(set(m['id'] for m in manifest))} glyphs")


def write(manifest, gid, label, group, name, img):
    rgba = img.convert("RGBA")
    fname = f"{gid}__{group}__{name}.bin"
    open(os.path.join(OUT, fname), "wb").write(rgba.tobytes())
    manifest.append(
        {
            "id": gid,
            "label": label,
            "group": group,
            "variant": name,
            "file": fname,
            "width": rgba.width,
            "height": rgba.height,
        }
    )


if __name__ == "__main__":
    main()
