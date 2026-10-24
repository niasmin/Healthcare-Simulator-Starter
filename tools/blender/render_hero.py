"""
Render the title screen art with Blender (headless): the campus from the air in the evening sun
with the town and the mountains behind it, the cast of characters in front, and the 3D logo.

    blender -b --python tools/blender/render_hero.py -- <out_dir> <font.ttf> [scale] [only ...]

Writes bg_portrait.png, bg_wide.png (the scene), cast.png (the characters, transparent) and
logo.png (transparent); tools/blender/compose_hero.py lays them out into the two title images.
`scale` (default 1) shrinks the renders for a quick look. The font is Fredoka Bold (SIL OFL),
e.g. from the @fontsource/fredoka package converted to .ttf.
"""
import math
import os
import random
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_assets as ra  # noqa: E402
import render_props as rp  # noqa: E402
import render_town as rt  # noqa: E402
from render_assets import box, mat, sphere  # noqa: E402
from render_props import blob, cyl, rbox, rod  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1 :]
OUT, FONT = ARGS[0], ARGS[1]
SCALE = float(ARGS[2]) if len(ARGS) > 2 else 1.0
ONLY = set(ARGS[3:])
os.makedirs(OUT, exist_ok=True)


# ---------------------------------------------------------------- helpers


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ra._mats.clear()
    _proto.clear()
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.use_denoising = True
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast"
    return s


def place(build, x, y, z=0.0, rot=0.0, s=1.0):
    """Run `build` (which models around the origin in game cells) and move what it made to game (x, y)."""
    before = set(bpy.context.scene.objects)
    build()
    bpy.context.view_layer.update()
    m = Matrix.Translation((x, -y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Scale(s, 4)
    for o in set(bpy.context.scene.objects) - before:
        if o.type == "MESH" or o.type == "FONT":
            o.matrix_world = m @ o.matrix_world


_proto = {}


def instance(key, build, x, y, z=0.0, rot=0.0, s=1.0):
    """Like place(), but builds each `key` once, merges it into one mesh and reuses that mesh for
    every copy: thousands of houses and trees stay quick to set up and to render."""
    mesh = _proto.get(key)
    if mesh is None:
        before = set(bpy.context.scene.objects)
        build()
        new = [o for o in set(bpy.context.scene.objects) - before if o.type in ("MESH", "FONT")]
        bpy.ops.object.select_all(action="DESELECT")
        for o in new:
            o.select_set(True)
        bpy.context.view_layer.objects.active = new[0]
        bpy.ops.object.convert(target="MESH")
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        mesh = o.data
        bpy.data.objects.remove(o)
        _proto[key] = mesh
    o = bpy.data.objects.new(key, mesh)
    bpy.context.collection.objects.link(o)
    o.matrix_world = Matrix.Translation((x, -y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Scale(s, 4)


def ground_mat(c1, c2, scale=0.08):
    """Grass with a soft patchy variation."""
    m = bpy.data.materials.new("grass")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.9
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = ra.hex_rgb(c1)
    ramp.color_ramp.elements[1].color = ra.hex_rgb(c2)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def water_mat():
    m = bpy.data.materials.new("water")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = ra.hex_rgb(0x3E8FB5)
    b.inputs["Roughness"].default_value = 0.04
    b.inputs["Coat Weight"].default_value = 1.0
    return m


def sign(text, x, y, z, width, colour, icon=0xE5484D, face="y", size=0.34):
    """A white sign board with a coloured icon and the name in 3D letters, on a front face."""
    font = bpy.data.fonts.load(FONT, check_existing=True)
    h = size * 1.55

    def build():
        rbox(0, -0.06, 0, width, 0.0, h, mat(0xFBF8F2, 1.0, 0.4), 0.04)
        rbox(0.08, -0.08, 0.08, 0.08 + h - 0.16, -0.05, h - 0.08, mat(icon, 1.0, 0.4), 0.03)
        box(0.08 + (h - 0.16) / 2 - 0.035, -0.1, 0.16, 0.08 + (h - 0.16) / 2 + 0.035, -0.07, h - 0.16, mat(0xFFFFFF))
        box(0.16, -0.1, h / 2 - 0.035, h - 0.16, -0.07, h / 2 + 0.035, mat(0xFFFFFF))
        cu = bpy.data.curves.new("t", "FONT")
        cu.body = text
        cu.font = font
        cu.size = size
        cu.extrude = 0.02
        cu.align_y = "CENTER"
        o = bpy.data.objects.new("t", cu)
        bpy.context.collection.objects.link(o)
        o.data.materials.append(mat(colour, 1.0, 0.4))
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.location = (h + 0.04, 0.09, h / 2)
        bpy.context.view_layer.update()
        o.location.x = h + 0.04 + (width - h - 0.12 - o.dimensions.x) / 2

    place(build, x, y, z, 0 if face == "y" else math.pi / 2)


def tree(x, y, s=1.0, kind="green", rnd=None):
    variant = (rnd or random).randrange(3)
    r = random.Random(variant * 31 + len(kind))
    leaf = {"green": (0x4F8A45, 0x5F9E4E, 0x6FB05A), "dark": (0x3F7A3A, 0x4F8A45, 0x5A9248), "sakura": (0xF2A7C3, 0xF7C0D4, 0xE891B2), "gold": (0xD9B341, 0xE6C55A, 0x9DB54A)}[kind]

    def build():
        cyl(0, 0, 0, 0.9, 0.07, mat(0x6E4A2E), 8)
        for k in range(5):
            a = k * 2.4 + variant
            rr = 0.32 + r.random() * 0.18
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=rr, location=(math.cos(a) * 0.25, math.sin(a) * 0.25, 0.95 + (k % 3) * 0.22))
            o = bpy.context.object
            o.data.materials.append(mat(leaf[k % 3], 1.0, 0.8))
            bpy.ops.object.shade_smooth()

    instance(f"tree-{kind}-{variant}", build, x, y, s=s)


def palm(x, y, scale=1.0):
    s = 1.0

    def build():
        for k in range(6):
            z0, z1 = k * 0.3 * s, (k + 1) * 0.3 * s
            cyl(0.04 * k * s, 0, z0, z1, (0.06 - k * 0.004) * s, mat(0x8A6A48), 8)
        top = Vector((0.24 * s, 0, 1.8 * s))
        for k in range(7):
            a = k * 2 * math.pi / 7
            tip = top + Vector((math.cos(a) * 0.75 * s, math.sin(a) * 0.75 * s, -0.35 * s))
            bpy.ops.mesh.primitive_cone_add(radius1=0.14 * s, radius2=0.0, depth=(tip - top).length, vertices=4)
            o = bpy.context.object
            o.location = (top + tip) / 2
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference((tip - top).normalized())
            o.scale = (1, 0.25, 1)
            o.data.materials.append(mat(0x4F8A45, 1.0, 0.7))

    instance("palm", build, x, y, s=scale)


def hedge(x0, y0, x1, y1):
    rbox(x0, y0, 0, x1, y1, 0.35, mat(0x4F8A45, 1.0, 0.85), 0.12)


def flowers(x, y, n, rnd):
    cols = (0xF08AA8, 0xFFD166, 0xF4F1EA, 0xE5484D, 0xB58CF0)
    for k in range(n):
        sphere(x + rnd.uniform(-0.5, 0.5), y + rnd.uniform(-0.3, 0.3), 0.12, 0.07, mat(cols[k % len(cols)]))
    for k in range(3):
        sphere(x + (k - 1) * 0.35, y, 0.1, 0.16, mat(0x5F9E4E))


def fountain(x, y):
    def build():
        stone = mat(0xEDE6D6, 1.0, 0.5)
        cyl(0, 0, 0, 0.28, 1.4, stone, 40)
        cyl(0, 0, 0.2, 0.27, 1.28, water_mat(), 40)
        cyl(0, 0, 0.27, 1.0, 0.16, stone, 16)
        cyl(0, 0, 1.0, 1.1, 0.55, stone, 24)
        cyl(0, 0, 1.05, 1.1, 0.48, water_mat(), 24)
        cyl(0, 0, 1.1, 1.5, 0.07, stone, 12)
        jet = mat(0xDDF3FF, 1.0, 0.05, 0.4)
        sphere(0, 0, 1.6, 0.12, jet)
        for k in range(8):
            a = k * math.pi / 4
            rod((0, 0, 1.5), (math.cos(a) * 0.5, -math.sin(a) * 0.5, 1.15), 0.025, jet)

    place(build, x, y)


def pond(x0, y0, x1, y1, rnd):
    stone = mat(0xD9D2BF, 1.0, 0.6)
    box(x0 - 0.12, y0 - 0.12, 0, x1 + 0.12, y1 + 0.12, 0.08, stone)
    box(x0, y0, 0.0, x1, y1, 0.09, water_mat())
    for k in range(int((x1 - x0) * (y1 - y0) * 1.2)):
        px, py = rnd.uniform(x0 + 0.2, x1 - 0.2), rnd.uniform(y0 + 0.2, y1 - 0.2)
        cyl(px, py, 0.09, 0.1, 0.15, mat(0x4F8A45, 1.0, 0.6), 10)
        if k % 3 == 0:
            sphere(px, py, 0.15, 0.06, mat(0xF2A7C3))


def lamp(x, y):
    instance("lamp", rt.street_lamp, x - 0.5, y - 0.5)


def car(build, x, y, rot):
    place(build, x, y, rot=rot, s=1.3)




def mountains(rnd):
    """Faceted low-poly hills in two bands; the far band paler and bluer, as in the haze."""
    for band, (y0, cols, hmin, hmax) in enumerate(((-260, (0xB4C6D8, 0xBFD0E0, 0xAABED2), 34, 56), (-170, (0x86A8A4, 0x93B3AC, 0x7A9E98), 18, 30))):
        for k in range(14):
            x = -160 + k * 24 + rnd.uniform(-8, 8)
            y = y0 - rnd.uniform(0, 30)
            hgt = rnd.uniform(hmin, hmax)
            bpy.ops.mesh.primitive_cone_add(vertices=7, radius1=1, radius2=0.12, depth=1, location=(x, -y, hgt / 2 - 2))
            o = bpy.context.object
            o.scale = (rnd.uniform(28, 44), rnd.uniform(18, 28), hgt)
            o.rotation_euler.z = rnd.uniform(0, 6.28)
            o.data.materials.append(mat(cols[k % 3], 1.0, 0.95))
    # a golden chedi on the highest hill, like Doi Suthep above Chiang Mai
    bpy.ops.mesh.primitive_cone_add(radius1=1.8, radius2=0, depth=6, location=(-6, 150, 39))
    bpy.context.object.data.materials.append(mat(0xE0B23C, 1.0, 0.25, 0.3))
    bpy.ops.mesh.primitive_cylinder_add(radius=2.1, depth=1.6, location=(-6, 150, 35.5))
    bpy.context.object.data.materials.append(mat(0xE0B23C, 1.0, 0.25, 0.3))


def skyline(rnd):
    """A few towers of the city far behind the town."""
    for k in range(12):
        x = -30 + k * 7 + rnd.uniform(-2, 2)
        y = -55 - rnd.uniform(0, 15)
        h = rnd.uniform(4, 12)
        w = rnd.uniform(2, 3.5)
        box(x, y, 0, x + w, y + w, h, mat(rnd.choice((0xE9EEF2, 0xDDE3EA, 0xF3EAD8)), 1.0, 0.4))
        for f in range(int(h / 1.2)):
            box(x - 0.01, y + w - 0.01, 0.5 + f * 1.2, x + w + 0.01, y + w + 0.02, 0.9 + f * 1.2, mat(0x7FA9B8, 1.0, 0.15))


# ---------------------------------------------------------------- the scene


def town(kinds, rnd, x, y):
    i = rnd.randrange(len(kinds))
    instance(f"town{i}", kinds[i], x, y, s=1.25)


def campus(rnd):
    s = bpy.context.scene
    # ground: the town's lawns, the lot a touch brighter
    bpy.ops.mesh.primitive_plane_add(size=500, location=(0, 0, -0.02))
    bpy.context.object.data.materials.append(ground_mat(0x6F9852, 0x86AB5E))
    box(-0.5, -0.5, -0.02, 24.5, 24.5, 0.04, ground_mat(0x7FAE58, 0x93BE68, 0.15))
    pave = mat(0xE6DCC6, 1.0, 0.7)
    # paths: the avenue from the gate, a cross walk and a ring round the fountain
    box(10.4, 9.5, 0.04, 11.6, 25, 0.06, pave)
    box(1.5, 14.4, 0.04, 21.5, 15.6, 0.06, pave)
    cyl(11, 15, 0.04, 0.065, 2.4, pave, 48)
    box(4, 8.6, 0.04, 18, 9.6, 0.06, pave)
    # the street in front, with the gate
    box(-30, 25.2, -0.01, 60, 28.2, 0.02, mat(0x5B5F65, 1.0, 0.8))
    for k in range(-30, 60, 2):
        box(k, 26.65, 0.02, k + 1.0, 26.75, 0.025, mat(0xF2D46A))
    box(-30, 24.5, 0.0, 60, 25.2, 0.08, mat(0xD3CDBD, 1.0, 0.8))
    for x in (9.8, 12.2):
        box(x - 0.25, 24.0, 0, x + 0.25, 24.5, 1.6, mat(0xF3EAD8))
        box(x - 0.3, 23.95, 1.6, x + 0.3, 24.55, 1.75, mat(0xC0634A))
    box(9.6, 24.1, 1.75, 12.4, 24.4, 2.15, mat(0xFBF8F2))
    hedge(-0.5, 24.0, 9.4, 24.4)
    hedge(12.6, 24.0, 24.5, 24.4)
    hedge(24.1, -0.5, 24.5, 24.4)

    # the buildings, with their signs
    place(lambda: ra.building("ward", 6, 4, 0x4F8A80), 8, 3)
    sign("NURSING HOME", 8.8, 7.0, 1.0, 4.4, 0x1F4F8A, 0x2F74D8)
    place(lambda: ra.building("therapy", 4, 3, 0x6B8F4E), 1.5, 9.8)
    sign("REHABILITATION", 1.6, 12.8, 0.55, 3.8, 0x1F4F8A, 0x1E9E6A, size=0.26)
    place(lambda: ra.building("neuro_clinic", 4, 3, 0x3B5BA5), 16, 3.5)
    sign("NEUROCLINIC", 16.2, 6.5, 0.55, 3.6, 0x1F4F8A, 0x6A4FDC, size=0.28)
    place(lambda: ra.building("villa", 3, 3, 0xB08850), 16.5, 10.5)
    place(lambda: ra.building("villa", 3, 3, 0xB08850), 20.2, 12.5)
    sign("TRANQUILA", 16.6, 13.5, 1.15, 2.8, 0x5A3E28, 0xC7862A, size=0.28)
    place(lambda: ra.building("homecare_office", 4, 3, 0x3F7F9A), 2, 17)
    sign("HOME CARE", 2.2, 20.0, 0.55, 3.4, 0x1F4F8A, 0x1E9E6A, size=0.3)
    place(lambda: ra.building("dining_room", 3, 3, 0xC9771F), 2.5, 3.5)
    place(ra.thai_house, 18.5, 17.5, s=1.6)
    place(ra.sala, 14.6, 19.6, s=1.5)
    pond(13.2, 17.2, 17.6, 21.6, rnd)
    fountain(11, 15)
    car(rt.ambulance, 6.5, 21.3, math.pi / 2)
    car(lambda: rt.sedan(0xF4F6F8), 7.6, 21.3, math.pi / 2)
    car(lambda: rt.sedan(0x2F6AA5), 4.0, 26.0, -math.pi / 2)
    car(lambda: rt.tuk_tuk(), 18, 27.0, math.pi / 2)

    # gardens, trees, lamps and people out on the paths
    for x, y in ((9, 13), (13, 13), (9, 17), (13, 17), (6, 14), (16, 14)):
        flowers(x, y, 8, rnd)
    for x, y in ((0.5, 1), (6.5, 1), (15, 1.5), (22.5, 2), (23, 8), (7, 10.5), (14.8, 10.5), (6, 13), (0.8, 15.5),
                    (22.5, 18), (9, 22.5), (13, 22.5), (0.8, 22.5), (20.5, 22.8), (5, 8.5)):
        tree(x, y, rnd.uniform(1.1, 1.5), "sakura" if (x + y) % 5 < 1.2 else rnd.choice(("green", "dark", "green")), rnd)
    for x, y in ((10, 20), (12.2, 19.2), (21.8, 15.6), (1.2, 7.6)):
        palm(x, y, 1.4)
    for x, y in ((10.1, 11), (11.9, 11), (10.1, 19), (11.9, 19), (10.1, 23), (11.9, 23), (4, 15.9), (18, 15.9)):
        lamp(x, y)
    walkers = [("nurse", 10.7, 12.5), ("elder_f", 11.3, 12.2), ("caregiver", 8.5, 15.2), ("wheelchair", 8.9, 15.0), ("doctor", 14, 14.8),
               ("elder_m", 14.6, 15.2), ("pt", 5.2, 14.9), ("resident", 5.8, 15.1), ("kid", 11.1, 21.0), ("owner_f", 10.8, 21.4), ("jogger", 20, 24.85), ("student", 3, 24.85)]
    for name, x, y in walkers:
        instance(f"p-{name}", rp.PEOPLE[name], x - 0.5 * 0.55, y - 0.5 * 0.55, rot=rnd.uniform(-0.6, 0.6), s=0.55)

    # the town behind: rows of houses and shops along streets, then the city and the hills
    kinds = [lambda: rt.house_two_storey(0xC0634A, 0xF3EAD8), lambda: rt.house_two_storey(0x5F7F8F, 0xEFE6D2), lambda: rt.house_bungalow(0x9C5A3C, 0xF1E1CF),
             lambda: rt.shophouse(0x2F9AA0, 0xEDE3CF, (0xC0392B, 0x2F74D8)), lambda: rt.house_two_storey(0x4F8A70, 0xF6EFE2), lambda: rt.house_bungalow(0x7D6AA0, 0xE9EEF2),
             lambda: rt.shophouse(0xE5484D, 0xE2E8EA, (0xF2C230, 0x1E9E6A)), rt.convenience_store, rt.cafe]
    box(-40, -4.2, -0.01, 70, -2.2, 0.02, mat(0x5B5F65, 1.0, 0.8))
    for row, y0 in enumerate((-8, -14, -20, -27, -34)):
        if row:
            box(-40, y0 + 2.6, -0.01, 70, y0 + 4.2, 0.02, mat(0x5B5F65, 1.0, 0.8))
        for k, x in enumerate(range(-26, 52, 3)):
            if rnd.random() < 0.18:
                tree(x + 1, y0 + 1, rnd.uniform(1.0, 1.6), rnd.choice(("green", "dark", "sakura")), rnd)
                continue
            town(kinds, rnd, x, y0)
    for x in range(-36, 0, 3):
        for y in range(2, 24, 4):
            if rnd.random() < 0.5:
                town(kinds, rnd, x, y)
            else:
                tree(x + 1, y + 1, rnd.uniform(1.0, 1.6), rnd.choice(("green", "dark")), rnd)
    place(rt.temple, -11, -24, s=2.2)
    for x in range(26, 60, 3):
        for y in range(-2, 24, 4):
            if rnd.random() < 0.55:
                tree(x + 1, y + 1, rnd.uniform(1.0, 1.6), rnd.choice(("green", "dark", "sakura")), rnd)
            else:
                town(kinds, rnd, x, y)
    for x in range(-30, 60, 4):
        for y in (30, 34):
            tree(x + rnd.uniform(-1, 1), y + rnd.uniform(-1, 1), rnd.uniform(1.2, 1.8), rnd.choice(("green", "dark", "gold")), rnd)
    skyline(rnd)
    mountains(rnd)


def sky(s, elevation=14, rotation=-35, strength=0.35):
    w = bpy.data.worlds.new("w")
    s.world = w
    w.use_nodes = True
    nt = w.node_tree
    sk = nt.nodes.new("ShaderNodeTexSky")
    sk.sky_type = "NISHITA"
    sk.sun_elevation = math.radians(elevation)
    sk.sun_rotation = math.radians(rotation)
    sk.air_density = 1.2
    sk.dust_density = 2.0
    nt.links.new(sk.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = strength
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    s.collection.objects.link(sun)
    sun.data.energy = 4.0
    sun.data.angle = math.radians(3)
    sun.data.color = (1.0, 0.86, 0.7)
    sun.rotation_euler = (math.radians(90 - elevation - 18), 0, math.radians(rotation + 180 + 35))


def camera(s, loc, target, lens, w, h, samples):
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    s.collection.objects.link(cam)
    s.camera = cam
    cam.location = Vector((loc[0], -loc[1], loc[2]))
    t = Vector((target[0], -target[1], target[2]))
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = lens
    cam.data.clip_end = 600
    s.render.resolution_x = int(w * SCALE)
    s.render.resolution_y = int(h * SCALE)
    s.cycles.samples = samples
    return cam


def render_bg(name, w, h, loc, target, lens):
    if ONLY and name not in ONLY:
        return
    s = reset()
    rnd = random.Random(7)
    sky(s)
    campus(rnd)
    camera(s, loc, target, lens, w, h, 96)
    s.view_settings.exposure = -0.9
    s.render.film_transparent = False
    s.render.filepath = f"{OUT}/{name}.png"
    bpy.ops.render.render(write_still=True)
    print("rendered", name)


def render_cast():
    """The cast: owner, nurse, a grandmother in a wheelchair, a carer, a physio and an OT, at eye level."""
    if ONLY and "cast" not in ONLY:
        return
    s = reset()
    w = bpy.data.worlds.new("w")
    s.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.9, 0.92, 1.0, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    for e, r, en, c in ((40, -30, 3.2, (1.0, 0.9, 0.78)), (25, 150, 1.2, (0.75, 0.85, 1.0))):
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
        s.collection.objects.link(sun)
        sun.data.energy = en
        sun.data.angle = math.radians(10)
        sun.data.color = c
        sun.rotation_euler = (math.radians(90 - e), 0, math.radians(r))
    cast = [("owner_m", -1.75, 0.15), ("nurse", -1.05, -0.2), ("wheelchair", -0.3, 0.35), ("caregiver", 0.45, -0.15), ("pt", 1.15, 0.2), ("ot", 1.85, 0.0)]
    for name, x, y in cast:
        place(rp.PEOPLE[name], x - 0.5, y - 0.5, rot=-x * 0.12)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    bpy.context.object.is_shadow_catcher = True
    camera(s, (0, 6.2, 1.15), (0, 0, 0.6), 55, 1600, 760, 96)
    s.render.film_transparent = True
    s.render.filepath = f"{OUT}/cast.png"
    bpy.ops.render.render(write_still=True)
    print("rendered cast")


def render_logo():
    """The title in chunky 3D letters: 'Healthcare' in sky blue, 'EMPIRE' in gold, a heart on top."""
    if ONLY and "logo" not in ONLY:
        return
    s = reset()
    w = bpy.data.worlds.new("w")
    s.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.85, 0.9, 1.0, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    s.collection.objects.link(sun)
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(35), math.radians(-20), math.radians(10))
    font = bpy.data.fonts.load(FONT)

    def faced(face, side):
        """Light on the front of the letters, darker on the extruded sides (by the surface normal)."""
        m = bpy.data.materials.new("letters")
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes["Principled BSDF"]
        b.inputs["Roughness"].default_value = 0.3
        b.inputs["Coat Weight"].default_value = 0.6
        geo = nt.nodes.new("ShaderNodeNewGeometry")
        dot = nt.nodes.new("ShaderNodeVectorMath")
        dot.operation = "DOT_PRODUCT"
        dot.inputs[1].default_value = (0, -1, 0)
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.55
        ramp.color_ramp.elements[0].color = ra.hex_rgb(side)
        ramp.color_ramp.elements[1].position = 0.9
        ramp.color_ramp.elements[1].color = ra.hex_rgb(face)
        nt.links.new(geo.outputs["Normal"], dot.inputs[0])
        nt.links.new(dot.outputs["Value"], ramp.inputs["Fac"])
        nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
        return m

    def word(text, size, z, face, side, depth=0.22):
        cu = bpy.data.curves.new("w", "FONT")
        cu.body = text
        cu.font = font
        cu.size = size
        cu.extrude = depth
        cu.bevel_depth = 0.03
        cu.bevel_resolution = 3
        cu.align_x = "CENTER"
        cu.align_y = "CENTER"
        o = bpy.data.objects.new("w", cu)
        bpy.context.collection.objects.link(o)
        o.location = (0, 0, z)
        o.rotation_euler = (math.pi / 2, 0, 0)
        o.data.materials.append(faced(face, side))
        return o

    word("Healthcare", 1.35, 0.95, 0x5FD0F2, 0x1D4F7A)
    word("EMPIRE", 1.75, -0.45, 0xFFC531, 0x8A4A12, 0.28)
    # ribbon with the subtitle
    rbox(-2.9, -0.15, -1.62, 2.9, 0.15, -1.12, mat(0x7A3F12, 1.0, 0.5), 0.06)
    cu = bpy.data.curves.new("r", "FONT")
    cu.body = "NURSING HOME TYCOON"
    cu.font = bpy.data.fonts.load(FONT.replace("700", "600")) if os.path.exists(FONT.replace("700", "600")) else font
    cu.size = 0.36
    cu.extrude = 0.02
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    o = bpy.data.objects.new("r", cu)
    bpy.context.collection.objects.link(o)
    o.location = (0, -0.2, -1.37)
    o.rotation_euler = (math.pi / 2, 0, 0)
    o.data.materials.append(mat(0xFFF5DD, 1.0, 0.4))
    # a red heart with a white cross above the H
    for dx in (-0.16, 0.16):
        sphere(-2.9 + dx, 0, 1.95, 0.26, mat(0xE5484D, 1.0, 0.3))
    bpy.ops.mesh.primitive_cone_add(radius1=0.37, radius2=0, depth=0.5, location=(-2.9, 0, 1.68), rotation=(math.pi, 0, 0), vertices=4)
    bpy.context.object.rotation_euler = (math.pi, 0, math.pi / 4)
    bpy.context.object.scale = (1, 0.55, 1)
    bpy.context.object.data.materials.append(mat(0xE5484D, 1.0, 0.3))
    box(-2.95, -0.25, 1.75, -2.85, -0.22, 2.07, mat(0xFFFFFF))
    box(-3.06, -0.25, 1.86, -2.74, -0.22, 1.96, mat(0xFFFFFF))
    camera(s, (0, 14, 0.2), (0, 0, 0.1), 60, 1200, 760, 64)
    s.camera.location = (2.2, -14, -1.6)
    s.camera.rotation_euler = (Vector((0, 0, 0.1)) - s.camera.location).to_track_quat("-Z", "Y").to_euler()
    s.render.film_transparent = True
    s.render.filepath = f"{OUT}/logo.png"
    bpy.ops.render.render(write_still=True)
    print("rendered logo")


if __name__ == "__main__":
    # Portrait: a high view down the avenue from the gate; wide: lower and further right.
    render_bg("bg_portrait", 1080, 1920, (15, 33, 13), (11.5, 10.5, 0), 30)
    render_bg("bg_wide", 2400, 1000, (24, 33, 10), (10, 11, 1), 26)
    render_cast()
    render_logo()
