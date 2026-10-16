"""Edit mode's tracer: a part script run so that its program reads as a design.

The script stays the only thing anyone writes. Running it here records it as an engineer reads a
part: a timeline of the build123d operations it performed, in order, each traced to the line of
code that asked for it, and the sizes that drove them, each traced to the number in the source it
came from. Every numeric literal in the project's own files is read as a number that remembers
where it was written (`LENGTH = 2.80`, line 8) and the formula it went through (`LENGTH - 2*WALL`),
while behaving exactly as a float or an int to build123d and OCCT. A hand edit is then one number
changed in the source, solved back from the dimension the engineer typed, and the part traced again.

It runs warm in a process of its own (`python -m cadgen.edit.tracer --serve`, started by
`service.py`): one JSON request per line on stdin, one reply per line on stdout, with build123d
imported once. It patches build123d and cadgen's model decorator for its own process only, so it is
never imported anywhere else. Nothing here changes how cadgen builds: the STEP files are still
written by running the scripts as the agent does.
"""

from __future__ import annotations

import ast
import base64
import functools
import hashlib
import importlib.abc
import importlib.machinery
import importlib.util
import io
import json
import math
import os
import re
import sys
import tempfile
import traceback
from contextlib import redirect_stdout
from pathlib import Path

# ---------------------------------------------------------------------------------------------
# Numbers that remember where they came from.

LITERALS: dict[str, dict] = {}
"""Every numeric literal of the traced files: where it is written, its text and the name it sets."""


def _expr(value):
    return value._e if isinstance(value, (TFloat, TInt)) else ("num", value)


def _plain(value):
    if isinstance(value, TFloat):
        return float(value)
    if isinstance(value, TInt):
        return int(value)
    return value


def _traced(value, expr):
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return TInt(value, expr)
    if isinstance(value, float):
        return TFloat(value, expr)
    return value


def _numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _ops(cls, base):
    def binary(symbol, fn):
        def left(self, other):
            if not _numeric(other):
                return NotImplemented
            return _traced(fn(base(self), _plain(other)), (symbol, self._e, _expr(other)))

        def right(self, other):
            if not _numeric(other):
                return NotImplemented
            return _traced(fn(_plain(other), base(self)), (symbol, _expr(other), self._e))

        return left, right

    for name, symbol, fn in [
        ("add", "+", lambda a, b: a + b),
        ("sub", "-", lambda a, b: a - b),
        ("mul", "*", lambda a, b: a * b),
        ("truediv", "/", lambda a, b: a / b),
        ("floordiv", "//", lambda a, b: a // b),
        ("pow", "**", lambda a, b: a**b),
    ]:
        left, right = binary(symbol, fn)
        setattr(cls, f"__{name}__", left)
        setattr(cls, f"__r{name}__", right)
    cls.__neg__ = lambda self: _traced(-base(self), ("neg", self._e))
    cls.__pos__ = lambda self: self
    cls.__abs__ = lambda self: _traced(abs(base(self)), ("abs", self._e))
    return cls


class TFloat(float):
    def __new__(cls, value, expr):
        number = float.__new__(cls, value)
        number._e = expr
        return number

    def __reduce__(self):
        return (float, (float(self),))


class TInt(int):
    def __new__(cls, value, expr):
        number = int.__new__(cls, value)
        number._e = expr
        return number

    def __reduce__(self):
        return (int, (int(self),))


_ops(TFloat, float)
_ops(TInt, int)


def studio_number(value, literal_id):
    return _traced(value, ("lit", literal_id))


# ---------------------------------------------------------------------------------------------
# Reading the project's files with their numbers traced.


def _literal_of(node):
    """A numeric literal, its sign included: `2.80`, `-.80`."""
    if isinstance(node, ast.Constant) and _numeric(node.value):
        return node.value
    if (
        isinstance(node, ast.UnaryOp)
        and isinstance(node.op, (ast.USub, ast.UAdd))
        and isinstance(node.operand, ast.Constant)
        and _numeric(node.operand.value)
    ):
        return -node.operand.value if isinstance(node.op, ast.USub) else node.operand.value
    return None


class _Numbers(ast.NodeTransformer):
    def __init__(self, file: str, rel: str, source: str):
        self.file, self.rel = file, rel
        self.lines = source.splitlines(keepends=True)
        self.names: dict[tuple[int, int], str] = {}

    def name_assignments(self, tree):
        # `LENGTH = 2.80` names its literal: the engineer's named size.
        for node in ast.walk(tree):
            if (
                isinstance(node, ast.Assign)
                and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and _literal_of(node.value) is not None
            ):
                self.names[(node.value.lineno, node.value.col_offset)] = node.targets[0].id

    def _replace(self, node, value):
        if node.lineno != node.end_lineno:
            return node
        text = self.lines[node.lineno - 1].encode()[node.col_offset : node.end_col_offset].decode()
        literal_id = f"{self.rel}:{node.lineno}:{node.col_offset}"
        LITERALS[literal_id] = {
            "id": literal_id,
            "file": self.rel,
            "path": self.file,
            "line": node.lineno,
            "col": node.col_offset,
            "end": node.end_col_offset,
            "text": text,
            "value": value,
            "name": self.names.get((node.lineno, node.col_offset)),
        }
        call = ast.Call(
            func=ast.Name(id="__studio_number__", ctx=ast.Load()),
            args=[ast.Constant(value), ast.Constant(literal_id)],
            keywords=[],
        )
        return ast.copy_location(call, node)

    def visit_UnaryOp(self, node):
        value = _literal_of(node)
        if value is not None and not isinstance(node, ast.Constant):
            return self._replace(node, value)
        return self.generic_visit(node)

    def visit_Constant(self, node):
        if _numeric(node.value):
            return self._replace(node, node.value)
        return node

    def visit_JoinedStr(self, node):
        return node


ROOT: Path = Path.cwd()
FILES: dict[str, str] = {}
"""The traced files' hashes by path relative to the project, to refuse an edit to a changed file."""


def _relative(path: str) -> str:
    try:
        return str(Path(path).resolve().relative_to(ROOT))
    except ValueError:
        return path


def _inside(path: str) -> bool:
    """A file of the project's own: under its folder, not in a hidden folder or an environment
    inside it (`.venv`). The project itself may sit in a hidden folder (Studio's state folder)."""
    try:
        parts = Path(path).resolve().relative_to(ROOT).parts
    except ValueError:
        return False
    return not any(part.startswith(".") or part == "site-packages" for part in parts)


class _ProjectLoader(importlib.abc.Loader):
    def __init__(self, path: str):
        self.path = path

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        raw = Path(self.path).read_bytes()
        source = raw.decode("utf-8")
        rel = _relative(self.path)
        FILES[rel] = hashlib.sha256(raw).hexdigest()[:16]
        tree = ast.parse(source, self.path)
        numbers = _Numbers(self.path, rel, source)
        numbers.name_assignments(tree)
        tree = ast.fix_missing_locations(numbers.visit(tree))
        module.__dict__["__studio_number__"] = studio_number
        module.__file__ = self.path
        exec(compile(tree, self.path, "exec"), module.__dict__)


class _ProjectFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, name, path, target=None):
        spec = importlib.machinery.PathFinder.find_spec(name, path)
        if spec is None or not spec.origin or not spec.origin.endswith(".py") or not _inside(spec.origin):
            return None
        spec.loader = _ProjectLoader(spec.origin)
        return spec


sys.meta_path.insert(0, _ProjectFinder())

# ---------------------------------------------------------------------------------------------
# The build123d operations the project's code performs, recorded as it runs.

import build123d as B  # noqa: E402

STEPS: list[dict] = []
RECORDING = False

# Operations that make or change geometry, as an engineer names them.
FUNCTIONS = {
    "extrude": "Extrude",
    "revolve": "Revolve",
    "loft": "Loft",
    "sweep": "Sweep",
    "fillet": "Fillet",
    "chamfer": "Chamfer",
    "offset": "Offset",
    "mirror": "Mirror",
    "split": "Split",
    "make_face": "Face",
    "thicken": "Thicken",
}
CLASSES = {
    "Box": "Box",
    "Cylinder": "Cylinder",
    "Cone": "Cone",
    "Sphere": "Sphere",
    "Torus": "Torus",
    "Wedge": "Wedge",
    "Rectangle": "Rectangle",
    "RectangleRounded": "Rounded rectangle",
    "Circle": "Circle",
    "Ellipse": "Ellipse",
    "Polygon": "Polygon",
    "RegularPolygon": "Polygon",
    "SlotOverall": "Slot",
    "SlotCenterToCenter": "Slot",
    "Trapezoid": "Trapezoid",
    "Triangle": "Triangle",
    "Text": "Text",
    "Hole": "Hole",
    "CounterBoreHole": "Counterbore",
    "CounterSinkHole": "Countersink",
    # Where a pattern puts its copies: a row that uses them is a Pattern.
    "GridLocations": "Pattern",
    "PolarLocations": "Pattern",
}
PATTERNS = {"GridLocations", "PolarLocations"}


def _project_frames():
    """The project's own frames calling into build123d, outermost first."""
    frames = []
    frame = sys._getframe(2)
    while frame is not None:
        filename = frame.f_code.co_filename
        if filename != __file__ and _inside(filename):
            frames.append(
                {"file": _relative(filename), "line": frame.f_lineno, "function": frame.f_code.co_name}
            )
        frame = frame.f_back
    return list(reversed(frames))


def _called_from_project():
    frame = sys._getframe(2)
    # Skip the wrappers of this file.
    while frame is not None and frame.f_code.co_filename == __file__:
        frame = frame.f_back
    return frame is not None and _inside(frame.f_code.co_filename)


def _parameters(fn, args, kwargs):
    try:
        bound = inspect_signature(fn).bind_partial(*args, **kwargs)
        return list(bound.arguments.items())
    except (TypeError, ValueError):
        return [(f"arg{i}", value) for i, value in enumerate(args)] + list(kwargs.items())


def inspect_signature(fn):
    import inspect

    return inspect.signature(fn)


def _record(op, label, fn, args, kwargs, result, extra=None):
    step = {
        "index": len(STEPS),
        "op": op,
        "label": label,
        "frames": _project_frames(),
        "args": [
            (name, value) for name, value in _parameters(fn, args, kwargs) if name not in ("self",)
        ],
        "result": result,
        **(extra or {}),
    }
    STEPS.append(step)
    try:
        result._studio_step = step["index"]
        result._studio_origin = step["index"]
    except Exception:
        pass
    return step


def _origin(shape):
    return getattr(shape, "_studio_origin", None)


def _wrap_function(name, label):
    original = getattr(B, name)

    @functools.wraps(original)
    def wrapper(*args, **kwargs):
        result = original(*args, **kwargs)
        if RECORDING and _called_from_project():
            base = _origin(args[0]) if args else None
            step = _record(name, label, original, args, kwargs, result, {"from": base})
            # A fillet or chamfer changes the body it works on: its result is that body, changed.
            if name in ("fillet", "chamfer") and args:
                body = _body_of(args[0])
                if body is not None:
                    result._studio_origin = body
                    step["from"] = body
        return result

    setattr(B, name, wrapper)


def _body_of(edges):
    """The step that made the body these edges or faces belong to, when it is known."""
    try:
        first = edges[0] if hasattr(edges, "__getitem__") else edges
    except Exception:
        return None
    return getattr(first, "_studio_body", None)


def _wrap_class(name, label):
    cls = getattr(B, name)
    original = cls.__init__

    @functools.wraps(original)
    def init(self, *args, **kwargs):
        original(self, *args, **kwargs)
        if RECORDING and type(self).__name__ == name and _called_from_project():
            _record(name, label, original, (self, *args), kwargs, self)

    cls.__init__ = init


for _name, _label in FUNCTIONS.items():
    if hasattr(B, _name):
        _wrap_function(_name, _label)
for _name, _label in CLASSES.items():
    if hasattr(B, _name):
        _wrap_class(_name, _label)


def _wrap_boolean(cls, method, op, label):
    original = cls.__dict__.get(method)
    if original is None:
        return

    @functools.wraps(original)
    def wrapper(self, other):
        result = original(self, other)
        if RECORDING and _called_from_project():
            others = other if isinstance(other, (list, tuple)) else [other]
            for each in others:
                # A tool used once: a copy of it later (a pattern's) leaves its place on the model.
                try:
                    each._studio_used = True
                except Exception:
                    pass
            step = _record(
                op,
                label,
                original,
                (self, other),
                {},
                result,
                {"from": _origin(self), "tools": [_origin(each) for each in others]},
            )
            # The body keeps its lineage through a join or a cut: it is still the same part.
            try:
                result._studio_origin = _origin(self) if _origin(self) is not None else step["index"]
            except Exception:
                pass
        return result

    setattr(cls, method, wrapper)


for _cls in (B.Shape, B.Compound):
    _wrap_boolean(_cls, "__add__", "join", "Join")
    _wrap_boolean(_cls, "__sub__", "cut", "Cut")
    _wrap_boolean(_cls, "__and__", "intersect", "Intersect")



_pos_init = B.Pos.__init__


@functools.wraps(_pos_init)
def _pos(self, *args, **kwargs):
    _pos_init(self, *args, **kwargs)
    # Where a placement's numbers came from: `Pos(x, y, z)` written with sizes.
    names = ("x", "y", "z")
    self._studio_args = [(names[i] if i < 3 else f"arg{i}", value) for i, value in enumerate(args) if _numeric(value)]


B.Pos.__init__ = _pos


_shape_rmul = B.Shape.__rmul__


@functools.wraps(_shape_rmul)
def _moved(self, other):
    # `Pos(...) * shape`: Location's own __mul__ declines a shape, so the shape moves itself.
    result = _shape_rmul(self, other)
    if not RECORDING or result is NotImplemented or not isinstance(result, B.Shape):
        return result
    origin = _origin(self)
    try:
        result._studio_origin = origin
        result._studio_step = getattr(self, "_studio_step", None)
    except Exception:
        pass
    # `Pos(...) * shape` and `Plane(face) * shape` place a shape; a copy of a tool already used
    # (a pattern's `loc * hole`) is another instance, and the dimensions stay on the first.
    if origin is not None and not getattr(self, "_studio_used", False):
        PLACED[origin] = result
    if getattr(other, "_studio_args", None) and _called_from_project():
        STEPS.append(
            {
                "index": len(STEPS),
                "op": "move",
                "label": "Place",
                "frames": _project_frames(),
                "args": list(other._studio_args),
                "result": result,
                "from": origin,
            }
        )
    return result


B.Shape.__rmul__ = _moved

_plane_rmul = B.Plane.__rmul__


@functools.wraps(_plane_rmul)
def _plane_moved(self, other):
    # `Pos(x, y) * Plane(face)`: the plane keeps where its numbers came from, so the shape it
    # places (a hole) is a Place with them.
    result = _plane_rmul(self, other)
    if getattr(other, "_studio_args", None) and isinstance(result, B.Plane):
        try:
            result._studio_args = other._studio_args
        except Exception:
            pass
    return result


B.Plane.__rmul__ = _plane_moved
PLACED: dict[int, object] = {}
"""The latest placed copy of each step's shape: where it sits in the world."""

# Edges and faces picked from a body know which body they came from, so a fillet keeps its lineage.
_shape_edges, _shape_faces = B.Shape.edges, B.Shape.faces


def _tag_children(method):
    @functools.wraps(method)
    def wrapper(self, *args, **kwargs):
        children = method(self, *args, **kwargs)
        origin = _origin(self)
        if origin is not None:
            for child in children:
                try:
                    child._studio_body = origin
                except Exception:
                    pass
        return children

    return wrapper


B.Shape.edges = _tag_children(_shape_edges)
B.Shape.faces = _tag_children(_shape_faces)

# A model inside the tracer is its plain function: no build pipeline, no STEP written.
import cadgen.authoring as _authoring  # noqa: E402

_authoring._model_wrapper = lambda func, defn: func

# ---------------------------------------------------------------------------------------------
# Formulas, units and numbers as an engineer writes them.

UNIT_NAMES = {"INCH", "INCHES", "IN", "MM", "MM_PER_IN", "MM_PER_INCH"}


def _is_unit(expr):
    return expr[0] == "lit" and (LITERALS.get(expr[1], {}).get("name") or "").upper() in UNIT_NAMES


def strip_unit(expr):
    """`LENGTH*INCH` reads `LENGTH` in an inch project: the unit is how the code meets OCCT."""
    if expr[0] == "*":
        if _is_unit(expr[2]):
            return expr[1], LITERALS[expr[2][1]]["value"]
        if _is_unit(expr[1]):
            return expr[2], LITERALS[expr[1][1]]["value"]
    if expr[0] == "/" and _is_unit(expr[2]):
        return expr[1], 1 / LITERALS[expr[2][1]]["value"]
    return expr, None


PRECEDENCE = {"+": 1, "-": 1, "*": 2, "/": 2, "//": 2, "neg": 3, "**": 4}


def formula(expr, parent=0):
    kind = expr[0]
    if kind == "lit":
        literal = LITERALS.get(expr[1], {})
        return literal.get("name") or literal.get("text") or "?"
    if kind == "num":
        return _number_text(expr[1])
    if kind == "neg":
        return f"-{formula(expr[1], PRECEDENCE['neg'])}"
    if kind == "abs":
        return f"abs({formula(expr[1])})"
    precedence = PRECEDENCE.get(kind, 0)
    text = f"{formula(expr[1], precedence)}{kind}{formula(expr[2], precedence + (1 if kind in '-/' else 0))}"
    return f"({text})" if precedence < parent else text


def leaves(expr, out=None):
    out = [] if out is None else out
    if expr[0] == "lit":
        if expr[1] not in out:
            out.append(expr[1])
    elif expr[0] in ("neg", "abs"):
        leaves(expr[1], out)
    elif expr[0] not in ("num",):
        leaves(expr[1], out)
        leaves(expr[2], out)
    return out


def evaluate(expr, override=None):
    kind = expr[0]
    if kind == "lit":
        if override is not None and expr[1] == override[0]:
            return override[1]
        return LITERALS[expr[1]]["value"]
    if kind == "num":
        return expr[1]
    if kind == "neg":
        return -evaluate(expr[1], override)
    if kind == "abs":
        return abs(evaluate(expr[1], override))
    a, b = evaluate(expr[1], override), evaluate(expr[2], override)
    return {"+": a + b, "-": a - b, "*": a * b, "/": a / b, "//": a // b, "**": a**b}[kind]


def parse_number(text):
    """A number as typed, plain arithmetic allowed (`2.8 + .2`, `3/4`); anything else is refused."""
    tree = ast.parse(text.strip(), mode="eval")

    def value(node):
        if isinstance(node, ast.Constant) and _numeric(node.value):
            return node.value
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
            inner = value(node.operand)
            return -inner if isinstance(node.op, ast.USub) else inner
        if isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub, ast.Mult, ast.Div)):
            a, b = value(node.left), value(node.right)
            return {ast.Add: a + b, ast.Sub: a - b, ast.Mult: a * b, ast.Div: a / b}[type(node.op)]
        raise ValueError(text)

    return float(value(tree.body))


def _number_text(value):
    if isinstance(value, int) or float(value).is_integer() and abs(value) < 1e9:
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


def literal_text(value, old_text):
    """A new value written the way the old one was: as many decimals (`.060` to `.050`, `2.80` to
    `3.10`), and without a leading zero where the old one had none."""
    if old_text.lstrip("+-").isdigit() and float(value).is_integer():
        return str(int(value))
    needed = f"{value:.6f}".rstrip("0").rstrip(".")
    places = len(needed.split(".")[1]) if "." in needed else 0
    written = len(old_text.split(".")[1]) if "." in old_text else 0
    text = f"{value:.{max(places, written)}f}"
    if re.match(r"^[+-]?\.", old_text) and re.match(r"^-?0\.", text):
        text = text.replace("0.", ".", 1)
    return text


def display(value_mm, units):
    """A length in the project's units, as a drawing writes it."""
    value = value_mm / 25.4 if units == "in" else value_mm
    rounded = round(value, 3 if units == "in" else 2)
    return f"{rounded:.3f}".rstrip("0").rstrip(".") if units == "in" else f"{rounded:g}"


# ---------------------------------------------------------------------------------------------
# A trace: the timeline, the sizes and the dimensions of one part.

STATE: dict[str, dict] = {}
"""The last trace of each script, kept so an edit can solve against it."""


def _scale_of(value):
    """The factor a length goes through to reach millimetres: 25.4 when written in inches."""
    if not isinstance(value, (TFloat, TInt)):
        return None
    _, unit = strip_unit(value._e)
    return unit


# build123d's argument names, as an engineer names the sizes: a profile's width runs along X.
LABELS = {
    ("Rectangle", "width"): "Length",
    ("Rectangle", "height"): "Width",
    ("RectangleRounded", "width"): "Length",
    ("RectangleRounded", "height"): "Width",
    ("extrude", "amount"): "Height",
    ("move", "x"): "X",
    ("move", "y"): "Y",
    ("move", "z"): "Z",
    ("chamfer", "length"): "Distance",
    ("offset", "amount"): "Offset",
    ("GridLocations", "x_spacing"): "Spacing",
    ("GridLocations", "y_spacing"): "Spacing",
    ("GridLocations", "x_count"): "Instances",
    ("GridLocations", "y_count"): "Instances",
    ("PolarLocations", "count"): "Instances",
}


def _input(name, value, units, op=None):
    if not isinstance(value, (TFloat, TInt)):
        return None
    shown, unit = strip_unit(value._e)
    length = unit is not None or name in LENGTH_ARGUMENTS
    return {
        "label": LABELS.get((op, name)) or name.replace("_", " ").capitalize(),
        "value": float(value),
        "display": display(float(value), units) if length else _number_text(_plain(value)),
        "unit": (units if length else ""),
        "formula": formula(shown),
        "leaves": [leaf for leaf in leaves(value._e) if not _is_unit(("lit", leaf))],
        "expr": value._e,
        "length": length,
    }


LENGTH_ARGUMENTS = {
    "width",
    "height",
    "length",
    "radius",
    "amount",
    "depth",
    "diameter",
    "x_radius",
    "y_radius",
    "major_radius",
    "minor_radius",
    "arc_size",
    "size",
    "distance",
    "thickness",
}


def _bbox(shape):
    box = shape.bounding_box()
    return (box.min.X, box.min.Y, box.min.Z), (box.max.X, box.max.Y, box.max.Z)


def _dimension(identifier, step, item, a, b, anchor, lines, units, label=None):
    return {
        "expr": item["expr"],
        "name": item["label"],
        "id": identifier,
        "step": step,
        "label": label or item["display"],
        "display": item["display"],
        "formula": item["formula"],
        "leaves": item["leaves"],
        "anchor": anchor,
        "lines": lines,
    }


def _dimensions(steps, units):
    """Dimensions on the model for the steps whose shape and sizes line up with the world's axes."""
    dimensions = []
    for step in steps:
        args = dict(step["args"])
        if step["op"] in ("extrude",) and step["args"]:
            sketch = step["args"][0][1]
            sketch_step = getattr(sketch, "_studio_step", None)
            if sketch_step is None:
                continue
            profile = STEPS[sketch_step]
            if profile["op"] not in ("Rectangle", "RectangleRounded"):
                continue
            shape = PLACED.get(step["index"], step["result"])
            sizes = dict(profile["args"])
            amount = args.get("amount")
            dimensions += _box_dimensions(
                step, shape, sizes.get("width"), sizes.get("height"), amount, sizes.get("radius"), units
            )
        elif step["op"] == "Box":
            shape = PLACED.get(step["index"], step["result"])
            dimensions += _box_dimensions(
                step, shape, args.get("length"), args.get("width"), args.get("height"), None, units
            )
        elif step["op"] == "Cylinder":
            shape = PLACED.get(step["index"], step["result"])
            radius = args.get("radius")
            item = _input("diameter", radius * 2, units) if isinstance(radius, (TFloat, TInt)) else None
            if item is None:
                continue
            (x0, y0, z0), (x1, y1, z1) = _bbox(shape)
            cx, cy, cz = (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2
            r = float(radius)
            off = max(r * 0.8, 2)
            dimensions.append(
                _dimension(
                    f"{step['index']}:diameter",
                    step["index"],
                    item,
                    None,
                    None,
                    (cx + r * 0.71 + off, cy + r * 0.71 + off, cz),
                    [((cx - r * 0.71, cy - r * 0.71, cz), (cx + r * 0.71 + off, cy + r * 0.71 + off, cz))],
                    units,
                    label=f"Ø{item['display']}",
                )
            )
    return dimensions


def _box_dimensions(step, shape, x_size, y_size, z_size, radius, units):
    (x0, y0, z0), (x1, y1, z1) = _bbox(shape)
    span = max(x1 - x0, y1 - y0, z1 - z0, 1)
    off = max(span * 0.12, 2)
    near = lambda value, extent: value is not None and abs(float(value) - extent) <= max(1e-3 * span, 1e-3)  # noqa: E731
    out = []
    x_item = _input("length", x_size, units) if isinstance(x_size, (TFloat, TInt)) else None
    y_item = _input("width", y_size, units) if isinstance(y_size, (TFloat, TInt)) else None
    z_item = _input("height", z_size, units) if isinstance(z_size, (TFloat, TInt)) else None
    for item, label in ((x_item, "Length"), (y_item, "Width"), (z_item, "Height")):
        if item is not None:
            item["label"] = label
    if x_item and near(x_size, x1 - x0):
        y = y0 - off
        out.append(
            _dimension(
                f"{step['index']}:x", step["index"], x_item, None, None, ((x0 + x1) / 2, y, z0),
                [((x0, y0, z0), (x0, y - off * 0.15, z0)), ((x1, y0, z0), (x1, y - off * 0.15, z0)), ((x0, y, z0), (x1, y, z0))],
                units,
            )
        )
    if y_item and near(y_size, y1 - y0):
        x = x1 + off
        out.append(
            _dimension(
                f"{step['index']}:y", step["index"], y_item, None, None, (x, (y0 + y1) / 2, z0),
                [((x1, y0, z0), (x + off * 0.15, y0, z0)), ((x1, y1, z0), (x + off * 0.15, y1, z0)), ((x, y0, z0), (x, y1, z0))],
                units,
            )
        )
    if z_item and near(z_size, z1 - z0):
        x, y = x1 + off * 0.6, y0 - off * 0.6
        out.append(
            _dimension(
                f"{step['index']}:z", step["index"], z_item, None, None, (x, y, (z0 + z1) / 2),
                [((x1, y0, z0), (x, y, z0)), ((x1, y0, z1), (x, y, z1)), ((x, y, z0), (x, y, z1))],
                units,
            )
        )
    if radius is not None and isinstance(radius, (TFloat, TInt)) and float(radius) > 0:
        r = float(radius)
        item = _input("radius", radius, units)
        cx, cy = x1 - r, y1 - r
        rim = (cx + r * 0.71, cy + r * 0.71, z1)
        out.append(
            _dimension(
                f"{step['index']}:r", step["index"], item, None, None,
                (cx + r * 0.71 + off * 0.5, cy + r * 0.71 + off * 0.5, z1),
                [((cx, cy, z1), rim), (rim, (cx + r * 0.71 + off * 0.5, cy + r * 0.71 + off * 0.5, z1))],
                units, label=f"R{item['display']}",
            )
        )
    return out


def _rows(steps):
    """The timeline as the design reads it: one row per line of the function that designs the
    part (the deepest one every operation passes through), each with the operations it performed
    inside any helper it calls, a loop's repeats counted once. With the rows, the depth of that
    function in each operation's frames."""
    chains = [step["frames"] for step in steps if step["frames"]]
    if not chains:
        return [], 0
    depth = 0
    while all(len(chain) > depth for chain in chains) and len(
        {(chain[depth]["file"], chain[depth]["function"]) for chain in chains}
    ) == 1:
        depth += 1
    level = max(depth - 1, 0)
    rows: list[dict] = []
    by_key: dict[tuple, dict] = {}
    for step in steps:
        if not step["frames"]:
            continue
        frame = step["frames"][min(level, len(step["frames"]) - 1)]
        key = (frame["file"], frame["line"])
        row = by_key.get(key)
        if row is None:
            row = {"key": f"{frame['file']}:{frame['line']}", "file": frame["file"], "line": frame["line"], "function": frame["function"], "steps": []}
            by_key[key] = row
            rows.append(row)
        row["steps"].append(step)
    return rows, level


def _read(path):
    """A project file's text exactly as written: UTF-8, its line endings kept."""
    return Path(path).read_bytes().decode("utf-8")


def _write(path, text):
    Path(path).write_bytes(text.encode("utf-8"))


def _source_line(rel, line):
    try:
        return _read(ROOT / rel).splitlines()[line - 1].strip()
    except (OSError, IndexError, UnicodeDecodeError):
        return ""


def _row_kind(steps):
    """What a row of the history is, as a CAD tree names it."""
    ops = [step["op"] for step in steps]
    if PATTERNS & set(ops):
        return "Pattern"
    if "mirror" in ops:
        return "Mirror"
    if any(step["op"] == "offset" and dict(step["args"]).get("openings") is not None for step in steps):
        return "Shell"
    # A cut by a cylinder alone is a hole.
    if "cut" in ops and "Cylinder" in ops and not {"extrude", "revolve", "Box", "sweep", "loft"} & set(ops):
        return "Hole"
    kind = next(
        (FUNCTIONS.get(op, CLASSES.get(op, op.capitalize())) for op in ("cut", "fillet", "chamfer", "extrude", "revolve", "join") if op in ops),
        None,
    ) or (CLASSES.get(ops[0], FUNCTIONS.get(ops[0], ops[0].capitalize())) if ops else "Step")
    return {"cut": "Cut", "join": "Join"}.get(kind, kind)


def _feature_input(kind, step, name, value, units):
    """A step's number as the feature's input reads it: a hole's radius as its diameter, a
    shell's inward offset as its thickness, a pattern's unused direction left out."""
    item = _input(name, value, units, step["op"])
    if item is None:
        return None
    if kind == "Hole" and step["op"] == "Cylinder" and name in ("radius", "height"):
        if name == "height":
            return {**item, "label": "Depth"}
        shown, _ = strip_unit(value._e)
        half = shown[0] == "/" and shown[2] == ("num", 2)
        return {**item, "label": "Diameter", "value": float(value) * 2, "display": display(float(value) * 2, units),
                "formula": formula(shown[1]) if half else formula(("*", shown, ("num", 2))), "expr": ("*", value._e, ("num", 2))}
    if kind == "Shell" and step["op"] == "offset" and name == "amount":
        shown, _ = strip_unit(value._e)
        plain = shown[0] == "lit" and not LITERALS[shown[1]]["name"]
        return {**item, "label": "Thickness", "value": -float(value), "display": display(-float(value), units),
                "formula": LITERALS[shown[1]]["text"].lstrip("-") if plain else formula(("neg", shown)), "expr": ("neg", value._e)}
    if kind == "Pattern" and step["op"] in PATTERNS and float(value) in (0, 1) and name.endswith(("count", "spacing")):
        return None  # the direction a one-row pattern does not use
    return item


def _row_summary(row, units):
    text = _source_line(row["file"], row["line"])
    target = re.match(r"^([A-Za-z_]\w*)\s*(?:[-+*]?=)", text)
    kind = _row_kind(row["steps"])
    inputs, seen = [], set()
    for step in row["steps"]:
        for name, value in step["args"]:
            item = _feature_input(kind, step, name, value, units)
            if item is None:
                continue
            key = tuple(item["leaves"])
            # A helper's own zero (`Pos(0, 0, z)`) is how it is written, not a size of this part.
            plain_zero = float(value) == 0 and all(not LITERALS[leaf]["name"] for leaf in key)
            if not key or key in seen or plain_zero:
                continue
            seen.add(key)
            inputs.append(item)
    # A constrained sketch's dimensions are the feature's inputs too, named as a CAD tool names
    # them (D1@Sketch1), so the sizes that drive the sketch are changed where the feature is.
    for step in row["steps"]:
        drawn = getattr(step["args"][0][1], "_cadgen_sketch", None) if step["op"] in ("extrude", "revolve") and step["args"] else None
        for relation in getattr(drawn, "relations", []):
            if not relation.dimension or not isinstance(relation.raw, (TFloat, TInt)):
                continue
            item = _input(SKETCH_DIMENSION_INPUTS.get(relation.kind, relation.kind), relation.raw, units)
            key = tuple(item["leaves"]) if item else ()
            if item is None or not key or key in seen:
                continue
            seen.add(key)
            inputs.append({**item, "label": f"{relation.name}@{drawn.name}"})
    repeats = len([s for s in row["steps"] if s["op"] == row["steps"][0]["op"]])
    return {
        "key": row["key"],
        "file": row["file"],
        "line": row["line"],
        "name": target.group(1) if target else None,
        "kind": kind,
        "code": text,
        "count": repeats if repeats > 1 else 1,
        "steps": [step["index"] for step in row["steps"]],
        "inputs": inputs,
    }


# A profile an extrude or revolve makes a solid from: what a CAD tree shows as its sketch.
SKETCH_PROFILES = {"Rectangle", "RectangleRounded", "Circle", "Ellipse", "Polygon", "RegularPolygon",
                   "SlotOverall", "SlotCenterToCenter", "Trapezoid", "Triangle", "Text"}
# A constrained sketch's plane as the tree names it (`cadgen.sketch` takes either).
SKETCH_PLANES = {"XY": "Top", "XZ": "Front", "YZ": "Right"}
# A sketch dimension's kind as the input it is: linear ones are lengths, an angle is not.
SKETCH_DIMENSION_INPUTS = {"length": "length", "distance": "length", "horizontal_distance": "length",
                           "vertical_distance": "length", "radius": "radius", "diameter": "diameter", "angle": "angle"}
# A primitive solid reads as an extrude of the sketch it implies.
PRIMITIVE_SKETCHES = {"Box": ("Rectangle", "Rectangle"), "Cylinder": ("Circle", "Circle")}
MAKES_SOLID = {"Extrude", "Revolve", "Box", "Cylinder"}


def _plane_of(shape):
    """The plane a profile lies on, as a CAD tree names the origin's planes (Top is XY)."""
    try:
        normal = shape.faces()[0].normal_at()
    except Exception:
        return None
    weights = {"Top": abs(normal.Z), "Front": abs(normal.Y), "Right": abs(normal.X)}
    name, weight = max(weights.items(), key=lambda item: item[1])
    return name if weight > 0.999 else "Plane"


def _sketch_of(steps):
    """The sketch a row makes its solid from: the profile its extrude or revolve takes, or the
    rectangle or circle a box or cylinder implies, with the plane it lies on."""
    for step in steps:
        if step["op"] in ("extrude", "revolve") and step["args"]:
            # A face made from a constrained sketch (`cadgen.sketch`): that sketch, by its name.
            drawn = getattr(step["args"][0][1], "_cadgen_sketch", None)
            if drawn is not None:
                plane = drawn.plane if isinstance(drawn.plane, str) else _plane_of(step["args"][0][1])
                return {"op": "Sketch", "label": "Sketch", "name": drawn.name, "step": None,
                        "plane": SKETCH_PLANES.get(plane, plane), "status": drawn.status}
            index = getattr(step["args"][0][1], "_studio_step", None)
            if index is not None and STEPS[index]["op"] in SKETCH_PROFILES:
                profile = STEPS[index]
                return {"op": profile["op"], "label": profile["label"], "step": index, "plane": _plane_of(profile["result"])}
        if step["op"] in PRIMITIVE_SKETCHES:
            op, label = PRIMITIVE_SKETCHES[step["op"]]
            return {"op": op, "label": label, "step": step["index"], "plane": "Top"}
    return None


def _is_flat(step):
    """A step that draws: a profile, or a profile placed, joined or cut (a sketch's own lines)."""
    if step["op"] in SKETCH_PROFILES:
        return True
    return step["op"] in ("join", "cut", "intersect", "move") and isinstance(step.get("result"), (B.Sketch, B.Face))


def _features(summaries, timeline):
    """The history as a CAD tree reads it:
    - a solid made from a sketch and then cut from the body, or joined to it, is one Cut-Extrude
      or Boss-Extrude, the line that cut or joined it folded in;
    - lines that only draw a profile (`bloom = Circle(...)`, `bloom += Pos(...) * Circle(...)`) are
      the sketch of the extrude that makes a solid of it, under it, not features of their own;
    - every other line is a feature of its own (Fillet, Hole, Shell).
    Each feature keeps the rows of the history it stands for, in order."""
    row_of = {index: summary["key"] for summary in summaries for index in summary["steps"]}
    features, feature_of_row = [], {}
    for summary, row in zip(summaries, timeline):
        kind = summary["kind"]
        booleans = [step for step in row["steps"] if step["op"] in ("cut", "join", "intersect")]
        flat = bool(row["steps"]) and all(_is_flat(step) for step in row["steps"])
        if kind in ("Cut", "Join", "Intersect") and booleans and not flat:
            tool_rows = {row_of.get(tool) for step in booleans for tool in step.get("tools") or [] if tool is not None}
            targets = [feature_of_row.get(key) for key in tool_rows]
            if targets and all(target is not None and target["solid"] and not target["folded"] for target in targets):
                for target in {id(target): target for target in targets}.values():
                    target["kind"] = {"Cut": "Cut", "Join": "Boss", "Intersect": "Intersect"}[kind] + "-" + target["base"]
                    target["rows"].append(summary["key"])
                    target["folded"] = True
                feature_of_row[summary["key"]] = targets[0]
                continue
        makes = {step["op"] for step in row["steps"]} & {"extrude", "revolve", "Box", "Cylinder"}
        # A cut or join whose tool is made on the same line is that tool's feature: a Cut-Extrude.
        inline = kind in ("Cut", "Join", "Intersect") and booleans and makes and not flat
        solid = kind in MAKES_SOLID or bool(inline)
        base = "Revolve" if kind == "Revolve" or "revolve" in makes else "Extrude"
        sketch = _sketch_of(row["steps"]) if solid else None
        if solid and sketch is None:
            # A profile drawn over earlier lines (`bloom = Circle(...)`, `bloom += ...`): those
            # lines are this feature's sketch. They are the drawing lines just before it that
            # assign the variable it extrudes.
            drawn_name = re.search(r"(?:extrude|revolve)\(\s*([A-Za-z_]\w*)", summary["code"] or "")
            drawn = []
            for previous in reversed(features):
                if not previous["flat"] or not drawn_name or previous["name"] != drawn_name.group(1):
                    break
                drawn.insert(0, previous)
            if drawn:
                profile = next((step["args"][0][1] for step in row["steps"] if step["op"] in ("extrude", "revolve") and step["args"]), None)
                sketch = {"op": "Sketch", "label": "Sketch", "step": None, "plane": _plane_of(profile) if profile is not None else None,
                          "rows": [key for f in drawn for key in f["rows"]]}
                features = [f for f in features if f not in drawn]
        if inline:
            kind = {"Cut": "Cut", "Join": "Boss", "Intersect": "Intersect"}[kind]
        feature = {
            "key": summary["key"], "rows": [summary["key"]], "name": summary["name"], "count": summary["count"],
            "file": summary["file"], "line": summary["line"], "sketch": sketch,
            "kind": (f"{kind}-{base}" if inline else f"Boss-{base}") if solid else {"Move": "Move/Copy"}.get(kind, kind),
            "base": base, "solid": solid and not inline, "folded": bool(inline), "flat": flat,
        }
        if sketch and sketch.get("rows"):
            feature["rows"] = sketch["rows"] + feature["rows"]
        feature_of_row[summary["key"]] = feature
        features.append(feature)
    return [{key: value for key, value in feature.items() if key not in ("base", "solid", "folded", "flat")} for feature in features]


def _is_model(file, function):
    """Whether a project function is a part's model (`@step`), so an assembly's call to it is a component."""
    try:
        return re.search(rf"^\s*@step\b[^\n]*\n(?:\s*@[^\n]*\n)*\s*def\s+{re.escape(function)}\s*\(", _read(ROOT / file), re.M) is not None
    except (OSError, UnicodeDecodeError):
        return False


def _components(steps):
    """An assembly's parts: the operations split by the part model each runs in (`daisy_tray()`),
    when the assembly calls more than one; empty for a single part."""
    chains = [step["frames"] for step in steps if step["frames"]]
    if not chains:
        return []
    depth = 0
    while all(len(chain) > depth for chain in chains) and len({(c[depth]["file"], c[depth]["function"]) for c in chains}) == 1:
        depth += 1
    groups: dict[tuple, list] = {}
    for step in steps:
        frames = step["frames"]
        if len(frames) <= depth:
            return []
        groups.setdefault((frames[depth]["file"], frames[depth]["function"]), []).append(step)
    if len(groups) < 2 or not all(_is_model(file, function) for file, function in groups):
        return []
    return [{"file": file, "function": function, "steps": group} for (file, function), group in groups.items()]


def _bounds(shape):
    try:
        box = shape.bounding_box()
        return [[box.min.X, box.min.Y, box.min.Z], [box.max.X, box.max.Y, box.max.Z]]
    except Exception:
        return None


def _clean(item):
    return {key: value for key, value in item.items() if key != "expr"}


def _export_mesh(shape):
    handle, file = tempfile.mkstemp(suffix=".stl")
    os.close(handle)
    try:
        B.export_stl(shape, file, tolerance=0.02, angular_tolerance=0.2)
        return base64.b64encode(Path(file).read_bytes()).decode()
    finally:
        os.unlink(file)


def _units():
    project = ROOT / "project.json"
    for candidate in [project, *[p / "project.json" for p in ROOT.parents]]:
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
            units = data.get("brief", {}).get("units") or data.get("units")
            if units in ("in", "mm"):
                return units
        except (OSError, ValueError):
            continue
    return None


def trace(request):
    global RECORDING, ROOT
    script = Path(request["script"]).resolve()
    ROOT = Path(request.get("root") or script.parent).resolve()
    # The project's modules are read afresh: this project's, and any an earlier trace loaded.
    stale = [
        name
        for name, module in sys.modules.items()
        if isinstance(getattr(module, "__loader__", None), _ProjectLoader)
        or (getattr(module, "__file__", None) and _inside(module.__file__))
    ]
    for name in stale:
        del sys.modules[name]
    LITERALS.clear()
    FILES.clear()
    STEPS.clear()
    PLACED.clear()
    sys.path[:0] = [str(script.parent)]
    try:
        spec = importlib.util.spec_from_file_location("__studio_part__", script, loader=_ProjectLoader(str(script)))
        module = importlib.util.module_from_spec(spec)
        printed = io.StringIO()
        with redirect_stdout(printed):
            spec.loader.exec_module(module)
            models = [
                value.__cadgen_model__
                for value in vars(module).values()
                if hasattr(value, "__cadgen_model__") and Path(str(value.__cadgen_model__.script_path)).resolve() == script
            ]
            if not models:
                return {"ok": False, "error": f"{script.name} declares no model (@step)."}
            model = models[0]
            RECORDING = True
            try:
                shape = model.func()
            finally:
                RECORDING = False
    except Exception:
        return {"ok": False, "error": traceback.format_exc(limit=6)}
    finally:
        sys.path.remove(str(script.parent))

    units = request.get("units") or _units() or ("in" if any(lit.get("name", "") and lit["name"].upper() in UNIT_NAMES for lit in LITERALS.values()) else "mm")
    steps = list(STEPS)
    # An assembly's history is its parts' histories, each read from that part's own model.
    components = _components(steps)
    if components:
        timeline, rows, level = [], [], 0
        for component in components:
            part_timeline, level = _rows(component["steps"])
            part_rows = [_row_summary(row, units) for row in part_timeline]
            component["features"] = _features(part_rows, part_timeline)
            timeline += part_timeline
            rows += part_rows
    else:
        timeline, level = _rows(steps)
        rows = [_row_summary(row, units) for row in timeline]
    dimensions = _dimensions(steps, units)
    row_of = {index: row["key"] for row in rows for index in row["steps"]}
    for dimension in dimensions:
        dimension["row"] = row_of.get(dimension["step"])
    # The sizes an engineer changes: named numbers the part used, units aside.
    used = {leaf for step in steps for _, value in step["args"] if isinstance(value, (TFloat, TInt)) for leaf in leaves(value._e)}
    params = [
        {
            "id": literal["id"],
            "name": literal["name"],
            "file": literal["file"],
            "line": literal["line"],
            "text": literal["text"],
            "value": literal["value"],
            "unit": units if any(_scale_of_leaf(literal["id"], step) for step in steps) else "",
        }
        for literal in LITERALS.values()
        if literal["name"] and literal["id"] in used and literal["name"].upper() not in UNIT_NAMES
    ]
    params.sort(key=lambda p: (p["file"], p["line"]))
    # The body and its making, for a command to act on (`commands.py`).
    STATE[str(script)] = {"dimensions": {d["id"]: d for d in dimensions}, "rows": rows, "units": units,
                          "shape": shape, "steps": steps, "level": level}
    return {
        "ok": True,
        "script": str(script),
        "name": script.stem,
        "units": units,
        "files": dict(FILES),
        "params": params,
        "rows": [{**row, "inputs": [_clean(item) for item in row["inputs"]]} for row in rows],
        # The same history as a CAD tree reads it, and the part's extent for the origin's planes.
        "features": [] if components else _features(rows, timeline),
        "components": [{"name": c["function"], "file": c["file"], "features": c["features"]} for c in components],
        "bounds": _bounds(shape) if isinstance(shape, B.Shape) else None,
        "dimensions": [_clean(d) for d in dimensions],
        # The viewer draws the model from its STEP; a page of its own asks for the mesh.
        "mesh": _export_mesh(shape) if request.get("mesh", True) and isinstance(shape, B.Shape) else None,
        "printed": printed.getvalue()[-2000:],
    }


def _scale_of_leaf(literal_id, step):
    for _, value in step["args"]:
        if isinstance(value, (TFloat, TInt)) and literal_id in leaves(value._e) and _scale_of(value):
            return True
    return False


# ---------------------------------------------------------------------------------------------
# Edits: one number in the source, then the part traced again.


def _changed_since(path, expected_hash):
    return bool(expected_hash) and hashlib.sha256(Path(path).read_bytes()).hexdigest()[:16] != expected_hash


def _write_literal(literal, text, expected_hash):
    path = Path(literal["path"])
    source = _read(path)
    if _changed_since(path, expected_hash):
        raise RuntimeError(f"{literal['file']} changed since the editor read it. Look again and retry.")
    lines = source.splitlines(keepends=True)
    row = lines[literal["line"] - 1].encode()
    old = row[literal["col"] : literal["end"]].decode()
    if old != literal["text"]:
        raise RuntimeError(f"{literal['file']} line {literal['line']} no longer reads {literal['text']}.")
    lines[literal["line"] - 1] = (row[: literal["col"]] + text.encode() + row[literal["end"] :]).decode()
    _write(path, "".join(lines))


def _solve(expr, leaf, target):
    """The value of `leaf` that makes `expr` equal `target` (secant steps; exact for the linear
    formulas sizes usually go through)."""
    x0 = LITERALS[leaf]["value"]
    x1 = x0 * 1.1 + 1e-3
    f0, f1 = evaluate(expr, (leaf, x0)) - target, evaluate(expr, (leaf, x1)) - target
    for _ in range(30):
        if abs(f1) < 1e-9:
            return x1
        if f1 == f0:
            break
        x0, x1 = x1, x1 - f1 * (x1 - x0) / (f1 - f0)
        f0, f1 = f1, evaluate(expr, (leaf, x1)) - target
    if abs(f1) < 1e-6 * max(1, abs(target)):
        return x1
    raise RuntimeError("That value cannot be reached by changing this number.")


def edit(request):
    if isinstance(request.get("command"), dict):
        return command(request)
    if isinstance(request.get("splice"), dict):
        return splice(request)
    script = str(Path(request["script"]).resolve())
    if script not in STATE:
        traced = trace(request)
        if not traced["ok"]:
            return traced
    files = request.get("files") or {}
    if "literal" in request:
        literal = LITERALS.get(request["literal"])
        if literal is None:
            return {"ok": False, "error": "That number is no longer in the source. Look again."}
        try:
            value = parse_number(request["text"])
        except Exception:
            return {"ok": False, "error": f"{request['text']} is not a number."}
        old_value = literal["value"]
        _write_literal(literal, literal_text(value, literal["text"]), files.get(literal["file"]))
        change = {"literal": literal["id"], "name": literal["name"] or literal["text"], "file": literal["file"], "line": literal["line"], "from": literal["text"], "to": literal_text(value, literal["text"]), "was": old_value}
    else:
        state = STATE[script]
        if "input" in request:
            # A size in a timeline row, edited like a dimension: solved back to the number behind it.
            row = next((row for row in state["rows"] if row["key"] == request["input"].get("row")), None)
            index = request["input"].get("index", -1)
            dimension = row["inputs"][index] if row is not None and 0 <= index < len(row["inputs"]) else None
        else:
            dimension = state["dimensions"].get(request["dimension"])
        if dimension is None:
            return {"ok": False, "error": "That size is no longer on the part. Look again."}
        # A formula's named sizes are what an engineer changes; its bare coefficients (`2*WALL`) are not.
        named = [leaf for leaf in dimension["leaves"] if LITERALS[leaf]["name"]]
        candidates = named or dimension["leaves"]
        leaf = request.get("leaf") or (candidates[0] if len(candidates) == 1 else None)
        if leaf is None:
            return {
                "ok": False,
                "choose": [
                    {"id": c, "name": LITERALS[c]["name"] or LITERALS[c]["text"], "file": LITERALS[c]["file"], "line": LITERALS[c]["line"]}
                    for c in candidates
                ],
            }
        try:
            typed = parse_number(request["text"])
        except Exception:
            return {"ok": False, "error": f"{request['text']} is not a number."}
        is_length = dimension.get("length", True)
        target = typed * 25.4 if state["units"] == "in" and is_length else typed
        expr = dimension["expr"]
        literal = LITERALS[leaf]
        value = _solve(expr, leaf, target)
        text = literal_text(round(value, 6), literal["text"])
        _write_literal(literal, text, files.get(literal["file"]))
        change = {"literal": literal["id"], "name": literal["name"] or literal["text"], "file": literal["file"], "line": literal["line"], "from": literal["text"], "to": text, "was": literal["value"]}
    traced = trace(request)
    traced["change"] = change
    return traced


# ---------------------------------------------------------------------------------------------
# Commands: a line of build123d written after the part's body (`commands.py`), then the part
# traced again. The line stands only if it runs and makes the feature asked for, on the faces or
# edges selected; otherwise the file is put back as it was.


def _refused_change(files):
    """Why a change is refused when a file it read changed since: the agent's edit, another view's."""
    for rel, digest in (files or {}).items():
        if FILES.get(rel) not in (None, digest):
            return {"ok": False, "error": f"{rel} changed since the editor read it. Look again and retry."}
    return None


def _check(script, traced, plan, scale):
    from cadgen.edit import commands

    if not traced.get("ok"):
        return commands.failure_words(plan.command, traced.get("error") or "")
    key = f"{plan.rel}:{plan.line}"
    row = next((row for row in traced["rows"] if row["key"] == key), None)
    made = [STATE[script]["steps"][index] for index in row["steps"]] if row else []
    step = next((step for step in made if step["op"] in plan.records), None)
    if step is None:
        return "The new line did not make the feature, so nothing changed. Ask the agent to make it."
    if plan.selected and not commands.same_items(dict(step["args"]).get(plan.selected["argument"]), plan.selected["items"], scale):
        return "The new line picked other faces or edges than the ones selected, so nothing changed."
    return None


def command(request):
    from cadgen.edit import commands

    script = str(Path(request["script"]).resolve())
    traced = trace(request)
    if not traced["ok"]:
        return traced
    refused = _refused_change(request.get("files"))
    if refused:
        return refused
    state = STATE[script]
    try:
        plan = commands.plan(request["command"], steps=state["steps"], shape=state["shape"], level=state["level"],
                             units=state["units"], literals=LITERALS, root=ROOT, parse=parse_number)
    except commands.CommandError as error:
        return {"ok": False, "error": str(error)}
    scale = state["shape"].bounding_box().diagonal or 1.0
    _write(plan.path, plan.new)
    after = trace(request)
    failure = _check(script, after, plan, scale)
    if failure:
        _write(plan.path, plan.old)
        trace(request)
        return {"ok": False, "error": failure}
    after["change"] = {
        "kind": "command",
        "command": plan.command,
        **plan.summary,
        "file": plan.rel,
        "line": plan.line,
        "row": f"{plan.rel}:{plan.line}",
        "code": plan.code,
        # Undo puts the lines back as they were; Redo writes them again.
        "undo": {"file": plan.rel, "hunks": commands.hunks(plan.new, plan.old)},
        "redo": {"file": plan.rel, "hunks": commands.hunks(plan.old, plan.new)},
    }
    return after


def splice(request):
    """Lines of a project file put back, or written again: a command's Undo and Redo."""
    from cadgen.edit import commands

    global ROOT
    script = Path(request["script"]).resolve()
    ROOT = Path(request.get("root") or script.parent).resolve()
    spec = request["splice"]
    rel = str(spec.get("file") or "")
    path = (ROOT / rel).resolve()
    try:
        path.relative_to(ROOT)
    except ValueError:
        return {"ok": False, "error": "That change is not in this project."}
    if path.suffix != ".py" or not path.is_file():
        return {"ok": False, "error": f"{rel} is no longer in the project."}
    if _changed_since(path, (request.get("files") or {}).get(rel)):
        return {"ok": False, "error": f"{rel} changed since the editor read it. Look again and retry."}
    old = _read(path)
    try:
        new = commands.splice(old, spec.get("hunks") or [])
    except commands.CommandError as error:
        return {"ok": False, "error": str(error)}
    _write(path, new)
    traced = trace(request)
    if not traced["ok"]:
        _write(path, old)
        trace(request)
        return {"ok": False, "error": "The part does not build with that change, so nothing changed."}
    first = min((int(each["start"]) for each in spec.get("hunks") or []), default=1)
    traced["change"] = {"kind": "splice", "file": rel, "line": first,
                        "undo": {"file": rel, "hunks": commands.hunks(new, old)}, "redo": spec}
    return traced


# ---------------------------------------------------------------------------------------------


def handle(request):
    try:
        if request.get("op") == "edit":
            return edit(request)
        return trace(request)
    except Exception as error:
        return {"ok": False, "error": str(error), "detail": traceback.format_exc(limit=4)}


def main():
    if "--serve" in sys.argv:
        for line in sys.stdin:
            if not line.strip():
                continue
            request = json.loads(line)
            reply = handle(request)
            reply["id"] = request.get("id")
            sys.stdout.write(json.dumps(reply, default=_plain) + "\n")
            sys.stdout.flush()
        return
    print(json.dumps(handle(json.loads(sys.argv[1])), default=_plain, indent=1))


if __name__ == "__main__":
    main()
