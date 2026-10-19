"""The sketch itself: its entities, its relations and dimensions, and what it reports.

Entities and relations are named as a CAD tool's sketcher names them (Point1, Line1, Arc1,
Circle1; Horizontal1, Tangent1; D1 for a dimension), and each remembers the line of the script
that made it, so an editor can show and change the sketch through the script. A sketch is solved
on demand (``solve``), and again only when something changed.

A sketch's numbers are in its own unit: millimetres unless ``unit`` says otherwise (``unit=INCH``
in a part sized in inches, so its sketch reads in inches too).
"""

from __future__ import annotations

import math
import os
import sys
from dataclasses import dataclass, field

__all__ = ["Arc", "Circle", "Line", "Point", "Relation", "Sketch", "SketchError"]


class SketchError(ValueError):
    """A sketch that cannot be solved or made into a face, said in a CAD tool's words."""


# The origin's planes as a CAD tree names them (Top is XY), and build123d's own names.
PLANE_NAMES = {"Top": "XY", "Front": "XZ", "Right": "YZ", "XY": "XY", "XZ": "XZ", "YZ": "YZ"}
STATUS_FULLY, STATUS_UNDER, STATUS_OVER = "Fully defined", "Under defined", "Over defined"
# Told of every sketch made, with the frame of the script that made it: edit mode's tracer keeps
# where each sketch is made, to solve it again from its own lines as they are edited.
WATCHERS: list = []
_HERE = os.path.dirname(os.path.abspath(__file__))


def _caller():
    """The frame of the script that called into the sketch: the first one outside this package."""
    frame = sys._getframe(1)
    while frame is not None and os.path.dirname(os.path.abspath(frame.f_code.co_filename)) == _HERE:
        frame = frame.f_back
    return frame


def _source():
    """The script line that called into the sketch."""
    frame = _caller()
    return (frame.f_code.co_filename, frame.f_lineno) if frame is not None else None


def _literal(value) -> str | None:
    """The number in the script a value was written as, when edit mode's tracer runs the script
    (it reads each number as one that remembers where it is written); None otherwise."""
    expr = getattr(value, "_e", None)
    return expr[1] if isinstance(expr, tuple) and len(expr) == 2 and expr[0] == "lit" else None


@dataclass(eq=False)
class Point:
    name: str
    x: float
    y: float
    fixed: bool = False
    construction: bool = False
    source: tuple | None = None
    # Where its x and y are written in the script, under edit mode's tracer.
    literals: tuple = (None, None)

    def __iter__(self):
        yield self.x
        yield self.y

    def __repr__(self) -> str:
        return f"{self.name}({self.x:g}, {self.y:g})"


@dataclass(eq=False)
class Line:
    name: str
    start: Point
    end: Point
    construction: bool = False
    source: tuple | None = None

    @property
    def length(self) -> float:
        return math.hypot(self.end.x - self.start.x, self.end.y - self.start.y)

    def __repr__(self) -> str:
        return f"{self.name}({self.start!r} to {self.end!r})"


@dataclass(eq=False)
class Circle:
    name: str
    center: Point
    radius: float
    construction: bool = False
    source: tuple | None = None
    literal: str | None = None  # where its radius is written

    def __repr__(self) -> str:
        return f"{self.name}(center {self.center!r}, radius {self.radius:g})"


@dataclass(eq=False)
class Arc:
    """A center-point arc: from ``start`` to ``end`` around ``center``, counterclockwise unless
    ``clockwise``. Its radius is its start's distance from the center; its end keeps to it."""

    name: str
    center: Point
    start: Point
    end: Point
    clockwise: bool = False
    construction: bool = False
    source: tuple | None = None
    literal: str | None = None  # where a slot's radius is written

    @property
    def radius(self) -> float:
        return math.hypot(self.start.x - self.center.x, self.start.y - self.center.y)

    def __repr__(self) -> str:
        return f"{self.name}(center {self.center!r}, {self.start!r} to {self.end!r})"


@dataclass(eq=False)
class Relation:
    """A relation (``dimension`` False: Horizontal1, Tangent1) or a dimension (D1) on entities.
    ``value`` is a dimension's size (in the part's units, or degrees for an angle) and ``raw``
    what the script passed (a named size, traced in edit mode); ``data`` keeps what the drawing
    decided once (which side a distance is measured to, whether a tangent arc is inside)."""

    name: str
    kind: str
    refs: tuple
    value: float | None = None
    raw: object = None
    dimension: bool = False
    source: tuple | None = None
    data: dict = field(default_factory=dict)

    def __repr__(self) -> str:
        sized = f" = {self.value:g}" if self.value is not None else ""
        return f"{self.name}({', '.join(ref.name for ref in self.refs)}){sized}"


def _number(value, what: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise SketchError(f"{what} must be a number, not {value!r}.") from None
    if not math.isfinite(number):
        raise SketchError(f"{what} must be a finite number.")
    return number


class Sketch:
    """A constrained 2D sketch on a plane: ``plane`` is Top, Front or Right (XY, XZ, YZ), a
    build123d Plane, or a planar Face to sketch on; ``offset`` moves it along its normal.
    ``unit`` is how many millimetres one of the sketch's units is (25.4 for a sketch in inches).
    ``origin`` is the sketch's origin, a fixed point to dimension from."""

    def __init__(self, name: str = "Sketch1", plane="Top", offset: float = 0.0, unit: float = 1.0):
        self.name = str(name)
        self.plane = plane
        self.offset = _number(offset, "The offset")
        self.unit = _number(unit, "The unit")
        if self.unit <= 0:
            raise SketchError("A sketch's unit must be more than zero.")
        self.points: list[Point] = []
        self.curves: list[Line | Arc | Circle] = []
        self.relations: list[Relation] = []
        self._counts: dict[str, int] = {}
        self._solution = None
        frame = _caller()
        self.source = (frame.f_code.co_filename, frame.f_lineno) if frame is not None else None
        self.origin = Point("Origin", 0.0, 0.0, fixed=True, construction=True, source=self.source)
        for watch in WATCHERS:
            watch(self, frame)

    # --- naming and bookkeeping ---------------------------------------------------------------

    def _named(self, kind: str) -> str:
        self._counts[kind] = self._counts.get(kind, 0) + 1
        return f"{kind}{self._counts[kind]}"

    def _changed(self):
        self._solution = None

    def _point(self, value, *, construction: bool = False) -> Point:
        if isinstance(value, Point):
            return value
        try:
            x, y = value
        except (TypeError, ValueError):
            raise SketchError(f"A point is a sketch Point or an (x, y) pair, not {value!r}.") from None
        point = Point(self._named("Point"), _number(x, "A point's x"), _number(y, "A point's y"),
                      construction=construction, source=_source(), literals=(_literal(x), _literal(y)))
        self.points.append(point)
        self._changed()
        return point

    def _relate(self, kind: str, refs, value=None, *, label: str | None = None, data: dict | None = None) -> Relation:
        dimension = value is not None
        relation = Relation(
            name=f"D{self._counts.get('D', 0) + 1}" if dimension else self._named(label or kind.capitalize()),
            kind=kind, refs=tuple(refs), value=_number(value, "A dimension") if dimension else None,
            raw=value, dimension=dimension, source=_source(), data=dict(data or {}),
        )
        if dimension:
            self._counts["D"] = self._counts.get("D", 0) + 1
        self.relations.append(relation)
        self._changed()
        return relation

    # --- geometry --------------------------------------------------------------------------------

    def point(self, x, y, *, fixed: bool = False, construction: bool = False) -> Point:
        """A point at (x, y) on the sketch; ``fixed`` holds it where it is."""
        point = Point(self._named("Point"), _number(x, "A point's x"), _number(y, "A point's y"),
                      fixed=fixed, construction=construction, source=_source(), literals=(_literal(x), _literal(y)))
        self.points.append(point)
        self._changed()
        return point

    def line(self, start, end, *, construction: bool = False) -> Line:
        """A line between two points (sketch Points, or (x, y) pairs made into points)."""
        a, b = self._point(start), self._point(end)
        if a is b:
            raise SketchError("A line needs two different points.")
        line = Line(self._named("Line"), a, b, construction, _source())
        self.curves.append(line)
        self._changed()
        return line

    def polyline(self, *points, closed: bool = False, construction: bool = False) -> list[Line]:
        """Lines through the points in order, each starting where the last ended; ``closed``
        returns to the first."""
        made = [self._point(point) for point in points]
        if len(made) < 2:
            raise SketchError("A polyline needs at least two points.")
        pairs = list(zip(made, made[1:])) + ([(made[-1], made[0])] if closed else [])
        return [self.line(a, b, construction=construction) for a, b in pairs]

    def circle(self, center, radius, *, construction: bool = False) -> Circle:
        """A circle around a center point."""
        r = _number(radius, "A radius")
        if r <= 0:
            raise SketchError("A circle's radius must be more than zero.")
        circle = Circle(self._named("Circle"), self._point(center), r, construction, _source(), literal=_literal(radius))
        self.curves.append(circle)
        self._changed()
        return circle

    def arc(self, center, start, end, *, clockwise: bool = False, construction: bool = False) -> Arc:
        """A center-point arc from ``start`` to ``end``, counterclockwise unless ``clockwise``."""
        c, a, b = self._point(center), self._point(start), self._point(end)
        if len({id(c), id(a), id(b)}) < 3:
            raise SketchError("An arc needs a center, a start and an end that are different points.")
        arc = Arc(self._named("Arc"), c, a, b, clockwise, construction, _source())
        self.curves.append(arc)
        self._changed()
        return arc

    def three_point_arc(self, start, through, end, *, construction: bool = False) -> Arc:
        """An arc from ``start`` through a point to ``end``: its center is placed where the three
        points say, and it keeps to the side ``through`` is on."""
        (ax, ay), (bx, by), (cx, cy) = tuple(start), tuple(through), tuple(end)
        d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
        if abs(d) < 1e-12:
            raise SketchError("A three-point arc's points are in a line.")
        ux = ((ax**2 + ay**2) * (by - cy) + (bx**2 + by**2) * (cy - ay) + (cx**2 + cy**2) * (ay - by)) / d
        uy = ((ax**2 + ay**2) * (cx - bx) + (bx**2 + by**2) * (ax - cx) + (cx**2 + cy**2) * (bx - ax)) / d
        # Start, through, end turning counterclockwise is a counterclockwise arc.
        counterclockwise = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax) > 0
        return self.arc((ux, uy), start, end, clockwise=not counterclockwise, construction=construction)

    def rectangle(self, corner, opposite, *, construction: bool = False) -> tuple[Line, Line, Line, Line]:
        """A rectangle from one corner to the opposite one, as a CAD tool's corner rectangle draws
        it: four lines, the bottom and top horizontal, the sides vertical. Returns them as
        (bottom, right, top, left)."""
        (x0, y0), (x1, y1) = tuple(corner), tuple(opposite)
        p0 = self._point(corner) if isinstance(corner, Point) else self.point(x0, y0, construction=construction)
        p1 = self.point(x1, y0, construction=construction)
        p2 = self._point(opposite) if isinstance(opposite, Point) else self.point(x1, y1, construction=construction)
        p3 = self.point(x0, y1, construction=construction)
        bottom, right, top, left = (self.line(a, b, construction=construction) for a, b in ((p0, p1), (p1, p2), (p2, p3), (p3, p0)))
        self.horizontal(bottom)
        self.horizontal(top)
        self.vertical(left)
        self.vertical(right)
        return bottom, right, top, left

    def center_rectangle(self, center, corner, *, construction: bool = False) -> tuple[Line, Line, Line, Line]:
        """A rectangle around a center point, to one corner: a rectangle whose center (the middle
        of a construction diagonal) is held at the center point."""
        (cx, cy), (x1, y1) = tuple(center), tuple(corner)
        bottom, right, top, left = self.rectangle((2 * cx - x1, 2 * cy - y1), (x1, y1), construction=construction)
        diagonal = self.line(bottom.start, top.start, construction=True)
        self.midpoint(self._point(center), diagonal)
        return bottom, right, top, left

    def slot(self, center1, center2, radius, *, construction: bool = False) -> tuple[Arc, Line, Arc, Line]:
        """A straight slot between two arc centers, as a CAD tool's slot draws it: two arcs of one
        radius joined by two lines tangent to both. Returns (arc1, line1, arc2, line2)."""
        c1, c2 = self._point(center1), self._point(center2)
        r = _number(radius, "A slot's radius")
        dx, dy = c2.x - c1.x, c2.y - c1.y
        length = math.hypot(dx, dy)
        if length <= 0 or r <= 0:
            raise SketchError("A slot needs two different centers and a radius more than zero.")
        nx, ny = -dy / length * r, dx / length * r
        a1 = self.point(c1.x - nx, c1.y - ny, construction=construction)
        b1 = self.point(c1.x + nx, c1.y + ny, construction=construction)
        a2 = self.point(c2.x - nx, c2.y - ny, construction=construction)
        b2 = self.point(c2.x + nx, c2.y + ny, construction=construction)
        arc1 = self.arc(c1, b1, a1, construction=construction)
        line1 = self.line(a1, a2, construction=construction)
        arc2 = self.arc(c2, a2, b2, construction=construction)
        line2 = self.line(b2, b1, construction=construction)
        arc1.literal = arc2.literal = _literal(radius)
        for line in (line1, line2):
            self.tangent(line, arc1)
            self.tangent(line, arc2)
        self.equal(arc1, arc2)
        return arc1, line1, arc2, line2

    # --- relations ---------------------------------------------------------------------------------

    def fix(self, point: Point) -> Relation:
        """Hold a point where it is."""
        point.fixed = True
        return self._relate("fixed", (point,), label="Fixed")

    def coincident(self, a, b) -> Relation:
        """A point on another point, or on a line, arc or circle."""
        if isinstance(a, Point) and isinstance(b, Point):
            return self._relate("coincident", (a, b))
        point, curve = (a, b) if isinstance(a, Point) else (b, a)
        if not isinstance(point, Point):
            raise SketchError("Coincident takes a point and a point, line, arc or circle.")
        return self._relate("coincident", (point, curve))

    def horizontal(self, a, b=None) -> Relation:
        """A line horizontal, or two points at one height."""
        return self._relate("horizontal", (a,) if b is None else (a, b))

    def vertical(self, a, b=None) -> Relation:
        """A line vertical, or two points one above the other."""
        return self._relate("vertical", (a,) if b is None else (a, b))

    def parallel(self, a: Line, b: Line) -> Relation:
        return self._relate("parallel", (a, b))

    def perpendicular(self, a: Line, b: Line) -> Relation:
        return self._relate("perpendicular", (a, b))

    def tangent(self, a, b) -> Relation:
        """A line tangent to an arc or circle, or two arcs or circles tangent to each other (inside
        or outside, as they are drawn)."""
        if isinstance(a, Line) and isinstance(b, Line):
            raise SketchError("Tangent takes a line and an arc or circle, or two arcs or circles.")
        line, curve = (a, b) if isinstance(a, Line) else (b, a) if isinstance(b, Line) else (None, None)
        if line is not None:
            # Where they share an end, tangency is the radius square to the line there.
            shared = _shared_end(line, curve)
            return self._relate("tangent", (line, curve), data={"side": _side(line, curve.center), "at": shared})
        inside = math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) < max(_radius(a), _radius(b))
        return self._relate("tangent", (a, b), data={"inside": inside, "at": _shared_end(a, b)})

    def equal(self, a, b) -> Relation:
        """Two lines of one length, or two arcs or circles of one radius."""
        return self._relate("equal", (a, b))

    def midpoint(self, point: Point, line: Line) -> Relation:
        return self._relate("midpoint", (point, line))

    def symmetric(self, a: Point, b: Point, about: Line) -> Relation:
        """Two points mirrored about a line (a construction centerline, usually)."""
        return self._relate("symmetric", (a, b, about))

    def concentric(self, a, b) -> Relation:
        return self._relate("concentric", (a, b))

    # --- dimensions --------------------------------------------------------------------------------

    def distance(self, a, b, value) -> Relation:
        """The distance between two points, a point and a line, or two parallel lines."""
        if isinstance(a, Line) and isinstance(b, Point):
            a, b = b, a
        data = {}
        if isinstance(b, Line):
            data["side"] = _side(b, a.start if isinstance(a, Line) else a)
        return self._relate("distance", (a, b), value, data=data)

    def length(self, line: Line, value) -> Relation:
        return self._relate("length", (line,), value)

    def horizontal_distance(self, a: Point, b: Point, value) -> Relation:
        """How far right ``b`` is of ``a`` (left, when it is drawn left of it)."""
        return self._relate("horizontal_distance", (a, b), value, data={"sign": 1.0 if b.x >= a.x else -1.0})

    def vertical_distance(self, a: Point, b: Point, value) -> Relation:
        """How far above ``a`` ``b`` is (below, when it is drawn below it)."""
        return self._relate("vertical_distance", (a, b), value, data={"sign": 1.0 if b.y >= a.y else -1.0})

    def radius(self, curve, value) -> Relation:
        return self._relate("radius", (curve,), value)

    def diameter(self, curve, value) -> Relation:
        return self._relate("diameter", (curve,), value)

    def angle(self, a: Line, b: Line, degrees) -> Relation:
        """The angle between two lines, in degrees (0 to 180)."""
        return self._relate("angle", (a, b), degrees)

    # --- sketch tools ------------------------------------------------------------------------------

    def fillet(self, a: Line, b: Line, radius) -> Relation:
        """The corner where two lines meet rounded by an arc of ``radius`` tangent to both, as a
        CAD tool's sketch fillet rounds it. The lines keep their ends at the corner (its virtual
        sharp), so a dimension to the corner still measures to it, and the face is made with the
        corner rounded. The radius is a dimension of the sketch (D1); the arc is named Fillet1."""
        if not (isinstance(a, Line) and isinstance(b, Line)) or a is b:
            raise SketchError("A sketch fillet rounds the corner where two lines meet.")
        corner = _shared_end(a, b)
        if corner is None:
            raise SketchError(f"{a.name} and {b.name} do not meet at an end, so there is no corner to round.")
        if a.construction != b.construction:
            raise SketchError(f"{a.name} and {b.name} are not both construction geometry, or both not, so they are not rounded together.")
        if _number(radius, "A fillet's radius") <= 0:
            raise SketchError("A fillet's radius must be more than zero.")
        if any(r.kind == "fillet" and r.data["corner"] is corner and {id(ref) for ref in r.refs} == {id(a), id(b)} for r in self.relations):
            raise SketchError(f"The corner of {a.name} and {b.name} is rounded already.")
        return self._relate("fillet", (a, b), radius, data={"corner": corner, "arc": self._named("Fillet")})

    def offset_entities(self, made, source, distance) -> Relation:
        """``made`` kept ``distance`` from ``source``, as a CAD tool's Offset Entities keeps an
        offset: each line of ``made`` parallel to its own of ``source``, that far to the side it
        is drawn on; each arc or circle around its own's center, that much bigger or smaller; and
        an open chain's ends square across from the source's ends. ``made`` and ``source`` are a
        curve each, or lists of them in step. One dimension holds them all."""
        made = list(made) if isinstance(made, (list, tuple)) else [made]
        source = list(source) if isinstance(source, (list, tuple)) else [source]
        if not made or len(made) != len(source):
            raise SketchError("Offset Entities takes the offset curves and the curves they are offset from, one for one.")
        if _number(distance, "An offset") <= 0:
            raise SketchError("An offset must be more than zero.")
        sides = []
        for m, s in zip(made, source):
            if isinstance(s, Line) and isinstance(m, Line):
                sides.append(_side(s, m.start))
            elif isinstance(s, (Arc, Circle)) and type(m) is type(s):
                sides.append(1.0 if _radius(m) >= _radius(s) else -1.0)
            else:
                raise SketchError(f"{m.name} cannot be an offset of {s.name}: a line's offset is a line, an arc's an arc, a circle's a circle.")
        ends_of = lambda curve: (curve.start, curve.end) if isinstance(curve, (Line, Arc)) else ()  # noqa: E731
        points = [point for curve in made for point in ends_of(curve)]
        # An open chain's ends, each with the source end across from it.
        ends = []
        for index, (m, s) in enumerate(zip(made, source)):
            for role, point in zip(("start", "end"), ends_of(m)):
                if sum(other is point for other in points) == 1:
                    across = min(("start", "end"), key=lambda each: math.hypot(getattr(s, each).x - point.x, getattr(s, each).y - point.y))
                    ends.append((index, role, across))
        return self._relate("offset", (*made, *source), distance, label="Offset",
                            data={"count": len(made), "sides": sides, "ends": ends})

    def convert(self, edges, *, construction: bool = False) -> list:
        """Model edges brought into the sketch, as a CAD tool's Convert Entities brings them: each
        of ``edges`` (build123d Edges, or the Faces and Wires they bound) projected onto the
        sketch's plane as a line, an arc or a circle, and held On Edge where the model puts it, so
        it follows the model when the part changes. Edges that meet share their point; an edge
        square to the sketch, which projects to a point, is left out. Returns the curves made, in
        the order the edges come."""
        import build123d as B

        from .regions import plane_of

        plane = plane_of(self)
        found = list(_edges_of(edges))
        if not found:
            raise SketchError("Convert Entities needs edges, or a face, of the model.")
        boxes = [edge.bounding_box() for edge in found]
        scale = max([1.0, *(abs(c) for box in boxes for corner in (box.min, box.max) for c in tuple(corner))])
        near = 1e-7 * scale
        # A place of the model in the sketch's units: where it falls on the plane, and how far off it.
        local = lambda vector: plane.to_local_coords(vector)  # noqa: E731
        made_points: list[Point] = []

        def point(vector) -> Point:
            place = local(vector)
            x, y = place.X / self.unit, place.Y / self.unit
            for each in made_points:
                if math.hypot(each.x - x, each.y - y) * self.unit <= near:
                    return each
            made = Point(self._named("Point"), x, y, fixed=True, construction=construction, source=_source())
            self.points.append(made)
            made_points.append(made)
            return made

        curves: list = []
        for edge in found:
            kind = edge.geom_type
            if kind == B.GeomType.LINE:
                start, end = edge.start_point(), edge.end_point()
                a, b = local(start), local(end)
                if math.hypot(a.X - b.X, a.Y - b.Y) <= near:
                    continue
                curve = Line(self._named("Line"), point(start), point(end), construction, _source())
            elif kind == B.GeomType.CIRCLE:
                if abs(abs(edge.normal().dot(plane.z_dir)) - 1) > 1e-6:
                    raise SketchError(f"One of those edges is a circle tilted to {self.name}, which would come in as an ellipse. "
                                      "Convert Entities brings in lines, arcs and circles that lie square to the sketch.")
                radius = edge.radius / self.unit
                if edge.is_closed:
                    curve = Circle(self._named("Circle"), point(edge.arc_center), radius, construction, _source())
                else:
                    start, end, mid = (local(v) for v in (edge.start_point(), edge.end_point(), edge.position_at(0.5)))
                    turning = (mid.X - start.X) * (end.Y - start.Y) - (mid.Y - start.Y) * (end.X - start.X) > 0
                    curve = Arc(self._named("Arc"), point(edge.arc_center), point(edge.start_point()), point(edge.end_point()),
                                not turning, construction, _source())
            else:
                word = str(kind.name).lower().replace("bspline", "spline").replace("bezier", "spline")
                raise SketchError(f"One of those edges is a {word}. Convert Entities brings in lines, arcs and circles; "
                                  "ask the agent to bring in that edge.")
            self.curves.append(curve)
            self._relate("on_edge", (curve,), label="OnEdge",
                         data={"radius": curve.radius * 1.0} if isinstance(curve, Circle) else {})
            curves.append(curve)
        if not curves:
            raise SketchError(f"Those edges are square to {self.name}, so they come in as points. Pick edges that lie along it.")
        return curves

    def depth_to(self, target) -> float:
        """How far ``target`` is from the sketch's plane along its normal, in millimetres, negative
        behind it: an extrude's depth Up To Surface (a flat face parallel to the sketch) or Up To
        Vertex (a vertex, or a point), as a CAD tool ends an extrude on what is picked."""
        import build123d as B

        from .regions import plane_of

        plane = plane_of(self)
        if isinstance(target, B.Face):
            if target.geom_type != B.GeomType.PLANE or abs(abs(target.normal_at().dot(plane.z_dir)) - 1) > 1e-6:
                raise SketchError(f"Up To Surface ends {self.name}'s extrude on a flat face parallel to it. "
                                  "That face is not, so pick another, or use Up To Next.")
            place = target.center()
        elif isinstance(target, B.Vertex):
            place = B.Vector(target)
        else:
            try:
                place = B.Vector(target)
            except Exception:  # noqa: BLE001 - said to the engineer: what an extrude can end on
                raise SketchError("An extrude ends on a flat face or a vertex of the model.") from None
        return float(plane.to_local_coords(place).Z)

    def fillet_arcs(self):
        """The sketch's fillets as arcs where the solved sketch puts them (``fillets.py``)."""
        from .fillets import fillet_arcs

        self.solve()
        return fillet_arcs(self)

    # --- results -----------------------------------------------------------------------------------

    def solve(self, prefer=()):
        """The sketch solved: every point where its relations and dimensions put it. Raises
        SketchError naming the relations that disagree when none can hold. ``prefer`` names
        points held more firmly where they are drawn than the rest (a point being dragged)."""
        if self._solution is None or prefer:
            from .solver import solve

            self._solution = solve(self, prefer=prefer)
        return self._solution

    @property
    def status(self) -> str:
        """Fully defined, Under defined or Over defined, as a CAD tool says it."""
        return self.solve().status

    @property
    def dof(self) -> int:
        """How many ways the sketch can still move: 0 when it is fully defined."""
        return self.solve().dof

    def faces(self):
        """The sketch's closed regions as build123d Faces on its plane, holes cut out."""
        from .regions import faces

        self.solve()
        return faces(self)

    def face(self):
        """The sketch's one closed region (with any holes) as a build123d Face on its plane."""
        made = self.faces()
        if len(made) != 1:
            raise SketchError(f"{self.name} has {len(made)} separate regions; use faces() and pick one.")
        return made[0]

    def path(self):
        """The sketch's curves, construction aside, joined end to end into one chain as a
        build123d Wire in the part: what a sweep runs its profile along, as SolidWorks' Sweep takes
        a path sketch. Open from one end to the other, or closed."""
        from .regions import path

        self.solve()
        return path(self)

    def thin(self, thickness, *, side: str = "inside"):
        """The sketch's outline as a wall ``thickness`` thick, as a CAD tool's Thin Feature makes
        one, as build123d Faces on its plane to extrude: a closed profile's wall ``"inside"`` its
        outline, ``"outside"`` it, or ``"mid"`` astride it (a hole's wall too); an open sketch's
        strip astride its curves, or to one side of the way they run (``"inside"`` the left)."""
        import build123d as B

        from .regions import faces, path

        self.solve()
        wall = float(thickness) * self.unit
        if not wall > 0:
            raise SketchError(f"{self.name}: a thin feature's wall needs a thickness.")
        if side not in ("inside", "outside", "mid"):
            raise SketchError(f"{self.name}: a thin feature's wall is inside, outside or mid.")
        try:
            regions = faces(self)
        except SketchError:
            regions = None
        made = []
        if regions is not None:
            reach = {"inside": (0.0, -wall), "outside": (wall, 0.0), "mid": (wall / 2, -wall / 2)}[side]
            for face in regions:
                outer, inner = (B.offset(face, amount=amount, kind=B.Kind.INTERSECTION) if amount else face for amount in reach)
                made += outer.cut(inner).faces()
        else:
            line = path(self)
            if line.is_closed:
                raise SketchError(f"{self.name}: a closed outline is walled as a profile; this one does not close a region.")
            # Square at its ends, as a CAD tool's thin wall is: astride is half to each side.
            sides = {"inside": [(B.Side.LEFT, wall)], "outside": [(B.Side.RIGHT, wall)],
                     "mid": [(B.Side.LEFT, wall / 2), (B.Side.RIGHT, wall / 2)]}[side]
            strips = [B.Face(line.offset_2d(amount, kind=B.Kind.INTERSECTION, side=way)) for way, amount in sides]
            made = strips if len(strips) == 1 else strips[0].fuse(strips[1]).clean().faces()
        found = B.ShapeList(made)
        for face in found:
            face._cadgen_sketch = self
        found._cadgen_sketch = self
        return found

    def rib(self, thickness, body, *, flip: bool = False):
        """A rib, as SolidWorks' Rib grows one parallel to its sketch: the sketch's straight lines
        thickened across its plane by ``thickness`` (half each side), each grown in the plane,
        square to itself, until it meets ``body``; ``flip`` grows them the other way. A build123d
        solid to join to the body."""
        import build123d as B

        from .regions import path, plane_of

        self.solve()
        wall = float(thickness) * self.unit
        if not wall > 0:
            raise SketchError(f"{self.name}: a rib needs a thickness.")
        plane = plane_of(self)
        made = None
        for edge in path(self).edges():
            if edge.geom_type != B.GeomType.LINE:
                raise SketchError(f"{self.name}: a rib is drawn with straight lines.")
            along = (edge.end_point() - edge.start_point()).normalized()
            out = plane.z_dir.cross(along) * (-1 if flip else 1)
            strip = B.Face.extrude(edge, plane.z_dir * wall).moved(B.Location(plane.z_dir * (-wall / 2)))
            try:
                grown = B.Solid.extrude_until(strip, body, out, B.Until.NEXT)
            except Exception as error:  # noqa: BLE001 - said to the engineer: which way it grows
                raise SketchError(f"{self.name}: the rib meets nothing of the body that way. Flip it to grow the other way.") from error
            made = grown if made is None else made.fuse(grown)
        made._cadgen_sketch = self
        return made

    def axis(self, line: Line):
        """A line of the sketch as a build123d Axis in the part, through its start and along it:
        what a revolve turns the sketch about (a centerline, usually)."""
        import build123d as B

        from .regions import plane_of

        if not isinstance(line, Line):
            raise SketchError("A sketch's axis is one of its lines.")
        self.solve()
        plane = plane_of(self)
        start = plane.from_local_coords((line.start.x * self.unit, line.start.y * self.unit))
        end = plane.from_local_coords((line.end.x * self.unit, line.end.y * self.unit))
        if (end - start).length < 1e-9:
            raise SketchError(f"{line.name} has no length to be an axis.")
        return B.Axis(start, (end - start).normalized())

    def frame(self) -> dict | None:
        """Where the sketch's plane is in the part, in millimetres: its origin, the directions of
        the sketch's x and y, and its normal. None where build123d cannot place it."""
        try:
            from .regions import plane_of

            plane = plane_of(self)
        except Exception:  # noqa: BLE001 - a frame is for drawing; the sketch still solves without one
            return None
        y_dir = plane.z_dir.cross(plane.x_dir)
        return {key: [float(c) for c in (vector.X, vector.Y, vector.Z)]
                for key, vector in (("origin", plane.origin), ("x", plane.x_dir), ("y", y_dir), ("z", plane.z_dir))}

    def state(self) -> dict:
        """The sketch for an editor to draw, as JSON: its entities where it solved them, each
        marked defined when nothing can move it (black in a CAD tool, blue while it can move),
        its relations and dimensions, how defined it is, and its plane's frame in the part."""
        from .fillets import fillet_arcs

        solution = self.solve()
        moving = solution.movable
        where = lambda item: {"file": item.source[0], "line": item.source[1]} if item.source else {}  # noqa: E731
        defined = lambda point: point.name not in moving  # noqa: E731
        errors = []
        try:
            rounded = fillet_arcs(self)
        except SketchError as error:
            rounded = []
            errors.append(str(error))
        # Where each line is drawn to: the fillet at an end, else the end itself.
        trims = {(id(arc.a), arc.end_of(arc.a)): arc.start for arc in rounded}
        trims.update({(id(arc.b), arc.end_of(arc.b)): arc.end for arc in rounded})
        # Brought in from the model by Convert Entities: held On Edge, not drawn.
        converted = {id(relation.refs[0]) for relation in self.relations if relation.kind == "on_edge"}
        curves = []
        for curve in self.curves:
            entry = {"id": curve.name, "kind": type(curve).__name__.lower(), "construction": curve.construction, **where(curve)}
            if id(curve) in converted:
                entry["converted"] = True
            if isinstance(curve, Line):
                entry.update(start=curve.start.name, end=curve.end.name, defined=defined(curve.start) and defined(curve.end))
                if (id(curve), "start") in trims or (id(curve), "end") in trims:
                    entry["shown"] = [list(trims.get((id(curve), "start"), (curve.start.x, curve.start.y))),
                                      list(trims.get((id(curve), "end"), (curve.end.x, curve.end.y)))]
            elif isinstance(curve, Circle):
                entry.update(center=curve.center.name, radius=curve.radius, literal=curve.literal,
                             defined=defined(curve.center) and curve.name not in moving)
            else:
                entry.update(center=curve.center.name, start=curve.start.name, end=curve.end.name, radius=curve.radius,
                             clockwise=curve.clockwise, literal=curve.literal,
                             defined=all(defined(p) for p in (curve.center, curve.start, curve.end)))
            curves.append(entry)
        # Each fillet's arc, worked out from its lines (`derived`): drawn and picked as an arc, with
        # its places rather than points of its own.
        for arc in rounded:
            curves.append({"id": arc.name, "kind": "arc", "derived": "fillet", "dimension": arc.relation.name,
                           "construction": arc.a.construction, "c": list(arc.center), "s": list(arc.start), "e": list(arc.end),
                           "radius": arc.radius, "clockwise": arc.clockwise,
                           "defined": all(defined(p) for p in (arc.a.start, arc.a.end, arc.b.start, arc.b.end)), **where(arc.relation)})
        redundant = {relation.name for relation in solution.redundant}
        return {
            "name": self.name,
            "plane": self.plane if isinstance(self.plane, str) else "Plane",
            "unit": self.unit,
            "frame": self.frame(),
            "status": solution.status,
            "dof": solution.dof,
            "redundant": sorted(redundant),
            "errors": errors,
            "points": [{"id": p.name, "x": p.x, "y": p.y, "fixed": p.fixed, "construction": p.construction,
                        "defined": defined(p), "literals": list(p.literals), **where(p)}
                       for p in [self.origin, *self.points]],
            "curves": curves,
            "relations": [{"id": r.name, "kind": r.kind, "refs": [ref.name for ref in r.refs], "redundant": r.name in redundant, **where(r)}
                          for r in self.relations if not r.dimension],
            "dimensions": [{"id": r.name, "kind": r.kind, "refs": [ref.name for ref in r.refs], "value": r.value,
                            "literal": _literal(r.raw), "redundant": r.name in redundant,
                            "data": {key: value.name if isinstance(value, Point) else value for key, value in r.data.items()}, **where(r)}
                           for r in self.relations if r.dimension],
            "loops": self._loops(),
        }

    def _loops(self) -> list:
        """The sketch's closed loops as outlines in its own units, for an editor to shade the
        profile a feature takes (a hole is a loop inside another, so an even-odd fill shows it).
        None where the profile is open or branches: the sketch is still drawn, only not shaded."""
        from .regions import loops

        try:
            return [[[round(x, 6), round(y, 6)] for x, y in loop.polygon] for loop in loops(self)]
        except SketchError:
            return []

    def __repr__(self) -> str:
        return f"Sketch({self.name!r}, {len(self.curves)} curves, {len(self.relations)} relations)"


def _radius(curve) -> float:
    return curve.radius


def _edges_of(items):
    """The edges of what Convert Entities is given: edges, the faces and wires they bound, or lists of them."""
    import build123d as B

    if isinstance(items, B.Edge):
        yield items
    elif isinstance(items, (B.Face, B.Wire)):
        yield from items.edges()
    elif isinstance(items, B.Shape):
        yield from items.edges()
    else:
        try:
            listed = list(items)
        except TypeError:
            raise SketchError("Convert Entities takes edges, or faces, of the model.") from None
        for item in listed:
            yield from _edges_of(item)


def _shared_end(a, b) -> Point | None:
    """The end point two curves share, when they share one (a line's and an arc's, two arcs')."""
    ends = lambda curve: (curve.start, curve.end) if hasattr(curve, "start") else ()  # noqa: E731
    return next((point for point in ends(a) if any(point is other for other in ends(b))), None)


def _side(line: Line, point: Point) -> float:
    """Which side of a line a point is drawn on: 1 left of start-to-end, -1 right (1 on it)."""
    cross = (line.end.x - line.start.x) * (point.y - line.start.y) - (line.end.y - line.start.y) * (point.x - line.start.x)
    return 1.0 if cross >= 0 else -1.0
