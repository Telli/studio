"""Sketch fillets where they fall on a solved sketch.

A sketch fillet rounds the corner where two lines meet with an arc of its radius tangent to both,
as a CAD tool's sketch fillet does. The lines keep their ends at the corner, its virtual sharp, so
the sketch's dimensions to the corner still measure to it and nothing is solved again: the arc,
and where it meets each line, follow from the lines as they solved. The face is made with the
corner rounded (``regions.py``), and an editor draws each line up to its fillet.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from .sketch import Line, Point, SketchError

__all__ = ["FilletArc", "fillet_arcs"]


@dataclass
class FilletArc:
    """One fillet on the solved sketch: its arc (``Fillet1``) from where it meets ``a`` to where
    it meets ``b``, around ``center``, and the dimension that is its radius."""

    name: str
    relation: object
    a: Line
    b: Line
    corner: Point
    center: tuple[float, float]
    start: tuple[float, float]
    end: tuple[float, float]
    radius: float
    clockwise: bool

    def end_of(self, line: Line) -> str:
        """Which end of one of its lines the fillet takes: ``start`` or ``end``."""
        return "start" if line.start is self.corner else "end"


def _far(line: Line, corner: Point) -> Point:
    return line.end if line.start is corner else line.start


def fillet_arcs(sketch) -> list[FilletArc]:
    """Each fillet of a solved sketch as the arc between its lines. Raises SketchError for one
    whose lines are in line, or whose radius is more than its lines can take (with the fillet at
    each line's other end, if it has one)."""
    made: list[FilletArc] = []
    taken: dict[tuple[int, str], float] = {}
    for relation in sketch.relations:
        if relation.kind != "fillet":
            continue
        a, b = relation.refs
        corner = relation.data["corner"]
        name = relation.data["arc"]
        p = (corner.x, corner.y)
        rays = []
        for line in (a, b):
            far = _far(line, corner)
            dx, dy = far.x - p[0], far.y - p[1]
            length = math.hypot(dx, dy)
            if length <= 1e-12:
                raise SketchError(f"{line.name} has no length, so {name} has no corner to round.")
            rays.append((dx / length, dy / length))
        (ux, uy), (vx, vy) = rays
        theta = math.acos(max(-1.0, min(1.0, ux * vx + uy * vy)))
        if theta < 1e-6 or math.pi - theta < 1e-6:
            raise SketchError(f"{a.name} and {b.name} are in line, so {name} has no corner to round.")
        r = float(relation.value)
        reach = r / math.tan(theta / 2)
        for line in (a, b):
            key = (id(line), "start" if line.start is corner else "end")
            taken[key] = taken.get(key, 0.0) + reach
        wx, wy = ux + vx, uy + vy
        w = math.hypot(wx, wy)
        out = r / math.sin(theta / 2)
        center = (p[0] + wx / w * out, p[1] + wy / w * out)
        start = (p[0] + ux * reach, p[1] + uy * reach)
        end = (p[0] + vx * reach, p[1] + vy * reach)
        turn = (start[0] - center[0]) * (end[1] - center[1]) - (start[1] - center[1]) * (end[0] - center[0])
        made.append(FilletArc(name, relation, a, b, corner, center, start, end, r, clockwise=turn < 0))
    # A line rounded at both ends takes both fillets' reach.
    for arc in made:
        for line in (arc.a, arc.b):
            need = taken.get((id(line), "start"), 0.0) + taken.get((id(line), "end"), 0.0)
            if need > line.length * (1 + 1e-9):
                raise SketchError(f"{arc.name}'s radius of {arc.radius:g} is more than {line.name} can take. Make it smaller.")
    return made
