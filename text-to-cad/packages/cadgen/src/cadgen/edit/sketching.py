"""Edit mode's sketch mode: a sketch drawn, related and dimensioned as a CAD tool's sketcher does
it, written as lines of the part's script (``cadgen.sketch``).

The script stays the source. A sketch is the statement that makes it (``sketch1 =
Sketch("Sketch1", plane="Top")``) and the statements after it that draw on it, relate and
dimension it: its block. A stroke in the viewer is one more statement at the block's end, a
relation or a dimension one more, and an entity deleted is its statement taken out, with the
relations on it, while what was drawn from its points keeps them where they are.

Everything here is text: a change is made to a script's text and a sketch's state as the tracer
last solved it (``Sketch.state()``, whose items name the line that made them), so that the state
and the text agree; the tracer runs the block again after each change (``tracer.py``).
"""

from __future__ import annotations

import ast
import keyword
import re
from dataclasses import dataclass, field

GEOMETRY = ("point", "line", "polyline", "circle", "arc", "three_point_arc", "rectangle", "center_rectangle", "slot")
RELATIONS = ("fix", "coincident", "horizontal", "vertical", "parallel", "perpendicular", "tangent", "equal", "midpoint",
             "symmetric", "concentric")
DIMENSIONS = ("distance", "length", "horizontal_distance", "vertical_distance", "radius", "diameter", "angle")
SKETCH_METHODS = frozenset(GEOMETRY + RELATIONS + DIMENSIONS)
# How many curves a drawing statement returns, in the order it makes them: a rectangle's four
# lines (a center rectangle's diagonal is not returned), a slot's arc, line, arc, line.
RETURNED = {"rectangle": 4, "center_rectangle": 4, "slot": 4}
# The words a CAD tool uses for each kind of entity, for messages.
KIND_WORDS = {"line": "line", "circle": "circle", "arc": "arc", "point": "point"}
# What a typed size may be: numbers, names and plain arithmetic.
_TYPED = re.compile(r"^[\w\s.+\-*/()]+$")


class SketchEditError(Exception):
    """A sketch change that cannot be made, said to the engineer."""


def number(value: float) -> str:
    """A coordinate or size as the script writes it: up to six decimals, no trailing zeros."""
    value = round(float(value), 6)
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) < 1e12:
        return str(int(value))
    return f"{value:.6f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------------------------------------
# Text edits, at the ast's own positions (lines from 1, columns in UTF-8 bytes).


class TextEdits:
    def __init__(self, text: str):
        self.text = text
        self.spans: list[tuple[int, int, int, int, str]] = []
        self.newline = "\r\n" if "\r\n" in text else "\n"

    def replace(self, start_line: int, start_col: int, end_line: int, end_col: int, replacement: str) -> None:
        self.spans.append((start_line, start_col, end_line, end_col, replacement))

    def replace_node(self, node: ast.AST, replacement: str) -> None:
        self.replace(node.lineno, node.col_offset, node.end_lineno, node.end_col_offset, replacement)

    def remove_lines(self, first: int, last: int) -> None:
        """Lines ``first`` to ``last`` taken out whole."""
        self.spans.append((first, 0, last + 1, 0, ""))

    def insert_after(self, line: int, lines: list[str]) -> None:
        """New lines after line ``line`` (0 puts them first)."""
        if lines:
            self.spans.append((line + 1, 0, line + 1, 0, "".join(each + self.newline for each in lines)))

    def apply(self) -> str:
        lines = self.text.splitlines(keepends=True)
        if lines and not lines[-1].endswith(("\n", "\r")):
            lines[-1] += self.newline
        encoded = [line.encode("utf-8") for line in lines]
        starts = [0]
        for each in encoded:
            starts.append(starts[-1] + len(each))
        data = b"".join(encoded)

        def offset(line: int, col: int) -> int:
            if line - 1 >= len(encoded):
                return len(data)
            return starts[line - 1] + col

        for start_line, start_col, end_line, end_col, replacement in sorted(
                self.spans, key=lambda span: (offset(span[0], span[1]), offset(span[2], span[3])), reverse=True):
            a, b = offset(start_line, start_col), offset(end_line, end_col)
            data = data[:a] + replacement.encode("utf-8") + data[b:]
        return data.decode("utf-8")


# ---------------------------------------------------------------------------------------------
# A sketch's block, and its entities as code.


def _sketch_call(node, var: str) -> bool:
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and isinstance(node.func.value, ast.Name)
            and node.func.value.id == var and node.func.attr in SKETCH_METHODS)


def _call_of(statement: ast.stmt, var: str) -> ast.Call | None:
    """The sketch call a statement is (``line1 = sketch1.line(...)``, ``sketch1.length(...)``)."""
    value = statement.value if isinstance(statement, (ast.Assign, ast.Expr)) else None
    return value if _sketch_call(value, var) else None


def _assigns(statement: ast.stmt, var: str) -> bool:
    targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target] if isinstance(
        statement, (ast.AugAssign, ast.AnnAssign)) else []
    return any(isinstance(node, ast.Name) and node.id == var for target in targets for node in ast.walk(target))


@dataclass
class Block:
    """Where a sketch is made in a script: the statement that makes it and the ones that draw on
    it, relate and dimension it, in the body (a function's, or the module's) that holds them."""

    path: str
    text: str
    tree: ast.Module
    function: ast.FunctionDef | None
    body: list
    start: int
    end: int
    var: str
    indent: str

    @property
    def statements(self) -> list:
        return self.body[self.start:self.end + 1]

    @property
    def first_line(self) -> int:
        return self.body[self.start].lineno

    @property
    def last_line(self) -> int:
        return self.body[self.end].end_lineno


def find_block(text: str, line: int, path: str = "<sketch>") -> Block:
    """The block of the sketch made at ``line`` of ``text``."""
    tree = ast.parse(text, path)
    function = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.lineno <= line <= node.end_lineno:
            if function is None or node.lineno > function.lineno:
                function = node
    body = function.body if function is not None else tree.body
    start = next((index for index, statement in enumerate(body) if statement.lineno <= line <= statement.end_lineno), None)
    statement = body[start] if start is not None else None
    if not (isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name)
            and isinstance(statement.value, ast.Call)):
        raise SketchEditError("This sketch is not made on a line of its own (sketch1 = Sketch(...)), so edit mode cannot "
                              "change it. Ask the agent to change it.")
    var = statement.targets[0].id
    end = start
    for index in range(start + 1, len(body)):
        if _assigns(body[index], var):
            break
        if any(_sketch_call(node, var) for node in ast.walk(body[index])):
            end = index
    source = text.splitlines()[statement.lineno - 1]
    return Block(path=path, text=text, tree=tree, function=function, body=body, start=start, end=end, var=var,
                 indent=source[: len(source) - len(source.lstrip())])


def _segment(text: str, node: ast.AST) -> str:
    return ast.get_source_segment(text, node) or ""


@dataclass
class Made:
    """What one statement of a block makes: its curves, points and relations, by name, in order."""

    statement: ast.stmt
    method: str | None
    curves: list = field(default_factory=list)
    points: list = field(default_factory=list)
    relations: list = field(default_factory=list)


class Names:
    """A sketch's entities as its block writes them: each curve by its name in the script
    (``line3``, ``bottom``, ``rect[2]``), each point as a curve's end or center (``line3.end``) or
    the origin (``sketch1.origin``), and each statement with what it makes."""

    def __init__(self, block: Block, state: dict):
        self.block = block
        self.state = state
        self.curves = {curve["id"]: curve for curve in state.get("curves", [])}
        self.points = {point["id"]: point for point in state.get("points", [])}
        self.relations = {item["id"]: item for item in [*state.get("relations", []), *state.get("dimensions", [])]}
        self.made: list[Made] = []
        self.curve_code: dict[str, str] = {}
        self.point_code: dict[str, list[tuple[int, str]]] = {"Origin": [(block.start, f"{block.var}.origin")]}
        self.made_by: dict[str, int] = {}  # an item's name, to the index of the statement that made it
        for index in range(block.start + 1, block.end + 1):
            statement = block.body[index]
            call = _call_of(statement, block.var)
            made = Made(statement, call.func.attr if call is not None else None)
            span = range(statement.lineno, statement.end_lineno + 1)
            made.curves = [curve["id"] for curve in state.get("curves", []) if curve.get("line") in span]
            made.relations = [item["id"] for item in [*state.get("relations", []), *state.get("dimensions", [])] if item.get("line") in span]
            made.points = [point["id"] for point in state.get("points", []) if point.get("line") in span and point["id"] != "Origin"]
            for name in [*made.curves, *made.relations, *made.points]:
                self.made_by.setdefault(name, index)
            self.made.append(made)
            target = statement.targets[0] if isinstance(statement, ast.Assign) and len(statement.targets) == 1 else None
            if call is None or target is None:
                continue
            if isinstance(target, ast.Name):
                if made.method == "point" and made.points:
                    self.point_code.setdefault(made.points[0], []).append((index, target.id))
                elif len(made.curves) == 1:
                    self.curve_code[made.curves[0]] = target.id
                else:
                    returned = RETURNED.get(made.method, len(made.curves))
                    for position, curve in enumerate(made.curves[:returned]):
                        self.curve_code[curve] = f"{target.id}[{position}]"
            elif isinstance(target, ast.Tuple) and all(isinstance(element, ast.Name) for element in target.elts):
                for element, curve in zip(target.elts, made.curves):
                    self.curve_code[curve] = element.id
        for name, code in self.curve_code.items():
            curve = self.curves[name]
            index = self.made_by.get(name, block.start)
            for role in ("start", "end", "center"):
                if curve.get(role):
                    self.point_code.setdefault(curve[role], []).append((index, f"{code}.{role}"))

    def statement_of(self, name: str) -> Made | None:
        index = self.made_by.get(name)
        return self.made[index - self.block.start - 1] if index is not None else None

    def curve(self, name: str) -> str:
        code = self.curve_code.get(name)
        if code is None:
            if name not in self.curves:
                raise SketchEditError(f"{name} is no longer in the sketch. Look again.")
            raise SketchEditError(f"{name} has no name in the script, so edit mode cannot refer to it. Ask the agent to name it.")
        return code

    def point(self, name: str, before: int | None = None) -> str | None:
        """A point as code, written by a statement before ``before`` (an index of the block's body)."""
        for index, code in self.point_code.get(name, []):
            if before is None or index < before:
                return code
        return None

    def item(self, name: str) -> str:
        """A curve or a point as code."""
        if name in self.curves:
            return self.curve(name)
        code = self.point(name)
        if code is None:
            if name not in self.points:
                raise SketchEditError(f"{name} is no longer in the sketch. Look again.")
            raise SketchEditError(f"{name} has no name in the script, so edit mode cannot refer to it. Ask the agent to name it.")
        return code


def _taken(block: Block) -> set[str]:
    return {node.id for node in ast.walk(block.tree) if isinstance(node, ast.Name)} | {
        node.name for node in ast.walk(block.tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}


class _Vars:
    """New names for what a change draws, as the sketch will name it (``line5`` for Line5), kept
    clear of the names the file already uses."""

    def __init__(self, block: Block, state: dict):
        self.taken = _taken(block)
        self.counts: dict[str, int] = {}
        for item in [*state.get("curves", []), *state.get("points", [])]:
            match = re.match(r"^([A-Za-z]+)(\d+)$", item["id"])
            if match:
                self.counts[match.group(1)] = self.counts.get(match.group(1), 0) + 1

    def next(self, kind: str) -> str:
        """The name of the next ``kind`` (``Line``) the sketch makes, as a Python name."""
        self.counts[kind] = self.counts.get(kind, 0) + 1
        number_ = self.counts[kind]
        name = f"{kind.lower()}{number_}"
        while name in self.taken or keyword.iskeyword(name):
            number_ += 1
            name = f"{kind.lower()}{number_}"
        self.taken.add(name)
        return name


# ---------------------------------------------------------------------------------------------
# Changes.


def _point_argument(names: Names, ref: dict) -> str:
    """A point a change names: an existing one (``{"point": "Point3"}``) as code, or a new one at
    a place (``{"at": [x, y]}``)."""
    if not isinstance(ref, dict):
        raise SketchEditError("A point is an existing point or a place.")
    if ref.get("point"):
        return names.item(str(ref["point"]))
    try:
        x, y = (float(value) for value in ref["at"])
    except (KeyError, TypeError, ValueError):
        raise SketchEditError("A point needs a place.") from None
    return f"({number(x)}, {number(y)})"


def _typed(value) -> str:
    """A dimension's value as typed: a number, or a named size of the part with plain arithmetic."""
    text = str(value if value is not None else "").strip()
    if not text:
        raise SketchEditError("A dimension needs a value.")
    try:
        return number(float(text))
    except ValueError:
        pass
    if not _TYPED.match(text):
        raise SketchEditError(f"{text} is not a size. Type a number or a size's name.")
    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError:
        raise SketchEditError(f"{text} is not a size. Type a number or a size's name.") from None
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Expression, ast.BinOp, ast.UnaryOp, ast.Constant, ast.Name, ast.Load, ast.operator, ast.unaryop)):
            raise SketchEditError(f"{text} is not a size. Type a number or a size's name.")
    return text


def typed_names(value) -> list[str]:
    """The size names a typed value uses, for the tracer to check the part has them."""
    try:
        tree = ast.parse(str(value).strip(), mode="eval")
    except SyntaxError:
        return []
    return sorted({node.id for node in ast.walk(tree) if isinstance(node, ast.Name)})


def _construction(op: dict) -> str:
    return ", construction=True" if op.get("construction") else ""


def _draw(block: Block, names: Names, state: dict, op: dict) -> list[str]:
    """The lines a drawing change writes: the entity, then what the drawing inferred of it (a point
    on a curve, a line drawn horizontal)."""
    s = block.var
    vars_ = _Vars(block, state)
    entity = str(op.get("entity") or "")
    built = _construction(op)
    lines: list[str] = []
    roles: dict[str, str] = {}  # each point of the change, by role (start, end, center), as code
    made: list[str] = []
    if entity in ("line", "centerline"):
        var = vars_.next("Line")
        built = ", construction=True" if entity == "centerline" or op.get("construction") else ""
        lines.append(f"{var} = {s}.line({_point_argument(names, op.get('start'))}, {_point_argument(names, op.get('end'))}{built})")
        roles = {"start": f"{var}.start", "end": f"{var}.end"}
        made = [var]
    elif entity in ("rectangle", "center_rectangle"):
        targets = [vars_.next("Line") for _ in range(4)]
        if entity == "rectangle":
            corner, other = _point_argument(names, op.get("corner")), _point_argument(names, op.get("opposite"))
            roles = {"corner": f"{targets[0]}.start", "opposite": f"{targets[1]}.end"}
        else:
            corner, other = _point_argument(names, op.get("center")), _point_argument(names, op.get("corner"))
            vars_.next("Line")  # its diagonal
            roles = {"corner": f"{targets[1]}.end"}
        lines.append(f"{', '.join(targets)} = {s}.{entity}({corner}, {other}{built})")
        made = targets
    elif entity == "circle":
        var = vars_.next("Circle")
        radius = float(op.get("radius") or 0)
        if radius <= 0:
            raise SketchEditError("A circle needs a radius more than zero.")
        lines.append(f"{var} = {s}.circle({_point_argument(names, op.get('center'))}, {number(radius)}{built})")
        roles = {"center": f"{var}.center"}
        made = [var]
    elif entity == "arc":
        var = vars_.next("Arc")
        turn = ", clockwise=True" if op.get("clockwise") else ""
        lines.append(f"{var} = {s}.arc({_point_argument(names, op.get('center'))}, {_point_argument(names, op.get('start'))}, "
                     f"{_point_argument(names, op.get('end'))}{turn}{built})")
        roles = {"center": f"{var}.center", "start": f"{var}.start", "end": f"{var}.end"}
        made = [var]
    elif entity == "slot":
        arc1, line1, arc2, line2 = vars_.next("Arc"), vars_.next("Line"), vars_.next("Arc"), vars_.next("Line")
        radius = float(op.get("radius") or 0)
        if radius <= 0:
            raise SketchEditError("A slot needs a width more than zero.")
        lines.append(f"{arc1}, {line1}, {arc2}, {line2} = {s}.slot({_point_argument(names, op.get('center1'))}, "
                     f"{_point_argument(names, op.get('center2'))}, {number(radius)}{built})")
        roles = {"center1": f"{arc1}.center", "center2": f"{arc2}.center"}
        made = [arc1, line1, arc2, line2]
    elif entity == "point":
        var = vars_.next("Point")
        ref = op.get("at") or {}
        try:
            x, y = (float(value) for value in ref.get("at"))
        except (TypeError, ValueError):
            raise SketchEditError("A point needs a place.") from None
        lines.append(f"{var} = {s}.point({number(x)}, {number(y)}{built})")
        roles = {"at": var}
        made = [var]
    else:
        raise SketchEditError(f"Edit mode cannot draw {entity or 'that'} yet.")
    # A point drawn on a curve stays on it, as a CAD tool's inference makes it.
    for role, code in roles.items():
        ref = op.get(role) if role != "at" else op.get("at")
        if isinstance(ref, dict) and ref.get("on") and not ref.get("point"):
            kind = "midpoint" if ref.get("midpoint") else "coincident"
            lines.append(f"{s}.{kind}({code}, {names.curve(str(ref['on']))})")
    for relation in op.get("relations") or []:
        kind = str(relation.get("kind") or "")
        if kind in ("horizontal", "vertical") and made:
            lines.append(f"{s}.{kind}({made[0]})")
        elif kind in ("tangent", "perpendicular", "parallel") and made and relation.get("to"):
            lines.append(f"{s}.{kind}({made[0]}, {names.curve(str(relation['to']))})")
    return lines


# What each relation takes, as a CAD tool offers it for a selection.
_RELATION_ARITY = {"fix": 1, "horizontal": (1, 2), "vertical": (1, 2), "coincident": 2, "parallel": 2, "perpendicular": 2,
                   "tangent": 2, "equal": 2, "midpoint": 2, "concentric": 2, "symmetric": 3}
_DIMENSION_ARITY = {"length": 1, "radius": 1, "diameter": 1, "distance": 2, "horizontal_distance": 2, "vertical_distance": 2,
                    "angle": 2}


def _relate(block: Block, names: Names, op: dict) -> list[str]:
    kind = str(op.get("relation") or "")
    refs = [str(ref) for ref in op.get("refs") or []]
    arity = _RELATION_ARITY.get(kind)
    if arity is None:
        raise SketchEditError(f"Edit mode has no relation called {kind or 'that'}.")
    if len(refs) not in (arity if isinstance(arity, tuple) else (arity,)):
        raise SketchEditError(f"{kind.capitalize()} takes {arity if isinstance(arity, int) else ' or '.join(map(str, arity))} items.")
    if kind == "midpoint":
        # A point at the middle of a line, whichever order they were picked in.
        refs.sort(key=lambda ref: ref in names.curves)
    if kind == "symmetric":
        lines_ = [ref for ref in refs if ref in names.curves and names.curves[ref]["kind"] == "line"]
        if not lines_:
            raise SketchEditError("Symmetric takes two points and a line to mirror them about.")
        refs = [ref for ref in refs if ref != lines_[-1]] + [lines_[-1]]
    return [f"{block.var}.{kind}({', '.join(names.item(ref) for ref in refs)})"]


def _dimension(block: Block, names: Names, op: dict) -> list[str]:
    kind = str(op.get("dimension") or "")
    refs = [str(ref) for ref in op.get("refs") or []]
    if _DIMENSION_ARITY.get(kind) != len(refs):
        raise SketchEditError("Pick what to dimension again.")
    if kind == "distance":
        # A point to a line, a line to a line: the sketch takes the point first.
        refs.sort(key=lambda ref: ref in names.curves)
    return [f"{block.var}.{kind}({', '.join(names.item(ref) for ref in refs)}, {_typed(op.get('value'))})"]


def _keyword(call: ast.Call, name: str) -> ast.keyword | None:
    return next((each for each in call.keywords if each.arg == name), None)


def _construction_edits(block: Block, names: Names, edits: TextEdits, items: list[str], on: bool) -> None:
    """Each item's statement made, or no longer made, for construction (``construction=True``)."""
    seen = set()
    for name in items:
        made = names.statement_of(name)
        if made is None or made.method not in GEOMETRY or id(made.statement) in seen:
            continue
        seen.add(id(made.statement))
        call = _call_of(made.statement, block.var)
        existing = _keyword(call, "construction")
        if existing is not None:
            if on:
                edits.replace_node(existing.value, "True")
            else:
                # The keyword and the comma before it: `..., construction=True)`.
                previous = call.keywords[call.keywords.index(existing) - 1] if call.keywords.index(existing) else (call.args[-1] if call.args else None)
                if previous is None:
                    edits.replace_node(existing, "")
                else:
                    edits.replace(previous.end_lineno, previous.end_col_offset, existing.end_lineno, existing.end_col_offset, "")
        elif on:
            last = call.keywords[-1] if call.keywords else call.args[-1] if call.args else None
            if last is None:
                continue
            edits.replace(last.end_lineno, last.end_col_offset, last.end_lineno, last.end_col_offset, ", construction=True")


def change(text: str, line: int, state: dict, op: dict, path: str = "<sketch>") -> str:
    """``text`` with one sketch change made to the sketch at ``line``: an entity drawn (``draw``),
    a relation (``relate``) or a dimension (``dimension``) added, or entities made construction
    geometry or not (``construction``). ``state`` is the sketch as it solved from ``text``."""
    block = find_block(text, line, path)
    names = Names(block, state)
    edits = TextEdits(text)
    kind = op.get("kind")
    if kind == "draw":
        written = _draw(block, names, state, op)
    elif kind == "relate":
        written = _relate(block, names, op)
    elif kind == "dimension":
        written = _dimension(block, names, op)
    elif kind == "construction":
        _construction_edits(block, names, edits, [str(item) for item in op.get("items") or []], bool(op.get("on", True)))
        return edits.apply()
    else:
        raise SketchEditError(f"Edit mode cannot make that sketch change ({kind or 'none'}).")
    edits.insert_after(block.last_line, [f"{block.indent}{each}" for each in written])
    return edits.apply()


def set_value(text: str, line: int, state: dict, dimension: str, typed: str, path: str = "<sketch>") -> str:
    """``text`` with a dimension's value written as typed: a size's name, or a formula of sizes
    (``LENGTH / 2``), in place of what its line passed."""
    block = find_block(text, line, path)
    names = Names(block, state)
    made = names.statement_of(dimension)
    call = _call_of(made.statement, block.var) if made is not None else None
    if call is None or made.method not in DIMENSIONS or not call.args:
        raise SketchEditError(f"{dimension} is not written on a line of its own, so edit mode cannot change it. Ask the agent.")
    edits = TextEdits(text)
    edits.replace_node(call.args[-1], _typed(typed))
    return edits.apply()


# ---------------------------------------------------------------------------------------------
# Deleting: a rectangle's line goes on its own, as in a CAD tool, so a rectangle is first written
# as its four lines and their relations.


def explodes(text: str, line: int, state: dict, items: list[str], path: str = "<sketch>") -> bool:
    """Whether deleting ``items`` takes some of a corner rectangle's lines or relations but not all
    of it, so the rectangle is to be written as its lines first (``explode``)."""
    block = find_block(text, line, path)
    names = Names(block, state)
    wanted = set(items)
    for made in names.made:
        if made.method == "rectangle" and isinstance(made.statement, ast.Assign) and isinstance(made.statement.targets[0], ast.Tuple):
            parts = set(made.curves) | set(made.relations)
            if parts & wanted and not set(made.curves) <= wanted:
                return True
    return False


def explode(text: str, line: int, state: dict, items: list[str], path: str = "<sketch>") -> str:
    """Each corner rectangle that ``items`` take part of, written as its four lines and the
    relations it holds them by, in the order the rectangle makes them, so every entity keeps its
    name (Line1 is still Line1)."""
    block = find_block(text, line, path)
    names = Names(block, state)
    edits = TextEdits(text)
    wanted = set(items)
    s = block.var
    for made in names.made:
        statement = made.statement
        if made.method != "rectangle" or not (isinstance(statement, ast.Assign) and isinstance(statement.targets[0], ast.Tuple)):
            continue
        if not (set(made.curves) | set(made.relations)) & wanted or set(made.curves) <= wanted:
            continue
        call = _call_of(statement, s)
        bottom, right, top, left = (element.id for element in statement.targets[0].elts)
        corner, opposite = call.args[0], call.args[1]

        def coordinate(point: ast.AST, axis: int, name: str) -> str:
            if isinstance(point, ast.Tuple) and len(point.elts) == 2:
                return _segment(text, point.elts[axis])
            # A corner on an existing point: its place as solved.
            return number(names.points[name]["x" if axis == 0 else "y"])

        p0, p1, p2, p3 = (names.curves[curve]["start"] for curve in made.curves[:4])
        x0, y0 = coordinate(corner, 0, p0), coordinate(corner, 1, p0)
        x1, y1 = coordinate(opposite, 0, p2), coordinate(opposite, 1, p2)
        first = _segment(text, corner) if not isinstance(corner, ast.Tuple) else f"({x0}, {y0})"
        third = _segment(text, opposite) if not isinstance(opposite, ast.Tuple) else f"({x1}, {y1})"
        built = ""
        flag = _keyword(call, "construction")
        if flag is not None:
            built = f", construction={_segment(text, flag.value)}"
        indent = block.indent
        written = [
            f"{bottom} = {s}.line({first}, ({x1}, {y0}){built})",
            f"{right} = {s}.line({bottom}.end, {third}{built})",
            f"{top} = {s}.line({right}.end, ({x0}, {y1}){built})",
            f"{left} = {s}.line({top}.end, {bottom}.start{built})",
            f"{s}.horizontal({bottom})",
            f"{s}.horizontal({top})",
            f"{s}.vertical({left})",
            f"{s}.vertical({right})",
        ]
        edits.replace(statement.lineno, 0, statement.end_lineno + 1, 0, "".join(f"{indent}{each}{edits.newline}" for each in written))
    return edits.apply()


def delete(text: str, line: int, state: dict, items: list[str], path: str = "<sketch>") -> str:
    """``text`` with ``items`` deleted from the sketch at ``line``: each entity's statement taken
    out with the relations and dimensions on it; a curve drawn from a point of one deleted keeps
    the point where it is. A statement that makes several entities (a slot) goes whole. A
    rectangle's line is written out first (``explode``)."""
    block = find_block(text, line, path)
    names = Names(block, state)
    edits = TextEdits(text)
    wanted = [str(item) for item in items]
    if "Origin" in wanted:
        raise SketchEditError("The sketch's origin cannot be deleted.")
    removed: set[int] = set()  # indexes of block.body

    def bound(index: int) -> set[str]:
        statement = block.body[index]
        targets = statement.targets if isinstance(statement, ast.Assign) else []
        return {node.id for target in targets for node in ast.walk(target) if isinstance(node, ast.Name)}

    for name in wanted:
        made = names.statement_of(name)
        if made is None:
            raise SketchEditError(f"{name} is no longer in the sketch. Look again.")
        if made.method not in SKETCH_METHODS:
            raise SketchEditError(f"{name} is made in a way edit mode cannot take apart. Ask the agent to change it.")
        if name in made.relations and made.method in GEOMETRY:
            shape = made.method.replace("_", " ")
            raise SketchEditError(f"{name} comes with the {shape} it holds. Delete the {shape} instead.")
        removed.add(names.made_by[name])
    gone_codes: set[str] = set()
    for index in removed:
        gone_codes |= bound(index)
    # What used them: a relation on a deleted entity goes with it; a curve drawn from a deleted
    # curve's point keeps the point, as another curve's that has it, or written where it is.
    replaced: dict[int, list] = {}
    changed = True
    while changed:
        changed = False
        replaced.clear()
        for index in range(block.start + 1, block.end + 1):
            if index in removed:
                continue
            made = names.made[index - block.start - 1]
            statement = made.statement
            references = [node for node in ast.walk(statement) if isinstance(node, ast.Name) and node.id in gone_codes]
            if not references:
                continue
            if made.method is None:
                raise SketchEditError(f"Line {statement.lineno} uses what is deleted in a way edit mode cannot change. Ask the agent.")
            attributes = [node for node in ast.walk(statement) if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)
                          and node.value.id in gone_codes and node.attr in ("start", "end", "center")]
            covered = {id(node.value) for node in attributes}
            if made.method not in GEOMETRY or any(id(node) not in covered for node in references):
                removed.add(index)
                gone_codes |= bound(index)
                changed = True
                continue
            replaced[index] = attributes
    for index, attributes in replaced.items():
        for node in attributes:
            point = _point_named(names, f"{node.value.id}.{node.attr}")
            other = next((code for at, code in names.point_code.get(point, [])
                          if at < index and at not in removed and code.split(".")[0].split("[")[0] not in gone_codes), None) if point else None
            if other is not None:
                edits.replace_node(node, other)
            elif point:
                where = names.points[point]
                edits.replace_node(node, f"({number(where['x'])}, {number(where['y'])})")
    for index in sorted(removed):
        statement = block.body[index]
        edits.remove_lines(statement.lineno, statement.end_lineno)
    return edits.apply()


def _point_named(names: Names, code: str) -> str | None:
    for point, codes in names.point_code.items():
        if any(each == code for _, each in codes):
            return point
    return None


# ---------------------------------------------------------------------------------------------
# A new sketch.


def has_name(tree: ast.Module, name: str) -> bool:
    """Whether a file brings ``name`` in at its top: imported, or assigned."""
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and any((alias.asname or alias.name) == name for alias in node.names):
            return True
        if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
            return True
    return False


def sketch_import(tree: ast.Module) -> tuple[int, str] | None:
    """Where a file that does not bring in ``Sketch`` would: after its last import, the line."""
    if has_name(tree, "Sketch"):
        return None
    last = max((node.end_lineno for node in tree.body if isinstance(node, (ast.Import, ast.ImportFrom))), default=0)
    return last, "from cadgen.sketch import Sketch"


def sketch_line(var: str, name: str, plane_code: str, unit_code: str | None) -> str:
    unit = f", unit={unit_code}" if unit_code else ""
    return f'{var} = Sketch("{name}", plane={plane_code}{unit})'


def sketch_names(tree: ast.Module, wanted: str) -> tuple[str, str]:
    """A new sketch's name (``Sketch3``) and the Python name it is held in (``sketch3``), each one
    the file does not use yet."""
    used = {node.value for node in ast.walk(tree) if isinstance(node, ast.Constant) and isinstance(node.value, str)}
    taken = {node.id for node in ast.walk(tree) if isinstance(node, ast.Name)}
    match = re.match(r"^Sketch(\d+)$", wanted or "")
    number_ = int(match.group(1)) if match else 1
    while f"Sketch{number_}" in used or f"sketch{number_}" in taken:
        number_ += 1
    return f"Sketch{number_}", f"sketch{number_}"
