"""Which feature made each face of a part, for the chips and the selection bar that name a face by it.

Nothing on cadgen 0.7.x records it, but the tracer keeps the result of each step it traced. A face
belongs to the first step whose result has a face on the same surface: the same plane, the same
cylinder by its axis and radius, and so on (``surface_key``). So a face a later hole cuts through is
still the extrude's that made it, and the hole's wall, on a cylinder no step had before, the hole's.

The rule has one blind spot, and keeps to it as the design has it: where two steps' results each have
a face on one surface, the first is credited, though the later may be what made the face (a tool
made before the body it cuts, its cap flush with the body's top, takes the top). A part written the
usual way makes its body before the tools it cuts.

Nothing else is credited that is not known. A face on a free-form surface (a B-spline: a loft's sides)
has no key, and one that no step's result has a face for has no maker: both are left out. So is every
face of an assembly, or of a compound the store draws as several parts, whose faces the viewer numbers
part by part.

Runs in the tracer's process only: it reads OCCT's B-rep.
"""

from __future__ import annotations

import math

from OCP.Bnd import Bnd_Box
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepBndLib import BRepBndLib
from OCP.GeomAbs import GeomAbs_Cone, GeomAbs_Cylinder, GeomAbs_Plane, GeomAbs_Sphere, GeomAbs_Torus
from OCP.TopAbs import TopAbs_FACE, TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.TopoDS import TopoDS, TopoDS_Shape

from cadgen._internal.entity_ordinals import entity_map

# What a key's numbers are rounded to: a length to a millionth of the part's size (its bounding box's
# diagonal), so a part in inches keys as the same part in millimetres does; a direction's components
# and an angle to a millionth, a turn that moves a point at the part's size by as much.
PRECISION = 1e-6


def _rounded(value: float, unit: float) -> int:
    """``value`` as a whole number of ``unit``."""
    return round(value / unit)


def _point(point, unit: float) -> tuple[int, int, int]:
    return _rounded(point.X(), unit), _rounded(point.Y(), unit), _rounded(point.Z(), unit)


def _direction(direction) -> tuple[tuple[int, int, int], int]:
    """A unit direction rounded, turned so its first non-zero component is positive (an axis and its
    reverse are one line, a plane's two sides one plane), with the sign that took: 1 or -1."""
    rounded = tuple(_rounded(value, PRECISION) for value in (direction.X(), direction.Y(), direction.Z()))
    sign = -1 if next((value for value in rounded if value), 0) < 0 else 1
    return tuple(sign * value for value in rounded), sign


def _dot(direction, point) -> float:
    return direction.X() * point.X() + direction.Y() * point.Y() + direction.Z() * point.Z()


def _axis(axis, unit: float) -> tuple[int, ...]:
    """An axis line: its direction, sign fixed, and its point nearest the origin."""
    direction, location = axis.Direction(), axis.Location()
    along = _dot(direction, location)
    nearest = (location.X() - along * direction.X(), location.Y() - along * direction.Y(), location.Z() - along * direction.Z())
    return (*_direction(direction)[0], *(_rounded(value, unit) for value in nearest))


def surface_key(face, size: float = 1.0) -> tuple | None:
    """The surface ``face`` lies on (a build123d face, or OCCT's), as a key to tell it by, its lengths
    rounded to a millionth of ``size`` (the part's: its bounding box's diagonal), whichever way the face
    faces. None for a surface it cannot tell by its numbers (a B-spline, a surface of revolution).

    - A plane: its unit normal, turned so its first non-zero component is positive, and its distance
      from the origin along that normal.
    - A cylinder: its axis's direction, turned the same way, the axis's point nearest the origin, and
      its radius.
    - A cone: its apex, its axis's direction, and its half-angle.
    - A sphere: its centre and radius. A torus: its centre, its axis's direction and both radii.
    """
    unit = PRECISION * (size if size and size > 0 else 1.0)
    try:
        surface = BRepAdaptor_Surface(TopoDS.Face_s(getattr(face, "wrapped", face)), False)
        kind = surface.GetType()
        if kind == GeomAbs_Plane:
            axis = surface.Plane().Axis()
            normal, sign = _direction(axis.Direction())
            return ("plane", *normal, _rounded(sign * _dot(axis.Direction(), axis.Location()), unit))
        if kind == GeomAbs_Cylinder:
            cylinder = surface.Cylinder()
            return ("cylinder", *_axis(cylinder.Axis(), unit), _rounded(cylinder.Radius(), unit))
        if kind == GeomAbs_Cone:
            # OCCT's cone runs through its apex both ways: the axis's sense and the angle's sign do not tell it.
            cone = surface.Cone()
            return ("cone", *_point(cone.Apex(), unit), *_direction(cone.Axis().Direction())[0],
                    _rounded(abs(cone.SemiAngle()), PRECISION))
        if kind == GeomAbs_Sphere:
            sphere = surface.Sphere()
            return ("sphere", *_point(sphere.Location(), unit), _rounded(sphere.Radius(), unit))
        if kind == GeomAbs_Torus:
            torus = surface.Torus()
            axis = torus.Axis()
            return ("torus", *_point(axis.Location(), unit), *_direction(axis.Direction())[0],
                    _rounded(torus.MajorRadius(), unit), _rounded(torus.MinorRadius(), unit))
    except Exception:  # noqa: BLE001 - a face OCCT cannot read has no key, and so no maker
        return None
    return None


def _brep(step: dict) -> TopoDS_Shape | None:
    """A step's result as it was made: the B-rep the tracer kept of it then (``brep``), which a later
    ``move`` or ``locate`` of the shape in place does not change, else the result as it is now."""
    kept = step.get("brep")
    if isinstance(kept, TopoDS_Shape):
        return kept
    wrapped = getattr(step.get("result"), "_wrapped", None)
    return wrapped if isinstance(wrapped, TopoDS_Shape) else None


def _has(shape: TopoDS_Shape, kind) -> bool:
    return TopExp_Explorer(shape, kind).More()


class _Keys:
    """``surface_key`` of each face, read once: a face a boolean leaves as it was is the same B-rep in
    every result after it (OCCT's hash and ``IsSame`` tell it; its orientation does not change its key)."""

    def __init__(self, size: float) -> None:
        self.size = size
        self.read: dict[int, list[tuple[TopoDS_Shape, tuple | None]]] = {}

    def __call__(self, face: TopoDS_Shape) -> tuple | None:
        seen = self.read.setdefault(hash(face), [])
        for other, key in seen:
            if other.IsSame(face):
                return key
        key = surface_key(face, self.size)
        seen.append((face, key))
        return key


def _size(shape: TopoDS_Shape) -> float:
    box = Bnd_Box()
    BRepBndLib.Add_s(shape, box)
    return 1.0 if box.IsVoid() else math.sqrt(box.SquareExtent()) or 1.0


def _several(shape) -> bool:
    """Whether the store packages ``shape`` as several parts (`cadgen.store.build`), each numbered on its own."""
    from cadgen.store.build import compound_has_children

    return compound_has_children(shape)


def face_features(shape, steps: list[dict], row_of: dict[int, str], features: list[dict]) -> dict[str, str]:
    """Each face of ``shape``, a part's body as traced, by its number as the viewer's references name it
    (``"12"`` for ``f12``: ``entity_map``'s order), mapped to the key of the feature that made it.

    ``steps`` are the trace's steps, ``row_of`` the key of the row each step's index is in, and
    ``features`` the part's features, each the rows it stands for (``rows``). A face is the first
    step's whose result has a face on its surface, and that step's row is a feature's. A face whose
    maker is not known is left out: one with no key, one no step has, one whose step is in no row or in
    the rows of more than one feature (a cut by several tools at once), and every face of a body the
    store packages as several parts (an assembly gets ``{}``).

    The body is read where its features made it: as the step that first made this B-rep kept it, so a
    body placed at its end (``Pos(...) * body``) or moved in place keeps its faces' makers. Only the
    steps up to that one can have made its faces, so a rolled-back body's are credited to the features
    above the rollback bar alone.
    """
    try:
        return _credited(shape, steps, row_of, features)
    except Exception:  # noqa: BLE001 - a body OCCT cannot read has no face known to be any feature's; the part still reads
        return {}


def _credited(shape, steps, row_of, features) -> dict[str, str]:
    wrapped = getattr(shape, "_wrapped", None)
    if not isinstance(wrapped, TopoDS_Shape) or _several(shape):
        return {}
    made = next(((step["index"], brep) for step in steps if (brep := _brep(step)) is not None and brep.IsPartner(wrapped)), None)
    last, body = made if made is not None else (math.inf, wrapped)
    feature_of: dict[str, str | None] = {}
    for feature in features or ():
        for row in {feature.get("key"), *(feature.get("rows") or ())} - {None}:
            feature_of[row] = feature["key"] if feature_of.get(row, feature["key"]) == feature["key"] else None
    keyed = _Keys(_size(body))
    first: dict[tuple, int] = {}
    for step in steps:
        if step["index"] > last:
            break
        brep = _brep(step)
        if brep is None or not _has(brep, TopAbs_SOLID):
            continue  # a sketch, a face or a plane makes no face of a solid itself; what makes a solid of it does
        explorer = TopExp_Explorer(brep, TopAbs_FACE)
        while explorer.More():
            key = keyed(explorer.Current())
            if key is not None:
                first.setdefault(key, step["index"])
            explorer.Next()
    faces = entity_map(body, "face")
    credited = {}
    for number in range(1, faces.Extent() + 1):
        key = keyed(faces.FindKey(number))
        maker = first.get(key) if key is not None else None
        feature = feature_of.get(row_of.get(maker)) if maker is not None else None
        if feature:
            credited[str(number)] = feature
    return credited


def face_count(shape) -> int:
    """How many faces ``shape`` has, as the viewer numbers them: what a view checks the faces it shows
    against before it names one by ``face_features`` (a model on screen built from another script has
    other faces)."""
    wrapped = getattr(shape, "_wrapped", None)
    try:
        return entity_map(wrapped, "face").Extent() if isinstance(wrapped, TopoDS_Shape) else 0
    except Exception:  # noqa: BLE001 - none counted: a view then names no face by the map
        return 0
