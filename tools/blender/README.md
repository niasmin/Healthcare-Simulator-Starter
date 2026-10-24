# Blender sprites

The 3D-looking buildings and some garden pieces are modelled in code and rendered with Blender, so
they can be re-rendered after a tweak.

```sh
# Blender 4.2 LTS (headless is enough)
curl -LO https://download.blender.org/release/Blender4.2/blender-4.2.23-linux-x64.tar.xz
tar -xf blender-4.2.23-linux-x64.tar.xz

# render everything (or name some sprites after the folder), then crop, convert and record anchors
blender -b --python tools/blender/render_assets.py -- /tmp/renders [b_ward_4x5 dc_sala3d ...]
python3 tools/blender/pack_sprites.py /tmp/renders src/assets/sprites src/assets/sprite_anchors.json
```

- The camera matches the game grid: a tile is 64×32 px, and each image's footprint ground centre
  is recorded in `src/assets/sprite_anchors.json`; the renderer places sprites by that point.
- Buildings are `b_<type>_<w>x<h>` for the prefab footprints; the same building turned the other
  way uses the mirror image. Other sizes (and homes with the solar roof) keep the drawn building.
- Doors, scaffolding during works, labels and night lights are drawn over the sprite by the game.
