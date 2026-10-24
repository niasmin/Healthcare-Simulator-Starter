"""Crop rendered PNGs to their content, save as WebP and write the anchor of each (the footprint's
ground centre, which the renderer put in the middle of the full image).

    python3 tools/blender/pack_sprites.py <render_dir> <out_dir> <manifest.json> [density]

Pass the density the renders were made at (2 for render_props.py); it is stored as a third value
so the game draws them at world size.
"""
import json
import sys
from pathlib import Path

from PIL import Image

src, out, manifest = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
density = float(sys.argv[4]) if len(sys.argv) > 4 else 1
out.mkdir(parents=True, exist_ok=True)
anchors = json.loads(manifest.read_text()) if manifest.exists() else {}
for f in sorted(src.glob("*.png")):
    if f.name == "sheet.png":
        continue
    im = Image.open(f).convert("RGBA")
    # The shadow catcher leaves a faint haze over the whole frame: clear it, keep the real shadow.
    a = im.getchannel("A").point(lambda v: 0 if v < 14 else v)
    im.putalpha(a)
    alpha = a.point(lambda v: 255 if v > 24 else 0)
    x0, y0, x1, y1 = alpha.getbbox()
    pad = 2
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    im.crop((x0, y0, x1, y1)).save(out / f"{f.stem}.webp", "WEBP", quality=88, method=6)
    anchors[f.stem] = [im.width / 2 - x0, im.height / 2 - y0] + ([density] if density != 1 else [])
manifest.write_text(json.dumps(anchors, indent=1, sort_keys=True) + "\n")
print(len(anchors), "sprites")
