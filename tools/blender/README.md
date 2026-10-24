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

## Equipment and people

```sh
# 26 pieces of equipment and 18 people, two views each, at twice the pixel density
blender -b --python tools/blender/render_props.py -- /tmp/props [eq3_care_bed ch3_nurse ...]
python3 tools/blender/pack_sprites.py /tmp/props src/assets/sprites src/assets/sprite_anchors.json 2
```

- Each model stands in one tile with its front toward game south. `_s` is that view and `_n` the
  model turned round; the game mirrors them for east and west.
- Where each piece stands and which way it faces comes from `src/domain/rules/layout.ts`: beds
  with the headboard to a wall, desks by the door, cabinets on the back walls, a clear aisle from
  the door to everything. Bedside kit (call bell, monitor, pump, suction) stands at a bed's head.
- People are rendered without a ground shadow (the game draws one that moves with them). Walking
  figures show the front view going down the screen and the back view going up.
