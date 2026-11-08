#!/usr/bin/env python3
"""Draws the library's covers from Studio's examples' real files, as one family.

Every cover is 640x400, and the Toolbox shows it square, so what it shows stays inside the middle
400. There are two kinds, and `COVERS` holds the recipe of each:

- a model: the part on nothing, for the viewer's ground in each theme to show behind it, from one
  camera, by one renderer (`render`), with what the job adds to it;
- a sheet: one sheet of the same size in the same place (`SHEET`), holding that document's own
  structure, measured from the real document, without a word or a figure.

The neutrals are baked into pictures/<cover>.webp. Everything with a hue is a mark: a path in
pictures/covers.json, with a tone the page draws from the theme's tokens, so a kind's hue, the one
blue and the status colours are right in both themes. Sheets are marks alone. `LibraryPicture`
draws both. A real stress plot keeps its own colours, in the picture.

Law 4 holds here: nothing on a cover is a figure, and a cover that shows a result reads it from the
result's own file. Red, amber and green mark only a real finding.

Each example's card picture (its studio-sample.json `picture`) is bundled too, as
pictures/examples/<id>.webp at the same size and quality, the part alone on nothing; `--examples`
bakes these alone.

A picture no cover names any more is removed. Nothing is written into the examples.

    text-to-cad/.venv/bin/python scripts/studio-library-pictures.py [--examples] [cover ...]
"""

from __future__ import annotations

import json
import math
import re
import sys
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "studio-sample"
SERVO = SAMPLES / "servo-bracket"
LIBRARY = ROOT / "apps" / "web" / "src" / "components" / "workbench" / "library"
PICTURES = LIBRARY / "pictures"
COVERS_FILE = PICTURES / "covers.json"
SIZE = (640, 400)
QUALITY = 80

# What a cover keeps inside: the middle of the box, square, with the same margin all round.
SAFE = 318
CENTRE = (320.0, 200.0)
# Drawn this many times over and brought down, for clean outlines.
OVER = 3
# Where every model is seen from: the corner of the bracket's bend, a little above.
VIEW = (1.0, -1.0, 0.9)
# Mesh fineness, in millimetres and radians.
TOLERANCE, ANGULAR = 0.04, 0.25
SMOOTH_BELOW = math.radians(32)

# The parts' neutrals: their models' own, but for the catalog's teal screws and the clip's blue.
ALUMINIUM = (186, 192, 199)
SERVO_CASE = (92, 96, 104)
ADAPTER = (146, 156, 168)
SCREW = (112, 118, 126)
CLIP = (150, 156, 164)
PLATE = (108, 113, 122)

# One sheet: portrait, the same size in the same place on every cover.
SHEET = {"x": 197, "y": 36, "w": 246, "h": 328, "r": 7}
PAD = 22


def unit(vector) -> np.ndarray:
    vector = np.asarray(vector, dtype=float)
    return vector / np.linalg.norm(vector)


class Camera:
    """A parallel view: from `toward`, with +Z up, fitted to what it must show."""

    def __init__(self, toward=VIEW, up=(0.0, 0.0, 1.0)):
        self.forward = -unit(toward)
        self.right = unit(np.cross(self.forward, up))
        self.up = np.cross(self.right, self.forward)
        self.scale, self.at, self.centre = 1.0, np.zeros(3), np.array(CENTRE)

    def fit(self, points, box: float = SAFE, centre=CENTRE) -> "Camera":
        """Scaled and moved so `points` fill a `box` square, centred on `centre`."""
        points = np.asarray(points, dtype=float)
        across, down = points @ self.right, points @ self.up
        self.scale = box / max(np.ptp(across), np.ptp(down))
        self.at = self.right * (across.min() + across.max()) / 2 + self.up * (down.min() + down.max()) / 2
        self.centre = np.array(centre, dtype=float)
        return self

    def project(self, points) -> np.ndarray:
        """Each point as x and y in the picture, then its depth in millimetres (far is larger)."""
        relative = np.asarray(points, dtype=float).reshape(-1, 3) - self.at
        return np.column_stack([
            self.centre[0] + relative @ self.right * self.scale,
            self.centre[1] - relative @ self.up * self.scale,
            relative @ self.forward,
        ])

    def world_at_height(self, x, y, height: float) -> tuple[np.ndarray, np.ndarray]:
        """The X and Y where each picture point's line of sight meets the plane Z = `height`."""
        across, down = (x - self.centre[0]) / self.scale, (self.centre[1] - y) / self.scale
        base = self.at + across[..., None] * self.right + down[..., None] * self.up
        travel = (height - base[..., 2]) / self.forward[2]
        return base[..., 0] + travel * self.forward[0], base[..., 1] + travel * self.forward[1]


@dataclass
class Part:
    """One mesh in a picture. `keep` is the band of Z it is drawn in; a cut through a solid is drawn
    as its top face, with `infill` lines at that pitch; `layers` rings its walls at that height."""

    mesh: object
    colour: tuple = ALUMINIUM
    alpha: float = 1.0
    colours: np.ndarray | None = None
    wire: bool = False
    layers: float | None = None
    infill: float | None = None
    keep: tuple | None = None
    flat: bool = False


def smoothed(mesh):
    """The mesh with its creases kept and its round faces smooth."""
    import trimesh

    return trimesh.graph.smooth_shade(mesh, angle=SMOOTH_BELOW, facet_minarea=None)


def render(parts: list[Part], camera: Camera) -> dict:
    """The parts, each pixel the nearest, shaded and outlined. Returns the picture (RGBA, on
    nothing) and the depth marks are tested against."""
    width, height = SIZE[0] * OVER, SIZE[1] * OVER
    depth = np.full((height, width), np.inf)
    normal = np.zeros((height, width, 3))
    albedo = np.zeros((height, width, 3))
    alpha = np.zeros((height, width))
    wire = np.zeros((height, width), dtype=bool)
    ringed = np.zeros((height, width))
    world_z = np.zeros((height, width))
    cap = np.zeros((height, width))
    for part in parts:
        mesh = part.mesh
        projected = camera.project(mesh.vertices)
        screen = projected[:, :2] * OVER
        normals = mesh.face_normals[:, None].repeat(3, axis=1) if part.flat else mesh.vertex_normals[mesh.faces]
        heights = np.asarray(mesh.vertices)[:, 2]
        faces = np.asarray(mesh.faces)
        for index, face in enumerate(faces):
            a, b, c = screen[face]
            area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if area == 0 or (area > 0 and part.keep is None):
                continue
            left = max(int(math.floor(min(a[0], b[0], c[0]))), 0)
            right = min(int(math.ceil(max(a[0], b[0], c[0]))) + 1, width)
            top = max(int(math.floor(min(a[1], b[1], c[1]))), 0)
            bottom = min(int(math.ceil(max(a[1], b[1], c[1]))) + 1, height)
            if left >= right or top >= bottom:
                continue
            xs, ys = np.meshgrid(np.arange(left, right) + 0.5, np.arange(top, bottom) + 0.5)
            w0 = ((b[0] - xs) * (c[1] - ys) - (b[1] - ys) * (c[0] - xs)) / area
            w1 = ((c[0] - xs) * (a[1] - ys) - (c[1] - ys) * (a[0] - xs)) / area
            w2 = 1 - w0 - w1
            inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not inside.any():
                continue
            d = w0 * projected[face[0], 2] + w1 * projected[face[1], 2] + w2 * projected[face[2], 2]
            z = w0 * heights[face[0]] + w1 * heights[face[1]] + w2 * heights[face[2]]
            if part.keep is not None:
                inside &= (z >= part.keep[0]) & (z <= part.keep[1])
            window = depth[top:bottom, left:right]
            nearer = inside & (d < window)
            if not nearer.any():
                continue
            window[nearer] = d[nearer]
            shade = w0[..., None] * normals[index, 0] + w1[..., None] * normals[index, 1] + w2[..., None] * normals[index, 2]
            backface = area > 0
            if backface and part.infill:
                shade = np.broadcast_to(np.array([0.0, 0.0, 1.0]), shade.shape)
            normal[top:bottom, left:right][nearer] = shade[nearer]
            if part.colours is not None:
                tint = (w0[..., None] * part.colours[face[0]] + w1[..., None] * part.colours[face[1]]
                        + w2[..., None] * part.colours[face[2]])
                albedo[top:bottom, left:right][nearer] = tint[nearer]
            else:
                albedo[top:bottom, left:right][nearer] = part.colour
            alpha[top:bottom, left:right][nearer] = part.alpha
            world_z[top:bottom, left:right][nearer] = z[nearer]
            ringed[top:bottom, left:right][nearer] = part.layers or 0
            cap[top:bottom, left:right][nearer] = part.keep[1] if backface and part.infill else 0
            if part.wire:
                lines = np.minimum(np.minimum(w0, w1), w2) * abs(area) / np.maximum(
                    np.array([np.linalg.norm(c - b), np.linalg.norm(a - c), np.linalg.norm(b - a)]).max(), 1e-6)
                wire[top:bottom, left:right] |= nearer & (lines < 1.6)
    return shaded(camera, depth, normal, albedo, alpha, wire, ringed, world_z, cap, parts)


def shaded(camera, depth, normal, albedo, alpha, wire, ringed, world_z, cap, parts) -> dict:
    """Light, layer rings, the cut's infill and the outlines over the drawn buffers."""
    solid = np.isfinite(depth)
    length = np.maximum(np.linalg.norm(normal, axis=2, keepdims=True), 1e-6)
    n = normal / length
    # The lights stand with the camera, so every part is lit alike.
    key = unit(-0.45 * camera.right + 0.75 * camera.up - 0.55 * camera.forward)
    fill = unit(0.8 * camera.right + 0.1 * camera.up - 0.5 * camera.forward)
    light = 0.46 + 0.5 * np.clip(n @ key, 0, 1) + 0.16 * np.clip(n @ fill, 0, 1)
    colour = albedo * light[..., None]

    rings = ringed > 0
    if rings.any():
        phase = np.mod(world_z[rings] / ringed[rings], 1.0)
        colour[rings] *= (0.74 + 0.34 * np.abs(2 * phase - 1))[..., None]

    capped = cap != 0
    if capped.any():
        ys, xs = np.nonzero(capped)
        for level in np.unique(cap[capped]):
            at = cap[capped] == level
            world_x, world_y = camera.world_at_height(xs[at] / OVER, ys[at] / OVER, level)
            pitch = next(part.infill for part in parts if part.infill and part.keep[1] == level)
            lines = np.abs(np.mod((world_x + world_y) / pitch, 1.0) - 0.5) < 0.16
            lines |= np.abs(np.mod((world_x - world_y) / pitch, 1.0) - 0.5) < 0.16
            shade = np.where(lines, 0.72, 1.0)
            pick = np.nonzero(capped)
            colour[pick[0][at], pick[1][at]] *= shade[..., None]

    # Outlines: where the surface jumps in depth or turns sharply.
    held = np.where(solid, depth, np.nanmax(depth[solid]) if solid.any() else 0)
    jump = np.zeros_like(solid)
    limit = 1.1 / camera.scale * 2.5
    for axis in (0, 1):
        jump |= np.abs(np.diff(held, axis=axis, prepend=np.take(held, [0], axis=axis))) > limit
    turn = np.zeros_like(solid)
    for axis in (0, 1):
        previous = np.roll(n, 1, axis=axis)
        turn |= (n * previous).sum(axis=2) < 0.82
    edges = ndimage.binary_dilation((jump | turn) & solid, iterations=2) & solid
    colour[edges] *= 0.42
    colour[wire] *= 0.5

    premultiplied = np.dstack([np.clip(colour, 0, 255) * alpha[..., None], alpha * 255])
    small = premultiplied.reshape(SIZE[1], OVER, SIZE[0], OVER, 4).mean(axis=(1, 3))
    opacity = np.maximum(small[..., 3:] / 255, 1e-6)
    straight = np.dstack([np.clip(small[..., :3] / opacity, 0, 255), small[..., 3]])
    return {"image": Image.fromarray(np.uint8(np.rint(straight))), "depth": depth, "camera": camera}


# Marks ------------------------------------------------------------------------------------------

def number(value: float) -> str:
    text = f"{value:.1f}"
    return text[:-2] if text.endswith(".0") else text


def line_path(points, closed: bool = False) -> str:
    body = "L".join(f"{number(x)} {number(y)}" for x, y in points)
    return f"M{body}{'Z' if closed else ''}"


def rect_path(x, y, w, h, r=0.0) -> str:
    if r <= 0:
        return f"M{number(x)} {number(y)}h{number(w)}v{number(h)}h{number(-w)}Z"
    r = min(r, w / 2, h / 2)
    return (f"M{number(x + r)} {number(y)}h{number(w - 2 * r)}a{number(r)} {number(r)} 0 0 1 {number(r)} {number(r)}"
            f"v{number(h - 2 * r)}a{number(r)} {number(r)} 0 0 1 {number(-r)} {number(r)}h{number(2 * r - w)}"
            f"a{number(r)} {number(r)} 0 0 1 {number(-r)} {number(-r)}v{number(2 * r - h)}"
            f"a{number(r)} {number(r)} 0 0 1 {number(r)} {number(-r)}Z")


def circle_path(x, y, r) -> str:
    return (f"M{number(x - r)} {number(y)}a{number(r)} {number(r)} 0 1 0 {number(2 * r)} 0"
            f"a{number(r)} {number(r)} 0 1 0 {number(-2 * r)} 0Z")


class Marks:
    """A cover's paths by how they are drawn, so one tone is one path. A mark's tone is a token the
    page resolves in each theme: ink, hue, warning, fail or pass."""

    def __init__(self):
        self.drawn: dict[tuple, list[str]] = {}
        self.insets: list[dict] = []

    def add(self, d: str, tone: str = "ink", width: float | None = None, opacity: float = 1.0,
            dash: str | None = None) -> None:
        if d:
            self.drawn.setdefault((tone, width, opacity, dash), []).append(d)

    def line(self, points, tone="ink", width=3.0, opacity=1.0, dash=None, closed=False) -> None:
        if len(points) > 1:
            self.add(line_path(points, closed), tone, width, opacity, dash)

    def bar(self, x, y, w, h=7.0, tone="ink", opacity=0.28) -> None:
        self.add(rect_path(x, y, max(w, h), h, h / 2), tone, None, opacity)

    def inset(self, cover: str, x, y, w, h) -> None:
        self.insets.append({"cover": cover, "x": x, "y": y, "w": w, "h": h})

    def as_json(self) -> list[dict]:
        marks = []
        for (tone, width, opacity, dash), paths in self.drawn.items():
            mark: dict = {"tone": tone, "d": "".join(paths)}
            if width is not None:
                mark["width"] = width
            if opacity != 1.0:
                mark["opacity"] = opacity
            if dash is not None:
                mark["dash"] = dash
            marks.append(mark)
        return marks


def seen_runs(picture: dict, points, bias: float = 0.25) -> list[list[tuple[float, float]]]:
    """A 3D line's stretches the parts do not hide, in picture coordinates."""
    camera, depth = picture["camera"], picture["depth"]
    points = np.asarray(points, dtype=float)
    runs, run = [], []
    for start, end in zip(points[:-1], points[1:]):
        steps = max(int(np.linalg.norm(end - start) * camera.scale / 3), 1)
        for t in np.linspace(0, 1, steps + 1):
            x, y, d = camera.project(start + (end - start) * t)[0]
            px, py = int(x * OVER), int(y * OVER)
            near = (0 <= px < depth.shape[1] and 0 <= py < depth.shape[0]
                    and depth[max(py - 2, 0):py + 3, max(px - 2, 0):px + 3].min() + bias < d)
            if near:
                if len(run) > 1:
                    runs.append(run)
                run = []
            else:
                run.append((x, y))
    if len(run) > 1:
        runs.append(run)
    return [simplified(run) for run in runs]


def simplified(points, tolerance: float = 0.35):
    from shapely.geometry import LineString

    return list(LineString(points).simplify(tolerance).coords)


def flat_shape(meshes, camera: Camera, tolerance: float = 0.5):
    """What meshes cover in the picture, as one outline."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    shapes = []
    for mesh in meshes:
        corners = camera.project(mesh.vertices)[:, :2][mesh.faces]
        for triangle in corners:
            polygon = Polygon(triangle)
            if polygon.area > 1e-3:
                shapes.append(polygon.buffer(0.05))
    return unary_union(shapes).simplify(tolerance)


def shape_path(shape) -> str:
    """A shapely outline as a path, holes and all (the page fills with evenodd)."""
    polygons = [shape] if shape.geom_type == "Polygon" else list(shape.geoms)
    return "".join(
        line_path(ring.coords[:-1], closed=True)
        for polygon in polygons
        for ring in (polygon.exterior, *polygon.interiors)
    )


# The examples' real files -----------------------------------------------------------------------

@lru_cache
def mount() -> dict[str, list]:
    """The saved assembly's solids, in place, by name: the mount's real frame."""
    import build123d
    import trimesh

    parts: dict[str, list] = {}
    for solid in build123d.import_step(SERVO / "assemblies" / "servo_mount.step").children:
        vertices, triangles = solid.tessellate(TOLERANCE, ANGULAR)
        mesh = trimesh.Trimesh([tuple(v) for v in vertices], triangles, process=True)
        parts.setdefault(solid.label.split(":")[0], []).append(smoothed(mesh))
    return parts


@lru_cache
def step_part(path: str):
    import build123d
    import trimesh

    shape = build123d.import_step(SAMPLES / path)
    solids = shape.solids()
    meshes = []
    for solid in solids:
        vertices, triangles = solid.tessellate(TOLERANCE, ANGULAR)
        meshes.append(trimesh.Trimesh([tuple(v) for v in vertices], triangles, process=True))
    return smoothed(trimesh.util.concatenate(meshes))


def mount_parts(ghost: float = 1.0, skip: tuple = (), only: tuple | None = None) -> list[Part]:
    colours = {"servo_bracket": ALUMINIUM, "mg996r": SERVO_CASE, "horn_adapter": ADAPTER,
               "m3x8_screw": SCREW, "cable_clip": CLIP}
    return [Part(mesh, colours[name], ghost)
            for name, meshes in mount().items() if name not in skip and (only is None or name in only)
            for mesh in meshes]


def mount_points():
    return np.vstack([mesh.vertices for meshes in mount().values() for mesh in meshes])


def glb_up(points) -> np.ndarray:
    """A glTF's Y-up points in CAD's Z-up frame, in millimetres."""
    points = np.asarray(points, dtype=float)
    return np.column_stack([points[:, 0], -points[:, 2], points[:, 1]]) * 1000


def stress_part() -> Part:
    """The study's result mesh with the colours the study wrote on it (COLOR_0)."""
    import pygltflib
    import trimesh

    glb = pygltflib.GLTF2().load(str(SERVO / "studies" / "servo_bracket.fea.glb"))
    blob = glb.binary_blob()

    def accessor(index: int) -> np.ndarray:
        view = glb.accessors[index]
        buffer = glb.bufferViews[view.bufferView]
        size = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[view.type]
        kind = np.dtype({5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[view.componentType])
        stride = buffer.byteStride or size * kind.itemsize
        start = (buffer.byteOffset or 0) + (view.byteOffset or 0)
        return np.array([np.frombuffer(blob, kind, size, start + row * stride) for row in range(view.count)])

    primitive = glb.meshes[0].primitives[0]
    vertices = glb_up(accessor(primitive.attributes.POSITION))
    faces = accessor(primitive.indices).reshape(-1, 3)
    colours = accessor(primitive.attributes.COLOR_0).astype(float)
    if colours.max() > 1.5:
        colours = colours / (65535 if colours.max() > 255 else 255)
    colours = colours[:, :3]
    # glTF colours are linear; the picture is sRGB.
    colours = np.where(colours <= 0.0031308, colours * 12.92, 1.055 * np.power(colours, 1 / 2.4) - 0.055) * 255
    mesh = trimesh.Trimesh(vertices, faces, process=False)
    return Part(mesh, colours=colours)


def cam_job():
    """The horn adapter's CAM job: its part, its stock, and the top setup's cutting moves."""
    import trimesh

    scene = trimesh.load(SERVO / "cam" / "horn_adapter.cam.glb", process=False)
    part = scene.geometry["part"]
    mesh = trimesh.Trimesh(glb_up(part.vertices), part.faces, process=True)
    stock = glb_up(scene.geometry["stock"].vertices)
    moves = glb_up(scene.geometry["top feed"].vertices)
    return smoothed(mesh), stock, moves


def box_edges(low, high):
    (x0, y0, z0), (x1, y1, z1) = low, high
    corners = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    pairs = [(0, 1), (1, 2), (2, 3), (3, 0), (4, 5), (5, 6), (6, 7), (7, 4), (0, 4), (1, 5), (2, 6), (3, 7)]
    return [(corners[a], corners[b]) for a, b in pairs]


def robot_file(name: str):
    import xml.etree.ElementTree as ElementTree

    return ElementTree.parse(SERVO / "robots" / name).getroot()


def numbers(text: str) -> list[float]:
    return [float(value) for value in text.split()]


def horn_joint():
    """The URDF's horn joint: where it is, in millimetres, its axis, and its limits in radians."""
    joint = next(item for item in robot_file("servo_mount.urdf").iter("joint") if item.get("name") == "horn_joint")
    origin = np.array(numbers(joint.find("origin").get("xyz"))) * 1000
    axis = np.array(numbers(joint.find("axis").get("xyz")))
    limit = joint.find("limit")
    return origin, axis, float(limit.get("lower")), float(limit.get("upper"))


def tool_height() -> float:
    joint = next(item for item in robot_file("servo_mount.urdf").iter("joint") if item.get("name") == "tool0_joint")
    return numbers(joint.find("origin").get("xyz"))[2] * 1000


def arc(origin, radius, start, end, height=0.0, steps=48):
    angles = np.linspace(start, end, steps)
    return np.column_stack([origin[0] + radius * np.cos(angles), origin[1] + radius * np.sin(angles),
                            np.full(steps, origin[2] + height)])


def cut_shapes(path: Path):
    """A DXF's CUT contours as closed rings and its BEND lines, in millimetres."""
    import ezdxf
    from shapely.geometry import LineString
    from shapely.ops import linemerge

    pieces, bends = [], []
    for entity in ezdxf.readfile(path).modelspace():
        layer = entity.dxf.layer
        if entity.dxftype() == "LINE":
            line = [tuple(entity.dxf.start)[:2], tuple(entity.dxf.end)[:2]]
            (bends if layer == "BEND" else pieces).append(line)
        elif entity.dxftype() == "ARC":
            points = list(entity.flattening(0.02))
            pieces.append([tuple(point)[:2] for point in points])
        elif entity.dxftype() == "CIRCLE":
            points = list(entity.flattening(0.02))
            pieces.append([tuple(point)[:2] for point in points])
    merged = linemerge([LineString(piece) for piece in pieces if len(piece) > 1])
    lines = [merged] if merged.geom_type == "LineString" else list(merged.geoms)
    return [list(line.coords) for line in lines], bends


def markdown_table(text: str, heading: str) -> list[list[str]]:
    """The body rows of the first table after a line starting with `heading`."""
    rows, seen = [], False
    for line in text.splitlines():
        if line.startswith(heading):
            seen = True
        elif seen and line.startswith("|"):
            rows.append([cell.strip() for cell in line.strip().strip("|").split("|")])
        elif seen and rows:
            break
    return rows[2:]


def read(path: str) -> str:
    return (SERVO / path).read_text(encoding="utf-8")


# Model covers -----------------------------------------------------------------------------------

def mount_camera() -> Camera:
    return Camera().fit(mount_points())


def model(parts: list[Part], camera: Camera, hook=None) -> dict:
    picture = render(parts, camera)
    marks = Marks()
    if hook is not None:
        hook(picture, marks)
    return {"image": picture["image"], "marks": marks}


def cover_bracket():
    return model(mount_parts(only=("servo_bracket",)), mount_camera())


def cover_mount():
    return model(mount_parts(), mount_camera())


def cover_adapter():
    meshes = [part.mesh for part in mount_parts(only=("horn_adapter",))]
    return model([Part(meshes[0], ADAPTER)], Camera().fit(meshes[0].vertices, SAFE * 0.8))


def cover_stress():
    part = stress_part()
    return model([part], mount_camera())


def cover_mesh():
    import trimesh

    mesh = trimesh.load(SERVO / "parts" / "servo_bracket.3mf", force="mesh", process=True)
    return model([Part(mesh, ALUMINIUM, wire=True, flat=True)], mount_camera())


def cover_toolpaths():
    mesh, stock, moves = cam_job()
    camera = Camera().fit(np.vstack([stock, moves[np.abs(moves[:, 2] - moves[:, 2].max()) > 3]]), SAFE * 0.92)

    def hook(picture, marks):
        low, high = stock.min(axis=0), stock.max(axis=0)
        for start, end in box_edges(low, high):
            for run in seen_runs(picture, [start, end]):
                marks.line(run, "ink", 2.2, 0.32)
        # The moves are pairs of points; a cut runs on while one ends where the next starts.
        breaks = np.nonzero(np.abs(moves[1:-1:2] - moves[2::2]).max(axis=1) > 1e-6)[0] * 2 + 2
        for cut in np.split(moves, breaks):
            for run in seen_runs(picture, cut, bias=0.05):
                marks.line(run, "hue", 2.4)

    return model([Part(mesh, ADAPTER)], camera, hook)


def cover_flags():
    """The real sheet metal check's review findings where they are on the bracket: the web between
    each tapped hole and the cutout, and the bend."""
    import trimesh

    bracket = trimesh.util.concatenate(mount()["servo_bracket"])
    section = bracket.section(plane_origin=[0, 0, -1.0], plane_normal=[0, 0, 1.0])
    loops = [np.asarray(loop) for loop in section.discrete]
    def across(loop):
        return np.ptp(loop[:, :2], axis=0)
    tapped = [loop.mean(axis=0) for loop in loops if np.allclose(across(loop), 2.5, atol=0.15)]
    if len(tapped) != 4:
        raise SystemExit(f"expected the bracket's four tapped holes, found {len(tapped)}")
    cutout = max((loop for loop in loops if np.ptp(loop[:, 1]) > 15 and np.ptp(loop[:, 1]) < 25), key=lambda loop: np.ptp(loop[:, 0]))
    inner = cutout[:, 0].min(), cutout[:, 0].max()

    def hook(picture, marks):
        camera = picture["camera"]
        for hole in tapped:
            edge = inner[1] if hole[0] > 0 else inner[0]
            ring = arc((hole[0] + (edge - hole[0]) * 0.45, hole[1], 0.0), 4.2, 0, 2 * math.pi, steps=28)
            flat = camera.project(ring)[:, :2]
            marks.add(line_path(flat, closed=True), "warning", None, 0.45)
            marks.add(line_path(flat, closed=True), "warning", 3.0)
        band = camera.project([(-32, 0, 0), (32, 0, 0), (32, 3.2, 0), (-32, 3.2, 0)])[:, :2]
        face = camera.project([(-32, 0, 0), (32, 0, 0), (32, 0, -3.2), (-32, 0, -3.2)])[:, :2]
        marks.add(line_path(band, closed=True), "warning", None, 0.5)
        marks.add(line_path(face, closed=True), "warning", None, 0.5)

    return model(mount_parts(only=("servo_bracket",)), mount_camera(), hook)


def clip_solid():
    """The real clip, turned on the plate so its opening, and both its lips, face the camera."""
    import trimesh

    mesh = trimesh.load(SERVO / "parts" / "cable_clip.stl", process=True)
    mesh.apply_transform(trimesh.transformations.rotation_matrix(math.pi, (0, 0, 1)))
    return mesh


def clip_mesh():
    return smoothed(clip_solid())


def plate_mesh(low, high):
    import trimesh

    return trimesh.creation.box(bounds=[low, high])


LAYER = 0.2


def cover_gcode():
    """The clip standing on a build plate, as the DfAM check prints it, stopped part way: its real
    outline cut into 0.2 mm layers. An illustration: no slicer has run."""
    mesh = clip_mesh()
    low, high = mesh.bounds
    plate = plate_mesh((low[0] - 3.6, low[1] - 3.2, low[2] - 0.8), (high[0] + 3.6, high[1] + 3.2, low[2]))
    cut = low[2] + (high[2] - low[2]) * 0.62
    camera = Camera().fit(np.vstack([plate.vertices, mesh.vertices]), SAFE)
    parts = [
        Part(plate, PLATE, flat=True),
        Part(mesh, CLIP, 0.2, keep=(cut, high[2] + 1)),
        Part(mesh, CLIP, layers=LAYER * 2, keep=(low[2] - 1, cut), infill=1.1),
    ]

    def hook(picture, marks):
        section = mesh.section(plane_origin=[0, 0, cut], plane_normal=[0, 0, 1.0])
        for loop in section.discrete:
            marks.line(camera.project(loop)[:, :2], "hue", 3.6)

    return model(parts, camera, hook)


def cover_urdf():
    """The URDF's chain as its file gives it: base_link, horn_joint and its axis and limits, tool0."""
    origin, axis, lower, upper = horn_joint()
    tool = origin + axis * tool_height()
    parts = mount_parts(0.42, skip=("horn_adapter",)) + mount_parts(only=("horn_adapter",))
    camera = mount_camera()

    def hook(picture, marks):
        marks.line(camera.project([origin - axis * 3, origin + axis * 17])[:, :2], "hue", 3.2)
        sweep = camera.project(arc(origin, 20, lower, upper, height=6))[:, :2]
        marks.line(sweep, "hue", 4.5)
        chain = camera.project([(0, 0, 0), origin, tool])[:, :2]
        marks.line(chain, "hue", 4.5)
        for x, y in chain:
            marks.add(circle_path(x, y, 11), "hue")
            marks.add(circle_path(x, y, 4.5), "ground")

    return model(parts, camera, hook)


def cover_fit():
    """The mount with its centre of mass, from the URDF's links, and the horn's travel."""
    root = robot_file("servo_mount.urdf")
    origin, axis, lower, upper = horn_joint()
    total, moment = 0.0, np.zeros(3)
    for link in root.iter("link"):
        inertial = link.find("inertial")
        if inertial is None:
            continue
        mass = float(inertial.find("mass").get("value"))
        place = np.array(numbers(inertial.find("origin").get("xyz"))) * 1000
        place = place + (origin if link.get("name") == "horn_link" else 0)
        total, moment = total + mass, moment + mass * place
    centre = moment / total
    camera = mount_camera()

    def hook(picture, marks):
        x, y, _ = camera.project(centre)[0]
        marks.add(circle_path(x, y, 15), "hue")
        marks.add(f"M{number(x)} {number(y)}v-15a15 15 0 0 1 15 15ZM{number(x)} {number(y)}v15a15 15 0 0 1 -15 -15Z", "ground")

    return model(mount_parts(0.6), camera, hook)


def cover_motion():
    origin, axis, lower, upper = horn_joint()
    camera = mount_camera()

    def hook(picture, marks):
        sweep = arc(origin, 21, lower, upper, height=6)
        flat = camera.project(sweep)[:, :2]
        marks.line(flat, "hue", 5.0)
        end, before = flat[-1], flat[-5]
        forward = (end - before) / np.linalg.norm(end - before)
        side = np.array([-forward[1], forward[0]])
        tip = end + forward * 18
        marks.add(line_path([tip, end + side * 11, end - side * 11], closed=True), "hue")

    return model(mount_parts(), camera, hook)


EXPLODE = {"horn_adapter": 58.0, "m3x8_screw": 36.0, "mg996r": 16.0, "servo_bracket": -14.0, "cable_clip": -14.0}


def cover_exploded():
    import trimesh

    parts, points = [], []
    colours = {"servo_bracket": ALUMINIUM, "mg996r": SERVO_CASE, "horn_adapter": ADAPTER,
               "m3x8_screw": SCREW, "cable_clip": CLIP}
    for name, meshes in mount().items():
        for mesh in meshes:
            moved = mesh.copy()
            moved.apply_translation((0, 0, EXPLODE[name]))
            parts.append(Part(moved, colours[name]))
            points.append(moved.vertices)
    camera = Camera().fit(np.vstack(points))
    origin, axis, *_ = horn_joint()

    def hook(picture, marks):
        for run in seen_runs(picture, [origin + axis * 50, origin + axis * -8]):
            marks.line(run, "hue", 2.6, dash="9 7")

    return model(parts, camera, hook)


def cover_views():
    """Four pictures of the mount, front, side, top and an angle: each its own camera."""
    points = mount_points()
    views = [((0, -1, 0), (0, 0, 1)), ((1, 0, 0), (0, 0, 1)), ((0, 0, 1), (0, 1, 0)), (VIEW, (0, 0, 1))]
    canvas = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    cell = SAFE / 2
    for index, (toward, up) in enumerate(views):
        centre = (CENTRE[0] + (index % 2 - 0.5) * cell, CENTRE[1] + (index // 2 - 0.5) * cell)
        camera = Camera(toward, up).fit(points, cell * 0.8, centre)
        canvas.alpha_composite(render(mount_parts(), camera)["image"])
    return {"image": canvas, "marks": Marks()}


def cover_catalog():
    """Real step.parts files from the examples, as bought: a motor, a long and a short screw, a nut."""
    import trimesh

    files = [("motor-mount/parts/imported/stepper_motor_nema17_l0040_single_shaft.step", (0, 0, 0)),
             ("desk-lamp/parts/imported/iso4762_socket_head_cap_screw_m5x30.step", (36, 0, 0)),
             ("servo-bracket/parts/imported/iso4762_socket_head_cap_screw_m3x8.step", (0, -36, 0)),
             ("desk-lamp/parts/imported/nylon_locknut_m5_simple.step", (27, -27, 0))]
    parts, points = [], []
    for path, offset in files:
        mesh = step_part(path).copy()
        mesh.apply_translation(np.array(offset, dtype=float) - (mesh.bounds[0] + mesh.bounds[1]) * [0.5, 0.5, 0])
        mesh.apply_translation((0, 0, -mesh.bounds[0][2]))
        parts.append(Part(mesh, SCREW if "motor" not in path else ADAPTER))
        points.append(mesh.vertices)
    return model(parts, Camera().fit(np.vstack(points)))


def cover_pmi():
    """Datums and tolerance frames on the bracket: an illustration, with nothing in its frames."""
    camera = mount_camera()

    def hook(picture, marks):
        def frame(x, y, cells=3):
            for cell in range(cells):
                marks.add(rect_path(x + cell * 34, y, 34, 30), "hue", 3.2)

        for anchor, x, y in (((-12, 40, 0), 170, 52), ((32, 20, 0), 400, 318), ((-32, 0, -20), 150, 330)):
            ax, ay, _ = camera.project(anchor)[0]
            marks.line([(ax, ay), (x + 40, y + (30 if y < 200 else 0))], "hue", 3.0)
            frame(x, y)
            marks.add(circle_path(ax, ay, 6), "hue")

    return model(mount_parts(only=("servo_bracket",)), camera, hook)


# Sheet covers -----------------------------------------------------------------------------------

def sheet() -> tuple[dict, Marks]:
    return {"image": None, "sheet": True}, Marks()


LEFT = SHEET["x"] + PAD
TOP = SHEET["y"] + PAD
INNER_W = SHEET["w"] - 2 * PAD
INNER_H = SHEET["h"] - 2 * PAD
RIGHT = LEFT + INNER_W
BOTTOM = TOP + INNER_H


def done(cover: dict, marks: Marks) -> dict:
    cover["marks"] = marks
    return cover


def title(marks: Marks, width: float = 0.56) -> float:
    """A sheet's title, the same on all of them. Returns the Y under it."""
    marks.bar(LEFT, TOP, INNER_W * width, 10, "ink", 0.72)
    return TOP + 24


def thumbnail(meshes, box, toward=VIEW, tolerance=0.3):
    """Meshes as one flat outline fitted into a (x, y, size) box."""
    x, y, size = box
    camera = Camera(toward).fit(np.vstack([mesh.vertices for mesh in meshes]), size, (x + size / 2, y + size / 2))
    return flat_shape(meshes, camera, tolerance)


def cover_parts_list():
    """One row for each real part of the parts list, its outline, its bars and its count in dots."""
    rows = markdown_table(read("docs/servo_mount_parts_list.md"), "## In the model")
    solids = mount()
    names = {"Servo bracket": "servo_bracket", "MG996R": "mg996r", "Horn adapter": "horn_adapter",
             "Socket": "m3x8_screw", "Cable clip": "cable_clip"}
    cover, marks = sheet()
    y = title(marks) + 2
    height = (BOTTOM - y) / len(rows)
    size = height - 12
    for index, row in enumerate(rows):
        top = y + index * height
        if index:
            marks.line([(LEFT, top), (RIGHT, top)], "ink", 2.0, 0.14)
        name = next(value for key, value in names.items() if row[0].startswith(key))
        meshes = solids[name][:1]
        marks.add(shape_path(thumbnail(meshes, (LEFT, top + 6, size))), "hue")
        text = LEFT + size + 16
        room = RIGHT - text - 56
        marks.bar(text, top + height / 2 - 9, min(len(row[0]) * 3.6, room), 7, "ink", 0.55)
        marks.bar(text, top + height / 2 + 3, min(len(row[2]) * 1.6, room), 6, "ink", 0.24)
        for dot in range(int(row[1])):
            marks.add(circle_path(RIGHT - 5 - dot * 11, top + height / 2, 4), "ink", None, 0.55)
    return done(cover, marks)


def cover_test_plan():
    """A box for each real test, empty: none has been run."""
    rows = markdown_table(read("docs/servo_mount_test_plan.md"), "## Tests")
    cover, marks = sheet()
    y = title(marks) + 4
    height = (BOTTOM - y) / len(rows)
    box = min(height - 12, 20)
    longest = max(len(row[1]) for row in rows)
    for index, row in enumerate(rows):
        middle = y + index * height + height / 2
        marks.add(rect_path(LEFT + 1.5, middle - box / 2, box, box, 4), "hue", 3.2)
        room = RIGHT - LEFT - box - 18
        marks.bar(LEFT + box + 15, middle - 8, room * (0.45 + 0.55 * len(row[1]) / longest), 6.5, "ink", 0.5)
        marks.bar(LEFT + box + 15, middle + 3, room * 0.6, 5.5, "ink", 0.2)
    return done(cover, marks)


def cover_requirements():
    """Each real requirement's row, ending in its real status: met, open or not met."""
    rows = markdown_table(read("docs/engineering_requirements.md"), "## A table of requirements")
    cover, marks = sheet()
    y = title(marks) + 2
    marks.add(rect_path(LEFT, y, INNER_W, 13, 3), "hue", None, 0.3)
    y += 19
    height = (BOTTOM - y) / len(rows)
    longest = max(len(row[1]) for row in rows)
    for index, row in enumerate(rows):
        middle = y + index * height + height / 2
        status = row[-1]
        tone = "fail" if status.startswith("Not met") else "warning" if status.startswith("Open") else "pass"
        marks.bar(LEFT, middle - 3.5, 24, 7, "ink", 0.5)
        marks.bar(LEFT + 34, middle - 3, 34 + 70 * len(row[1]) / longest, 6, "ink", 0.24)
        marks.bar(RIGHT - 78, middle - 3, 46, 6, "ink", 0.24)
        marks.add(circle_path(RIGHT - 8, middle, 7), tone)
    return done(cover, marks)


def cover_fmea():
    """The real FMEA's failure modes where they rate, severity up and occurrence across."""
    rows = markdown_table(read("docs/fmea.md"), "## A table")
    rated = [(int(row[3]), int(row[5])) for row in rows if row[3].isdigit() and row[5].isdigit()]
    severities = range(min(s for s, _ in rated), max(s for s, _ in rated) + 1)
    occurrences = range(min(o for _, o in rated), max(o for _, o in rated) + 1)
    cover, marks = sheet()
    y = title(marks) + 4
    across, down = len(occurrences), len(severities)
    size = min(INNER_W / across, (BOTTOM - y - 44) / down)
    left = LEFT + (INNER_W - size * across) / 2
    worst = (down) * (across)
    for row, severity in enumerate(reversed(severities)):
        for column, occurrence in enumerate(occurrences):
            risk = (severity - severities.start + 1) * (occurrence - occurrences.start + 1) / worst
            cell = (left + column * size, y + row * size, size - 3, size - 3)
            marks.add(rect_path(*cell, 3), "hue", None, round(0.1 + 0.62 * risk, 1))
            count = rated.count((severity, occurrence))
            for mode in range(count):
                offset = (mode - (count - 1) / 2) * 13
                marks.add(circle_path(cell[0] + (size - 3) / 2 + offset, cell[1] + (size - 3) / 2, 5.5), "ink", None, 0.9)
    under = y + down * size + 14
    marks.bar(LEFT, under, INNER_W * 0.86, 7, "ink", 0.28)
    marks.bar(LEFT, under + 15, INNER_W * 0.62, 7, "ink", 0.28)
    return done(cover, marks)


def cover_prd():
    """The PRD's own shape: a summary, then its real musts, shoulds and coulds."""
    text = read("docs/prd.md")
    tiers = [len(re.findall(rf"^- {letter}\d", text, re.M)) for letter in "MSC"]
    cover, marks = sheet()
    y = title(marks)
    marks.add(rect_path(LEFT, y, INNER_W, 44, 5), "hue", None, 0.22)
    marks.bar(LEFT + 12, y + 12, INNER_W - 24, 7, "ink", 0.5)
    marks.bar(LEFT + 12, y + 25, (INNER_W - 24) * 0.7, 7, "ink", 0.5)
    y += 56
    rows = sum(tiers) + len(tiers)
    height = (BOTTOM - y) / rows
    for tier, count in enumerate(tiers):
        marks.bar(LEFT, y + 2, 72 - tier * 12, 7, "hue", 0.95)
        y += height
        for line in range(count):
            marks.add(circle_path(LEFT + 6, y + height / 2, 3.2), "ink", None, 0.45)
            marks.bar(LEFT + 16, y + height / 2 - 3, (INNER_W - 16) * (0.9 - 0.12 * ((line * 3) % 4)), 6, "ink", 0.24)
            y += height
    return done(cover, marks)


def cover_write_up():
    """A report: its title, the real stress plot as its figure, then its real results' rows."""
    rows = markdown_table(read("docs/servo_bracket_strength_report.md"), "## Results")
    cover, marks = sheet()
    y = title(marks, 0.72)
    marks.bar(LEFT, y - 2, INNER_W, 6.5, "ink", 0.24)
    marks.bar(LEFT, y + 11, INNER_W * 0.7, 6.5, "ink", 0.24)
    y += 28
    size = 136
    marks.add(rect_path(LEFT, y, INNER_W, size, 5), "ink", None, 0.06)
    marks.inset("stress", LEFT + (INNER_W - size) / 2, y, size, size)
    y += size + 14
    height = (BOTTOM - y) / len(rows)
    for index in range(len(rows)):
        middle = y + index * height + height / 2
        marks.bar(LEFT, middle - 3, INNER_W * 0.46, 6, "ink", 0.45)
        marks.bar(RIGHT - INNER_W * 0.36, middle - 3, INNER_W * 0.36, 6, "hue", 0.8)
    return done(cover, marks)


def cover_design_review():
    """Its pictures of the design, then where it stands: each real line's own status."""
    text = read("docs/design_review.md")
    section = text.split("## Requirements met, and not met")[1].split("\n## ")[0]
    lines = [line for line in section.splitlines() if line.startswith("- ")]
    tones = [("fail" if line.startswith("- Not met") else "warning" if line.startswith("- Open") else
              "pass" if line.startswith("- Met") else "ink") for line in lines]
    cover, marks = sheet()
    y = title(marks)
    size = (INNER_W - 8) / 2
    for index, name in enumerate(("mount", "exploded")):
        x = LEFT + index * (size + 8)
        marks.add(rect_path(x, y, size, size, 5), "ink", None, 0.07)
        marks.inset(name, x, y, size, size)
    y += size + 14
    height = (BOTTOM - y) / max(len(lines), 1)
    for index, tone in enumerate(tones):
        middle = y + index * height + height / 2
        marks.add(circle_path(LEFT + 8, middle, 7), tone, None, 1.0 if tone != "ink" else 0.35)
        marks.bar(LEFT + 24, middle - 3.5, INNER_W * (0.82 - 0.09 * (index % 3)), 7, "ink", 0.28)
    return done(cover, marks)


def view_edges(toward, up, box, limit=math.radians(25)):
    """The bracket as a drawing's view: its hard edges, in a (x, y, width, height) box, hidden ones gone."""
    import trimesh
    from shapely.geometry import MultiLineString
    from shapely.ops import linemerge

    split = trimesh.util.concatenate(mount()["servo_bracket"])
    mesh = trimesh.Trimesh(split.vertices, split.faces, process=True)
    x, y, width, height = box
    camera = Camera(toward, up)
    across, down = mesh.vertices @ camera.right, mesh.vertices @ camera.up
    scale = min(width / np.ptp(across), height / np.ptp(down))
    camera.fit(mesh.vertices, 1.0)
    camera.scale = scale
    camera.centre = np.array((x + width / 2, y + height / 2))
    picture = render([Part(mesh, ALUMINIUM, flat=True)], camera)
    sharp = mesh.face_adjacency_edges[mesh.face_adjacency_angles > limit]
    runs = [run for a, b in sharp for run in seen_runs(picture, [mesh.vertices[a], mesh.vertices[b]], bias=0.3)]
    # A bend has no hard edge, so the view's outline closes it, as a drawing's would.
    outline = flat_shape([mesh], camera, 0.2)
    runs += [list(polygon.exterior.coords) for polygon in getattr(outline, "geoms", [outline])]
    merged = linemerge(MultiLineString(runs))
    lines = [merged] if merged.geom_type == "LineString" else list(merged.geoms)
    return [simplified(line.coords, 0.3) for line in lines]


def cover_drawing():
    """The real bracket's three views, each from its model, with dimension lines and no figures."""
    cover, marks = sheet()
    wide = INNER_W * 0.62
    top_view = (LEFT, TOP + 4, wide, wide * 40 / 64)
    front_view = (LEFT, TOP + 4 + wide * 40 / 64 + 28, wide, wide * 32 / 64)
    side_view = (LEFT + wide + 26, top_view[1], INNER_W - wide - 26, wide * 40 / 64)
    for run in view_edges((0, 0, 1), (0, 1, 0), top_view):
        marks.line(run, "ink", 2.0, 0.85)
    for run in view_edges((0, -1, 0), (0, 0, 1), front_view):
        marks.line(run, "ink", 2.0, 0.85)
    for run in view_edges((1, 0, 0), (0, 0, 1), (side_view[0], front_view[1], side_view[2], front_view[3])):
        marks.line(run, "ink", 2.0, 0.85)
    # Dimension lines: ticks and a span, with no figure on them.
    under = front_view[1] + front_view[3] + 15
    marks.line([(LEFT, under), (LEFT + wide, under)], "hue", 2.4)
    marks.line([(LEFT, under - 6), (LEFT, under + 6)], "hue", 2.4)
    marks.line([(LEFT + wide, under - 6), (LEFT + wide, under + 6)], "hue", 2.4)
    beside = side_view[0] - 11
    marks.line([(beside, top_view[1]), (beside, top_view[1] + top_view[3])], "hue", 2.4)
    marks.line([(beside - 6, top_view[1]), (beside + 6, top_view[1])], "hue", 2.4)
    marks.line([(beside - 6, top_view[1] + top_view[3]), (beside + 6, top_view[1] + top_view[3])], "hue", 2.4)
    # The title block, its cells empty.
    block = (RIGHT - INNER_W * 0.6, BOTTOM - 54, INNER_W * 0.6, 54)
    marks.add(rect_path(*block), "ink", 2.0, 0.6)
    marks.line([(block[0], block[1] + 27), (RIGHT, block[1] + 27)], "ink", 2.0, 0.6)
    marks.line([(block[0] + block[2] * 0.55, block[1]), (block[0] + block[2] * 0.55, BOTTOM)], "ink", 2.0, 0.6)
    marks.bar(block[0] + 8, block[1] + 10, block[2] * 0.4, 6, "ink", 0.3)
    marks.bar(block[0] + 8, block[1] + 37, block[2] * 0.3, 6, "ink", 0.3)
    return done(cover, marks)


def flat_marks(marks: Marks, box, rings, bends, tone="ink", fill=None, width=3.0) -> None:
    """A flat pattern's real contours fitted to (x, y, width, height), rotated by a quarter turn when
    asked through its box's fifth value."""
    x, y, w, h, *turn = box
    points = np.vstack([np.array(ring) for ring in rings])
    low, high = points.min(axis=0), points.max(axis=0)
    size = high - low
    turned = bool(turn and turn[0])
    scale = min(w / (size[1] if turned else size[0]), h / (size[0] if turned else size[1]))

    def place(ring):
        ring = (np.array(ring) - low - size / 2) * scale
        if turned:
            ring = ring[:, ::-1]
        return ring * [1, -1] + [x + w / 2, y + h / 2]

    placed = [place(ring) for ring in rings]
    if fill is not None:
        marks.add("".join(line_path(simplified(ring.tolist(), 0.25), closed=True) for ring in placed), fill[0], None, fill[1])
    for ring in placed:
        marks.line(simplified(ring.tolist(), 0.25), tone, width, closed=True)
    for bend in bends:
        marks.line(place(bend), "hue", width)


def cover_dxf():
    """The real cut file: its cut contours, and its bend line in its own hue, as it is on its layer."""
    rings, bends = cut_shapes(SERVO / "cut" / "servo_bracket_cut.dxf")
    cover, marks = sheet()
    room = 22
    flat_marks(marks, (LEFT + room / 2, TOP + 40, INNER_W - room, INNER_H - 80), rings, bends, width=3.2)
    for cx, cy in ((LEFT, TOP), (RIGHT, TOP), (LEFT, BOTTOM), (RIGHT, BOTTOM)):
        sx, sy = (1 if cx == LEFT else -1), (1 if cy == TOP else -1)
        marks.line([(cx + sx * 16, cy), (cx, cy), (cx, cy + sy * 16)], "ink", 2.4, 0.4)
    return done(cover, marks)


def cover_nest():
    """Real flat patterns, the bracket's and the shelf bracket's, nested on a sheet of stock: the
    outlines are real, the nest is an illustration."""
    servo, servo_bends = cut_shapes(SERVO / "cut" / "servo_bracket_cut.dxf")
    shelf, shelf_bends = cut_shapes(SAMPLES / "shelf-bracket" / "cut" / "shelf_bracket_cut.dxf")
    cover, marks = sheet()
    left, top = SHEET["x"] + 14, SHEET["y"] + 14
    cell_w = (SHEET["w"] - 28 - 8) / 2
    cell_h = (SHEET["h"] - 28 - 16) / 3
    for row in range(3):
        for column in range(2):
            box = (left + column * (cell_w + 8), top + row * (cell_h + 8), cell_w, cell_h)
            first = row == 0 and column == 0
            if row == 2 and column == 1:
                flat_marks(marks, box + (True,), shelf, [], fill=("ink", 0.14), width=2.4)
            else:
                flat_marks(marks, box, servo, [], "hue" if first else "ink", ("hue", 0.3) if first else ("ink", 0.14), 2.4)
    return done(cover, marks)


def cover_instructions():
    """The real assembly order, one panel a step, each step's new part in the hue."""
    solids = mount()
    order = [("servo_bracket",), ("cable_clip",), ("mg996r",), ("m3x8_screw",), ("horn_adapter",)]
    cover, marks = sheet()
    y = TOP
    gap = 8
    columns, rows = 2, 3
    width = (INNER_W - gap) / columns
    height = (INNER_H - 2 * gap) / rows
    everything = [mesh for meshes in solids.values() for mesh in meshes]
    for index in range(rows * columns):
        step = min(index, len(order) - 1)
        x, top = LEFT + (index % 2) * (width + gap), y + (index // 2) * (height + gap)
        marks.add(rect_path(x, top, width, height, 5), "ink", 2.0, 0.22)
        size = min(width, height) - 16
        camera = Camera().fit(np.vstack([mesh.vertices for mesh in everything]), size, (x + width / 2, top + height / 2 + 3))
        before = [mesh for names in order[:step] for name in names for mesh in solids[name]]
        new = [mesh for name in order[step] for mesh in solids[name]]
        if index == 5:
            before, new = everything, []
        if before:
            marks.add(shape_path(flat_shape(before, camera, 0.35)), "ink", None, 0.32)
        if new:
            marks.add(shape_path(flat_shape(new, camera, 0.35)), "hue")
        marks.add(circle_path(x + 13, top + 13, 7), "hue" if index < 5 else "ink", None, 1.0 if index < 5 else 0.5)
    return done(cover, marks)


# The covers, by name. A later cover's sheet can inset an earlier one's picture.
COVERS = {
    "bracket": cover_bracket,
    "adapter": cover_adapter,
    "mount": cover_mount,
    "mesh": cover_mesh,
    "catalog": cover_catalog,
    "exploded": cover_exploded,
    "views": cover_views,
    "motion": cover_motion,
    "fit": cover_fit,
    "pmi": cover_pmi,
    "urdf": cover_urdf,
    "stress": cover_stress,
    "toolpaths": cover_toolpaths,
    "flags": cover_flags,
    "gcode": cover_gcode,
    "dxf": cover_dxf,
    "nest": cover_nest,
    "drawing": cover_drawing,
    "instructions": cover_instructions,
    "parts-list": cover_parts_list,
    "test-plan": cover_test_plan,
    "write-up": cover_write_up,
    "prd": cover_prd,
    "requirements": cover_requirements,
    "fmea": cover_fmea,
    "design-review": cover_design_review,
}


def draw_covers(names: list[str]) -> None:
    written = json.loads(COVERS_FILE.read_text(encoding="utf-8")) if names and COVERS_FILE.is_file() else {"covers": {}}
    covers = written["covers"]
    for name in names or COVERS:
        cover = COVERS[name]()
        image = cover.get("image")
        if image is not None:
            image.save(PICTURES / f"{name}.webp", "WEBP", quality=QUALITY, method=6, alpha_quality=90)
        covers[name] = {
            "image": image is not None,
            "sheet": bool(cover.get("sheet")),
            "marks": cover["marks"].as_json(),
            "insets": cover["marks"].insets,
        }
        print(f"pictures/{name}")
    ordered = {name: covers[name] for name in COVERS if name in covers}
    COVERS_FILE.write_text(json.dumps({"sheet": SHEET, "covers": ordered}, separators=(",", ":")) + "\n", encoding="utf-8")
    if not names:
        keep = {f"{name}.webp" for name, cover in ordered.items() if cover["image"]}
        for picture in PICTURES.glob("*.webp"):
            if picture.name not in keep:
                picture.unlink()
                print(f"removed pictures/{picture.name}")
        (PICTURES / "kept-results.json").unlink(missing_ok=True)


# Examples' card pictures ------------------------------------------------------------------------

def fit(image: Image.Image) -> Image.Image:
    """The whole picture at the pictures' size, any room left in its own background (its corner)."""
    if image.mode != "RGBA":
        image = image.convert("RGB")
    return ImageOps.pad(image, SIZE, method=Image.Resampling.LANCZOS, color=image.getpixel((0, 0)))


def on_nothing(image: Image.Image, tolerance: int = 2) -> Image.Image:
    """A picture drawn on a flat ground (its corner's colour) as the part alone on nothing. The
    ground is what matches the corner, within `tolerance`, holes in the part too; the pixels beside
    it, the part's antialiased outline, keep what the ground did not put there (colour to alpha), so
    no fringe of the old ground shows on another. The part itself stays as it was drawn."""
    rgb = np.asarray(image.convert("RGB"), dtype=float)
    ground = rgb[0, 0]
    is_ground = np.abs(rgb - ground).max(axis=2) <= tolerance
    mask = Image.fromarray(np.uint8(is_ground) * 255).filter(ImageFilter.MaxFilter(5))
    outline = np.asarray(mask) > 0
    # How far each channel left the ground, of as far as it could go that way.
    above = np.maximum(rgb - ground, 0) / np.maximum(255 - ground, 1)
    below = np.maximum(ground - rgb, 0) / np.maximum(ground, 1)
    alpha = np.where(outline, np.maximum(above, below).max(axis=2), 1.0)
    alpha[is_ground] = 0
    kept = alpha[..., None] > 0
    colour = np.where(kept, ground + (rgb - ground) / np.maximum(alpha[..., None], 1e-6), 0.0)
    drawn = np.dstack([np.clip(colour, 0, 255), alpha * 255])
    return Image.fromarray(np.uint8(np.rint(drawn)))


def bake_examples() -> None:
    """Each example's card picture, on nothing, into the library's pictures/examples/."""
    (PICTURES / "examples").mkdir(exist_ok=True)
    for marker in sorted(SAMPLES.glob("*/studio-sample.json")):
        card = marker.parent / json.loads(marker.read_text(encoding="utf-8"))["picture"]
        with Image.open(card) as image:
            fit(on_nothing(image)).save(PICTURES / "examples" / f"{marker.parent.name}.webp", "WEBP", quality=QUALITY)
        print(f"pictures/examples/{marker.parent.name}.webp, from {marker.parent.name}/{card.name}")


def main() -> int:
    if sys.argv[1:] == ["--examples"]:
        bake_examples()
        return 0
    names = sys.argv[1:]
    unknown = [name for name in names if name not in COVERS]
    if unknown:
        raise SystemExit(f"no cover named {', '.join(unknown)}; the covers are {', '.join(COVERS)}")
    PICTURES.mkdir(exist_ok=True)
    draw_covers(names)
    if not names:
        bake_examples()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
