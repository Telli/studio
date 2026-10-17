"""Edit mode's modeling commands: a CAD command written as one line of the part's script.

Fillet, Chamfer, Hole, Shell, Mirror and Pattern act on what the engineer selects: faces and edges
picked on the model (cadgen's selectors, ``f12`` and ``e3``, each with the geometry the viewer read
for it) and a feature picked in the history. A command writes one line of build123d into the
script, after the statement that makes the part's body, and the tracer reads it back as a feature
of its own.

The hard part is the selection. A face or an edge is matched to the part as its script makes it
now by its geometry (its kind, centre, and length or area), then written as build123d's own
selectors, which say where it is rather than what number it has: ``tray.edges().group_by(
bd.Axis.Z)[-1]`` (the top edges), ``tray.faces().sort_by(bd.Axis.Z)[-1].outer_wire().edges()``
(the top face's outer edges). The cheapest chain of selectors that picks exactly the selection is
found by a search over what build123d's selectors read of each face and edge, read once with
build123d's own code, and the chain is run before it is written.

Runs in the tracer's process only: it imports build123d.
"""

from __future__ import annotations

import ast
import difflib
import heapq
import itertools
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import build123d as B
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE
from OCP.TopExp import TopExp
from OCP.TopoDS import TopoDS
from OCP.TopTools import TopTools_IndexedMapOfShape


class CommandError(Exception):
    """A command that cannot be made, said to the engineer."""


# ---------------------------------------------------------------------------------------------
# The selection, matched to the part as its script makes it now.

_ORDINAL = re.compile(r"([fe])(\d+)$")
_KIND_WORDS = {"face": ("face", "faces"), "edge": ("edge", "edges")}


def selector_ordinal(selector) -> tuple[str | None, int | None]:
    """``f12`` (or ``o1.1.f12``) is the twelfth face; ``e3`` the third edge."""
    match = _ORDINAL.search(str(selector or "").strip())
    if not match:
        return None, None
    return ("face" if match.group(1) == "f" else "edge"), int(match.group(2))


def counted(count: int, kind: str) -> str:
    """``1 edge``, ``4 edges``."""
    one, many = _KIND_WORDS.get(kind, (kind, f"{kind}s"))
    return f"{count} {one if count == 1 else many}"


def _said(item) -> str:
    kind, number = selector_ordinal(item.get("selector"))
    return f"{(kind or 'that').capitalize()} {kind[0] if kind else ''}{number or ''}".strip()


def _type_name(shape) -> str:
    """A face's or edge's kind as cadgen's selectors name it: ``plane``, ``cylinder``, ``line``."""
    try:
        from OCP.BRepAdaptor import BRepAdaptor_Curve, BRepAdaptor_Surface

        from cadgen._internal.step_scene_types import _enum_name

        adaptor = BRepAdaptor_Surface(shape.wrapped) if isinstance(shape, B.Face) else BRepAdaptor_Curve(shape.wrapped)
        return _enum_name(adaptor.GetType(), "GeomAbs_")
    except Exception:  # noqa: BLE001 - an unnamed kind only loosens the match
        return ""


class Topology:
    """One kind of a body's subshapes, numbered as cadgen's selectors number them (``f1`` is the
    first face ``TopExp.MapShapes`` meets) and described as the viewer describes them."""

    def __init__(self, shape, kind: str):
        self.kind = kind
        self.map = TopTools_IndexedMapOfShape()
        TopExp.MapShapes_s(shape.wrapped, TopAbs_FACE if kind == "face" else TopAbs_EDGE, self.map)
        self._items: dict[int, object] = {}
        self._described: dict[int, dict] = {}

    def __len__(self) -> int:
        return self.map.Extent()

    def item(self, number: int):
        if number not in self._items:
            raw = self.map.FindKey(number)
            self._items[number] = B.Face(TopoDS.Face_s(raw)) if self.kind == "face" else B.Edge(TopoDS.Edge_s(raw))
        return self._items[number]

    def number(self, shape) -> int:
        """The number of a face or edge of the body (0 for one not on it)."""
        return self.map.FindIndex(shape.wrapped)

    def describe(self, number: int) -> dict:
        if number not in self._described:
            item = self.item(number)
            center = item.center(B.CenterOf.MASS)
            size = item.area if self.kind == "face" else item.length
            self._described[number] = {"type": _type_name(item), "center": (center.X, center.Y, center.Z), "size": float(size)}
        return self._described[number]


def _distance(described: dict, wanted: dict, tolerance: float) -> float | None:
    """How far a face or edge is from what the viewer described, or None when it is another."""
    kind = str(wanted.get("type") or "").lower()
    if kind and described["type"] and kind != described["type"]:
        return None
    center = wanted.get("center")
    try:
        distance = math.dist(described["center"], [float(value) for value in center])
    except (TypeError, ValueError):
        return None
    if distance > tolerance:
        return None
    size = wanted.get("size")
    if size is not None:
        try:
            size = float(size)
        except (TypeError, ValueError):
            return None
        if abs(described["size"] - size) > 1e-4 * max(1.0, abs(size)):
            return None
    return distance


def resolve(topology: Topology, items: list[dict], scale: float) -> list[int]:
    """The faces or edges a selection names, as numbers of the body.

    Each item is a selector with what the viewer read of it (``type``, ``center``, ``size``). The
    selector's own number is tried first, as the STEP numbers it; a face or edge that is not there
    is looked for by its geometry, so a part that rebuilt with its faces in another order still
    finds them. Last, the face or edge at the selector's number is taken when its kind and size
    are the ones read, wherever the viewer placed it. A selector with no geometry is taken at its
    number."""
    tolerance = 1e-4 + 1e-6 * scale
    numbers: list[int] = []
    for item in items:
        kind, number = selector_ordinal(item.get("selector"))
        if kind != topology.kind:
            raise CommandError(f"{_said(item)} is not {'a face' if topology.kind == 'face' else 'an edge'}.")
        described = item.get("center") is not None
        if 1 <= number <= len(topology) and (not described or _distance(topology.describe(number), item, tolerance) is not None):
            found = number
        elif described:
            nearest = [(distance, candidate) for candidate in range(1, len(topology) + 1)
                       if (distance := _distance(topology.describe(candidate), item, tolerance)) is not None]
            if nearest:
                found = min(nearest)[1]
            elif 1 <= number <= len(topology) and _distance(topology.describe(number), {**item, "center": topology.describe(number)["center"]}, tolerance) is not None:
                found = number
            else:
                raise CommandError(f"{_said(item)} is not on the part as its script makes it now. "
                                   "Wait for the model to update, then select it again.")
        else:
            raise CommandError(f"{_said(item)} is not on the part.")
        if found not in numbers:
            numbers.append(found)
    return numbers


def same_items(shapes, wanted: list[dict], scale: float) -> bool:
    """Whether ``shapes`` are the faces or edges ``wanted`` describes, each once."""
    if isinstance(shapes, B.Shape) and not isinstance(shapes, list):
        shapes = [shapes]
    try:
        shapes = list(shapes)
    except TypeError:
        return False
    if len(shapes) != len(wanted):
        return False
    tolerance = 1e-4 + 1e-6 * scale
    left = list(wanted)
    for shape in shapes:
        kind = "face" if isinstance(shape, B.Face) else "edge"
        center = shape.center(B.CenterOf.MASS)
        described = {"type": "", "center": (center.X, center.Y, center.Z),
                     "size": float(shape.area if kind == "face" else shape.length)}
        match = next((each for each in left if _distance(described, {**each, "type": ""}, tolerance) is not None), None)
        if match is None:
            return False
        left.remove(match)
    return True


# ---------------------------------------------------------------------------------------------
# The selection written as build123d's own selectors.

AXES = ("Z", "X", "Y")  # Z first: a tie goes to "the top edges" over "the back ones"
PLANES = ("XY", "XZ", "YZ")
# What a step of a chain costs: a step that names where (an extreme, a kind, a direction) is
# cheap; one that counts in from an end is dear, as it means less once a size changes.
_COST_FILTER = 1.0
_COST_END = 1.0
_COST_RANK = 2.5
_COST_SIZE = 1.5
_COST_EDGES_OF_FACE = 1.0
_COST_OUTER_EDGES = 1.5
_COST_FIRST = 0.5
_DEPTH = 4
_BUDGET = 2500
_FACE_BUDGET = 400


class _Space:
    """A body's faces or edges as build123d's selectors read them: for each, its kind, the axes
    and planes it is parallel to (``filter_by``), where its centre lies along each axis
    (``group_by`` and ``sort_by``) and its sizes, each read once, with build123d's own code."""

    def __init__(self, shape, topology: Topology):
        self.kind = topology.kind
        self.topology = topology
        items = shape.faces() if self.kind == "face" else shape.edges()
        self.base = tuple(topology.number(item) for item in items)
        axes = {name: getattr(B.Axis, name) for name in AXES}
        planes = {name: getattr(B.Plane, name) for name in PLANES}
        self.facts: dict[int, dict] = {}
        for number, item in zip(self.base, items):
            one = B.ShapeList([item])
            center = item.center()
            sizes = {}
            for size in (("AREA", "RADIUS") if self.kind == "face" else ("LENGTH", "RADIUS")):
                try:
                    value = getattr(item, size.lower())
                    if isinstance(value, (int, float)) and math.isfinite(value):
                        sizes[size] = float(value)
                except Exception:  # noqa: BLE001 - a line has no radius
                    pass
            self.facts[number] = {
                "geom": item.geom_type,
                "parallel": {name: bool(one.filter_by(axis)) for name, axis in axes.items()},
                "flat": {name: bool(one.filter_by(plane)) for name, plane in planes.items()},
                "along": {name: (axis.location.inverse() * B.Location(center)).position.Z for name, axis in axes.items()},
                "sizes": sizes,
            }

    def numbers_of(self, shapes) -> tuple[int, ...]:
        return tuple(self.topology.number(shape) for shape in shapes)

    @staticmethod
    def _groups(seq, key):
        ordered = sorted(seq, key=key)
        return [tuple(group) for _, group in itertools.groupby(ordered, key=key)]

    def moves(self, seq: tuple[int, ...], picks_one: bool):
        """Each selector that narrows ``seq``: its text (names in braces, filled in by how the file
        reaches build123d), its cost, and what it leaves (a number, for a pick of one)."""
        facts = self.facts
        out = []
        kinds = sorted({facts[n]["geom"] for n in seq}, key=lambda kind: kind.name)
        if len(kinds) > 1:
            for kind in kinds:
                out.append((f".filter_by({{GeomType}}.{kind.name})", _COST_FILTER, tuple(n for n in seq if facts[n]["geom"] == kind)))
        for name in AXES:
            kept = tuple(n for n in seq if facts[n]["parallel"][name])
            if 0 < len(kept) < len(seq):
                out.append((f".filter_by({{Axis}}.{name})", _COST_FILTER, kept))
        for name in PLANES:
            kept = tuple(n for n in seq if facts[n]["flat"][name])
            if 0 < len(kept) < len(seq):
                out.append((f".filter_by({{Plane}}.{name})", _COST_FILTER, kept))
        for name in AXES:
            groups = self._groups(seq, lambda n, name=name: round(facts[n]["along"][name], 6))
            if len(groups) > 1:
                for index, cost in ((0, _COST_END), (-1, _COST_END), (1, _COST_RANK), (-2, _COST_RANK)):
                    if index in (1, -2) and len(groups) < 3:
                        continue
                    out.append((f".group_by({{Axis}}.{name})[{index}]", cost, groups[index]))
        for size in ("LENGTH", "AREA", "RADIUS"):
            if not all(size in facts[n]["sizes"] for n in seq):
                continue
            groups = self._groups(seq, lambda n, size=size: round(facts[n]["sizes"][size], 6))
            if len(groups) > 1:
                for index in (0, -1):
                    out.append((f".group_by({{SortBy}}.{size})[{index}]", _COST_SIZE, groups[index]))
        if picks_one and len(seq) == 1:
            out.append(("[0]", _COST_FIRST, seq[0]))
        if picks_one and len(seq) > 1:
            for name in AXES:
                ordered = sorted(seq, key=lambda n, name=name: facts[n]["along"][name])
                for index, neighbour in ((0, 1), (-1, -2)):
                    # Only an extreme that is the only one: a tie would pick by topology's order.
                    if abs(facts[ordered[index]]["along"][name] - facts[ordered[neighbour]]["along"][name]) > 1e-6:
                        out.append((f".sort_by({{Axis}}.{name})[{index}]", _COST_END, ordered[index]))
        return out


def _cheapest(space: _Space, starts, goal, keep, picks_one: bool, budget: int = _BUDGET):
    """The cheapest chain from one of ``starts`` (cost, text, numbers) that reaches ``goal``,
    never leaving what ``keep`` allows; None when there is none within the search's budget."""
    heap = []
    tie = itertools.count()
    for cost, text, seq in starts:
        heapq.heappush(heap, (cost, next(tie), text, seq, 0))
    seen: dict = {}
    while heap and budget > 0:
        cost, _, text, seq, depth = heapq.heappop(heap)
        if goal(seq):
            return cost, text, seq
        if isinstance(seq, int) or depth >= _DEPTH:
            continue
        budget -= 1
        for move, extra, result in space.moves(seq, picks_one):
            if not keep(result):
                continue
            key = result if isinstance(result, int) else frozenset(result)
            total = cost + extra
            if seen.get(key, math.inf) <= total:
                continue
            seen[key] = total
            heapq.heappush(heap, (total, next(tie), text + move, result, depth + 1))
    return None


@dataclass
class Names:
    """How a file reaches build123d: through a module (``bd.fillet``) or by bare names
    (``fillet``), and the bare names a line needs that the file does not import yet."""

    module: str
    needed: set[str] = field(default_factory=set)

    def __call__(self, name: str) -> str:
        if self.module:
            return f"{self.module}.{name}"
        self.needed.add(name)
        return name

    def fill(self, text: str) -> str:
        return text.format(**{name: self(name) for name in ("GeomType", "Axis", "Plane", "SortBy")
                              if "{" + name + "}" in text})

    def namespace(self) -> dict:
        if not self.module:
            return {name: getattr(B, name) for name in dir(B) if not name.startswith("_")}
        head, *rest = self.module.split(".")
        value = B
        for part in reversed(rest):  # `cadgen.build123d.fillet`: a `cadgen` with a `build123d`
            value = type("Module", (), {part: value})
        return {head: value}


class Selections:
    """Writes a selection of the body's faces or edges as build123d selectors on ``var``."""

    def __init__(self, shape, var: str, names: Names):
        self.shape = shape
        self.var = var
        self.names = names
        self.topology = {kind: Topology(shape, kind) for kind in ("face", "edge")}
        self._spaces: dict[str, _Space] = {}
        self._single_faces: dict[int, tuple[float, str] | None] = {}

    def space(self, kind: str) -> _Space:
        if kind not in self._spaces:
            self._spaces[kind] = _Space(self.shape, self.topology[kind])
        return self._spaces[kind]

    def _starts(self, kind: str, targets: frozenset[int]):
        space = self.space(kind)
        starts = [(0.0, f"{self.var}.{'faces' if kind == 'face' else 'edges'}()", space.base)]
        if kind == "edge":
            # The edges of a face the selection lies on: `<face>.edges()`, `.outer_wire().edges()`.
            faces = self.topology["face"]
            for face_number in range(1, len(faces) + 1):
                face = faces.item(face_number)
                edges = space.numbers_of(face.edges())
                if not targets & set(edges):
                    continue
                written = self._one_face(face_number)
                if written is None:
                    continue
                cost, text = written
                starts.append((cost + _COST_EDGES_OF_FACE, f"{text}.edges()", edges))
                try:
                    outer = space.numbers_of(face.outer_wire().edges())
                except Exception:  # noqa: BLE001 - a face with no outer wire
                    outer = ()
                if outer and len(outer) < len(edges):
                    starts.append((cost + _COST_OUTER_EDGES, f"{text}.outer_wire().edges()", outer))
        return starts

    def _one_face(self, number: int):
        if number not in self._single_faces:
            space = self.space("face")
            found = _cheapest(space, [(0.0, f"{self.var}.faces()", space.base)], goal=lambda seq: seq == number,
                              keep=lambda seq: seq == number if isinstance(seq, int) else number in seq, picks_one=True,
                              budget=_FACE_BUDGET)
            self._single_faces[number] = None if found is None else found[:2]
        return self._single_faces[number]

    def write(self, kind: str, numbers: list[int], one: bool = False) -> str:
        """The selector text for exactly these faces or edges; ``one`` asks for a single face or
        edge (a ``Face``, not a list), for what takes one."""
        targets = frozenset(numbers)
        space = self.space(kind)
        starts = self._starts(kind, targets)
        picks_one = len(targets) == 1
        found = _cheapest(
            space, starts,
            # One face for what takes one (a hole's): a Face, never a list of one.
            goal=lambda seq: (seq in targets) if isinstance(seq, int) else (not one and len(seq) == len(targets) and frozenset(seq) == targets),
            keep=lambda seq: (seq in targets) if isinstance(seq, int) else targets <= frozenset(seq),
            picks_one=picks_one,
        )
        if found is not None:
            return self._checked(self.names.fill(found[1]), kind, targets)
        if one:
            raise CommandError("That face cannot be told apart from the others by where it is. Pick another.")
        # No one chain picks them all: several, each picking only selected ones, added together.
        covered: set[int] = set()
        parts: list[str] = []
        for target in sorted(targets):
            if target in covered:
                continue
            found = _cheapest(
                space, starts,
                goal=lambda seq, target=target: not isinstance(seq, int) and target in seq and set(seq) <= targets and not set(seq) & covered,
                keep=lambda seq, target=target: not isinstance(seq, int) and target in seq,
                picks_one=False,
            )
            if found is None:
                raise CommandError(f"Some of the selected {_KIND_WORDS[kind][1]} cannot be told apart from the others by where "
                                   "they are. Select fewer, or ask the agent.")
            _, text, seq = found
            covered |= set(seq)
            parts.append(text)
        return self._checked(self.names.fill(" + ".join(parts)), kind, targets)

    def _checked(self, text: str, kind: str, targets: frozenset[int]) -> str:
        """The selector, run on the body: it must pick exactly the selection."""
        try:
            value = eval(text, {"__builtins__": {}}, {**self.names.namespace(), self.var: self.shape})  # noqa: S307 - our own selector text
        except Exception as error:  # noqa: BLE001
            raise CommandError(f"The selection could not be written ({error}).") from error
        shapes = [value] if isinstance(value, B.Shape) and not isinstance(value, list) else list(value)
        picked = [self.topology[kind].number(shape) for shape in shapes]
        if len(picked) != len(targets) or frozenset(picked) != targets:
            raise CommandError("The selection could not be written as selectors that pick exactly it.")
        return text


# ---------------------------------------------------------------------------------------------
# The script: where the body is made, and the line a command writes after it.

UNIT_NAMES = {"INCH", "INCHES", "IN", "MM_PER_IN", "MM_PER_INCH"}
_BUILDERS = re.compile(r"\bBuild(Part|Sketch|Line)\b")


@dataclass
class Body:
    """Where a part's body is made: the file, the function that designs the part, its top-level
    statement that last makes the body, and the name the body is held in (None when the
    statement returns it outright)."""

    path: Path
    rel: str
    text: str
    tree: ast.Module
    function: ast.FunctionDef
    statement: ast.stmt
    name: str | None
    indent: str

    @property
    def lines(self) -> list[str]:
        return self.text.splitlines(keepends=True)


def _function(tree: ast.Module, name: str, line: int):
    best = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name and node.lineno <= line <= node.end_lineno:
            if best is None or node.lineno > best.lineno:
                best = node
    return best


def _top_statement(function, line: int):
    return next((stmt for stmt in function.body if stmt.lineno <= line <= stmt.end_lineno), None)


def _innermost(statement: ast.stmt, line: int) -> ast.stmt:
    found = statement
    for node in ast.walk(statement):
        if isinstance(node, ast.stmt) and node.lineno <= line <= node.end_lineno and node.lineno >= found.lineno:
            found = node
    return found


def _assigned(statement: ast.stmt) -> str | None:
    if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
        return statement.targets[0].id
    if isinstance(statement, (ast.AugAssign, ast.AnnAssign)) and isinstance(statement.target, ast.Name):
        return statement.target.id
    return None


def find_body(steps: list[dict], shape, level: int, root: Path) -> Body:
    """The statement that makes ``shape``, the part's body: the last recorded operation whose
    result it is, at the level of the function that designs the part (the history's level)."""
    step = next((step for step in reversed(steps) if step.get("result") is shape), None)
    if step is None or not step.get("frames"):
        raise CommandError("Edit mode cannot find the line that makes this part's body. Ask the agent to make the change.")
    frame = step["frames"][min(level, len(step["frames"]) - 1)]
    path = (root / frame["file"]).resolve()
    text = path.read_text(encoding="utf-8")
    tree = ast.parse(text, str(path))
    function = _function(tree, frame["function"], frame["line"])
    statement = _top_statement(function, frame["line"]) if function is not None else None
    if statement is None:
        raise CommandError("Edit mode cannot find the line that makes this part's body. Ask the agent to make the change.")
    source = text.splitlines()[statement.lineno - 1]
    if isinstance(statement, ast.With) and _BUILDERS.search(ast.get_source_segment(text, statement) or ""):
        raise CommandError("This part is written in build123d's builder style, which edit mode's commands do not write "
                           "into yet. Ask the agent to make the change.")
    inner = _innermost(statement, frame["line"])
    if isinstance(statement, ast.Return):
        name = None
    else:
        name = _assigned(inner)
        if name is None:
            raise CommandError("Edit mode cannot tell which name holds this part's body. Ask the agent to make the change.")
    return Body(path=path, rel=frame["file"], text=text, tree=tree, function=function, statement=statement, name=name,
                indent=source[: len(source) - len(source.lstrip())])


def _solid(shape) -> bool:
    try:
        return isinstance(shape, B.Shape) and len(shape.solids()) > 0
    except Exception:  # noqa: BLE001 - a shape that cannot list its solids is no body
        return False


def body_at(steps: list[dict], shape, level: int, root: Path, rel: str, line: int):
    """The part's body as it is just before the top-level statement at ``line`` of ``rel`` runs, as
    a rollback bar there shows it: the shape the last operation on the body above that line made,
    and where it is made (``Body``). The body is the final shape's lineage: the operations whose
    result carries its origin, or the origin of a body it was made from (a shell's, a mirror's)."""
    origins: set[int] = set()
    origin = getattr(shape, "_studio_origin", None)
    while isinstance(origin, int) and origin not in origins and 0 <= origin < len(steps):
        origins.add(origin)
        origin = steps[origin].get("from")
    found = None
    for step in steps:
        frames = step.get("frames")
        if not frames:
            continue
        frame = frames[min(level, len(frames) - 1)]
        if frame["file"] == rel and frame["line"] < line and getattr(step.get("result"), "_studio_origin", None) in origins \
                and _solid(step["result"]):
            found = step
    if found is None:
        raise CommandError("There is no body above that point yet. Move the rollback bar below the first feature.")
    return found["result"], find_body(steps, found["result"], level, root)


def shifted(line: int, changes: list[dict]) -> int:
    """Where line ``line`` of a file is after ``changes`` (``hunks`` of its old text to its new)
    were made: moved by what they took out or put in above it, a line put in right above it too."""
    moved = line
    for change in changes:
        if int(change["start"]) + len(change["old"]) <= line:
            moved += len(change["new"]) - len(change["old"])
    return moved


def build123d_names(tree: ast.Module) -> tuple[str | None, ast.ImportFrom | None]:
    """How a file reaches build123d: a module name (``bd``), or ``""`` for bare names, with the
    named import that bare names would be added to (None for a star import)."""
    for node in tree.body:
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name in ("build123d", "cadgen.build123d"):
                    return alias.asname or alias.name, None
        if isinstance(node, ast.ImportFrom) and node.module == "cadgen":
            for alias in node.names:
                if alias.name == "build123d":
                    return alias.asname or "build123d", None
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module in ("build123d", "cadgen.build123d"):
            if any(alias.name == "*" for alias in node.names):
                return "", None
            return "", node
    return None, None


def unit_name(tree: ast.Module) -> str | None:
    """The name an inch part multiplies its sizes by (``INCH = 25.4``), where the file has one."""
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name.upper() in UNIT_NAMES and isinstance(node.value, ast.Constant) and node.value.value == 25.4:
                return name
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                name = alias.asname or alias.name
                if name.upper() in UNIT_NAMES:
                    return name
    return None


def _names_in(tree: ast.AST) -> set[str]:
    return {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)} | {
        node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}


def fresh_name(tree: ast.AST, wanted: str) -> str:
    """``wanted`` as a Python name the file does not use yet."""
    base = re.sub(r"\W+", "_", wanted.strip().lower()).strip("_") or "feature"
    if base[0].isdigit():
        base = f"feature_{base}"
    taken = _names_in(tree)
    if base not in taken:
        return base
    return next(f"{base}_{n}" for n in itertools.count(2) if f"{base}_{n}" not in taken)


class Edits:
    """Changes to one file's text, made at once: text put in at a point of a line (a column in
    UTF-8 bytes, as ``ast`` counts them) and lines put in after a line."""

    def __init__(self, text: str):
        self.text = text
        self._ops: list[tuple] = []

    def put(self, line: int, col: int, text: str, until: int | None = None):
        """Text at ``line``:``col``, replacing up to column ``until`` of the same line."""
        self._ops.append((line, col, 0, text, until if until is not None else col))

    def after(self, line: int, lines: list[str]):
        self._ops.append((line, math.inf, 1, lines, None))

    def swap(self, first: int, last: int, lines: list[str]):
        """Lines ``first`` to ``last`` put as ``lines``."""
        self._ops.append((first, -1, 2, lines, last))

    def apply(self) -> str:
        lines = self.text.splitlines(keepends=True)
        newline = next((line[len(line.rstrip("\r\n")):] for line in lines if line.endswith(("\n", "\r"))), "\n")
        for line, col, kind, text, until in sorted(self._ops, key=lambda op: (op[0], op[1]), reverse=True):
            if kind == 2:
                lines[line - 1:until] = [each + newline for each in text]
                continue
            if kind == 1:
                if line and not lines[line - 1].endswith(("\n", "\r")):
                    lines[line - 1] += newline
                lines[line:line] = [each + newline for each in text]
            else:
                raw = lines[line - 1].encode("utf-8")
                lines[line - 1] = (raw[:col] + text.encode("utf-8") + raw[until:]).decode("utf-8")
        return "".join(lines)


def hunks(old: str, new: str) -> list[dict]:
    """The lines that differ between two texts: each run of lines at ``start`` (from 1) that read
    ``old`` and become ``new``, endings kept, so a change can be put back exactly."""
    a, b = old.splitlines(keepends=True), new.splitlines(keepends=True)
    out = []
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes():
        if tag != "equal":
            out.append({"start": i1 + 1, "old": a[i1:i2], "new": b[j1:j2]})
    return out


def splice(text: str, changes: list[dict]) -> str:
    """``text`` with ``changes`` (from ``hunks``) made, each checked to still read as it did."""
    lines = text.splitlines(keepends=True)
    for change in sorted(changes, key=lambda change: change["start"], reverse=True):
        start, old = int(change["start"]) - 1, list(change["old"])
        if start < 0 or lines[start:start + len(old)] != old:
            raise CommandError(f"Line {start + 1} no longer reads as the change left it. Look again.")
        lines[start:start + len(old)] = list(change["new"])
    return "".join(lines)


# ---------------------------------------------------------------------------------------------
# The commands.

COMMANDS = ("fillet", "chamfer", "hole", "shell", "mirror", "pattern", "extrude", "cut", "revolve", "revolve_cut")
FEATURE_WORDS = {"fillet": "Fillet", "chamfer": "Chamfer", "hole": "Hole", "shell": "Shell", "mirror": "Mirror", "pattern": "Pattern",
                 "extrude": "Boss-Extrude", "cut": "Cut-Extrude", "revolve": "Boss-Revolve", "revolve_cut": "Cut-Revolve"}
# The operation each command's line records in the tracer.
RECORDS = {"fillet": ("fillet",), "chamfer": ("chamfer",), "hole": ("cut",), "shell": ("offset",),
           "mirror": ("mirror",), "pattern": ("GridLocations", "PolarLocations"), "extrude": ("extrude",), "cut": ("extrude",),
           "revolve": ("revolve",), "revolve_cut": ("revolve",)}


@dataclass
class Plan:
    """A command made into text: the file before and after, the command's line, and what the
    traced line must show (its operation, and the faces or edges it was given)."""

    command: str
    path: Path
    rel: str
    old: str
    new: str
    line: int
    code: str
    records: tuple[str, ...]
    selected: dict | None
    summary: dict


def _number(value: float, dotted: bool) -> str:
    text = f"{value:.6f}".rstrip("0").rstrip(".") if not float(value).is_integer() else str(int(value))
    if dotted and re.match(r"^-?0\.", text):
        text = text.replace("0.", ".", 1)
    return "0" if text in ("-0", "") else text


class _Writer:
    """Numbers and names written as the file writes them."""

    def __init__(self, body: Body, units: str, literals: dict, names: Names):
        self.units = units
        self.unit = unit_name(body.tree) if units == "in" else None
        # A file that writes `.060` gets `.020`, not `0.020`.
        self.dotted = any(literal["file"] == body.rel and re.match(r"^-?\.\d", literal["text"]) for literal in literals.values())
        self.names = names

    def number(self, value: float) -> str:
        return _number(value, self.dotted)

    def length(self, value: float, factor: str = "") -> str:
        """A length typed in the project's units, as code: ``.020*INCH`` in an inch part."""
        if self.units == "in":
            if self.unit:
                return f"{self.number(value)}{factor}*{self.unit}"
            return f"{self.number(value * 25.4)}{factor}"
        return f"{self.number(value)}{factor}"


def _value(inputs: dict, key: str, label: str, parse, *, positive: bool = True, integer: bool = False,
           minimum: float | None = None):
    text = str(inputs.get(key, "")).strip()
    try:
        value = parse(text)
    except Exception:  # noqa: BLE001
        raise CommandError(f"{label} needs a number.") from None
    if integer:
        if not float(value).is_integer():
            raise CommandError(f"{label} needs a whole number.")
        value = int(value)
    if minimum is not None and value < minimum:
        raise CommandError(f"{label} needs to be at least {_number(minimum, False)}.")
    if positive and value <= 0:
        raise CommandError(f"{label} needs to be more than 0.")
    return value


def _tool(body: Body, var: str, feature: dict | None, bar: int | None = None):
    """What Mirror and Pattern copy: the tool a feature cuts or adds (``lid -= <tool>``), named
    so it can be used again, or the body itself (``var``). Returns (tool, operator, edits)."""
    if not feature or not feature.get("row"):
        return var, "+=", []
    file, _, line = str(feature["row"]).rpartition(":")
    if file != body.rel or not line.isdigit():
        raise CommandError("Pick a feature of this part's body in the history.")
    line = int(line)
    if bar is not None and line >= bar:
        raise CommandError(f"{feature.get('name') or 'That feature'} is below the rollback bar. Move the bar below it first.")
    statement = _top_statement(body.function, line)
    if statement is None:
        raise CommandError("Pick a feature of this part's body in the history.")
    if statement.lineno != line or isinstance(statement, (ast.For, ast.While, ast.If, ast.With)):
        raise CommandError("That feature is made inside a loop or a branch. Ask the agent to mirror or pattern it.")
    tool = operator = None
    if isinstance(statement, ast.AugAssign) and isinstance(statement.op, (ast.Sub, ast.Add)):
        tool, operator = statement.value, statement.op
    elif isinstance(statement, ast.Assign) and isinstance(statement.value, ast.BinOp) and isinstance(statement.value.op, (ast.Sub, ast.Add)):
        tool, operator = statement.value.right, statement.value.op
    if tool is None:
        # A feature that is the body itself (the first extrude): the body is what is copied.
        return var, "+=", []
    sign = "-=" if isinstance(operator, ast.Sub) else "+="
    if isinstance(tool, ast.Name):
        return tool.id, sign, []
    name = fresh_name(body.tree, str(feature.get("name") or "tool"))
    edits = [(tool.lineno, tool.col_offset, f"({name} := "), (tool.end_lineno, tool.end_col_offset, ")")]
    return name, sign, edits


def recorded_numbers(steps: list[dict]) -> dict:
    """What a line's operations were given, by operation and argument (``("fillet", "radius")``):
    sizes in millimetres, angles in degrees, counts, and how many faces or edges a list held."""
    out: dict = {}
    for step in steps:
        for name, value in step["args"]:
            key = (step["op"], name)
            if key in out or isinstance(value, bool):
                continue
            if isinstance(value, (int, float)):
                out[key] = float(value)
            elif isinstance(value, (list, tuple)):
                out[key] = float(len(value))
    return out


def _feature_line(body: Body, replacing: dict, command: str, units: str, steps: list[dict], level: int) -> tuple[ast.stmt, Feature]:
    """The line Edit Feature writes again: the feature's own, read as the command it is."""
    file, _, line = str(replacing.get("row") or "").rpartition(":")
    if file != body.rel or not line.isdigit():
        raise CommandError("That feature is not made where this part's body is. Ask the agent to change it.")
    made = [step for step in steps if step.get("frames")
            and (step["frames"][min(level, len(step["frames"]) - 1)]["file"], step["frames"][min(level, len(step["frames"]) - 1)]["line"])
            == (file, int(line))]
    statement = _top_statement(body.function, int(line))
    feature = (read_feature(statement, body.text, recorded_numbers(made), units)
               if statement is not None and statement.lineno == int(line) else None)
    if feature is None:
        raise CommandError("That feature is not written as one of edit mode's commands, so edit mode cannot open it. "
                           "Change its sizes in the design tree, or ask the agent.")
    if feature.command != command:
        raise CommandError(f"That feature is a {FEATURE_WORDS[feature.command]}, not a {FEATURE_WORDS[command]}.")
    return statement, feature


def plan(spec: dict, *, steps: list[dict], shape, level: int, units: str, literals: dict, root: Path, parse,
         bar: int | None = None) -> Plan:
    """A command (``spec``: its ``command``, the ``selection`` it acts on, its ``inputs`` as
    typed and the history ``feature`` it copies) made into the part's script. ``parse`` reads a
    typed number (plain arithmetic allowed). With ``replace`` (a feature's history row) it is Edit
    Feature: that feature's own line written again in its place, with what it acts on kept, or
    picked again (a ``selection``) on the body as it was before it. ``bar``: the line of the
    top-level statement a rollback bar sits above; the command acts on the body there and its
    line goes right above that statement."""
    command = str(spec.get("command") or "")
    if command not in COMMANDS:
        raise CommandError(f"Edit mode has no command {command or 'by that name'}.")
    if not isinstance(shape, B.Shape):
        raise CommandError("This part's script makes no solid body to change.")
    body = find_body(steps, shape, level, root)
    module, named_import = build123d_names(body.tree)
    names = Names(module if module is not None else "bd")
    edits = Edits(body.text)
    selection = [item for item in spec.get("selection") or [] if isinstance(item, dict)]
    replacing = spec.get("replace") if isinstance(spec.get("replace"), dict) else None
    old = kept = None
    # The body the selection is on, and the name that holds it there: the part's, unless rolled back.
    picked_on, picked_var = shape, None
    if bar is not None and not replacing:
        from cadgen.edit.deleting import suppressed_span

        statement = _top_statement(body.function, bar)
        if (statement is None or statement.lineno != bar) and suppressed_span(body.lines, bar) is None:
            raise CommandError("The rollback bar is no longer between two features. Move it again.")
    if replacing:
        old, kept = _feature_line(body, replacing, command, units, steps, level)
        var, returned = kept.target, []
        if selection and command in ("fillet", "chamfer", "hole", "shell"):
            # Picked again, as a CAD tool rolls back to the feature: on the body as it was before it.
            picked_on, before = body_at(steps, shape, level, root, body.rel, old.lineno)
            picked_var = before.name
    elif bar is not None:
        picked_on, before = body_at(steps, shape, level, root, body.rel, bar)
        if before.name is None:
            raise CommandError("Edit mode cannot tell which name holds the body there. Ask the agent to make the change.")
        var, returned = before.name, []
    elif body.name is None:
        # `return <body>` becomes `part = <body>`, the command's line, and `return part`.
        var = fresh_name(body.tree, "part")
        value = body.statement.value
        if value is None or value.lineno != body.statement.lineno:
            raise CommandError("Edit mode cannot tell what this part returns. Ask the agent to make the change.")
        edits.put(body.statement.lineno, body.statement.col_offset, f"{var} = ", until=value.col_offset)
        returned = [f"{body.indent}return {var}"]
    else:
        var, returned = body.name, []
    writer = _Writer(body, units, literals, names)
    inputs = spec.get("inputs") or {}
    # A new feature comes last in the tree, as a CAD tool adds it: past any suppressed right after the body's line.
    from cadgen.edit.deleting import suppressed_span

    at = body.statement.end_lineno
    while (span := suppressed_span(body.lines, at + 1)) is not None:
        at = span["last"]
    if bar is not None and not replacing:
        at = bar - 1
    # Edges or faces picked again replace the feature's own; otherwise it keeps them as written.
    fixed = None if kept is not None and selection and picked_var else kept

    def same(role: str, value: float, fresh: str) -> str:
        """``fresh``, unless Edit Feature left this value as it was: then the line's own code for it."""
        if kept is not None and role in kept.codes:
            written, was = kept.codes[role]
            if math.isclose(float(value), was, rel_tol=1e-9, abs_tol=1e-9):
                return written
        return fresh

    scale = picked_on.bounding_box().diagonal or 1.0
    selections = Selections(picked_on, picked_var or var, names)
    selected = None
    units_word = units if units in ("mm", "in") else ""

    def chosen(kind: str, *, one: bool = False, least: int = 1):
        items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == kind]
        if len(items) < least:
            raise CommandError(f"Select {'a face' if kind == 'face' and one else _KIND_WORDS[kind][1]} on the model first.")
        if one and len(items) > 1:
            raise CommandError("Select one face.")
        numbers = resolve(selections.topology[kind], items, scale)
        return numbers, selections.write(kind, numbers, one=one)

    def chosen_edges():
        # A face selected for a fillet or a chamfer stands for all its edges, as in a CAD tool.
        edge_items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "edge"]
        face_items = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "face"]
        if not edge_items and not face_items:
            raise CommandError("Select edges on the model first.")
        numbers = resolve(selections.topology["edge"], edge_items, scale) if edge_items else []
        edges = selections.topology["edge"]
        for face_number in resolve(selections.topology["face"], face_items, scale) if face_items else []:
            for each in selections.topology["face"].item(face_number).edges():
                if (number := edges.number(each)) and number not in numbers:
                    numbers.append(number)
        return numbers, selections.write("edge", numbers)

    if command in ("fillet", "chamfer"):
        numbers, edges = ([], fixed.parts["edges"]) if fixed else chosen_edges()
        if command == "fillet":
            radius = _value(inputs, "radius", "Radius", parse)
            code = f"{var} = {names('fillet')}({edges}, radius={same('radius', radius, writer.length(radius))})"
            shown = [("Radius", radius, units_word)]
        else:
            distance = _value(inputs, "distance", "Distance", parse)
            code = f"{var} = {names('chamfer')}({edges}, length={same('distance', distance, writer.length(distance))})"
            shown = [("Distance", distance, units_word)]
        selected = None if fixed else {"argument": "objects", "items": [selections.topology["edge"].describe(n) for n in numbers]}
        what = fixed.keeps if fixed else counted(len(numbers), "edge")
    elif command == "hole":
        if fixed:
            face = fixed.parts["face"]
        else:
            numbers, face = chosen("face", one=True)
            if selections.topology["face"].describe(numbers[0])["type"] != "plane":
                raise CommandError("A hole goes in a flat face. Select a flat one.")
        diameter = _value(inputs, "diameter", "Diameter", parse)
        through = str(inputs.get("depth", "")).strip().lower() in ("", "through", "through all")
        depth = None if through else _value(inputs, "depth", "Depth", parse)
        depth_code = f"{var}.bounding_box().diagonal" if through else same("depth", depth, writer.length(depth))
        plane = None if fixed else B.Plane(selections.topology["face"].item(numbers[0]))
        offsets = {axis: 0.0 for axis in AXES}
        for axis in (("X", "Y", "Z") if fixed else offset_axes(plane.z_dir)):
            if str(inputs.get(axis.lower(), "")).strip():
                offsets[axis] = _value(inputs, axis.lower(), axis, parse, positive=False)
        if not fixed:
            center = plane.origin + B.Vector(*(offsets[axis] * (25.4 if units == "in" else 1.0) for axis in ("X", "Y", "Z")))
            if selections.topology["face"].item(numbers[0]).distance_to(center) > 1e-4 + 1e-6 * scale:
                raise CommandError("The hole's center is off that face. Set where it goes on the face, from the face's center.")
        moved = ""
        if any(offsets.values()):
            given = [same(axis.lower(), offsets[axis], writer.length(offsets[axis])) if offsets[axis] else "0" for axis in ("X", "Y", "Z")]
            moved = f"{names('Pos')}({', '.join(given[:2] if given[2] == '0' else given)}) * "
        align = names("Align")
        code = (f"{var} -= {moved}{names('Plane')}({face}) * {names('Cylinder')}({same('diameter', diameter, writer.length(diameter, '/2'))}, {depth_code}, "
                f"align=({align}.CENTER, {align}.CENTER, {align}.MAX))")
        shown = [("Diameter", diameter, units_word)] + ([("Depth", depth, units_word)] if depth is not None else [])
        what = "through all" if through else "a blind hole"
    elif command == "shell":
        numbers, faces = ([], fixed.parts["openings"]) if fixed else chosen("face")
        thickness = _value(inputs, "thickness", "Thickness", parse)
        code = f"{var} = {names('offset')}({var}, amount=-{same('thickness', thickness, writer.length(thickness))}, openings={faces})"
        shown = [("Thickness", thickness, units_word)]
        selected = None if fixed else {"argument": "openings", "items": [selections.topology["face"].describe(n) for n in numbers]}
        what = fixed.keeps if fixed else f"{counted(len(numbers), 'face')} open"
    elif command == "mirror":
        faces = [item for item in selection if selector_ordinal(item.get("selector"))[0] == "face"]
        if faces:
            numbers, face = chosen("face", one=True)
            if selections.topology["face"].describe(numbers[0])["type"] != "plane":
                raise CommandError("A mirror plane is a flat face. Select a flat one, or pick a plane.")
            plane_code, plane_words = f"{names('Plane')}({face})", "a face"
        else:
            plane = str(inputs.get("plane") or "YZ").upper()
            if kept and plane == "FACE" and kept.parts.get("plane"):
                plane_code, plane_words = kept.parts["plane"], "a face"
            elif plane not in PLANES:
                raise CommandError("Pick the plane to mirror about.")
            else:
                plane_code, plane_words = f"{names('Plane')}.{plane}", f"the {plane} plane"
        tool, sign, tool_edits = (kept.parts["tool"], kept.operator, []) if kept else _tool(body, var, spec.get("feature"), bar)
        for line, col, text in tool_edits:
            edits.put(line, col, text)
        code = f"{var} {sign} {names('mirror')}({tool}, about={plane_code})"
        shown = []
        what = f"about {plane_words}"
    elif command in ("revolve", "revolve_cut"):
        # A sketch turned about one of its lines, as Revolved Boss/Base and Revolved Cut turn one:
        # `sketch.axis(line)` is that line in the part; the angle runs from the sketch, the other
        # way when reversed. Its line goes after the sketch's lines and the body's.
        from cadgen.edit import sketching

        drawn = spec.get("sketch") or {}
        if str(drawn.get("file") or "") != body.rel:
            raise CommandError("Pick a sketch of this part's body in the design tree.")
        try:
            block = sketching.find_block(body.text, int(drawn.get("line") or 0), str(body.path))
        except (sketching.SketchEditError, ValueError) as error:
            raise CommandError(str(error)) from None
        if block.function is None or block.function.lineno != body.function.lineno:
            raise CommandError("That sketch is made outside the function that makes this part's body. Ask the agent to revolve it.")
        if bar is not None and not replacing and block.last_line >= bar:
            raise CommandError(f"{drawn.get('name') or 'That sketch'} is below the rollback bar. Move the bar below it first.")
        axis = str(drawn.get("axis_code") or "")
        if not axis:
            raise CommandError("Pick the line to revolve about: a centerline of the sketch.")
        angle = _value(inputs, "angle", "Angle", parse)
        if angle > 360:
            raise CommandError("An angle is at most 360 degrees.")
        if inputs.get("reverse") in (True, "true", "1", 1):
            angle = -angle
        profile = kept.parts["profile"] if kept else f"{block.var}.face()" if int(drawn.get("regions") or 1) == 1 else f"{block.var}.faces()"
        sign = "+=" if command == "revolve" else "-="
        code = f"{var} {sign} {names('revolve')}({profile}, axis={block.var}.axis({axis}), revolution_arc={same('angle', angle, writer.number(angle))})"
        at = max(at, block.last_line)
        shown = [("Angle", abs(angle), "deg")]
        what = f"from {drawn.get('name') or 'the sketch'}, about {drawn.get('axis') or 'its centerline'}"
    elif command in ("extrude", "cut"):
        # A sketch made a solid of, as Extruded Boss/Base and Extruded Cut make one: from its
        # face, along its plane's normal (Reverse direction the other way), joined to the body or
        # cut from it. Its line goes after the sketch's lines and the body's.
        from cadgen.edit import sketching

        drawn = spec.get("sketch") or {}
        if str(drawn.get("file") or "") != body.rel:
            raise CommandError("Pick a sketch of this part's body in the design tree.")
        try:
            block = sketching.find_block(body.text, int(drawn.get("line") or 0), str(body.path))
        except (sketching.SketchEditError, ValueError) as error:
            raise CommandError(str(error)) from None
        if block.function is None or block.function.lineno != body.function.lineno:
            raise CommandError("That sketch is made outside the function that makes this part's body. Ask the agent to extrude it.")
        if bar is not None and not replacing and block.last_line >= bar:
            raise CommandError(f"{drawn.get('name') or 'That sketch'} is below the rollback bar. Move the bar below it first.")
        end = str(inputs.get("end") or "blind").lower()
        through = command == "cut" and end == "through"
        depth = None if through else _value(inputs, "depth", "Depth", parse)
        # Mid Plane: half the depth each way (build123d's `both`), so Reverse does not apply.
        both = ", both=True" if end == "mid" else ""
        amount = f"{var}.bounding_box().diagonal" if through else writer.length(depth / 2 if both else depth)
        reverse = inputs.get("reverse") in (True, "true", "1", 1) and not both
        if reverse:
            amount = f"-{amount}"
        if not through:
            amount = same("amount", (-1 if reverse else 1) * (depth / 2 if both else depth), amount)
        profile = kept.parts["profile"] if kept else f"{block.var}.face()" if int(drawn.get("regions") or 1) == 1 else f"{block.var}.faces()"
        sign = "+=" if command == "extrude" else "-="
        code = f"{var} {sign} {names('extrude')}({profile}, amount={amount}{both})"
        at = max(at, block.last_line)
        shown = [] if through else [("Depth", depth, units_word)]
        what = f"from {drawn.get('name') or 'the sketch'}" + (", through all" if through else ", mid plane" if end == "mid" else "")
    else:  # pattern
        kind = str(inputs.get("type") or "linear").lower()
        count = _value(inputs, "count", "Instances", parse, integer=True, minimum=2)
        align = names("Align")
        if kind == "circular":
            locations = f"{names('PolarLocations')}(0, {same('count', count, str(count))})"
            shown = [("Instances", count, "")]
            what = f"{count} around the Z axis"
        elif kind == "linear":
            spacing = _value(inputs, "spacing", "Spacing", parse, positive=False)
            if spacing == 0:
                raise CommandError("Spacing needs to be more or less than 0.")
            direction = str(inputs.get("direction") or "X").upper()
            spaced, counted_code = same("spacing", spacing, writer.length(spacing)), same("count", count, str(count))
            if direction == "X":
                locations = f"{names('GridLocations')}({spaced}, 0, {counted_code}, 1, align=({align}.MIN, {align}.CENTER))"
            elif direction == "Y":
                locations = f"{names('GridLocations')}(0, {spaced}, 1, {counted_code}, align=({align}.CENTER, {align}.MIN))"
            else:
                raise CommandError("A linear pattern runs along X or Y.")
            shown = [("Spacing", spacing, units_word), ("Instances", count, "")]
            what = f"{count} along {direction}"
        else:
            raise CommandError("A pattern is linear or circular.")
        tool, sign, tool_edits = (kept.parts["tool"], kept.operator, []) if kept else _tool(body, var, spec.get("feature"), bar)
        for line, col, text in tool_edits:
            edits.put(line, col, text)
        code = f"{var} {sign} [loc * {tool} for loc in {locations}.locations[1:]]"

    if old is not None:
        source = body.lines[old.lineno - 1]
        edits.swap(old.lineno, old.end_lineno, [f"{source[:len(source) - len(source.lstrip())]}{code}"])
        added_lines = _imports(edits, body, module, named_import, names)
        new = edits.apply()
        line = old.lineno + added_lines
    else:
        edits.after(at, [f"{body.indent}{code}", *returned])
        added_lines = _imports(edits, body, module, named_import, names)
        new = edits.apply()
        line = at + 1 + added_lines
    return Plan(command=command, path=body.path, rel=body.rel, old=body.text, new=new, line=line, code=code,
                records=RECORDS[command], selected=selected,
                summary={"feature": FEATURE_WORDS[command], "what": what,
                         "inputs": [{"label": label, "display": writer.number(value) if isinstance(value, float) else str(value),
                                     "unit": unit} for label, value, unit in shown]})


def _imports(edits: Edits, body: Body, module: str | None, named_import: ast.ImportFrom | None, names: Names) -> int:
    """Brings the names a line uses into the file: added to its ``from build123d import ...``,
    or, in a file that does not import build123d, a line that does. Returns the lines added
    above the command's line."""
    if module is None:
        last = max((node.end_lineno for node in body.tree.body if isinstance(node, (ast.Import, ast.ImportFrom))), default=0)
        edits.after(last, ["from cadgen import build123d as bd"])
        return 1
    if module or named_import is None:
        return 0
    have = {alias.asname or alias.name for alias in named_import.names}
    missing = sorted(name for name in names.needed if name not in have)
    if missing:
        last = named_import.names[-1]
        edits.put(last.end_lineno, last.end_col_offset, "".join(f", {name}" for name in missing))
    return 0


def offset_axes(normal) -> tuple[str, ...]:
    """The two axes that lie in a face's plane, when its normal is along the third: a hole on a
    top face moves in X and Y. An oblique face has none, and its hole stays at its centre."""
    for axis, others in (("Z", ("X", "Y")), ("X", ("Y", "Z")), ("Y", ("X", "Z"))):
        if abs(abs(getattr(normal, axis)) - 1.0) < 1e-9:
            return others
    return ()


def failure_words(command: str, error: str) -> str:
    """Why a command's line did not run, in words."""
    feature = FEATURE_WORDS.get(command, "change").lower()
    last = error.strip().splitlines()[-1] if error.strip() else ""
    if command in ("fillet", "chamfer", "shell") and re.search(r"StdFail|NotDone|BRep_API|failed|Fillet|Chamfer|offset", error, re.I):
        size = {"fillet": "radius", "chamfer": "distance", "shell": "thickness"}[command]
        return f"The {feature} could not be made with that {size} on that selection. Try a smaller {size}."
    return f"The {feature} could not be made: {last or 'the script stopped'}"


# ---------------------------------------------------------------------------------------------
# Edit Feature: a command's line read back into its PropertyManager's values, and written again
# in its place (``plan`` with ``replace``). What the line acts on stays as it is written: its
# edges, faces, the feature it copies, its sketch.


@dataclass
class Feature:
    """A command's line as Edit Feature reads it: the command, the values its panel opens with
    (in the part's units, as the panel types them), what it keeps (said in words), the code of
    what it keeps, and the name and operator it assigns with."""

    command: str
    values: dict
    keeps: str
    parts: dict
    target: str
    operator: str
    # Each number of the line as it is written (a named size, a formula) with its value in the
    # panel's units: a value the engineer leaves as it was is written as it was.
    codes: dict = field(default_factory=dict)


def _tight(node, text: str) -> str:
    """A number's code to put a minus before: as written when it is one term, else in brackets."""
    written = ast.get_source_segment(text, node) or ""
    one_term = isinstance(node, (ast.Name, ast.Constant, ast.Attribute, ast.Call, ast.Subscript)) or (
        isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Mult, ast.Div)))
    return written if one_term else f"({written})"


def _call_name(node) -> str | None:
    """The name a call is made by: ``fillet`` for ``bd.fillet(...)`` and for ``fillet(...)``."""
    if not isinstance(node, ast.Call):
        return None
    return node.func.attr if isinstance(node.func, ast.Attribute) else node.func.id if isinstance(node.func, ast.Name) else None


def _keyword_value(call: ast.Call, name: str):
    return next((each.value for each in call.keywords if each.arg == name), None)


def _through_all(node) -> bool:
    """Whether a depth is written as Through All: ``part.bounding_box().diagonal``, either way."""
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        node = node.operand
    return isinstance(node, ast.Attribute) and node.attr == "diagonal" and _call_name(node.value) == "bounding_box"


def _sketch_of(profile) -> str | None:
    """The sketch a profile is taken from, by its name: ``sketch2`` of ``sketch2.face()``."""
    if (isinstance(profile, ast.Call) and isinstance(profile.func, ast.Attribute) and profile.func.attr in ("face", "faces")
            and isinstance(profile.func.value, ast.Name)):
        return profile.func.value.id
    return None


def read_feature(statement: ast.stmt, text: str, numbers: dict, units: str) -> Feature | None:
    """``statement`` read as the command that writes such a line, or None for a line no command
    writes (the agent's own build123d). ``numbers`` are what the trace recorded for the line's
    operations: ``(operation, argument)`` to a size in millimetres, an angle in degrees, or a count."""
    if isinstance(statement, ast.AugAssign) and isinstance(statement.target, ast.Name) and isinstance(statement.op, (ast.Add, ast.Sub)):
        target, operator, value = statement.target.id, "+=" if isinstance(statement.op, ast.Add) else "-=", statement.value
    elif isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
        target, operator, value = statement.targets[0].id, "=", statement.value
    else:
        return None
    code = lambda node: ast.get_source_segment(text, node) or ""  # noqa: E731
    typed = lambda mm: None if mm is None else (mm / 25.4) if units == "in" else mm  # noqa: E731
    size = lambda mm: "" if mm is None else _number(typed(mm), False)  # noqa: E731
    number = lambda key: numbers.get(key)  # noqa: E731
    name = _call_name(value)
    codes: dict = {}

    def held(role, node, amount, written=None):
        # ``amount`` in the panel's units (a size already converted, a count or an angle as is).
        if node is not None and amount is not None:
            codes[role] = (written if written is not None else code(node), float(amount))

    def counted_items(key, kind):
        count = number(key)
        return counted(int(count), kind) if isinstance(count, (int, float)) else f"its {_KIND_WORDS[kind][1]}"

    if operator == "=" and name == "fillet" and value.args:
        held("radius", _keyword_value(value, "radius"), typed(number(("fillet", "radius"))))
        return Feature("fillet", {"radius": size(number(("fillet", "radius")))}, counted_items(("fillet", "objects"), "edge"),
                       {"edges": code(value.args[0])}, target, operator, codes)
    if operator == "=" and name == "chamfer" and value.args:
        held("distance", _keyword_value(value, "length"), typed(number(("chamfer", "length"))))
        return Feature("chamfer", {"distance": size(number(("chamfer", "length")))}, counted_items(("chamfer", "objects"), "edge"),
                       {"edges": code(value.args[0])}, target, operator, codes)
    if operator == "=" and name == "offset" and _keyword_value(value, "openings") is not None:
        amount = number(("offset", "amount"))
        written = _keyword_value(value, "amount")
        if isinstance(written, ast.UnaryOp) and isinstance(written.op, ast.USub) and amount is not None:
            held("thickness", written.operand, typed(-amount), _tight(written.operand, text))
        return Feature("shell", {"thickness": size(-amount if amount is not None else None)}, f"{counted_items(('offset', 'openings'), 'face')} open",
                       {"openings": code(_keyword_value(value, "openings"))}, target, operator, codes)
    if operator == "-=" and isinstance(value, ast.BinOp):
        calls = [node for node in ast.walk(value) if isinstance(node, ast.Call)]
        cylinder = next((node for node in calls if _call_name(node) == "Cylinder" and len(node.args) >= 2), None)
        plane = next((node for node in calls if _call_name(node) == "Plane" and node.args), None)
        if cylinder is not None and plane is not None:
            through = _through_all(cylinder.args[1])
            radius = number(("Cylinder", "radius"))
            values = {"diameter": size(2 * radius if radius is not None else None), "through": through,
                      "depth": size(number(("Cylinder", "height"))) if not through and number(("Cylinder", "height")) is not None else ""}
            held("diameter", cylinder.args[0], typed(2 * radius) if radius is not None else None)
            if not through:
                held("depth", cylinder.args[1], typed(number(("Cylinder", "height"))))
            moved = next((node for node in calls if _call_name(node) == "Pos"), None)
            for index, axis in enumerate(("x", "y", "z")):
                if moved is not None and number(("move", axis)) is not None and index < len(moved.args):
                    values[axis] = size(number(("move", axis)))
                    held(axis, moved.args[index], typed(number(("move", axis))))
            return Feature("hole", values, "1 face", {"face": code(plane.args[0])}, target, operator, codes)
    if operator in ("+=", "-=") and name == "mirror" and value.args:
        about = _keyword_value(value, "about")
        plane = about.attr if isinstance(about, ast.Attribute) and about.attr in PLANES else "face"
        tool = code(value.args[0])
        return Feature("mirror", {"plane": plane}, "Whole body" if tool == target else tool,
                       {"tool": tool, "plane": code(about) if about is not None else ""}, target, operator)
    if operator in ("+=", "-=") and isinstance(value, ast.ListComp) and isinstance(value.elt, ast.BinOp):
        iterated = value.generators[0].iter if value.generators else None
        made = iterated.value.value if isinstance(iterated, ast.Subscript) and isinstance(iterated.value, ast.Attribute) else None
        tool = code(value.elt.right)
        if _call_name(made) == "PolarLocations":
            values = {"type": "circular", "count": str(int(number(("PolarLocations", "count")) or 0))}
            held("count", made.args[1] if len(made.args) > 1 else None, number(("PolarLocations", "count")))
        elif _call_name(made) == "GridLocations":
            along_y = number(("GridLocations", "y_count")) not in (None, 1)
            spacing = number(("GridLocations", "y_spacing" if along_y else "x_spacing")) or 0.0
            values = {"type": "linear", "direction": "Y" if along_y else "X", "spacing": size(abs(spacing)), "reverse": spacing < 0,
                      "count": str(int(number(("GridLocations", "y_count" if along_y else "x_count")) or 0))}
            if len(made.args) >= 4:
                held("spacing", made.args[1 if along_y else 0], typed(spacing))
                held("count", made.args[3 if along_y else 2], number(("GridLocations", "y_count" if along_y else "x_count")))
        else:
            return None
        return Feature("pattern", values, "Whole body" if tool == target else tool, {"tool": tool}, target, operator, codes)
    if operator in ("+=", "-=") and name in ("extrude", "revolve") and value.args and _sketch_of(value.args[0]):
        profile, sketch = value.args[0], _sketch_of(value.args[0])
        if name == "extrude":
            amount = number(("extrude", "amount")) or 0.0
            both = isinstance(_keyword_value(value, "both"), ast.Constant) and _keyword_value(value, "both").value is True
            through = _through_all(_keyword_value(value, "amount"))
            written = _keyword_value(value, "amount")
            reverse = (isinstance(written, ast.UnaryOp) and isinstance(written.op, ast.USub)) if through else amount < 0
            values = {"end": "mid" if both else "through" if through else "blind", "reverse": bool(reverse) and not both,
                      "depth": size(abs(amount) * (2 if both else 1)) if not through else ""}
            if not through:
                held("amount", written, typed(amount))
            return Feature("extrude" if operator == "+=" else "cut", values, sketch, {"profile": code(profile), "sketch": sketch},
                           target, operator, codes)
        axis = _keyword_value(value, "axis")
        line = code(axis.args[0]) if isinstance(axis, ast.Call) and _call_name(axis) == "axis" and axis.args else None
        if name == "revolve" and line:
            arc = number(("revolve", "revolution_arc")) or 0.0
            held("angle", _keyword_value(value, "revolution_arc"), arc)
            return Feature("revolve" if operator == "+=" else "revolve_cut", {"angle": _number(abs(arc), False), "reverse": arc < 0},
                           sketch, {"profile": code(profile), "sketch": sketch, "axis": line}, target, operator, codes)
    return None
