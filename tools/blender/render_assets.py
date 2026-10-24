"""
Render the game's building and garden sprites with Blender (headless).

    blender -b --python tools/blender/render_assets.py -- <out_dir> [only_name ...]

Every model is built from simple boxes and prisms in code, so the whole set can be re-rendered
after a tweak. The camera matches the game's isometric grid exactly: one tile is 64 px wide and
32 px tall, and the footprint's ground centre lands in the middle of the image, so the game can
place a sprite by its centre. Background is transparent with a soft ground shadow.

Game axes -> Blender: game x -> +X, game y -> -Y, height -> +Z. The two faces toward the viewer are
the game's front-left (y = h edge, Blender -Y side) and front-right (x = w edge, +X side).
"""
import math
import sys

import bpy
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = ARGS[0] if ARGS else "/tmp/he_sprites"
ONLY = set(ARGS[1:])

PX_PER_UNIT = 64 / math.sqrt(2)  # one tile (1 unit) spans 64 px across
STOREY = 46 / (PX_PER_UNIT * math.sin(math.radians(60)))  # the game's storey height in units
SAMPLES = 48


def hex_rgb(h, f=1.0):
    return tuple(min(1.0, ((h >> s) & 255) / 255 * f) ** 2.2 for s in (16, 8, 0)) + (1.0,)


def mix(a, b, t):
    ch = lambda s: round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t)
    return (ch(16) << 16) | (ch(8) << 8) | ch(0)


_mats = {}


def mat(color, f=1.0, rough=0.7, emit=0.0):
    key = (color, round(f, 3), rough, emit)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(f"m{len(_mats)}")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = hex_rgb(color, f)
    b.inputs["Roughness"].default_value = rough
    if emit:
        b.inputs["Emission Color"].default_value = hex_rgb(color, f)
        b.inputs["Emission Strength"].default_value = emit
    _mats[key] = m
    return m


def box(x0, y0, z0, x1, y1, z1, m):
    """An axis-aligned box in game cells (x right, y down) and units of height."""
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.scale = (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0))
    o.location = ((x0 + x1) / 2, -(y0 + y1) / 2, (z0 + z1) / 2)
    o.data.materials.append(m)
    return o


def prism(x0, y0, x1, y1, z0, ridge, along_x, m):
    """A gable roof over the rectangle, ridge along x (or y), rising `ridge` above z0."""
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    if along_x:
        verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, ym, z0 + ridge), (x1, ym, z0 + ridge)]
        faces = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5), (0, 3, 2, 1)]
    else:
        verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (xm, y0, z0 + ridge), (xm, y1, z0 + ridge)]
        faces = [(1, 2, 5, 4), (3, 0, 4, 5), (0, 1, 4), (2, 3, 5), (0, 3, 2, 1)]
    verts = [(x, -y, z) for x, y, z in verts]
    me = bpy.data.meshes.new("roof")
    me.from_pydata(verts, [], faces)
    o = bpy.data.objects.new("roof", me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def pyramid(cx, cy, half, z0, h, m):
    verts = [(cx - half, cy - half, z0), (cx + half, cy - half, z0), (cx + half, cy + half, z0), (cx - half, cy + half, z0), (cx, cy, z0 + h)]
    faces = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)]
    me = bpy.data.meshes.new("pyr")
    me.from_pydata([(x, -y, z) for x, y, z in verts], [], faces)
    o = bpy.data.objects.new("pyr", me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def sphere(x, y, z, r, m):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, -y, z), segments=12, ring_count=8)
    o = bpy.context.object
    o.scale.z = 0.8
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def windows(w, h, floors, H, glass, frame, sill, flowers):
    """Windows on the two faces toward the viewer, one per tile per floor, with sills and flower boxes."""
    blooms = [mat(0xF08AA8), mat(0xFFD166), mat(0xF4F1EA)]
    leaf = mat(0x5F9E4E)
    for f in range(floors):
        z0 = 0.34 + f * STOREY * 0.78
        z1 = z0 + 0.42
        for i in range(w):  # front-left face, y = h
            box(i + 0.27, h - 0.01, z0 - 0.05, i + 0.73, h + 0.03, z1 + 0.05, frame)
            box(i + 0.31, h, z0, i + 0.69, h + 0.045, z1, glass)
            box(i + 0.49, h + 0.04, z0, i + 0.51, h + 0.05, z1, frame)
            box(i + 0.25, h, z0 - 0.08, i + 0.75, h + 0.09, z0 - 0.04, sill)
            if flowers and f == 0 and i % 2 == 0:
                box(i + 0.3, h + 0.02, z0 - 0.16, i + 0.7, h + 0.12, z0 - 0.08, mat(0x8A5A3C))
                for k in range(4):
                    sphere(i + 0.34 + k * 0.1, h + 0.08, z0 - 0.06, 0.045, blooms[k % 3] if k % 2 else leaf)
        for j in range(h):  # front-right face, x = w
            box(w - 0.01, j + 0.27, z0 - 0.05, w + 0.03, j + 0.73, z1 + 0.05, frame)
            box(w, j + 0.31, z0, w + 0.045, j + 0.69, z1, glass)
            box(w + 0.04, j + 0.49, z0, w + 0.05, j + 0.51, z1, frame)
            box(w, j + 0.25, z0 - 0.08, w + 0.09, j + 0.75, z0 - 0.04, sill)


def shrubs(w, h):
    """Low shrubs along the base of the front-left face, and a pair at the far corner."""
    greens = [mat(0x4F8A45), mat(0x5F9E4E), mat(0x6FB05A)]
    for i in range(w):
        if i % 2:
            continue
        for k, dx in enumerate((-0.12, 0.05, 0.2)):
            sphere(i + 0.5 + dx, h + 0.22, 0.12 + 0.03 * (k % 2), 0.13 + 0.03 * (k % 2), greens[(i + k) % 3])
    sphere(w + 0.22, h + 0.2, 0.14, 0.16, greens[1])


def building(kind, w, h, accent):
    cream = mix(0xF3E8D2, accent, 0.2)
    wall = mat(cream, 1.0, 0.85)
    glass = mat(0x7FA9B8, 1.0, 0.15)
    frame = mat(0xFBF8F2)
    pitched = kind in ("ward", "villa", "staff_room", "dining_room")
    floors = 2 if kind == "ward" and w * h >= 20 else 1
    H = STOREY * (1.75 if floors == 2 else 1)
    box(-0.04, -0.04, 0, w + 0.04, h + 0.04, 0.08, mat(cream, 0.7))  # plinth
    box(0, 0, 0.08, w, h, H, wall)
    box(-0.02, -0.02, H - 0.12, w + 0.02, h + 0.02, H, mat(accent))  # band under the roof
    if floors == 2:
        box(-0.02, -0.02, STOREY * 0.9 - 0.05, w + 0.02, h + 0.02, STOREY * 0.9, mat(cream, 0.85))
    windows(w, h, floors, H, glass, frame, mat(cream, 0.72), kind != "nursing_station")
    shrubs(w, h)
    if pitched:
        roof_c = {"villa": 0x9C5A3C, "ward": 0xC0634A}.get(kind, mix(accent, 0x000000, 0.1))
        over = 0.18
        along_x = w >= h
        ridge = 0.45 + min(w, h) * 0.17
        prism(-over, -over, w + over, h + over, H, ridge, along_x, mat(roof_c, 1.0, 0.55))
        # a darker ridge cap and white fascia boards along the eaves
        if along_x:
            box(-over, h / 2 - 0.05, H + ridge - 0.02, w + over, h / 2 + 0.05, H + ridge + 0.06, mat(roof_c, 0.7))
            box(-over, h + over - 0.02, H - 0.08, w + over, h + over + 0.02, H, frame)
        else:
            box(w / 2 - 0.05, -over, H + ridge - 0.02, w / 2 + 0.05, h + over, H + ridge + 0.06, mat(roof_c, 0.7))
            box(w + over - 0.02, -over, H - 0.08, w + over + 0.02, h + over, H, frame)
        if kind == "villa":
            box(w * 0.3, h * 0.25, H, w * 0.3 + 0.3, h * 0.25 + 0.3, H + 0.75, mat(0x9C6A52))
            # a little porch roof over the front-left face
            prism(w * 0.3, h, w * 0.7, h + 0.45, STOREY * 0.62, 0.22, True, mat(roof_c, 1.05, 0.55))
            for px in (w * 0.32, w * 0.68):
                box(px - 0.03, h + 0.38, 0.08, px + 0.03, h + 0.44, STOREY * 0.62, frame)
    else:
        box(-0.03, -0.03, H, w + 0.03, h + 0.03, H + 0.1, mat(cream, 0.92))  # parapet
        box(0.08, 0.08, H, w - 0.08, h - 0.08, H + 0.06, mat(0xC9CDC6))  # roof deck
        units = max(1, min(3, (w * h) // 4))
        for k in range(units):
            cx = w * (0.5 if units == 1 else 0.28 + 0.44 * k / (units - 1))
            box(cx - 0.22, h * 0.35 - 0.22, H + 0.06, cx + 0.22, h * 0.35 + 0.22, H + 0.36, mat(0xE8E8E2))
        # a sign band in the room colour across the front-left face
        box(w * 0.18, h, H - 0.42, w * 0.82, h + 0.05, H - 0.2, mat(accent, 1.0, 0.4))


def thai_house():
    """A Thai house on stilts (ruean thai): teak walls, a steep gable roof with crossed finials."""
    teak = mat(0x8A5A34)
    dark = mat(0x5E3A20)
    roof = mat(0xA9472F, 1.0, 0.5)
    lift = 0.42
    x0, y0, x1, y1 = -0.1, 0.0, 1.05, 0.85
    for px in (x0 + 0.06, x1 - 0.06):
        for py in (y0 + 0.06, y1 - 0.06, (y0 + y1) / 2):
            box(px - 0.04, py - 0.04, 0, px + 0.04, py + 0.04, lift, dark)
    box(x0 - 0.12, y0 - 0.05, lift, x1 + 0.12, y1 + 0.22, lift + 0.07, mat(0xB98352))  # deck with a veranda
    box(x0, y0, lift + 0.07, x1, y1 - 0.05, lift + 0.95, teak)
    # panel lines on the visible faces
    for i in range(5):
        x = x0 + (x1 - x0) * (i + 0.5) / 5
        box(x - 0.012, y1 - 0.05, lift + 0.07, x + 0.012, y1 - 0.03, lift + 0.95, dark)
    box(x1, y0 + 0.3, lift + 0.3, x1 + 0.02, y0 + 0.55, lift + 0.75, mat(0x2B2018))  # window
    box(x0 + 0.35, y1 - 0.05, lift + 0.07, x0 + 0.6, y1 - 0.02, lift + 0.8, mat(0x2B2018))  # door
    # railings on the veranda
    box(x0 - 0.12, y1 + 0.2, lift + 0.07, x1 + 0.12, y1 + 0.22, lift + 0.32, dark)
    # steps down from the veranda
    for k in range(3):
        box(x0 + 0.62, y1 + 0.22 + k * 0.1, lift - (k + 1) * 0.14, x0 + 0.85, y1 + 0.32 + k * 0.1, lift - k * 0.14, mat(0xB98352))
    # potted plants on the veranda
    for px in (x0, x1):
        sphere(px, y1 + 0.12, lift + 0.2, 0.09, mat(0x5F9E4E))
    # the steep roof, flaring past the walls, and the crossed gable finials (kalae)
    prism(x0 - 0.2, y0 - 0.18, x1 + 0.2, y1 + 0.18, lift + 0.95, 0.85, False, roof)
    top = lift + 0.95 + 0.85
    xm = (x0 + x1) / 2
    for y in (y0 - 0.18, y1 + 0.18):
        for s in (-1, 1):
            bpy.ops.mesh.primitive_cube_add(size=1)
            o = bpy.context.object
            o.scale = (0.05, 0.05, 0.42)
            o.location = (xm + s * 0.07, -y, top + 0.1)
            o.rotation_euler = (0, s * math.radians(30), 0)
            o.data.materials.append(mat(0x7A4F2E))


def sala():
    """An open Thai pavilion (sala): a raised teak deck, four columns, a two-tier red roof."""
    gold = mat(0xE0B23C, 1.0, 0.35)
    lift = 0.3
    box(0.08, 0.08, 0, 0.92, 0.92, lift, mat(0xD9D2BF))  # stone base
    box(0.04, 0.04, lift, 0.96, 0.96, lift + 0.06, mat(0xB98352))
    for px in (0.14, 0.86):
        for py in (0.14, 0.86):
            box(px - 0.035, py - 0.035, lift + 0.06, px + 0.035, py + 0.035, lift + 1.0, mat(0xF3E7CF))
    z = lift + 1.0
    pyramid(0.5, 0.5, 0.66, z, 0.42, mat(0xB8452F, 1.0, 0.5))
    pyramid(0.5, 0.5, 0.42, z + 0.3, 0.6, mat(0xC9573A, 1.0, 0.5))
    box(0.47, 0.47, z + 0.85, 0.53, 0.53, z + 1.15, gold)
    for px, py in ((-0.16, -0.16), (1.16, -0.16), (1.16, 1.16), (-0.16, 1.16)):
        box(px - 0.04, py - 0.04, z - 0.02, px + 0.04, py + 0.04, z + 0.16, gold)


def setup(w, h, res):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()  # the reset removed them
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = SAMPLES
    s.cycles.use_denoising = True
    s.render.film_transparent = True
    s.render.resolution_x = s.render.resolution_y = res
    s.view_settings.view_transform = "Standard"
    # camera: orthographic, 30 degrees above the ground, looking along the game's grid diagonal
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    s.collection.objects.link(cam)
    s.camera = cam
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = res / PX_PER_UNIT
    target = Vector((w / 2, -h / 2, 0))
    d = Vector((1, -1, 0)).normalized() * math.cos(math.radians(30)) + Vector((0, 0, math.sin(math.radians(30))))
    cam.location = target + d * 40
    cam.rotation_euler = (math.radians(60), 0, math.radians(45))
    cam.data.clip_end = 200
    # light: a warm sun from the upper left (as the game's drawn shadows fall to the front-right) and a soft sky
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    s.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.angle = math.radians(8)
    sun.data.color = (1.0, 0.96, 0.88)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-20))
    world = bpy.data.worlds.new("w")
    s.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.87, 1.0, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    # a shadow catcher under everything
    bpy.ops.mesh.primitive_plane_add(size=60, location=(w / 2, -h / 2, 0))
    bpy.context.object.is_shadow_catcher = True


def render(name, w, h, build, res=None):
    if ONLY and name not in ONLY:
        return
    res = res or int(32 * (w + h) + 220)
    setup(w, h, res)
    build()
    bpy.context.scene.render.filepath = f"{OUT}/{name}.png"
    bpy.ops.render.render(write_still=True)
    print("rendered", name, res)


ACCENT = {
    "ward": 0x4F8A80, "nursing_station": 0x4A6AA5, "therapy": 0x6B8F4E, "staff_room": 0xA77B4F, "villa": 0xB08850,
    "homecare_office": 0x3F7F9A, "training_room": 0x2F7D8C, "neuro_clinic": 0x3B5BA5, "stroke_unit": 0x7A4FA0,
    "pharmacy": 0x2A7F7F, "dining_room": 0xC9771F, "laundry_room": 0x5F6B78, "reception": 0x4B4FC4,
    "storage_room": 0x8A6A45, "bathroom": 0x3F8FAE, "accounting_office": 0x3C6E47,
}
# The prefab footprints (data/prefabs.ts); a building turned the other way uses the mirror image.
SIZES = [
    ("ward", 4, 5), ("ward", 5, 6), ("nursing_station", 3, 3), ("therapy", 3, 3), ("staff_room", 2, 3), ("villa", 3, 3),
    ("homecare_office", 4, 3), ("training_room", 2, 3), ("neuro_clinic", 4, 3), ("stroke_unit", 4, 3), ("pharmacy", 2, 2),
    ("dining_room", 3, 3), ("laundry_room", 2, 2), ("reception", 3, 2), ("storage_room", 2, 2), ("bathroom", 2, 2),
    ("accounting_office", 2, 2), ("staff_room", 2, 2),
]

for kind, w, h in SIZES:
    render(f"b_{kind}_{w}x{h}", w, h, lambda kind=kind, w=w, h=h: building(kind, w, h, ACCENT[kind]))
render("dc_thai_house", 1, 1, thai_house, res=260)
render("dc_sala3d", 1, 1, sala, res=220)
