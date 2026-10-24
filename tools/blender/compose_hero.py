"""Lay out the title screen art from render_hero.py's layers.

    python3 tools/blender/compose_hero.py <render_dir> <out_dir>

hero_portrait.jpg (phones): the scene with the 3D logo near the top and the cast in the lower
middle, above where the buttons sit. hero.jpg (wider screens): the scene with the cast on the
left; the page draws the logo over the top-left corner. Also writes logo3d.webp for the page.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter

src, out = Path(sys.argv[1]), Path(sys.argv[2])


def crop_alpha(im, floor=10):
    a = im.getchannel("A").point(lambda v: 0 if v < floor else v)
    im.putalpha(a)
    return im.crop(a.point(lambda v: 255 if v > 20 else 0).getbbox())


def fit(im, width):
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def shadowed(layer, blur=14, alpha=0.35):
    """A soft drop shadow behind a cut-out layer, so it sits on the busy scene."""
    pad = blur * 3
    base = Image.new("RGBA", (layer.width + pad * 2, layer.height + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", layer.size, (10, 30, 20, 0))
    sh.putalpha(layer.getchannel("A").point(lambda v: int(v * alpha)))
    base.alpha_composite(sh, (pad, pad + blur // 2))
    base = base.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(layer, (pad, pad))
    return base, pad


def outlined(im, width, colour):
    """A solid outline round a cut-out (the classic game-logo edge)."""
    a = im.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    grown = a.filter(ImageFilter.MaxFilter(width * 2 + 1)).filter(ImageFilter.GaussianBlur(1.2))
    base = Image.new("RGBA", im.size, colour + (0,))
    base.putalpha(grown)
    base.alpha_composite(im)
    return base


raw = Image.open(src / "logo.png").convert("RGBA")
pad = 40
big = Image.new("RGBA", (raw.width + pad * 2, raw.height + pad * 2), (0, 0, 0, 0))
big.alpha_composite(raw, (pad, pad))
k = max(1, raw.width // 400)  # outline widths scale with the render size
logo = crop_alpha(outlined(outlined(big, 2 * k, (255, 255, 255)), 4 * k, (20, 52, 92)))
# The shadow catcher leaves a faint haze round the cast; keep only the figures and their contact shadows.
cast = crop_alpha(Image.open(src / "cast.png").convert("RGBA"), 60)

# phones
bg = Image.open(src / "bg_portrait.png").convert("RGBA").resize((1080, 1920), Image.LANCZOS)
# Narrow phones crop the sides and the page puts menu buttons down both edges, so the logo stays
# in the middle 55%; the cast stands just above where the big buttons start (about 68% down).
lg, pad = shadowed(fit(logo, 600))
bg.alpha_composite(lg, ((1080 - lg.width) // 2, 215 - pad))
cs, pad = shadowed(fit(cast, 880), 18, 0.45)
bg.alpha_composite(cs, ((1080 - cs.width) // 2, 1300 - cs.height + pad))
bg.convert("RGB").save(out / "hero_portrait.jpg", quality=84, optimize=True, progressive=True)

# wider screens
bg = Image.open(src / "bg_wide.png").convert("RGBA").resize((2400, 1000), Image.LANCZOS)
# The page covers the screen from the top-left, with menu buttons down the left edge.
cs, pad = shadowed(fit(cast, 720), 18, 0.45)
bg.alpha_composite(cs, (150 - pad, 640 - cs.height + pad))
bg.convert("RGB").save(out / "hero.jpg", quality=84, optimize=True, progressive=True)

fit(logo, 900).save(out / "logo3d.webp", "WEBP", quality=90, method=6)
print("composed")
