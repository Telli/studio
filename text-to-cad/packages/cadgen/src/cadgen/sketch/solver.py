"""Solving a sketch: every point and radius where its relations and dimensions put them.

The unknowns are the free points' coordinates and the circles' radii (an arc's radius is its
start's distance from its center, and its end keeps to it). Each relation and dimension is a
residual that is zero when it holds. The sketch is solved by least squares from the geometry as
it was drawn, first with every unknown held lightly where it was put and then without, so what no
dimension fixes stays where it was drawn, as in a CAD tool's sketcher.

How defined a sketch is comes from the residuals' Jacobian at the solution: its rank short of the
unknowns is the degrees of freedom left (Under defined while any are), and a relation that adds
nothing to its rank is redundant (Over defined, the relations named).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import least_squares

from .sketch import STATUS_FULLY, STATUS_OVER, STATUS_UNDER, Arc, Circle, Line, Point, SketchError

__all__ = ["Solution", "solve"]

# How lightly the first pass holds each unknown where it was drawn.
STAY_WEIGHT = 1e-3


@dataclass
class Solution:
    status: str
    dof: int
    redundant: list = field(default_factory=list)
    residual: float = 0.0


class _Unknowns:
    """The free points' coordinates and the circles' radii, as one vector."""

    def __init__(self, sketch):
        self.slots: dict[int, int] = {}
        values: list[float] = []
        for point in sketch.points:
            if not point.fixed:
                self.slots[id(point)] = len(values)
                values += [point.x, point.y]
        for curve in sketch.curves:
            if isinstance(curve, Circle):
                self.slots[id(curve)] = len(values)
                values.append(curve.radius)
        self.x0 = np.array(values, dtype=float)

    def point(self, point: Point, x) -> np.ndarray:
        slot = self.slots.get(id(point))
        return np.array([point.x, point.y], dtype=float) if slot is None else x[slot:slot + 2]

    def center(self, item, x) -> np.ndarray:
        return self.point(item, x) if isinstance(item, Point) else self.point(item.center, x)

    def radius(self, curve, x) -> float:
        if isinstance(curve, Circle):
            return x[self.slots[id(curve)]]
        return float(np.linalg.norm(self.point(curve.start, x) - self.point(curve.center, x)))

    def write(self, sketch, x) -> None:
        for point in sketch.points:
            slot = self.slots.get(id(point))
            if slot is not None:
                point.x, point.y = float(x[slot]), float(x[slot + 1])
        for curve in sketch.curves:
            if isinstance(curve, Circle):
                curve.radius = float(x[self.slots[id(curve)]])


def _cross(a, b) -> float:
    return float(a[0] * b[1] - a[1] * b[0])


def _residual(relation, u: _Unknowns, scale: float):
    """The residual of one relation or dimension, as a function of the unknowns; None for one
    that holds without solving (a fixed point is no unknown at all)."""
    kind, refs, value, data = relation.kind, relation.refs, relation.value, relation.data
    P = u.point

    def direction(line, x):
        return P(line.end, x) - P(line.start, x)

    def unit(line, x):
        d = direction(line, x)
        return d / (np.linalg.norm(d) or 1e-12)

    def signed_distance(line, point, x):
        d = direction(line, x)
        return _cross(d, P(point, x) - P(line.start, x)) / (np.linalg.norm(d) or 1e-12)

    if kind == "fixed":
        return None
    if kind == "coincident":
        a, b = refs
        if isinstance(b, Point):
            return lambda x: P(a, x) - P(b, x)
        if isinstance(b, Line):
            return lambda x: [signed_distance(b, a, x)]
        return lambda x: [np.linalg.norm(P(a, x) - u.center(b, x)) - u.radius(b, x)]
    if kind in ("horizontal", "vertical"):
        axis = 1 if kind == "horizontal" else 0
        a, b = (refs[0].start, refs[0].end) if len(refs) == 1 else refs
        return lambda x: [P(a, x)[axis] - P(b, x)[axis]]
    if kind == "parallel":
        a, b = refs
        return lambda x: [scale * _cross(unit(a, x), unit(b, x))]
    if kind == "perpendicular":
        a, b = refs
        return lambda x: [scale * float(np.dot(unit(a, x), unit(b, x)))]
    if kind == "tangent":
        a, b = refs
        at = data.get("at")
        # Where the two share an end, tangency is the radius square to the line (or the two
        # centers in line with it) there: the distance form is flat at that solution, and a
        # flat residual is one the solver cannot see.
        if at is not None and isinstance(a, Line):
            return lambda x: [float(np.dot(P(at, x) - u.center(b, x), unit(a, x)))]
        if at is not None:
            def in_line(x):
                ra, rb = P(at, x) - u.center(a, x), P(at, x) - u.center(b, x)
                return [_cross(ra, rb) / (np.linalg.norm(rb) or 1e-12)]

            return in_line
        if isinstance(a, Line):
            side = data["side"]
            return lambda x: [side * signed_distance(a, b.center, x) - u.radius(b, x)]
        inside = data["inside"]
        return lambda x: [np.linalg.norm(u.center(a, x) - u.center(b, x))
                          - (abs(u.radius(a, x) - u.radius(b, x)) if inside else u.radius(a, x) + u.radius(b, x))]
    if kind == "equal":
        a, b = refs
        if isinstance(a, Line) and isinstance(b, Line):
            return lambda x: [np.linalg.norm(direction(a, x)) - np.linalg.norm(direction(b, x))]
        return lambda x: [u.radius(a, x) - u.radius(b, x)]
    if kind == "midpoint":
        point, line = refs
        return lambda x: P(point, x) - (P(line.start, x) + P(line.end, x)) / 2
    if kind == "symmetric":
        a, b, about = refs

        def symmetric(x):
            pa, pb, d = P(a, x), P(b, x), direction(about, x)
            n = np.linalg.norm(d) or 1e-12
            return [_cross(d, (pa + pb) / 2 - P(about.start, x)) / n, float(np.dot(pa - pb, d)) / n]

        return symmetric
    if kind == "concentric":
        a, b = refs
        return lambda x: u.center(a, x) - u.center(b, x)
    if kind == "distance":
        a, b = refs
        if isinstance(b, Line):
            side = data.get("side", 1.0)
            start = a.start if isinstance(a, Line) else a
            return lambda x: [side * signed_distance(b, start, x) - value]
        return lambda x: [np.linalg.norm(u.center(a, x) - u.center(b, x)) - value]
    if kind == "length":
        line = refs[0]
        return lambda x: [np.linalg.norm(direction(line, x)) - value]
    if kind in ("horizontal_distance", "vertical_distance"):
        a, b = refs
        axis, sign = (0 if kind == "horizontal_distance" else 1), data["sign"]
        return lambda x: [sign * (u.center(b, x)[axis] - u.center(a, x)[axis]) - value]
    if kind == "radius":
        return lambda x: [u.radius(refs[0], x) - value]
    if kind == "diameter":
        return lambda x: [2 * u.radius(refs[0], x) - value]
    if kind == "angle":
        a, b = refs
        target = math.radians(value)
        return lambda x: [scale * (math.atan2(abs(_cross(direction(a, x), direction(b, x))),
                                              float(np.dot(direction(a, x), direction(b, x)))) - target)]
    raise SketchError(f"{relation.name}: no relation called {kind}.")


def _rank(matrix: np.ndarray) -> int:
    if matrix.size == 0:
        return 0
    values = np.linalg.svd(matrix, compute_uv=False)
    return int((values > 1e-8 * max(1.0, float(values[0]))).sum())


def solve(sketch) -> Solution:
    u = _Unknowns(sketch)
    coordinates = [abs(c) for p in sketch.points for c in (p.x, p.y)] + [abs(float(r.value)) for r in sketch.relations if r.value is not None]
    scale = max([1.0, *coordinates])
    terms = [(arc, (lambda arc: lambda x: [np.linalg.norm(u.point(arc.start, x) - u.point(arc.center, x))
                                           - np.linalg.norm(u.point(arc.end, x) - u.point(arc.center, x))])(arc))
             for arc in sketch.curves if isinstance(arc, Arc)]
    terms += [(relation, fn) for relation in sketch.relations if (fn := _residual(relation, u, scale)) is not None]

    def residuals(x):
        return np.concatenate([np.atleast_1d(np.asarray(fn(x), dtype=float)) for _, fn in terms]) if terms else np.zeros(0)

    x = u.x0.copy()
    n, m = len(x), len(residuals(x))
    if n and m:
        # First held lightly where it was drawn, so what no dimension fixes stays put; then exactly.
        held = least_squares(lambda x: np.concatenate([residuals(x), STAY_WEIGHT * (x - u.x0)]), x, method="lm",
                             xtol=1e-12, ftol=1e-12, gtol=1e-12, max_nfev=400 * (n + 1))
        exact = least_squares(residuals, held.x, method="lm" if m >= n else "trf",
                              xtol=1e-14, ftol=1e-14, gtol=1e-14, max_nfev=400 * (n + 1))
        x = exact.x
    left = residuals(x)
    worst = float(np.max(np.abs(left))) if left.size else 0.0
    if worst > 1e-7 * scale:
        off = sorted(((float(np.max(np.abs(np.atleast_1d(fn(x))))), item) for item, fn in terms), key=lambda pair: -pair[0])
        named = [item.name for size, item in off if size > 1e-7 * scale][:3]
        raise SketchError(f"{sketch.name} can't be solved: {', '.join(named)} can't all hold. Remove one, or change its value.")
    u.write(sketch, x)

    # How defined: the Jacobian's rank against the unknowns, and each relation's share of it.
    if not (n and m):
        return Solution(STATUS_FULLY if n == 0 else STATUS_UNDER, n, [], worst)
    step = 1e-6 * scale
    jacobian = np.empty((m, n))
    for column in range(n):
        delta = np.zeros(n)
        delta[column] = step
        jacobian[:, column] = (residuals(x + delta) - residuals(x - delta)) / (2 * step)
    dof = n - _rank(jacobian)
    redundant, rows, rank = [], 0, 0
    for item, fn in terms:
        count = len(np.atleast_1d(fn(x)))
        new_rank = _rank(jacobian[: rows + count])
        if new_rank < rank + count and not isinstance(item, Arc):
            redundant.append(item)
        rows += count
        rank = new_rank
    status = STATUS_OVER if redundant else STATUS_FULLY if dof == 0 else STATUS_UNDER
    return Solution(status, dof, redundant, worst)
