"""
Render the interior equipment and the people with Blender (headless), on the same camera as the
buildings (render_assets.py) at twice the pixel density.

    blender -b --python tools/blender/render_props.py -- <out_dir> [only_name ...]

Each model stands in one tile (0..1 in game x and y) with its front toward game +y (south).
Every model is rendered twice: <name>_s (front toward the viewer's lower left) and <name>_n
(turned round, back toward the viewer). The game mirrors these for east and west.
"""
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_assets as ra  # noqa: E402
from render_assets import box, mat, sphere  # noqa: E402

ra.DENSITY = 2
OUT, ONLY = ra.OUT, ra.ONLY


def cyl(x, y, z0, z1, r, m, verts=16):
    """An upright cylinder at game (x, y) from height z0 to z1."""
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=z1 - z0, location=(x, -y, (z0 + z1) / 2), vertices=verts)
    o = bpy.context.object
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def rod(a, b, r, m):
    """A tube between two game points (x, y, z)."""
    pa = Vector((a[0], -a[1], a[2]))
    pb = Vector((b[0], -b[1], b[2]))
    d = pb - pa
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, location=(pa + pb) / 2, vertices=10)
    o = bpy.context.object
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    o.data.materials.append(m)
    return o


def blob(x, y, z, rx, ry, rz, m):
    """A smooth ellipsoid (heads, cushions, hair)."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(x, -y, z), segments=24, ring_count=14)
    o = bpy.context.object
    o.scale = (rx, ry, rz)
    o.data.materials.append(m)
    bpy.ops.object.shade_smooth()
    return o


def rbox(x0, y0, z0, x1, y1, z1, m, bevel=0.02):
    """A box with softened edges."""
    o = box(x0, y0, z0, x1, y1, z1, m)
    mod = o.modifiers.new("b", "BEVEL")
    mod.width = bevel
    mod.segments = 3
    return o


def wheels(xs, ys, z=0.03, r=0.03):
    dark = mat(0x3A3F46, 1.0, 0.5)
    for x in xs:
        for y in ys:
            sphere(x, y, z, r, dark)


# ---------------------------------------------------------------- equipment

WHITE = 0xF4F2EC
STEEL = 0xB9C0C8
WOOD = 0xC08A55
DARK = 0x3A3F46


def care_bed():
    steel = mat(STEEL, 1.0, 0.35)
    box(0.24, 0.1, 0.1, 0.76, 0.92, 0.17, steel)  # frame
    for x in (0.27, 0.73):
        for y in (0.14, 0.88):
            box(x - 0.015, y - 0.015, 0.04, x + 0.015, y + 0.015, 0.12, steel)
    wheels((0.27, 0.73), (0.14, 0.88))
    rbox(0.25, 0.11, 0.17, 0.75, 0.91, 0.27, mat(WHITE), 0.03)  # mattress
    rbox(0.245, 0.45, 0.2, 0.755, 0.915, 0.285, mat(0x6FB7AC, 1.0, 0.8), 0.03)  # blanket
    box(0.245, 0.43, 0.27, 0.755, 0.47, 0.29, mat(0xFFFFFF))  # sheet fold
    blob(0.5, 0.2, 0.3, 0.17, 0.07, 0.04, mat(0xFFFFFF))  # pillow
    rbox(0.21, 0.04, 0.08, 0.79, 0.1, 0.52, mat(0xD9C2A0, 1.0, 0.5), 0.02)  # headboard
    rbox(0.21, 0.92, 0.08, 0.79, 0.97, 0.36, mat(0xD9C2A0, 1.0, 0.5), 0.02)  # footboard
    for x in (0.235, 0.765):  # half side rails at the head
        box(x - 0.01, 0.14, 0.3, x + 0.01, 0.44, 0.32, steel)
        for y in (0.16, 0.42):
            box(x - 0.01, y - 0.01, 0.27, x + 0.01, y + 0.01, 0.32, steel)


def call_system():
    box(0.42, 0.02, 0.52, 0.58, 0.05, 0.72, mat(WHITE))
    sphere(0.5, 0.06, 0.62, 0.035, mat(0xE5484D, 1.0, 0.3, 0.6))
    rod((0.5, 0.06, 0.52), (0.5, 0.2, 0.32), 0.008, mat(0xDDDDDD))


def iv_pole(x, y, top=1.0):
    steel = mat(STEEL, 1.0, 0.3)
    for k in range(5):
        a = k * 2 * math.pi / 5
        rod((x, y, 0.04), (x + 0.12 * math.cos(a), y + 0.12 * math.sin(a), 0.03), 0.012, steel)
        sphere(x + 0.12 * math.cos(a), y + 0.12 * math.sin(a), 0.025, 0.022, mat(DARK))
    cyl(x, y, 0.03, top, 0.014, steel)
    rod((x - 0.1, y, top), (x + 0.1, y, top), 0.01, steel)


def feeding_pump():
    iv_pole(0.5, 0.5)
    rbox(0.43, 0.45, 0.5, 0.57, 0.53, 0.66, mat(0xE9EEF2), 0.015)
    box(0.45, 0.53, 0.56, 0.55, 0.535, 0.63, mat(0x6FD3A8, 1.0, 0.3, 1.2))
    blob(0.42, 0.5, 0.88, 0.05, 0.03, 0.09, mat(0xF4E6C8, 1.0, 0.2))  # bag
    rod((0.42, 0.5, 0.8), (0.47, 0.52, 0.66), 0.006, mat(0xEEEEEE))


def suction_unit():
    steel = mat(STEEL, 1.0, 0.35)
    box(0.32, 0.36, 0.06, 0.68, 0.64, 0.09, steel)
    wheels((0.35, 0.65), (0.39, 0.61))
    for x in (0.34, 0.66):
        box(x - 0.01, 0.36, 0.09, x + 0.01, 0.38, 0.5, steel)
    rbox(0.33, 0.38, 0.09, 0.67, 0.62, 0.3, mat(0xE9EEF2), 0.02)
    cyl(0.42, 0.5, 0.3, 0.5, 0.06, mat(0xCFE8F2, 1.0, 0.1))  # canister
    cyl(0.58, 0.5, 0.3, 0.44, 0.045, mat(0xCFE8F2, 1.0, 0.1))
    box(0.36, 0.62, 0.16, 0.5, 0.625, 0.24, mat(0x3B4A57))
    sphere(0.58, 0.625, 0.2, 0.02, mat(0x6FD3A8, 1.0, 0.3, 1.5))


def vital_monitor():
    iv_pole(0.5, 0.5, 0.78)
    rbox(0.36, 0.46, 0.74, 0.64, 0.54, 0.96, mat(0x3B4A57), 0.015)
    box(0.38, 0.54, 0.76, 0.62, 0.545, 0.94, mat(0x0E1A22))
    for k, c in enumerate((0x6FD39A, 0xFFD166, 0x6FC3F2)):
        box(0.4, 0.546, 0.9 - k * 0.05, 0.6 - k * 0.04, 0.55, 0.91 - k * 0.05, mat(c, 1.0, 0.3, 2.0))


def sensory_kit():
    box(0.3, 0.35, 0, 0.7, 0.65, 0.3, mat(0xD9C2A0))
    cyl(0.42, 0.5, 0.3, 0.5, 0.05, mat(0xB58CF0, 1.0, 0.2, 1.5))
    for k, c in enumerate((0xF08AA8, 0xFFD166, 0x6FC3F2)):
        sphere(0.56 + k * 0.04, 0.45 + k * 0.05, 0.34, 0.04, mat(c))


def rehab_frame():
    steel = mat(STEEL, 1.0, 0.3)
    for x in (0.3, 0.7):
        rod((x, 0.35, 0.02), (x, 0.35, 0.55), 0.015, steel)
        rod((x, 0.65, 0.02), (x, 0.62, 0.55), 0.015, steel)
        rod((x, 0.35, 0.55), (x, 0.62, 0.55), 0.02, mat(0x5A6570))
    rod((0.3, 0.35, 0.45), (0.7, 0.35, 0.45), 0.014, steel)


def door_sensor():
    box(0.4, 0.02, 0.8, 0.6, 0.05, 0.9, mat(WHITE))
    sphere(0.5, 0.055, 0.85, 0.02, mat(0x6FD3A8, 1.0, 0.3, 2.0))


def chair(x, y, facing_back, seat=0x4A6AA5):
    """An office chair at (x, y); the backrest away from +y when facing_back is False."""
    dark = mat(DARK, 1.0, 0.4)
    cyl(x, y, 0.03, 0.2, 0.012, dark)
    for k in range(5):
        a = k * 2 * math.pi / 5
        rod((x, y, 0.04), (x + 0.07 * math.cos(a), y + 0.07 * math.sin(a), 0.02), 0.008, dark)
    rbox(x - 0.08, y - 0.08, 0.2, x + 0.08, y + 0.08, 0.24, mat(seat), 0.02)
    by = y - 0.08 if not facing_back else y + 0.06
    rbox(x - 0.08, by, 0.24, x + 0.08, by + 0.02, 0.42, mat(seat), 0.01)


def monitor(x, y, toward_minus_y=True):
    dark = mat(DARK, 1.0, 0.3)
    box(x - 0.03, y - 0.02, 0.4, x + 0.03, y + 0.02, 0.42, dark)
    box(x - 0.008, y - 0.008, 0.42, x + 0.008, y + 0.008, 0.48, dark)
    box(x - 0.11, y - 0.012, 0.46, x + 0.11, y + 0.012, 0.6, dark)
    sy = y - 0.013 if toward_minus_y else y + 0.012
    box(x - 0.1, sy - 0.002, 0.47, x + 0.1, sy + 0.002, 0.59, mat(0x7FB8E8, 1.0, 0.2, 0.8))


def desk(accent, height=0.38, counter=False):
    top = mat(0xE8DCC6, 1.0, 0.5)
    rbox(0.08, 0.34, height - 0.04, 0.92, 0.76, height, top, 0.015)
    box(0.1, 0.72, 0.0, 0.9, 0.76, height - 0.04, mat(accent))  # modesty panel (front)
    box(0.1, 0.36, 0.0, 0.14, 0.72, height - 0.04, mat(accent, 0.85))
    box(0.86, 0.36, 0.0, 0.9, 0.72, height - 0.04, mat(accent, 0.85))
    if counter:  # a raised counter for visitors along the front
        rbox(0.06, 0.74, 0.0, 0.94, 0.86, 0.56, mat(accent), 0.02)
        rbox(0.04, 0.72, 0.56, 0.96, 0.9, 0.6, mat(0xF4EEE2, 1.0, 0.4), 0.015)
        box(0.3, 0.86, 0.22, 0.7, 0.865, 0.4, mat(0xFFFFFF, 1.0, 0.4, 0.3))


def nurse_desk():
    desk(0x4A6AA5, counter=True)
    monitor(0.36, 0.5, toward_minus_y=True)
    box(0.56, 0.44, 0.38, 0.72, 0.56, 0.4, mat(0xFFFFFF))  # chart
    box(0.56, 0.44, 0.4, 0.72, 0.56, 0.41, mat(0x6FB7AC))
    chair(0.42, 0.18, False)


def reception_desk():
    desk(0x4B4FC4, counter=True)
    monitor(0.6, 0.5, toward_minus_y=True)
    blob(0.25, 0.5, 0.45, 0.04, 0.04, 0.06, mat(0x5F9E4E))  # plant
    cyl(0.25, 0.5, 0.38, 0.43, 0.03, mat(0xC97A4A))
    chair(0.5, 0.18, False, 0x6A4FDC)


def exam_desk():
    desk(0x3B5BA5)
    monitor(0.38, 0.5, toward_minus_y=True)
    chair(0.42, 0.16, False)
    chair(0.62, 0.88, True, 0x8D97A1)  # patient's chair in front
    cyl(0.75, 0.48, 0.38, 0.46, 0.035, mat(0xF4F2EC))  # pen pot


def office_desk():
    desk(0x3C6E47)
    box(0.3, 0.42, 0.38, 0.52, 0.58, 0.39, mat(0x8D97A1))  # laptop base
    rod((0.3, 0.42, 0.39), (0.52, 0.42, 0.39), 0.004, mat(DARK))
    box(0.3, 0.41, 0.39, 0.52, 0.43, 0.53, mat(0x8D97A1))
    for k in range(3):
        box(0.6, 0.45, 0.38 + k * 0.012, 0.8, 0.62, 0.39 + k * 0.012, mat(0xFFFFFF if k % 2 else 0xF4E6C8))
    chair(0.42, 0.18, False, 0x3C6E47)


def med_cart():
    steel = mat(STEEL, 1.0, 0.35)
    rbox(0.28, 0.32, 0.06, 0.72, 0.68, 0.56, mat(0xF4F2EC), 0.02)
    for k, c in enumerate((0x4A6AA5, 0x6FC3F2, 0xFFD166, 0xE5484D)):
        z = 0.1 + k * 0.11
        box(0.3, 0.68, z, 0.7, 0.69, z + 0.09, mat(c))
        box(0.45, 0.69, z + 0.035, 0.55, 0.7, z + 0.05, mat(0xFFFFFF))
    box(0.26, 0.3, 0.56, 0.74, 0.7, 0.59, mat(0xDDE3EA))
    rod((0.22, 0.36, 0.5), (0.22, 0.64, 0.5), 0.012, steel)
    wheels((0.32, 0.68), (0.36, 0.64))


def lockers():
    body = mat(0x6B8FB5, 1.0, 0.45)
    rbox(0.1, 0.1, 0.0, 0.9, 0.42, 0.95, body, 0.015)
    for k in range(3):
        x0 = 0.12 + k * 0.26
        box(x0, 0.42, 0.04, x0 + 0.24, 0.425, 0.92, mat(0x7FA3C8, 1.0, 0.45))
        for v in range(3):
            box(x0 + 0.06, 0.425, 0.78 - v * 0.04, x0 + 0.18, 0.43, 0.79 - v * 0.04, mat(0x4E6E90))
        box(x0 + 0.19, 0.425, 0.45, x0 + 0.21, 0.435, 0.55, mat(0xDDE3EA))


def rest_sofa():
    fabric = mat(0x8FB8A8, 1.0, 0.9)
    rbox(0.1, 0.2, 0.06, 0.9, 0.72, 0.24, fabric, 0.04)  # seat base
    rbox(0.1, 0.16, 0.06, 0.9, 0.32, 0.5, fabric, 0.05)  # back
    for x in (0.06, 0.82):
        rbox(x, 0.18, 0.06, x + 0.12, 0.72, 0.36, fabric, 0.04)
    for x in (0.18, 0.5):
        rbox(x, 0.32, 0.24, x + 0.32, 0.7, 0.3, mat(0xA7CABC, 1.0, 0.9), 0.04)
    blob(0.3, 0.34, 0.38, 0.08, 0.04, 0.08, mat(0xF2C46D))  # cushion
    for x in (0.14, 0.86):
        for y in (0.22, 0.68):
            box(x - 0.015, y - 0.015, 0, x + 0.015, y + 0.015, 0.06, mat(0x5A3E28))


def whiteboard():
    steel = mat(STEEL, 1.0, 0.35)
    for x in (0.14, 0.86):
        rod((x, 0.25, 0.02), (x, 0.25, 0.95), 0.014, steel)
        rod((x - 0.08, 0.25, 0.02), (x + 0.08, 0.25, 0.02), 0.014, steel)
    rbox(0.1, 0.22, 0.38, 0.9, 0.27, 0.92, mat(0xF8F8F6, 1.0, 0.2), 0.01)
    for k, c in enumerate((0x2F74D8, 0xE5484D, 0x1E9E6A)):
        box(0.18, 0.271, 0.82 - k * 0.1, 0.5 + k * 0.08, 0.274, 0.835 - k * 0.1, mat(c))
    box(0.6, 0.271, 0.5, 0.82, 0.274, 0.7, mat(0xFFD166))
    box(0.1, 0.27, 0.36, 0.9, 0.32, 0.38, steel)


def waiting_chairs():
    steel = mat(STEEL, 1.0, 0.35)
    box(0.08, 0.38, 0.18, 0.92, 0.42, 0.2, steel)
    for x in (0.14, 0.86):
        box(x - 0.015, 0.36, 0.0, x + 0.015, 0.44, 0.18, steel)
    for k in range(3):
        x0 = 0.1 + k * 0.27
        rbox(x0, 0.32, 0.2, x0 + 0.25, 0.62, 0.25, mat(0x3F8FAE), 0.02)
        rbox(x0, 0.28, 0.25, x0 + 0.25, 0.32, 0.5, mat(0x3F8FAE), 0.02)


def medicine_shelf():
    frame = mat(0xF4F2EC, 1.0, 0.5)
    box(0.1, 0.1, 0, 0.9, 0.14, 0.95, frame)
    for x in (0.1, 0.86):
        box(x, 0.1, 0, x + 0.04, 0.42, 0.95, frame)
    colours = (0xE5484D, 0x2F74D8, 0xFFD166, 0x1E9E6A, 0xF08AA8, 0x6FC3F2)
    for k in range(4):
        z = 0.04 + k * 0.23
        box(0.14, 0.14, z, 0.86, 0.42, z + 0.02, frame)
        for b in range(5):
            x0 = 0.16 + b * 0.14
            hgt = 0.08 + ((b + k) % 3) * 0.03
            box(x0, 0.18, z + 0.02, x0 + 0.1, 0.36, z + 0.02 + hgt, mat(colours[(b + k * 2) % 6]))
    box(0.1, 0.42, 0.0, 0.9, 0.43, 0.04, frame)


def dining_table():
    wood = mat(WOOD, 1.0, 0.5)
    rbox(0.18, 0.18, 0.34, 0.82, 0.82, 0.38, wood, 0.02)
    for x in (0.24, 0.76):
        for y in (0.24, 0.76):
            box(x - 0.02, y - 0.02, 0, x + 0.02, y + 0.02, 0.34, wood)
    for x, y in ((0.36, 0.36), (0.64, 0.64), (0.64, 0.36), (0.36, 0.64)):
        cyl(x, y, 0.38, 0.39, 0.06, mat(0xFFFFFF, 1.0, 0.2))
        cyl(x, y, 0.39, 0.4, 0.035, mat(0xF2C46D))
    cyl(0.5, 0.5, 0.38, 0.48, 0.025, mat(0xCFE8F2, 1.0, 0.1))
    sphere(0.5, 0.5, 0.5, 0.035, mat(0xF08AA8))
    seat = mat(0xA0623A, 1.0, 0.6)
    for x, y, bx, by in ((0.5, 0.06, 0, -1), (0.5, 0.94, 0, 1), (0.06, 0.5, -1, 0), (0.94, 0.5, 1, 0)):
        rbox(x - 0.09, y - 0.09, 0.2, x + 0.09, y + 0.09, 0.24, seat, 0.015)
        if by:
            rbox(x - 0.09, y + by * 0.07 - 0.015, 0.24, x + 0.09, y + by * 0.07 + 0.015, 0.44, seat, 0.01)
        else:
            rbox(x + bx * 0.07 - 0.015, y - 0.09, 0.24, x + bx * 0.07 + 0.015, y + 0.09, 0.44, seat, 0.01)
        for dx in (-0.07, 0.07):
            for dy in (-0.07, 0.07):
                box(x + dx - 0.01, y + dy - 0.01, 0, x + dx + 0.01, y + dy + 0.01, 0.2, seat)


def washer():
    rbox(0.24, 0.24, 0.0, 0.76, 0.72, 0.62, mat(0xF4F6F8, 1.0, 0.3), 0.03)
    box(0.26, 0.72, 0.52, 0.74, 0.725, 0.6, mat(0xDDE3EA))
    sphere(0.66, 0.73, 0.56, 0.02, mat(0x6FD3A8, 1.0, 0.3, 1.5))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.02, location=(0.5, -0.73, 0.3), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(mat(0xB9C0C8, 1.0, 0.3))
    bpy.ops.mesh.primitive_cylinder_add(radius=0.115, depth=0.01, location=(0.5, -0.725, 0.3), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(mat(0x5C7A99, 1.0, 0.1))


def storage_rack():
    steel = mat(0x8D97A1, 1.0, 0.4)
    for x in (0.1, 0.88):
        for y in (0.12, 0.42):
            box(x, y, 0, x + 0.02, y + 0.02, 0.95, steel)
    colours = (0xC9A06A, 0xB58A54, 0xD9B784, 0x8FB8A8)
    for k in range(4):
        z = 0.06 + k * 0.28
        box(0.1, 0.12, z, 0.9, 0.44, z + 0.02, steel)
        if k < 3:
            for b in range(3):
                x0 = 0.13 + b * 0.25
                rbox(x0, 0.15, z + 0.02, x0 + 0.22, 0.41, z + 0.02 + 0.14 + (b % 2) * 0.05, mat(colours[(b + k) % 4]), 0.01)


def bath_set():
    rbox(0.1, 0.12, 0.0, 0.9, 0.56, 0.34, mat(0xF8F8F6, 1.0, 0.15), 0.05)  # tub
    box(0.14, 0.16, 0.2, 0.86, 0.52, 0.33, mat(0x9FD3E8, 1.0, 0.05))  # water
    steel = mat(STEEL, 1.0, 0.25)
    rod((0.2, 0.1, 0.5), (0.8, 0.1, 0.5), 0.012, steel)  # grab bar on the wall
    for x in (0.2, 0.8):
        rod((x, 0.08, 0.5), (x, 0.1, 0.5), 0.012, steel)
    cyl(0.85, 0.1, 0.34, 0.9, 0.01, steel)  # shower rail
    blob(0.85, 0.14, 0.9, 0.04, 0.03, 0.02, steel)
    # shower chair in front
    rbox(0.36, 0.66, 0.24, 0.64, 0.86, 0.27, mat(0xFFFFFF), 0.02)
    for x in (0.38, 0.62):
        for y in (0.68, 0.84):
            rod((x, y, 0), (x, y, 0.24), 0.01, steel)
    box(0.2, 0.62, 0.0, 0.32, 0.92, 0.01, mat(0x6FB7AC, 1.0, 0.9))  # bath mat


def exercise_mat():
    rbox(0.12, 0.18, 0.0, 0.88, 0.82, 0.04, mat(0x4F8FD8, 1.0, 0.8), 0.02)
    blob(0.72, 0.32, 0.13, 0.11, 0.11, 0.11, mat(0x6FD39A, 1.0, 0.4))
    for x in (0.25, 0.33):
        cyl(x, 0.72, 0.04, 0.07, 0.035, mat(0x3A3F46))  # dumbbells
        rod((x, 0.68, 0.055), (x, 0.76, 0.055), 0.01, mat(STEEL))


def parallel_bars():
    rbox(0.04, 0.18, 0.0, 0.96, 0.82, 0.04, mat(0x9C6B45, 1.0, 0.6), 0.01)
    steel = mat(STEEL, 1.0, 0.3)
    for y in (0.3, 0.7):
        for x in (0.14, 0.86):
            rod((x, y, 0.04), (x, y, 0.55), 0.018, steel)
        rod((0.1, y, 0.55), (0.9, y, 0.55), 0.02, mat(0xF2C46D, 1.0, 0.5))


def training_manikin():
    box(0.08, 0.2, 0.3, 0.92, 0.8, 0.34, mat(0xE8DCC6))
    for x in (0.12, 0.88):
        for y in (0.24, 0.76):
            box(x - 0.015, y - 0.015, 0, x + 0.015, y + 0.015, 0.3, mat(STEEL))
    skin = mat(0xF1D3B8, 1.0, 0.5)
    blob(0.25, 0.5, 0.39, 0.07, 0.07, 0.05, skin)  # head
    rbox(0.32, 0.38, 0.34, 0.66, 0.62, 0.42, mat(0x5A87C9), 0.04)  # torso in a training vest
    for y in (0.44, 0.56):
        rod((0.66, y, 0.37), (0.86, y, 0.37), 0.03, mat(0x2F3A48))
    box(0.4, 0.62, 0.34, 0.5, 0.7, 0.36, mat(0xE5484D))  # AED pad case


def care_van():
    body = mat(0xF4F6F8, 1.0, 0.3)
    rbox(0.18, 0.06, 0.06, 0.82, 0.94, 0.6, body, 0.05)
    rbox(0.2, 0.7, 0.4, 0.8, 0.9, 0.58, mat(0x5C7A99, 1.0, 0.1), 0.02)  # windscreen
    box(0.181, 0.2, 0.24, 0.183, 0.6, 0.32, mat(0x3F7F9A))
    box(0.817, 0.2, 0.24, 0.819, 0.6, 0.32, mat(0x3F7F9A))
    box(0.47, 0.3, 0.6, 0.53, 0.5, 0.62, mat(0xE5484D))
    for x in (0.2, 0.8):
        for y in (0.22, 0.78):
            bpy.ops.mesh.primitive_cylinder_add(radius=0.08, depth=0.06, location=(x, -y, 0.08), rotation=(0, math.pi / 2, 0))
            bpy.context.object.data.materials.append(mat(DARK))


EQUIPMENT = {
    "care_bed": care_bed, "call_system": call_system, "feeding_pump": feeding_pump, "suction_unit": suction_unit,
    "vital_monitor": vital_monitor, "sensory_kit": sensory_kit, "rehab_frame": rehab_frame, "door_sensor": door_sensor,
    "nurse_desk": nurse_desk, "reception_desk": reception_desk, "exam_desk": exam_desk, "office_desk": office_desk,
    "med_cart": med_cart, "lockers": lockers, "rest_sofa": rest_sofa, "whiteboard": whiteboard,
    "waiting_chairs": waiting_chairs, "medicine_shelf": medicine_shelf, "dining_table": dining_table, "washer": washer,
    "storage_rack": storage_rack, "bath_set": bath_set, "exercise_mat": exercise_mat, "parallel_bars": parallel_bars,
    "training_manikin": training_manikin, "care_van": care_van,
}

# ---------------------------------------------------------------- people
# Chibi proportions to match the game's figures: about 1.4 units tall with a big head.

SKIN = (0xF1C9A5, 0xD9A77F, 0xE8B98F)


def person(top, bottom, hair, skin=SKIN[0], style="short", coat=None, hat=None, extra=None, grey=False, shoes=DARK, apron=None):
    cx, cy = 0.5, 0.5
    sk = mat(skin, 1.0, 0.6)
    lo = mat(bottom, 1.0, 0.8)
    # legs and shoes
    for dx in (-0.065, 0.065):
        cyl(cx + dx, cy, 0.06, 0.4, 0.05, lo)
        blob(cx + dx, cy - 0.02, 0.04, 0.055, 0.075, 0.04, mat(shoes, 1.0, 0.4))
    # torso
    up = mat(top, 1.0, 0.8)
    blob(cx, cy, 0.58, 0.15, 0.11, 0.22, up)
    if skirt := (style in ("bun", "long", "elder_f", "student_f")):
        bpy.ops.mesh.primitive_cone_add(radius1=0.15, radius2=0.12, depth=0.2, location=(cx, -cy, 0.36))
        bpy.context.object.data.materials.append(lo)
    if coat:
        cm = mat(coat, 1.0, 0.7)
        bpy.ops.mesh.primitive_cone_add(radius1=0.17, radius2=0.14, depth=0.42, location=(cx, -cy, 0.5))
        o = bpy.context.object
        o.scale = (1.0, 0.8, 1.0)
        o.data.materials.append(cm)
        box(cx - 0.04, cy + 0.05, 0.36, cx + 0.04, cy + 0.125, 0.72, up)  # shirt showing at the front
    if apron:
        box(cx - 0.11, cy + 0.07, 0.36, cx + 0.11, cy + 0.12, 0.66, mat(apron, 1.0, 0.8))
    # arms
    for s in (-1, 1):
        rod((cx + s * 0.15, cy, 0.72), (cx + s * 0.2, cy + 0.02, 0.46), 0.045, mat(coat, 1.0, 0.7) if coat else up)
        blob(cx + s * 0.205, cy + 0.025, 0.42, 0.04, 0.04, 0.045, sk)
    # head
    hz = 1.0
    blob(cx, cy, hz, 0.21, 0.19, 0.2, sk)
    for dx in (-0.075, 0.075):
        blob(cx + dx, cy + 0.17, hz - 0.01, 0.024, 0.012, 0.032, mat(0x2B2522, 1.0, 0.3))
        blob(cx + dx + 0.008, cy + 0.178, hz + 0.008, 0.008, 0.005, 0.009, mat(0xFFFFFF, 1.0, 0.2))  # catch-light
        rod((cx + dx - 0.03, cy + 0.165, hz + 0.06), (cx + dx + 0.03, cy + 0.165, hz + 0.065), 0.008, mat(0x3A2A22, 1.0, 0.6))  # brow
        blob(cx + dx * 1.35, cy + 0.15, hz - 0.08, 0.03, 0.01, 0.018, mat(0xF2A6A0, 1.0, 0.7))  # cheeks
    blob(cx, cy + 0.18, hz - 0.1, 0.03, 0.008, 0.01, mat(0xB5654F, 1.0, 0.5))  # smile
    hm = mat(hair, 1.0, 0.6)
    blob(cx, cy - 0.025, hz + 0.05, 0.225, 0.2, 0.19, hm)  # hair cap, a touch back and up
    if style in ("bun", "elder_f"):
        blob(cx, cy - 0.17, hz + 0.12, 0.09, 0.08, 0.08, hm)
    if style in ("long", "student_f"):
        blob(cx, cy - 0.12, hz - 0.12, 0.2, 0.1, 0.18, hm)
    if hat == "nurse":
        box(cx - 0.11, cy - 0.04, hz + 0.19, cx + 0.11, cy + 0.08, hz + 0.27, mat(0xFFFFFF))
        box(cx - 0.02, cy + 0.081, hz + 0.21, cx + 0.02, cy + 0.083, hz + 0.25, mat(0x2F74D8))
    elif hat == "cap":
        cyl(cx, cy - 0.01, hz + 0.14, hz + 0.24, 0.2, mat(0x2B3A55))
        box(cx - 0.13, cy + 0.12, hz + 0.14, cx + 0.13, cy + 0.27, hz + 0.16, mat(0x1F2A3F))
    elif hat == "scrub":
        blob(cx, cy - 0.01, hz + 0.08, 0.215, 0.195, 0.16, mat(top, 1.0, 0.8))
    if extra == "stethoscope":
        bpy.ops.mesh.primitive_torus_add(major_radius=0.1, minor_radius=0.012, location=(cx, -cy - 0.07, 0.72), rotation=(math.radians(70), 0, 0))
        bpy.context.object.data.materials.append(mat(0x2B3A55))
    elif extra == "tie":
        box(cx - 0.02, cy + 0.11, 0.5, cx + 0.02, cy + 0.125, 0.74, mat(0xC0392B))
    elif extra == "clipboard":
        box(cx + 0.18, cy + 0.06, 0.42, cx + 0.28, cy + 0.08, 0.56, mat(0xA0623A))
        box(cx + 0.185, cy + 0.081, 0.43, cx + 0.275, cy + 0.083, 0.54, mat(0xFFFFFF))
    elif extra == "cane":
        rod((cx + 0.24, cy + 0.06, 0.0), (cx + 0.22, cy + 0.04, 0.46), 0.014, mat(0x7A4F2E))
    elif extra == "mop":
        rod((cx + 0.26, cy + 0.04, 0.02), (cx + 0.22, cy + 0.02, 0.95), 0.013, mat(0xB9C0C8))
        blob(cx + 0.26, cy + 0.04, 0.03, 0.08, 0.05, 0.03, mat(0x6FC3F2))
    elif extra == "badge":
        box(cx + 0.05, cy + 0.11, 0.66, cx + 0.11, cy + 0.125, 0.72, mat(0xFFD166, 1.0, 0.3))
    elif extra == "book":
        box(cx - 0.28, cy + 0.0, 0.42, cx - 0.19, cy + 0.1, 0.55, mat(0x2F74D8))


def wheelchair_rider():
    steel = mat(0x5D6670, 1.0, 0.35)
    cx, cy = 0.5, 0.5
    for s in (-1, 1):  # big rear wheels, small casters in front
        bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.02, location=(cx + s * 0.2, -(cy - 0.05), 0.21), rotation=(0, math.pi / 2, 0))
        bpy.context.object.data.materials.append(steel)
        sphere(cx + s * 0.16, cy + 0.24, 0.04, 0.04, mat(DARK))
    rbox(cx - 0.17, cy - 0.12, 0.3, cx + 0.17, cy + 0.18, 0.34, mat(0x2F3A48), 0.02)  # seat
    rbox(cx - 0.17, cy - 0.16, 0.34, cx + 0.17, cy - 0.12, 0.72, mat(0x2F3A48), 0.02)  # back
    for s in (-1, 1):
        rod((cx + s * 0.18, cy - 0.16, 0.72), (cx + s * 0.18, cy - 0.24, 0.8), 0.014, steel)  # push handles
    # the rider: grandfather, seated
    sk = mat(SKIN[0], 1.0, 0.6)
    blob(cx, cy - 0.04, 0.55, 0.14, 0.11, 0.2, mat(0xDCE6F0, 1.0, 0.8))
    for dx in (-0.065, 0.065):
        rod((cx + dx, cy, 0.37), (cx + dx, cy + 0.18, 0.37), 0.05, mat(0x8D7A64))
        rod((cx + dx, cy + 0.2, 0.37), (cx + dx, cy + 0.22, 0.1), 0.045, mat(0x8D7A64))
        blob(cx + dx, cy + 0.25, 0.06, 0.05, 0.07, 0.035, mat(DARK))
    rbox(cx - 0.13, cy + 0.04, 0.36, cx + 0.13, cy + 0.2, 0.42, mat(0x9FCFC3, 1.0, 0.9), 0.03)  # blanket
    for s in (-1, 1):
        rod((cx + s * 0.15, cy - 0.04, 0.68), (cx + s * 0.17, cy + 0.08, 0.44), 0.042, mat(0xDCE6F0, 1.0, 0.8))
    hz = 0.92
    blob(cx, cy - 0.04, hz, 0.2, 0.18, 0.19, sk)
    for dx in (-0.07, 0.07):
        blob(cx + dx, cy + 0.12, hz - 0.01, 0.022, 0.012, 0.03, mat(0x2B2522, 1.0, 0.3))
    blob(cx, cy - 0.07, hz + 0.06, 0.215, 0.19, 0.17, mat(0xD8D8D4, 1.0, 0.6))


def kid():
    """A schoolchild: the same figure in a school uniform, scaled down."""
    person(0xFFFFFF, 0x2B3A55, 0x2B2522, extra="book")
    bpy.context.view_layer.update()
    k = Matrix.Translation((0.5, -0.5, 0)) @ Matrix.Scale(0.72, 4) @ Matrix.Translation((-0.5, 0.5, 0))
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and not o.is_shadow_catcher:
            o.matrix_world = k @ o.matrix_world


PEOPLE = {
    "nurse": lambda: person(0xFFFFFF, 0xFFFFFF, 0x2B2522, style="bun", hat="nurse", shoes=0xFFFFFF, extra="badge"),
    "caregiver": lambda: person(0xF08AA8, 0xD9728F, 0x3A2A22, style="bun", extra="badge"),
    "pt": lambda: person(0x1E9E6A, 0x2F3A48, 0x2B2522, SKIN[1], extra="clipboard"),
    "ot": lambda: person(0x2F9AA0, 0x2F3A48, 0x4A3426, style="long", extra="badge"),
    "doctor": lambda: person(0x7FB8E8, 0x2F3A48, 0x2B2522, coat=0xFFFFFF, extra="stethoscope"),
    "pharmacist": lambda: person(0x6FB7AC, 0x3A4656, 0x2B2522, style="bun", coat=0xFFFFFF),
    "nutritionist": lambda: person(0xFFFFFF, 0x3A4656, 0x4A3426, style="long", apron=0xF29E4C),
    "cleaner": lambda: person(0x5F8F9A, 0x3A4656, 0x2B2522, SKIN[1], style="scrub", hat="scrub", extra="mop"),
    "receptionist": lambda: person(0x6A4FDC, 0x2B2F3A, 0x2B2522, style="long", extra="badge"),
    "security": lambda: person(0x2B3A55, 0x1F2A3F, 0x2B2522, SKIN[1], hat="cap", extra="badge"),
    "accountant": lambda: person(0xF4F6F8, 0x2F3A48, 0x2B2522, extra="tie"),
    "owner_m": lambda: person(0xF4F6F8, 0x2B3A55, 0x2B2522, coat=0x2B3A55, extra="tie"),
    "owner_f": lambda: person(0xF4F6F8, 0x7A4F6A, 0x2B2522, style="long", coat=0x7A4F6A),
    "student": lambda: person(0xFFFFFF, 0x1F2A3F, 0x2B2522, extra="book"),
    "elder_f": lambda: person(0xE8A3B8, 0x7A4F6A, 0xD8D8D4, style="elder_f", shoes=0x8A5A3C),
    "elder_m": lambda: person(0xDCE6F0, 0x8D7A64, 0xD8D8D4, extra="cane", shoes=0x8A5A3C),
    "resident": lambda: person(0x9FCFE0, 0x9FCFE0, 0xD8D8D4, shoes=0xF4F2EC),
    "wheelchair": wheelchair_rider,
    "jogger": lambda: person(0xF29E4C, 0x2F3A48, 0x2B2522, SKIN[1], shoes=0xFFFFFF),
    "kid": kid,
}


def turn_round():
    """Turn everything in the scene (but the camera, light and shadow plane) half round the tile centre."""
    bpy.context.view_layer.update()  # objects made last still have a stale world matrix
    r = Matrix.Translation((0.5, -0.5, 0)) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation((-0.5, 0.5, 0))
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and not o.is_shadow_catcher:
            o.matrix_world = r @ o.matrix_world


def render(name, build, res, shadow=True):
    for side in ("s", "n"):
        full = f"{name}_{side}"
        if ONLY and full not in ONLY and name not in ONLY:
            continue
        ra.setup(1, 1, res)
        if not shadow:  # people get a drawn shadow in the game, which moves with them
            for o in [o for o in bpy.context.scene.objects if o.type == "MESH" and o.is_shadow_catcher]:
                bpy.data.objects.remove(o)
        build()
        if side == "n":
            turn_round()
        bpy.context.scene.render.filepath = f"{OUT}/{full}.png"
        bpy.ops.render.render(write_still=True)
        print("rendered", full)


if __name__ == "__main__":
    for k, f in EQUIPMENT.items():
        render(f"eq3_{k}", f, 320)
    for k, f in PEOPLE.items():
        render(f"ch3_{k}", f, 300, shadow=False)
