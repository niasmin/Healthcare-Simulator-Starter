"""
Render the town around the home with Blender (headless): neighbours' houses, shophouses, a
convenience store, a cafe and a small temple (2 x 2 plots), traffic, and street furniture, on
the same camera as the home's buildings.

    blender -b --python tools/blender/render_town.py -- <out_dir> [only_name ...]

Town buildings (tw_*) render at density 1 like the home's buildings. Vehicles (car3_*) and
street furniture (st3_*) render at density 2; vehicles come in two views like the equipment
(_s nose toward game south, _n turned round) and the game mirrors them for east and west.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_assets as ra  # noqa: E402
import render_props as rp  # noqa: E402
from render_assets import STOREY, box, mat, prism, pyramid, sphere  # noqa: E402
from render_props import blob, cyl, rbox, rod  # noqa: E402

GLASS = 0x7FB4CC
FRAME = 0xF4F1EA
DARK = 0x3A3F46
GOLD = 0xE0B23C


def front_windows(x0, y0, x1, y1, z0, height, glass=GLASS, frame=FRAME, step=0.5, sill=True):
    """A row of windows on the two faces toward the viewer (y = y1 and x = x1)."""
    g, f = mat(glass, 1.0, 0.15), mat(frame, 1.0, 0.5)
    n = max(1, round((x1 - x0) / step))
    for i in range(n):
        a = x0 + (x1 - x0) * (i + 0.2) / n
        b = x0 + (x1 - x0) * (i + 0.8) / n
        box(a - 0.02, y1 - 0.01, z0 - 0.02, b + 0.02, y1 + 0.025, z0 + height + 0.02, f)
        box(a, y1, z0, b, y1 + 0.035, z0 + height, g)
        if sill:
            box(a - 0.03, y1, z0 - 0.05, b + 0.03, y1 + 0.07, z0 - 0.02, f)
    n = max(1, round((y1 - y0) / step))
    for j in range(n):
        a = y0 + (y1 - y0) * (j + 0.2) / n
        b = y0 + (y1 - y0) * (j + 0.8) / n
        box(x1 - 0.01, a - 0.02, z0 - 0.02, x1 + 0.025, b + 0.02, z0 + height + 0.02, f)
        box(x1, a, z0, x1 + 0.035, b, z0 + height, g)
        if sill:
            box(x1, a - 0.03, z0 - 0.05, x1 + 0.07, b + 0.03, z0 - 0.02, f)


def hip_roof(x0, y0, x1, y1, z0, rise, m, eave=0.12):
    """A hipped roof: four slopes up to a short ridge along the longer side."""
    x0, y0, x1, y1 = x0 - eave, y0 - eave, x1 + eave, y1 + eave
    xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
    inset = min(x1 - x0, y1 - y0) / 2
    if x1 - x0 >= y1 - y0:
        r0, r1 = (x0 + inset, ym), (x1 - inset, ym)
    else:
        r0, r1 = (xm, y0 + inset), (xm, y1 - inset)
    verts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (r0[0], r0[1], z0 + rise), (r1[0], r1[1], z0 + rise)]
    if x1 - x0 >= y1 - y0:
        faces = [(0, 1, 5, 4), (2, 3, 4, 5), (3, 0, 4), (1, 2, 5), (0, 3, 2, 1)]
    else:
        faces = [(1, 2, 5, 4), (3, 0, 4, 5), (0, 1, 4), (2, 3, 5), (0, 3, 2, 1)]
    me = bpy.data.meshes.new("hip")
    me.from_pydata([(x, -y, z) for x, y, z in verts], [], faces)
    o = bpy.data.objects.new("hip", me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def door(x, y1, w, h, m=0x8A5A3C):
    box(x - 0.02, y1 - 0.01, 0, x + w + 0.02, y1 + 0.03, h + 0.03, mat(FRAME))
    box(x, y1, 0, x + w, y1 + 0.04, h, mat(m, 1.0, 0.5))


def bushes(points, big=0.14):
    greens = [mat(0x4F8A45), mat(0x5F9E4E), mat(0x6FB05A)]
    for k, (x, y) in enumerate(points):
        sphere(x, y, big * 0.8, big + 0.03 * (k % 2), greens[k % 3])


def yard_tree(x, y, s=1.0):
    cyl(x, y, 0, 0.55 * s, 0.035 * s, mat(0x7A5234))
    for dx, dy, dz, r in ((0, 0, 0.75, 0.26), (-0.12, 0.06, 0.62, 0.2), (0.12, -0.05, 0.66, 0.2)):
        sphere(x + dx * s, y + dy * s, dz * s, r * s, mat(0x5F9E4E if r > 0.21 else 0x4F8A45))


# ---------------------------------------------------------------- buildings (2 x 2 plots)


def house_two_storey(roof, wall):
    H = STOREY * 1.55
    box(0.12, 0.12, 0, 1.88, 1.88, 0.08, mat(0xD9D2BF))  # plinth
    box(0.2, 0.2, 0.08, 1.8, 1.8, H, mat(wall, 1.0, 0.8))
    box(0.18, 0.18, STOREY * 0.78, 1.82, 1.82, STOREY * 0.78 + 0.05, mat(0xFFFFFF))  # floor band
    front_windows(0.2, 0.2, 1.8, 1.8, 0.32, 0.38)
    front_windows(0.2, 0.2, 1.8, 1.8, STOREY * 0.78 + 0.22, 0.38)
    door(0.55, 1.8, 0.28, 0.6)
    # a small porch roof over the door
    box(0.45, 1.8, 0.72, 0.95, 2.02, 0.75, mat(roof, 0.9))
    for x in (0.47, 0.93):
        box(x - 0.015, 1.98, 0.08, x + 0.015, 2.01, 0.72, mat(FRAME))
    hip_roof(0.2, 0.2, 1.8, 1.8, H, 0.7, mat(roof, 1.0, 0.55))
    # AC unit on the side wall
    rbox(1.81, 0.5, 0.9, 1.92, 0.78, 1.08, mat(0xEEF1F4), 0.01)
    bushes([(0.3, 1.95), (1.2, 1.95), (1.95, 1.3), (1.95, 0.4)])


def house_bungalow(roof, wall):
    H = STOREY * 0.9
    box(0.1, 0.1, 0, 1.9, 1.9, 0.12, mat(0xD9D2BF))
    box(0.25, 0.2, 0.12, 1.75, 1.4, H, mat(wall, 1.0, 0.8))
    front_windows(0.25, 0.2, 1.75, 1.4, 0.4, 0.4)
    door(0.9, 1.4, 0.3, 0.68)
    # a deep veranda on posts at the front, gable roof over all
    box(0.15, 1.4, 0.12, 1.85, 1.9, 0.15, mat(0xC9A06A))
    for x in (0.2, 1.0, 1.8):
        box(x - 0.025, 1.83, 0.15, x + 0.025, 1.88, H, mat(FRAME))
    prism(0.05, 0.05, 1.95, 2.0, H, 0.75, True, mat(roof, 1.0, 0.55))
    # pots and a bench on the veranda
    rbox(1.25, 1.55, 0.15, 1.65, 1.68, 0.33, mat(0x8A5A3C), 0.01)
    for x in (0.3, 0.6):
        cyl(x, 1.75, 0.15, 0.27, 0.06, mat(0xC97A4A))
        sphere(x, 1.75, 0.33, 0.1, mat(0x5F9E4E))
    yard_tree(1.95, 0.35, 0.9)


def shophouse(awning, wall, sign):
    """A three-storey Thai shophouse (tuek thaew): shutters below, balconies above, a sign band."""
    S = STOREY * 0.8
    H = S * 3.15
    box(0.05, 0.05, 0, 1.95, 1.95, H, mat(wall, 1.0, 0.8))
    box(0.0, 0.0, H, 2.0, 2.0, H + 0.12, mat(wall, 0.92))  # parapet
    box(0.1, 0.1, H, 1.9, 1.9, H + 0.07, mat(0xB9B3A6))
    for face in (0, 1):  # two shop units on each face toward the viewer
        for k in range(2):
            if face == 0:
                x0, x1 = 0.1 + k * 0.92, 0.9 + k * 0.92
                for s in range(9):  # rolling shutter slats
                    box(x0, 1.95, 0.04 + s * 0.07, x1, 1.97, 0.08 + s * 0.07, mat(0xC9CDD2 if s % 2 else 0xB4B9BF))
                box(x0 - 0.02, 1.95, 0.7, x1 + 0.02, 2.05, 0.86, mat(sign[(k + face) % len(sign)], 1.0, 0.5, 0.15))  # sign
            else:
                y0, y1 = 0.1 + k * 0.92, 0.9 + k * 0.92
                if k == 1:  # open shop: glass front and goods
                    box(1.95, y0, 0.04, 1.97, y1, 0.66, mat(GLASS, 1.0, 0.15))
                    for b in range(4):
                        box(1.97, y0 + 0.1 + b * 0.17, 0.05, 2.05, y0 + 0.22 + b * 0.17, 0.2 + (b % 2) * 0.1, mat((0xF2C46D, 0xE5484D, 0x6FC3F2, 0x6FD39A)[b]))
                else:
                    for s in range(9):
                        box(1.95, y0, 0.04 + s * 0.07, 1.97, y1, 0.08 + s * 0.07, mat(0xC9CDD2 if s % 2 else 0xB4B9BF))
                box(1.95, y0 - 0.02, 0.7, 2.05, y1 + 0.02, 0.86, mat(sign[(k + 1) % len(sign)], 1.0, 0.5, 0.15))
    # awning over the pavement
    box(0.0, 1.95, 0.86, 2.0, 2.28, 0.9, mat(awning, 1.0, 0.7))
    box(1.95, 0.0, 0.86, 2.28, 2.0, 0.9, mat(awning, 0.9, 0.7))
    for f in (1, 2):
        z = S * f + 0.2
        front_windows(0.05, 0.05, 1.95, 1.95, z, 0.42, step=0.66, sill=False)
        box(0.05, 1.95, z - 0.12, 1.95, 2.12, z - 0.08, mat(0xE9E4DA))  # balcony slab
        for i in range(11):
            box(0.07 + i * 0.18, 2.09, z - 0.08, 0.09 + i * 0.18, 2.11, z + 0.1, mat(0xE9E4DA))
        box(0.05, 2.09, z + 0.1, 1.95, 2.12, z + 0.13, mat(0xE9E4DA))
        for x in (0.3, 1.3):
            sphere(x, 2.05, z - 0.02, 0.08, mat(0x5F9E4E))
        rbox(1.96, 1.2, z + 0.05, 2.06, 1.45, z + 0.2, mat(0xEEF1F4), 0.01)  # AC units
    # water tank on the roof
    cyl(0.5, 0.5, H + 0.07, H + 0.4, 0.17, mat(0x5C8FB8, 1.0, 0.4))


def convenience_store():
    H = STOREY * 1.05
    box(0.05, 0.05, 0, 1.95, 1.95, 0.06, mat(0xD9D2BF))
    box(0.15, 0.15, 0.06, 1.8, 1.8, H, mat(0xF4F6F8, 1.0, 0.5))
    box(0.13, 0.13, H, 1.82, 1.82, H + 0.12, mat(0xF4F6F8))
    # glass front on both faces and coloured stripes along the fascia (generic, no brand)
    box(0.2, 1.8, 0.08, 1.75, 1.83, 0.7, mat(GLASS, 1.0, 0.1, 0.25))
    box(1.8, 0.2, 0.08, 1.83, 1.75, 0.7, mat(GLASS, 1.0, 0.1, 0.25))
    for k, c in enumerate((0xE5484D, 0xF29E4C, 0x1E9E6A)):
        z = H - 0.06 - k * 0.08
        box(0.12, 1.8, z - 0.06, 1.85, 1.86, z, mat(c, 1.0, 0.5))
        box(1.8, 0.12, z - 0.06, 1.86, 1.85, z, mat(c, 1.0, 0.5))
    # shelves seen through the glass
    for x in (0.5, 1.0, 1.45):
        box(x, 1.2, 0.08, x + 0.25, 1.35, 0.5, mat((0xF2C46D, 0x6FC3F2, 0xF08AA8)[int(x * 2) % 3]))
    # ice chest and a bench outside
    rbox(1.88, 1.2, 0.0, 2.05, 1.6, 0.3, mat(0x2F74D8), 0.02)
    rbox(0.4, 1.9, 0.0, 0.9, 2.02, 0.2, mat(0x8A5A3C), 0.01)
    box(1.4, 1.83, 0.08, 1.7, 1.86, 0.7, mat(FRAME))
    rbox(1.2, 0.3, H + 0.12, 1.6, 0.7, H + 0.35, mat(0xDDE3EA), 0.02)  # AC plant on the roof


def cafe():
    H = STOREY * 0.95
    box(0.05, 0.05, 0, 1.95, 1.95, 0.08, mat(0xC9A06A))  # wooden deck
    box(0.2, 0.2, 0.08, 1.3, 1.3, H, mat(0x9C6B45, 1.0, 0.7))
    front_windows(0.2, 0.2, 1.3, 1.3, 0.22, 0.5, frame=0x5A3E28, step=0.36, sill=False)
    prism(0.1, 0.1, 1.4, 1.4, H, 0.5, False, mat(0x3F5F4A, 1.0, 0.55))
    box(0.4, 1.3, H - 0.25, 1.1, 1.36, H - 0.08, mat(0xF4EEE2, 1.0, 0.4, 0.2))  # sign board
    # terrace tables with umbrellas
    for x, y, c in ((1.65, 0.55, 0xE5484D), (1.65, 1.55, 0xF2C46D), (0.6, 1.7, 0x2F9AA0)):
        cyl(x, y, 0.08, 0.32, 0.015, mat(DARK))
        cyl(x, y, 0.32, 0.34, 0.13, mat(0xFFFFFF))
        cyl(x, y, 0.34, 0.95, 0.012, mat(0xEEEEEE))
        bpy.ops.mesh.primitive_cone_add(radius1=0.3, radius2=0.0, depth=0.16, location=(x, -y, 1.0), vertices=8)
        bpy.context.object.data.materials.append(mat(c, 1.0, 0.7))
        for dx, dy in ((0.18, 0), (-0.18, 0)):
            rbox(x + dx - 0.05, y + dy - 0.05, 0.08, x + dx + 0.05, y + dy + 0.05, 0.22, mat(0x8A5A3C), 0.01)
    for x in (0.25, 1.95):
        cyl(x, 1.95, 0.08, 0.2, 0.06, mat(0xC97A4A))
        sphere(x, 1.95, 0.28, 0.1, mat(0x5F9E4E))


def temple():
    """A small Thai temple hall: white base, tiered red roof with gold bargeboards and chofa."""
    white, red, green, gold = mat(0xF6F1E6, 1.0, 0.6), mat(0xB8452F, 1.0, 0.45), mat(0x3F7F5A, 1.0, 0.45), mat(GOLD, 1.0, 0.3)
    box(0.0, 0.0, 0, 2.0, 2.0, 0.22, white)  # raised base
    box(0.05, 0.05, 0.22, 1.95, 1.95, 0.26, mat(0xD9D2BF))
    box(0.3, 0.35, 0.26, 1.7, 1.65, 1.15, white)
    for k in range(3):  # tall arched windows and the door, gold frames
        x = 0.5 + k * 0.42
        box(x - 0.03, 1.65, 0.42, x + 0.17, 1.68, 0.95, gold)
        box(x, 1.66, 0.45, x + 0.14, 1.69, 0.92, mat(0x8A2E22))
    for j in range(3):
        y = 0.55 + j * 0.38
        box(1.7, y - 0.03, 0.42, 1.73, y + 0.17, 0.95, gold)
        box(1.71, y, 0.45, 1.74, y + 0.14, 0.92, mat(0x8A2E22))
    # columns along the front
    for x in (0.32, 1.0, 1.68):
        box(x - 0.04, 1.7, 0.26, x + 0.04, 1.78, 1.12, white)
    # tiered roof: two overlapping gables, ridge along y
    prism(0.15, 0.1, 1.85, 1.9, 1.12, 0.62, False, red)
    prism(0.32, 0.0, 1.68, 2.0, 1.38, 0.6, False, red)
    prism(0.45, 0.25, 1.55, 1.75, 1.6, 0.6, False, green)
    for y in (0.0, 2.0):  # gold bargeboards and chofa finials at the gable ends
        for s in (-1, 1):
            rod((1.0, y, 1.98), (1.0 + s * 0.68, y, 1.38), 0.025, gold)
        box(0.97, y - 0.03, 1.98, 1.03, y + 0.03, 2.28, gold)
        bpy.ops.mesh.primitive_cone_add(radius1=0.05, radius2=0.0, depth=0.18, location=(1.0, -y, 2.36))
        bpy.context.object.data.materials.append(gold)
    # steps and two naga balustrades
    for k in range(3):
        box(0.85, 2.0 + k * 0.06, 0.22 - (k + 1) * 0.07, 1.15, 2.08 + k * 0.06, 0.22 - k * 0.07, white)
    for x in (0.82, 1.18):
        rod((x, 2.0, 0.3), (x, 2.2, 0.08), 0.03, gold)
    bushes([(0.1, 2.05), (1.9, 2.05), (2.05, 0.4), (2.05, 1.6)], 0.12)


# ---------------------------------------------------------------- vehicles (one tile, nose toward +y)


def wheel(x, y, r=0.085, w=0.06):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=w, location=(x, -y, r), rotation=(0, math.pi / 2, 0), vertices=16)
    o = bpy.context.object
    o.data.materials.append(mat(0x24272B, 1.0, 0.8))
    bpy.ops.mesh.primitive_cylinder_add(radius=r * 0.5, depth=w + 0.005, location=(x, -y, r), rotation=(0, math.pi / 2, 0), vertices=12)
    bpy.context.object.data.materials.append(mat(0xB9C0C8, 1.0, 0.3))


def lights(y_front, y_back, x0, x1, z):
    for x in (x0 + 0.04, x1 - 0.04):
        box(x - 0.03, y_front, z - 0.025, x + 0.03, y_front + 0.012, z + 0.025, mat(0xFFF2C4, 1.0, 0.2, 1.5))
        box(x - 0.03, y_back - 0.012, z - 0.025, x + 0.03, y_back, z + 0.025, mat(0xE5484D, 1.0, 0.3, 0.8))


def sedan(color):
    body = mat(color, 1.0, 0.25)
    rbox(0.3, 0.06, 0.08, 0.7, 0.94, 0.3, body, 0.05)
    rbox(0.32, 0.3, 0.29, 0.68, 0.72, 0.48, body, 0.05)
    glass = mat(0x2E3F4F, 1.0, 0.08)
    box(0.335, 0.72, 0.31, 0.665, 0.74, 0.46, glass)  # windscreen
    box(0.335, 0.28, 0.31, 0.665, 0.3, 0.46, glass)
    box(0.315, 0.34, 0.32, 0.325, 0.68, 0.45, glass)
    box(0.675, 0.34, 0.32, 0.685, 0.68, 0.45, glass)
    for x in (0.3, 0.7):
        for y in (0.22, 0.78):
            wheel(x, y)
    lights(0.94, 0.06, 0.3, 0.7, 0.22)


def pickup(color):
    body = mat(color, 1.0, 0.3)
    rbox(0.3, 0.04, 0.1, 0.7, 0.96, 0.32, body, 0.04)
    rbox(0.31, 0.5, 0.31, 0.69, 0.82, 0.54, body, 0.04)  # cab at the front
    glass = mat(0x2E3F4F, 1.0, 0.08)
    box(0.33, 0.82, 0.34, 0.67, 0.835, 0.52, glass)
    box(0.305, 0.55, 0.35, 0.315, 0.78, 0.51, glass)
    box(0.685, 0.55, 0.35, 0.695, 0.78, 0.51, glass)
    box(0.32, 0.06, 0.32, 0.68, 0.48, 0.34, mat(0x2B2F35))  # bed floor
    for x in (0.3, 0.68):
        box(x, 0.06, 0.32, x + 0.02, 0.48, 0.42, body)
    box(0.3, 0.04, 0.32, 0.7, 0.07, 0.42, body)
    for k, c in enumerate((0x8FB8A8, 0xC9A06A)):  # a load in the back
        rbox(0.36 + k * 0.15, 0.12 + k * 0.1, 0.34, 0.5 + k * 0.15, 0.3 + k * 0.1, 0.48, mat(c), 0.01)
    for x in (0.3, 0.7):
        for y in (0.2, 0.78):
            wheel(x, y, 0.095)
    lights(0.96, 0.04, 0.3, 0.7, 0.24)


def songthaew():
    """A red songthaew: a pickup with a roofed bench cabin on the back."""
    red = mat(0xC0392B, 1.0, 0.3)
    pickup(0xC0392B)
    for x in (0.31, 0.69):
        for y in (0.08, 0.46):
            box(x - 0.012, y - 0.012, 0.34, x + 0.012, y + 0.012, 0.66, mat(0xDDDDDD))
    rbox(0.29, 0.04, 0.66, 0.71, 0.5, 0.7, red, 0.02)
    for x in (0.34, 0.66):
        box(x - 0.03, 0.1, 0.34, x + 0.03, 0.44, 0.4, mat(0x8A5A3C))


def tuk_tuk():
    blue, yellow = mat(0x2F5FA8, 1.0, 0.3), mat(0xF2C230, 1.0, 0.5)
    rbox(0.36, 0.55, 0.08, 0.64, 0.92, 0.3, blue, 0.04)  # front nose
    rbox(0.3, 0.1, 0.1, 0.7, 0.58, 0.28, blue, 0.04)  # passenger tub
    rbox(0.32, 0.12, 0.28, 0.68, 0.5, 0.36, mat(0xC0392B, 1.0, 0.8), 0.03)  # bench
    rbox(0.32, 0.12, 0.36, 0.68, 0.18, 0.5, mat(0xC0392B, 1.0, 0.8), 0.02)
    for x in (0.31, 0.69):
        for y in (0.12, 0.62):
            box(x - 0.012, y - 0.012, 0.28, x + 0.012, y + 0.012, 0.66, mat(0xB9C0C8))
    rbox(0.28, 0.08, 0.66, 0.72, 0.7, 0.71, yellow, 0.03)  # canopy
    box(0.28, 0.08, 0.58, 0.72, 0.7, 0.66, mat(0x2F5FA8, 0.9))
    box(0.36, 0.62, 0.3, 0.64, 0.64, 0.56, mat(0x2E3F4F, 1.0, 0.08))
    wheel(0.5, 0.82, 0.075)
    for x in (0.3, 0.7):
        wheel(x, 0.24, 0.085)
    box(0.47, 0.92, 0.18, 0.53, 0.93, 0.24, mat(0xFFF2C4, 1.0, 0.2, 1.5))


def ambulance():
    white, red = mat(0xF4F6F8, 1.0, 0.3), mat(0xE5484D, 1.0, 0.4)
    rbox(0.29, 0.04, 0.1, 0.71, 0.96, 0.66, white, 0.05)
    box(0.285, 0.1, 0.32, 0.715, 0.85, 0.38, red)  # stripe
    box(0.33, 0.8, 0.42, 0.67, 0.965, 0.62, mat(0x2E3F4F, 1.0, 0.08))
    box(0.47, 0.2, 0.42, 0.53, 0.5, 0.56, mat(0xFFFFFF))
    box(0.285, 0.3, 0.46, 0.29, 0.5, 0.52, red)  # cross on the side
    box(0.285, 0.37, 0.4, 0.29, 0.43, 0.58, red)
    box(0.715, 0.3, 0.46, 0.72, 0.5, 0.52, red)
    box(0.715, 0.37, 0.4, 0.72, 0.43, 0.58, red)
    box(0.36, 0.7, 0.66, 0.64, 0.8, 0.71, mat(0x4A90E2, 1.0, 0.2, 2.0))  # light bar
    box(0.36, 0.7, 0.66, 0.45, 0.8, 0.715, mat(0xE5484D, 1.0, 0.2, 2.0))
    for x in (0.29, 0.71):
        for y in (0.2, 0.8):
            wheel(x, y, 0.09)
    lights(0.96, 0.04, 0.29, 0.71, 0.24)


def motorbike(color):
    body = mat(color, 1.0, 0.3)
    for y in (0.25, 0.75):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.09, minor_radius=0.025, location=(0.5, -y, 0.11), rotation=(0, math.pi / 2, 0))
        bpy.context.object.data.materials.append(mat(0x24272B))
    rbox(0.45, 0.3, 0.14, 0.55, 0.7, 0.3, body, 0.03)
    rbox(0.44, 0.28, 0.3, 0.56, 0.55, 0.36, mat(0x2B2522), 0.03)  # seat
    rod((0.5, 0.72, 0.2), (0.5, 0.78, 0.45), 0.015, mat(0xB9C0C8))
    rod((0.38, 0.77, 0.45), (0.62, 0.77, 0.45), 0.012, mat(DARK))
    box(0.47, 0.79, 0.36, 0.53, 0.81, 0.42, mat(0xFFF2C4, 1.0, 0.2, 1.5))
    # rider
    sk = mat(rp.SKIN[0], 1.0, 0.6)
    blob(0.5, 0.45, 0.6, 0.1, 0.08, 0.15, mat(0x2F74D8, 1.0, 0.8))
    for dx in (-0.06, 0.06):
        rod((0.5 + dx, 0.45, 0.4), (0.5 + dx, 0.62, 0.36), 0.035, mat(0x2F3A48))
        rod((0.5 + dx * 1.6, 0.5, 0.7), (0.5 + dx * 2, 0.74, 0.47), 0.03, mat(0x2F74D8))
    blob(0.5, 0.48, 0.88, 0.13, 0.12, 0.13, sk)
    blob(0.5, 0.47, 0.93, 0.14, 0.13, 0.11, mat(0xF2C230, 1.0, 0.3))  # helmet


# ---------------------------------------------------------------- street furniture (one tile)


def power_pole():
    concrete = mat(0xB9B3A6, 1.0, 0.8)
    cyl(0.5, 0.5, 0, 1.75, 0.035, concrete, 10)
    for z in (1.62, 1.4):
        box(0.3, 0.48, z, 0.7, 0.52, z + 0.04, mat(0x8D97A1))  # cross-arms
        for x in (0.32, 0.5, 0.68):
            cyl(x, 0.5, z + 0.04, z + 0.09, 0.012, mat(0xEDEDED))
    # a coil of cable and a junction box, the way Thai poles always have one
    bpy.ops.mesh.primitive_torus_add(major_radius=0.08, minor_radius=0.012, location=(0.5, -0.56, 1.1), rotation=(math.pi / 2, 0, 0))
    bpy.context.object.data.materials.append(mat(0x24272B))
    box(0.46, 0.53, 0.75, 0.54, 0.58, 0.9, mat(0x8D97A1))
    box(0.47, 0.53, 0.2, 0.53, 0.55, 0.45, mat(0xF2C230))  # number plate


def street_lamp():
    steel = mat(0x5A6570, 1.0, 0.4)
    cyl(0.5, 0.5, 0, 0.08, 0.06, steel)
    cyl(0.5, 0.5, 0.08, 1.45, 0.022, steel)
    rod((0.5, 0.5, 1.45), (0.5, 0.75, 1.52), 0.016, steel)
    rbox(0.44, 0.7, 1.46, 0.56, 0.86, 1.52, steel, 0.01)
    box(0.46, 0.72, 1.45, 0.54, 0.84, 1.46, mat(0xFFF2C4, 1.0, 0.2, 3.0))


def bus_stop():
    steel = mat(0x8D97A1, 1.0, 0.4)
    for x in (0.08, 0.92):
        for y in (0.3, 0.6):
            box(x - 0.015, y - 0.015, 0, x + 0.015, y + 0.015, 0.85, steel)
    rbox(0.0, 0.22, 0.85, 1.0, 0.7, 0.9, mat(0x2F74D8, 1.0, 0.4), 0.02)
    box(0.08, 0.28, 0.25, 0.92, 0.3, 0.8, mat(0xCFE8F2, 1.0, 0.05))  # back panel
    rbox(0.15, 0.32, 0.22, 0.85, 0.45, 0.26, mat(0xC9A06A), 0.01)  # bench
    box(0.85, 0.62, 0, 0.88, 0.65, 1.05, steel)
    rbox(0.78, 0.6, 1.0, 0.96, 0.67, 1.14, mat(0x2F74D8), 0.01)
    box(0.8, 0.672, 1.03, 0.94, 0.675, 1.11, mat(0xFFFFFF))


def spirit_house():
    """A san phra phum on its pedestal, with garlands and offerings."""
    white, gold, red = mat(0xF6F1E6, 1.0, 0.5), mat(GOLD, 1.0, 0.3), mat(0xB8452F, 1.0, 0.45)
    rbox(0.35, 0.35, 0, 0.65, 0.65, 0.06, mat(0xD9D2BF), 0.01)
    cyl(0.5, 0.5, 0.06, 0.55, 0.05, white)
    box(0.32, 0.32, 0.55, 0.68, 0.68, 0.6, gold)
    box(0.38, 0.38, 0.6, 0.62, 0.62, 0.82, white)
    box(0.45, 0.62, 0.62, 0.55, 0.625, 0.78, mat(0x8A2E22))
    prism(0.33, 0.33, 0.67, 0.67, 0.82, 0.2, False, red)
    pyramid(0.5, 0.5, 0.06, 1.02, 0.14, gold)
    for k, c in enumerate((0xF2C230, 0xE5484D, 0xFFFFFF)):  # garlands and offerings
        sphere(0.38 + k * 0.12, 0.66, 0.58, 0.03, mat(c))
    cyl(0.6, 0.62, 0.6, 0.62, 0.04, mat(0xF29E4C))


def food_cart():
    rbox(0.22, 0.32, 0.18, 0.78, 0.68, 0.48, mat(0xC0392B, 1.0, 0.5), 0.02)
    box(0.24, 0.34, 0.48, 0.76, 0.66, 0.6, mat(0xCFE8F2, 1.0, 0.05))  # glass case
    for k, c in enumerate((0xF2C46D, 0xE59866, 0x6FB05A)):
        box(0.28 + k * 0.16, 0.4, 0.5, 0.38 + k * 0.16, 0.6, 0.55, mat(c))
    for x in (0.25, 0.75):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.1, minor_radius=0.018, location=(x, -0.5, 0.1), rotation=(0, math.pi / 2, 0))
        bpy.context.object.data.materials.append(mat(DARK))
    cyl(0.5, 0.5, 0.6, 1.2, 0.012, mat(0xDDDDDD))
    bpy.ops.mesh.primitive_cone_add(radius1=0.42, radius2=0.0, depth=0.2, location=(0.5, -0.5, 1.22), vertices=10)
    bpy.context.object.data.materials.append(mat(0xF2C230, 1.0, 0.7))
    cyl(0.88, 0.45, 0, 0.2, 0.07, mat(0x2F74D8))  # stool


TOWN = {
    "tw_house_a1": lambda: house_two_storey(0xC0634A, 0xF3EAD8),
    "tw_house_a2": lambda: house_two_storey(0x5F7F8F, 0xEFE6D2),
    "tw_house_a3": lambda: house_two_storey(0x4F8A70, 0xF6EFE2),
    "tw_house_b1": lambda: house_bungalow(0x9C5A3C, 0xF1E1CF),
    "tw_house_b2": lambda: house_bungalow(0x7D6AA0, 0xE9EEF2),
    "tw_shop_1": lambda: shophouse(0x2F9AA0, 0xEDE3CF, (0xC0392B, 0x2F74D8)),
    "tw_shop_2": lambda: shophouse(0xE5484D, 0xE2E8EA, (0xF2C230, 0x1E9E6A)),
    "tw_store": convenience_store,
    "tw_cafe": cafe,
    "tw_temple": temple,
}
VEHICLES = {
    "car3_sedan_red": lambda: sedan(0xD9534F),
    "car3_sedan_blue": lambda: sedan(0x2F6AA5),
    "car3_sedan_white": lambda: sedan(0xF2F2F2),
    "car3_sedan_teal": lambda: sedan(0x3F8F86),
    "car3_pickup_silver": lambda: pickup(0xB9C0C8),
    "car3_pickup_black": lambda: pickup(0x2B2F35),
    "car3_songthaew": songthaew,
    "car3_tuktuk": tuk_tuk,
    "car3_ambulance": ambulance,
    "car3_moto": lambda: motorbike(0xE5484D),
}
STREET = {
    "st3_pole": power_pole,
    "st3_lamp": street_lamp,
    "st3_busstop": bus_stop,
    "st3_spirit": spirit_house,
    "st3_cart": food_cart,
}

if __name__ == "__main__":
    for name, f in TOWN.items():
        ra.DENSITY = 1
        ra.render(name, 2, 2, f)
    ra.DENSITY = 2
    for name, f in VEHICLES.items():
        rp.render(name, f, 300)
    for name, f in STREET.items():
        if ra.ONLY and name not in ra.ONLY:
            continue
        ra.setup(1, 1, 360)
        f()
        bpy.context.scene.render.filepath = f"{ra.OUT}/{name}.png"
        bpy.ops.render.render(write_still=True)
        print("rendered", name)
