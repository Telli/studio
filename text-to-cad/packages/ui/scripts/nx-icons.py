#!/usr/bin/env python3
"""Studio's NX-style feature icons, drawn from 3D on one isometric grid.

Every icon is built from boxes, cylinders and faces in model space, projected the same way
(2:1 isometric, 1 unit = 1 px at 32 px) and lit the same way (top lightest, the side facing +y
mid, the side facing +x darkest), in flat tones of three materials: yellow for what a feature
makes, gray for the body it works on, blue for sketches, planes and directions. Outlines stay
1 px at every size.

With no arguments it prints the hidden <svg> of <symbol>s the mockup uses. `--jsx OUT` writes the
viewer's module instead (src/renderers/step/edit/nxIcons.generated.jsx): the sprite as a component,
the icons' names, and NxIcon, which draws one by name. Run it again whenever an icon changes. Every
id is "nx-" and the icon's name, so nothing collides with the page the sprite is mounted in.
"""

import argparse
import math
import re
import sys
from xml.etree import ElementTree

FEAT = dict(top="#FFD660", mid="#FAC44B", slope="#F4BC48", left="#F6B337", right="#E29620", edge="#A9620A")
BODY = dict(top="#F4F6F9", left="#D3DAE2", right="#AFB9C5", edge="#66727F")
TAN = dict(top="#F8E7C4", left="#EFD6A6", right="#E4C287", edge="#B5853A")
GHOST = dict(top="#FFEBC0", left="#FCDDA2", right="#F7CF86", edge="#CF9235")
BLUE, BLUE_FILL, DARK = "#2F73D9", "#DFEBFC", "#39424D"
PURPLE, PURPLE_FILL = "#7C3AED", "#F1EAFE"
DASH = "2.2 1.6"
PREFIX = "nx-"  # on every id this writes: symbols, gradients, clip paths
FSIDE = f"{PREFIX}fside"  # the one gradient the icons share: the side of a cylinder

SHARED = (
    f'<linearGradient id="{FSIDE}" x1="0" y1="0" x2="1" y2="0">'
    '<stop offset="0" stop-color="#F9BE45"/><stop offset=".55" stop-color="#EFA72D"/>'
    '<stop offset="1" stop-color="#DC8E1A"/></linearGradient>'
)
CHECK = (
    f'<symbol id="{PREFIX}check" viewBox="0 0 12 12"><path d="m2.3 6.3 2.4 2.4 5-5.4" fill="none" '
    'stroke="#2e8540" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></symbol>'
)


def num(v):
    v = round(v + 0.0, 2)
    return str(int(v)) if v == int(v) else f"{v:.2f}".rstrip("0")


def edge(color, dash=None):
    """A line that stays 1 px at every size."""
    extra = f' stroke-dasharray="{dash}"' if dash else ""
    return (
        f'fill="none" stroke="{color}" stroke-width="1" stroke-linejoin="round" '
        f'stroke-linecap="round" vector-effect="non-scaling-stroke"{extra}'
    )


class Icon:
    def __init__(self, name):
        self.name, self.id, self.parts, self.defs, self.pts = name, PREFIX + name, [], [], []

    @staticmethod
    def P(x, y, z):
        return (x - y, (x + y) / 2 - z)

    def proj(self, pts3):
        return [self.P(*p) for p in pts3]

    @staticmethod
    def d(pts, closed=True):
        return "M" + " L".join(f"{num(x)} {num(y)}" for x, y in pts) + (" Z" if closed else "")

    def raw(self, svg, pts=()):
        self.pts += list(pts)
        self.parts.append(svg)

    def shape(self, pts, fill, extra=""):
        self.raw(f'<path d="{self.d(pts)}" fill="{fill}"{extra}/>', pts)

    def face(self, pts3, fill, extra=""):
        self.shape(self.proj(pts3), fill, extra)

    def outline(self, pts, color, closed=True, dash=None):
        self.raw(f'<path d="{self.d(pts, closed)}" {edge(color, dash)}/>', pts)

    def stroke(self, pts, color=BLUE, width=1.6, dash=None):
        extra = f' stroke-dasharray="{dash}"' if dash else ""
        self.raw(
            f'<path d="{self.d(pts, False)}" fill="none" stroke="{color}" stroke-width="{num(width)}" '
            f'stroke-linecap="round" stroke-linejoin="round"{extra}/>',
            pts,
        )

    def head(self, tip, behind, color=BLUE, length=4.4, half=2.5):
        """An arrowhead at tip, pointing away from behind; returns where its shaft should end."""
        dx, dy = tip[0] - behind[0], tip[1] - behind[1]
        n = math.hypot(dx, dy)
        ux, uy = dx / n, dy / n
        bx, by = tip[0] - ux * length, tip[1] - uy * length
        self.shape([tip, (bx - uy * half, by + ux * half), (bx + uy * half, by - ux * half)], color)
        return (bx + ux * 0.8, by + uy * 0.8)

    def arrow(self, start, tip, color=BLUE, width=1.6, length=4.4, half=2.5):
        self.stroke([start, self.head(tip, start, color, length, half)], color, width)

    def clip(self, pts):
        cid = f"{self.id}-c{len(self.defs)}"
        self.defs.append(f'<clipPath id="{cid}"><path d="{self.d(pts)}"/></clipPath>')
        return cid

    def gradient(self, p0, p1, stops):
        gid = f"{self.id}-g{len(self.defs)}"
        s = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
        self.defs.append(
            f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{num(p0[0])}" y1="{num(p0[1])}" '
            f'x2="{num(p1[0])}" y2="{num(p1[1])}">{s}</linearGradient>'
        )
        return f"url(#{gid})"

    def box(self, x0, y0, z0, x1, y1, z1, m, outline=True):
        P = self.P
        sil = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0), P(x0, y1, z1)]
        self.shape(sil, m["right"])
        self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], m["top"])
        self.face([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], m["left"])
        self.face([(x1, y0, z1), (x1, y1, z1), (x1, y1, z0), (x1, y0, z0)], m["right"])
        if outline:
            self.outline(sil, m["edge"])
        return sil

    def cylinder(self, x, y, z0, z1, r, m=FEAT, side=f"url(#{FSIDE})"):
        """An upright cylinder; r is its radius on screen."""
        cx, top = self.P(x, y, z1)
        _, bottom = self.P(x, y, z0)
        ry = r / 2
        L, R, T, B, rr = num(cx - r), num(cx + r), num(top), num(bottom), f"{num(r)} {num(ry)}"
        self.raw(
            f'<path d="M{L} {T} L{L} {B} A{rr} 0 0 0 {R} {B} L{R} {T} Z" fill="{side}"/>',
            [(cx - r, top - ry), (cx + r, bottom + ry)],
        )
        self.raw(f'<ellipse cx="{num(cx)}" cy="{T}" rx="{num(r)}" ry="{num(ry)}" fill="{m["top"]}"/>')
        self.raw(f'<path d="M{L} {T} L{L} {B} A{rr} 0 0 0 {R} {B} L{R} {T} A{rr} 0 0 0 {L} {T}" {edge(m["edge"])}/>')

    def hole(self, x, y, z, r, depth, wall=FEAT["right"], rim=FEAT["edge"]):
        cx, cy = self.P(x, y, z)
        e = f'cx="{num(cx)}" cy="{num(cy)}" rx="{num(r)}" ry="{num(r / 2)}"'
        cid = f"{self.id}-c{len(self.defs)}"
        self.defs.append(f'<clipPath id="{cid}"><ellipse {e}/></clipPath>')
        self.raw(f'<ellipse {e} fill="{wall}"/>')
        self.raw(
            f'<ellipse cx="{num(cx)}" cy="{num(cy + depth)}" rx="{num(r)}" ry="{num(r / 2)}" '
            f'fill="{DARK}" clip-path="url(#{cid})"/>'
        )
        self.raw(f'<ellipse {e} {edge(rim)}/>')

    def pencil(self, tip, length=14.5, width=5.0):
        ux, uy = math.sqrt(0.5), -math.sqrt(0.5)  # from the tip toward the end
        nx, ny = -uy, ux  # across, toward the shaded side

        def at(s, k):
            return (tip[0] + ux * s + nx * k * width / 2, tip[1] + uy * s + ny * k * width / 2)

        cone, end, lead = 5.0, length - 2.8, 1.9
        self.shape([tip, at(cone, -1), at(cone, 1)], "#F6DFB9")
        self.shape([tip, at(lead, -lead / cone), at(lead, lead / cone)], DARK)
        for k0, k1, tone in ((-1, -1 / 3, FEAT["top"]), (-1 / 3, 1 / 3, FEAT["left"]), (1 / 3, 1, FEAT["right"])):
            self.shape([at(cone, k0), at(end, k0), at(end, k1), at(cone, k1)], tone)
        self.shape([at(end, -1), at(length, -1), at(length, 1), at(end, 1)], "#C9D1DA")
        self.outline([tip, at(cone, -1), at(length, -1), at(length, 1), at(cone, 1)], FEAT["edge"])

    def symbol(self, size=32):
        xs = [p[0] for p in self.pts]
        ys = [p[1] for p in self.pts]
        w, h = max(xs) - min(xs), max(ys) - min(ys)
        print(f"{self.name}: {w:.1f} x {h:.1f}", file=sys.stderr)
        dx, dy = round(size - min(xs) - max(xs)) / 2, round(size - min(ys) - max(ys)) / 2
        defs = f"<defs>{''.join(self.defs)}</defs>" if self.defs else ""
        return (
            f'<symbol id="{self.id}" viewBox="0 0 {size} {size}">{defs}'
            f'<g transform="translate({num(dx)} {num(dy)})">{"".join(self.parts)}</g></symbol>'
        )


def sketch():
    ic = Icon("sketch")
    plane = ic.proj([(0, 0, 0), (12, 0, 0), (12, 12, 0), (0, 12, 0)])
    ic.shape(plane, BLUE_FILL)
    ic.outline(plane, BLUE)
    # a profile with a round end, being drawn from its back corner
    arc = [(6 + 3 * math.cos(math.radians(a)), 6 + 3 * math.sin(math.radians(a)), 0) for a in range(0, 181, 10)]
    ic.stroke(ic.proj([(3, 3, 0), (9, 3, 0)] + arc + [(3, 3, 0)]), width=1.6)
    ic.pencil(ic.P(3, 3, 0))
    return ic


def extrude():
    ic = Icon("extrude")
    plane = ic.proj([(-2, -2, 0), (12, -2, 0), (12, 12, 0), (-2, 12, 0)])
    ic.shape(plane, BLUE_FILL)
    ic.outline(plane, BLUE)
    ic.box(0, 0, 0, 10, 10, 9, FEAT)
    start = ic.P(5, 5, 9)
    ic.arrow(start, (start[0], start[1] - 9.5))
    return ic


def revolve():
    ic = Icon("revolve")
    ic.cylinder(0, 0, 0, 4, 11)
    ic.cylinder(0, 0, 4, 9.5, 5.2)
    top = ic.P(0, 0, 9.5)
    ic.stroke([top, (0, top[1] - 7.5)], width=1.3, dash=DASH)
    ic.stroke([(0, 6.5), (0, 9.5)], width=1.3, dash=DASH)
    # a turn around the axis, above the part
    cy, rx, ry = top[1] - 5, 6, 3
    arc = [(rx * math.cos(math.radians(a)), cy + ry * math.sin(math.radians(a))) for a in range(165, -36, -5)]
    ic.stroke(arc[:-5], width=1.3)
    ic.head(arc[-1], arc[-5], length=3.6, half=2.1)
    return ic


def hole():
    ic = Icon("hole")
    ic.box(0, 0, 0, 12, 12, 8, BODY)
    ic.hole(6, 6, 8, 5.4, 3.4)
    return ic


def rounded(kind):
    """A block with its top front-left edge blended or chamfered: that edge is the feature."""
    ic = Icon(kind)
    s, h, r = 12, 9, 4.5
    P = ic.P
    if kind == "blend":
        steps = [i * math.pi / 16 for i in range(9)]

        def prof(x):
            return [(x, s - r + r * math.sin(t), h - r + r * math.cos(t)) for t in steps]
    else:

        def prof(x):
            return [(x, s - r, h), (x, s, h - r)]

    sil = [P(0, 0, h), P(s, 0, h), P(s, 0, 0), P(s, s, 0), P(0, s, 0)] + ic.proj(prof(0)[::-1])
    ic.shape(sil, BODY["right"])
    ic.face([(0, 0, h), (s, 0, h), (s, s - r, h), (0, s - r, h)], BODY["top"])
    ic.face([(0, s, h - r), (s, s, h - r), (s, s, 0), (0, s, 0)], BODY["left"])
    ic.face([(s, 0, h), (s, 0, 0), (s, s, 0)] + prof(s)[::-1], BODY["right"])
    ic.outline(sil, BODY["edge"])
    band = prof(0) + prof(s)[::-1]
    if kind == "blend":
        fill = ic.gradient(P(s / 2, s - r, h), P(s / 2, s, h - r), [(0, FEAT["top"]), (1, FEAT["left"])])
    else:
        fill = FEAT["mid"]
    ic.face(band, fill)
    ic.outline(ic.proj(band), FEAT["edge"])
    return ic


def shell():
    ic = Icon("shell")
    s, h, t = 13, 8, 1.6
    sil = ic.box(0, 0, 0, s, s, h, FEAT, outline=False)
    opening = ic.proj([(t, t, h), (s - t, t, h), (s - t, s - t, h), (t, s - t, h)])
    ic.raw(f'<g clip-path="url(#{ic.clip(opening)})">')
    ic.face([(t, t, t), (s - t, t, t), (s - t, s - t, t), (t, s - t, t)], "#F2B944")
    ic.face([(t, t, h), (s - t, t, h), (s - t, t, t), (t, t, t)], "#E9A12A")
    ic.face([(t, t, h), (t, s - t, h), (t, s - t, t), (t, t, t)], "#CF8410")
    ic.raw("</g>")
    ic.outline(opening, FEAT["edge"])
    ic.outline(sil, FEAT["edge"])
    return ic


def draft():
    ic = Icon("draft")
    b, a, h = 12, 2.6, 9
    P = ic.P
    sil = [P(a, a, h), P(b - a, a, h), P(b, 0, 0), P(b, b, 0), P(0, b, 0), P(a, b - a, h)]
    ic.shape(sil, FEAT["right"])
    ic.face([(a, a, h), (b - a, a, h), (b - a, b - a, h), (a, b - a, h)], FEAT["top"])
    ic.face([(a, b - a, h), (b - a, b - a, h), (b, b, 0), (0, b, 0)], "#F8BC42")
    ic.face([(b - a, a, h), (b - a, b - a, h), (b, b, 0), (b, 0, 0)], "#E9A12B")
    ic.outline(sil, FEAT["edge"])
    # the pull direction, and the draft angle from it
    foot = P(b, 0, 0)
    ic.stroke([foot, (foot[0], foot[1] - 12)], width=1.2, dash=DASH)
    r = 7.5
    up = (foot[0], foot[1] - r)
    tx, ty = P(b - a, a, h)
    n = math.hypot(tx - foot[0], ty - foot[1])
    along = (foot[0] + (tx - foot[0]) / n * r, foot[1] + (ty - foot[1]) / n * r)
    ic.raw(
        f'<path d="M{num(up[0])} {num(up[1])} A{num(r)} {num(r)} 0 0 0 {num(along[0])} {num(along[1])}" '
        f'fill="none" stroke="{BLUE}" stroke-width="1.2"/>',
        [up, along],
    )
    return ic


def rib():
    ic = Icon("rib")
    s, t, H = 12, 2, 12
    P = ic.P
    # one L-shaped body: a base plate and a wall along its back
    sil = [P(0, 0, H), P(t, 0, H), P(t, 0, t), P(s, 0, t), P(s, 0, 0), P(s, s, 0), P(0, s, 0), P(0, s, H)]
    ic.shape(sil, BODY["right"])
    ic.face([(0, 0, H), (t, 0, H), (t, s, H), (0, s, H)], BODY["top"])
    ic.face([(t, 0, t), (s, 0, t), (s, s, t), (t, s, t)], BODY["top"])
    ic.face([(t, 0, H), (t, s, H), (t, s, t), (t, 0, t)], BODY["right"])
    ic.face([(s, 0, t), (s, s, t), (s, s, 0), (s, 0, 0)], BODY["right"])
    ic.face([(0, s, 0), (s, s, 0), (s, s, t), (t, s, t), (t, s, H), (0, s, H)], BODY["left"])
    ic.outline(sil, BODY["edge"])
    # the rib, in the corner
    y0, y1, top, run = 5, 7, 10.5, 10.5
    ic.face([(t, y1, t), (run, y1, t), (t, y1, top)], FEAT["left"])
    ic.face([(t, y0, top), (t, y1, top), (run, y1, t), (run, y0, t)], FEAT["slope"])
    ic.outline(ic.proj([(t, y0, top), (run, y0, t), (run, y1, t), (t, y1, t), (t, y1, top)]), FEAT["edge"])
    return ic


def pattern():
    ic = Icon("pattern")
    s = 13
    ic.box(0, 0, 0, s, s, 2, BODY)
    for x, y in ((3.4, 3.4), (3.4, 9.6), (9.6, 3.4), (9.6, 9.6)):
        ic.cylinder(x, y, 2, 6.5, 2.8)
    return ic


def mirror():
    ic = Icon("mirror")
    # the copy, behind the mirror plane
    for pts, tone in (
        ([(4.5, 2, 7), (4.5, 10, 7), (4.5, 10, 0), (4.5, 2, 0)], GHOST["right"]),
        ([(0, 2, 3), (4.5, 2, 7), (4.5, 10, 7), (0, 10, 3)], GHOST["top"]),
        ([(0, 10, 3), (4.5, 10, 7), (4.5, 10, 0), (0, 10, 0)], GHOST["left"]),
    ):
        ic.face(pts, tone)
    ghost = ic.proj([(0, 2, 3), (4.5, 2, 7), (4.5, 2, 0), (4.5, 10, 0), (0, 10, 0), (0, 10, 3)])
    ic.outline(ghost, GHOST["edge"], dash="1.6 1.4")
    plane = ic.proj([(6, 0.5, -0.5), (6, 11.5, -0.5), (6, 11.5, 9.5), (6, 0.5, 9.5)])
    ic.shape(plane, BLUE_FILL, ' fill-opacity=".8"')
    ic.outline(plane, BLUE, dash=DASH)
    # the original, in front
    sil = ic.proj([(7.5, 2, 7), (12, 2, 3), (12, 2, 0), (12, 10, 0), (7.5, 10, 0), (7.5, 10, 7)])
    ic.shape(sil, FEAT["right"])
    ic.face([(7.5, 2, 7), (12, 2, 3), (12, 10, 3), (7.5, 10, 7)], FEAT["slope"])
    ic.face([(7.5, 10, 7), (12, 10, 3), (12, 10, 0), (7.5, 10, 0)], FEAT["left"])
    ic.face([(12, 2, 3), (12, 10, 3), (12, 10, 0), (12, 2, 0)], FEAT["right"])
    ic.outline(sil, FEAT["edge"])
    return ic


def datum_plane():
    ic = Icon("plane")
    plane = ic.proj([(0, 0, 0), (13, 0, 0), (13, 13, 0), (0, 13, 0)])
    ic.shape(plane, TAN["top"])
    ic.outline(plane, TAN["edge"])
    c = ic.P(6.5, 6.5, 0)
    ic.arrow(c, (c[0], c[1] - 12.5))
    return ic


def csys():
    ic = Icon("csys")
    a = 8.5
    for pts, tone in (
        ([(0, 0, 0), (a, 0, 0), (a, 0, a), (0, 0, a)], TAN["left"]),
        ([(0, 0, 0), (0, a, 0), (0, a, a), (0, 0, a)], TAN["right"]),
        ([(0, 0, 0), (a, 0, 0), (a, a, 0), (0, a, 0)], TAN["top"]),
    ):
        ic.face(pts, tone)
        ic.outline(ic.proj(pts), TAN["edge"])
    o = ic.P(0, 0, 0)
    for end in ((13, 0, 0), (0, 13, 0), (0, 0, 13)):
        ic.arrow(o, ic.P(*end), width=1.4, length=3.8, half=2.1)
    return ic


def sweep():
    ic = Icon("sweep")
    d = "M-11 8 C-4 8 2 -6 11 -6"
    ic.raw(f'<path d="{d}" fill="none" stroke="{FEAT["edge"]}" stroke-width="7.6"/>', [(-11, 4.2), (11, -9.8), (-11, 11.8), (11, -2.2)])
    ic.raw(f'<path d="{d}" fill="none" stroke="{FEAT["left"]}" stroke-width="5.6"/>')
    ic.raw(f'<path d="{d}" fill="none" stroke="{FEAT["top"]}" stroke-width="2" transform="translate(-.4 -1.5)"/>')
    ic.raw(f'<path d="{d}" fill="none" stroke="{BLUE}" stroke-width="1.1" stroke-dasharray="{DASH}"/>')
    ic.raw(f'<path d="M11 -9.8 V-2.2" {edge(FEAT["edge"])}/>')
    ic.raw(f'<ellipse cx="-11" cy="8" rx="1.9" ry="3.8" fill="{FEAT["top"]}"/>', [(-12.9, 4.2)])
    ic.raw(f'<ellipse cx="-11" cy="8" rx="1.9" ry="3.8" {edge(FEAT["edge"])}/>')
    return ic


def loft():
    ic = Icon("loft")
    fill = ic.gradient((0, -10), (0, 13), [(0, FEAT["top"]), (1, FEAT["right"])])
    top, bottom = "M-9 -1 C-3 -2.5 3 -9.5 9 -10", "M9 2 C3 2.5 -3 11 -9 13"
    ic.raw(f'<path d="{top} L9 2 C3 2.5 -3 11 -9 13 Z" fill="{fill}"/>', [(-9, -10), (9, 13)])
    ic.raw(f'<path d="{top} {bottom}" {edge(FEAT["edge"])}/>')
    ic.raw(
        f'<rect x="6.6" y="-10" width="4.8" height="12" rx="1.6" fill="none" stroke="{BLUE}" stroke-width="1.5"/>',
        [(6.6, -10), (11.4, 2)],
    )
    ic.raw(
        f'<ellipse cx="-9" cy="6" rx="3.2" ry="7" fill="{BLUE_FILL}" stroke="{BLUE}" stroke-width="1.5"/>',
        [(-12.2, -1), (-5.8, 13)],
    )
    return ic


def split():
    ic = Icon("split")
    ic.box(0, 0, 0, 5, 11, 8, BODY)
    plane = ic.proj([(6, -2, -1), (6, 13, -1), (6, 13, 10), (6, -2, 10)])
    ic.shape(plane, BLUE_FILL, ' fill-opacity=".85"')
    ic.outline(plane, BLUE)
    ic.box(7, 0, 0, 12, 11, 8, BODY)
    return ic


def delete():
    ic = Icon("delete")
    ic.box(0, 0, 0, 11, 11, 8, BODY)
    cx, cy, r, k = 7.5, 7, 5.2, 2.1
    ic.raw(
        f'<circle cx="{num(cx)}" cy="{num(cy)}" r="{num(r)}" fill="{DARK}" stroke="#fff" stroke-width="1.4"/>',
        [(cx - r, cy - r), (cx + r, cy + r)],
    )
    ic.raw(
        f'<path d="M{num(cx - k)} {num(cy - k)} L{num(cx + k)} {num(cy + k)} M{num(cx + k)} {num(cy - k)} '
        f'L{num(cx - k)} {num(cy + k)}" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>'
    )
    return ic


def ask():
    ic = Icon("ask")
    bubble = (
        "M-7.5 -10 H7.5 A4.5 4.5 0 0 1 12 -5.5 V1 A4.5 4.5 0 0 1 7.5 5.5 H-1.5 L-6.5 10.5 V5.5 H-7.5 "
        "A4.5 4.5 0 0 1 -12 1 V-5.5 A4.5 4.5 0 0 1 -7.5 -10 Z"
    )
    ic.raw(f'<path d="{bubble}" fill="{PURPLE_FILL}"/>', [(-12, -10), (12, 10.5)])
    ic.raw(f'<path d="{bubble}" {edge(PURPLE)}/>')
    star = "M0 -8 C.7 -4.6 1.9 -3.4 5.4 -2.7 C1.9 -2 .7 -.8 0 2.6 C-.7 -.8 -1.9 -2 -5.4 -2.7 C-1.9 -3.4 -.7 -4.6 0 -8 Z"
    ic.raw(f'<path d="{star}" fill="{PURPLE}"/>')
    return ic


ICONS = (
    sketch, extrude, revolve, hole, lambda: rounded("blend"), lambda: rounded("chamfer"), shell, draft, rib,
    pattern, mirror, datum_plane, csys, sweep, loft, split, delete, ask,
)


def symbols():
    """The sprite's symbols in order, as (name, markup): the check, then each icon drawn."""
    return [("check", CHECK)] + [(ic.name, ic.symbol()) for ic in (make() for make in ICONS)]


def sprite():
    """The hidden <svg> of <symbol>s, for a page to paste in."""
    return "\n".join(
        ['<svg width="0" height="0" style="position:absolute" aria-hidden="true">', f"<defs>{SHARED}</defs>"]
        + [markup for _, markup in symbols()]
        + ["</svg>"]
    )


def react_attribute(name):
    """An SVG attribute as React spells it: stroke-width is strokeWidth; aria-* keeps its hyphen."""
    return name if name.startswith("aria-") else re.sub(r"-([a-z])", lambda match: match.group(1).upper(), name)


def quote(value):
    """An attribute's value as JSX writes it between double quotes."""
    return value.replace("&", "&amp;").replace('"', "&quot;")


def jsx(element, depth):
    """An element as JSX lines, one element to a line, `depth` levels in."""
    if (element.text or "").strip() or (element.tail or "").strip():
        raise ValueError(f"<{element.tag}> holds text; the icons are drawn with elements alone")
    pad = "  " * depth
    attrs = "".join(f' {react_attribute(name)}="{quote(value)}"' for name, value in element.attrib.items())
    if not len(element):
        return [f"{pad}<{element.tag}{attrs} />"]
    inner = [line for child in element for line in jsx(child, depth + 1)]
    return [f"{pad}<{element.tag}{attrs}>", *inner, f"{pad}</{element.tag}>"]


MODULE = """\
// Generated by scripts/nx-icons.py --jsx. To change an icon, change the generator and run it again;
// never edit this file.
//
// Edit mode's icons, drawn in NX's language: one hidden SVG sprite (NxIconSprite), mounted once, and
// NxIcon, which draws one of its symbols by name. Every id in the sprite starts with "@PREFIX@".

/** The name of every icon in the sprite: what NxIcon takes. */
export const NX_ICON_NAMES = Object.freeze([
@NAMES@
]);

// Made once, so that however often NxIconSprite is rendered, React is handed the same element and leaves it be.
const SPRITE = (
  <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
@SPRITE@
  </svg>
);

/**
 * The icons' symbols and the gradient they share, hidden. Mount it once in the page: every NxIcon
 * draws from it.
 */
export function NxIconSprite() {
  return SPRITE;
}

/**
 * One icon of the sprite, by name. Its symbol's own viewBox fits it to the box `className` gives the
 * svg, so the class sets its size, as with the other icons.
 */
export function NxIcon({ name, className }) {
  return <svg className={className} aria-hidden="true" focusable="false"><use href={`#@PREFIX@${name}`} /></svg>;
}
"""


def module():
    """The viewer's module: the icons' names, the sprite as a component, and NxIcon."""
    drawn = symbols()
    markup = [f"<defs>{SHARED}</defs>"] + [symbol for _, symbol in drawn]
    values = {
        "PREFIX": PREFIX,
        "NAMES": "\n".join(f'  "{name}",' for name, _ in drawn),
        "SPRITE": "\n".join(line for part in markup for line in jsx(ElementTree.fromstring(part), 2)),
    }
    return re.sub(r"@([A-Z]+)@", lambda match: values[match.group(1)], MODULE)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--jsx", metavar="OUT", help="write the viewer's module to OUT instead of printing the sprite")
    args = parser.parse_args(argv)
    if args.jsx:
        with open(args.jsx, "w", encoding="utf-8", newline="\n") as out:
            out.write(module())
    else:
        print(sprite())


if __name__ == "__main__":
    main()
