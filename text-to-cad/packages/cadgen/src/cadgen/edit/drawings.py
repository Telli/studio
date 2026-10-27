"""Drawings, as SolidWorks' Make Drawing from Part makes one and its Sheet Properties change it.

A part's drawing is an engineering drawing script beside the part (``cadgen.eng_drawing``):
``<name>_drawing.py``, which calls the part's model (``part().shape``: the engine's document of it)
and lays out its views on a sheet, so the drawing follows the part. One made before parts were
models reads the part's STEP, and is found by it as ever. Make Drawing writes one from the template (top, front and right views
in third angle and an isometric, each with its overall size), and the drawing panel changes its
sheet: the size, the scale, the title block's fields, and whether the isometric is drawn. Each
change runs the script, which writes the drawing's PDF.
"""

from __future__ import annotations

import ast
import difflib
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from pathlib import Path

# The line a drawn sheet comes back on: `cadgen.eng_drawing.SHEET_MARK`, which this process cannot import.
SHEET_MARK = "cadgen-sheet "
# The calls that put a dimension or an annotation on a view: what a pick on the sheet takes off.
DIMENSION_CALLS = ("dim", "hole", "slot", "holes", "diameter", "radius", "angle", "note", "flag", "frame", "overall")
# The title block's fields the panel edits, in the order a Sheet is written with them.
FIELDS = ("title", "part_number", "material", "revision", "author")
SIZES = ("A4", "A3", "A2", "A1", "A0")
_SKIPPED = {".venv", "venv", "node_modules", "tmp", ".git", "__pycache__", "_runtime", "dist", "build"}


class DrawingError(Exception):
    """A drawing change that cannot be made, said to the engineer."""


# This runs in the viewer's server, which never loads the CAD kernel: its own small helpers, not `commands`'.
def _call_name(node) -> str | None:
    if not isinstance(node, ast.Call):
        return None
    return node.func.id if isinstance(node.func, ast.Name) else node.func.attr if isinstance(node.func, ast.Attribute) else None


def _number(value: float) -> str:
    value = round(float(value), 6)
    return str(int(value)) if value.is_integer() else f"{value:.6f}".rstrip("0").rstrip(".")


def find(root: Path, step: Path) -> Path | None:
    """The project's drawing of a part (``step``: its script, or the STEP a drawing reads):
    ``<name>_drawing.py`` beside the part's model, else an engineering drawing script anywhere in
    the project that imports the part's script or reads its STEP."""
    name = step.stem
    imports = re.compile(rf"^\s*(?:from\s+(?:\.\s*)?{re.escape(name)}\s+import|import\s+{re.escape(name)}\b)", re.M)
    # Drawing scripts are named for what they draw: those first, the one named for this part first of all.
    named = [path for path in _scripts(root) if path.name.endswith("_drawing.py")]
    candidates = sorted(named, key=lambda path: path.name != f"{name}_drawing.py")
    for path in candidates:
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            continue
        if "eng_drawing" in text and (f"{name}.step" in text or imports.search(text)):
            return path
    return None


def _scripts(root: Path):
    for folder, folders, files in os.walk(root):
        folders[:] = [each for each in folders if each not in _SKIPPED and not each.startswith(".")]
        for file in files:
            if file.endswith(".py"):
                yield Path(folder) / file


def template(name: str, step: Path, script: Path, *, material: str = "", units: str = "mm") -> str:
    """A drawing script for the part named ``name``, from the engineering drawing skill's template.
    ``step`` is the part's script, whose model it calls (``part().shape``), or a STEP, which it
    reads (``read_step``)."""
    source = Path(step)
    if source.suffix.lower() == ".py":
        from cadgen.edit.service import model_of

        found = model_of(source.read_text(encoding="utf-8"))
        if found is None:
            raise DrawingError(f"{source.name} declares no model to draw.")
        if source.resolve().parent != Path(script).resolve().parent:
            raise DrawingError(f"A drawing goes beside its part: {source.name} is in another folder.")
        # Beside it, the part's script imports by its name, as `python <drawing>.py` runs it.
        head = f"from cadgen.eng_drawing import Sheet, eng_drawing\n\nfrom {source.stem} import {found[0]}"
        return _template(name, head, f"{found[0]}().shape", material=material, units=units)
    reading = os.path.relpath(source.resolve(), Path(script).parent.resolve()).replace(os.sep, "/")
    head = "from pathlib import Path\n\nfrom cadgen import read_step\nfrom cadgen.eng_drawing import Sheet, eng_drawing"
    return _template(name, head, f'read_step(Path(__file__).parent / "{reading}")', material=material, units=units)


def _template(name: str, head: str, reads: str, *, material: str, units: str) -> str:
    function = f"{re.sub(r'[^0-9a-zA-Z_]', '_', name)}_drawing"
    title = name.replace("_", " ").upper()
    fields = [f'title="{title}"', f'part_number="{title.replace(" ", "-")}"']
    if material:
        fields.append(f'material="{material.upper()}"')
    fields += ['revision="A"', *([f'units="{units}"'] if units == "in" else [])]
    return f'''{head}


@eng_drawing(out="{function}.pdf")
def {function}():
    part = {reads}
    sheet = Sheet("A3", {", ".join(fields)})
    # Third angle, placed from the part's size; iso=True adds the isometric.
    top, front, right, iso = sheet.three_views(part, iso=True)
    top.overall()
    front.overall()
    return sheet


if __name__ == "__main__":
    {function}()
'''


def _sheet_call(tree: ast.Module) -> ast.Call:
    found = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and _call_name(node) == "Sheet"]
    if len(found) != 1:
        raise DrawingError("The drawing's script makes more than one sheet, or none. Ask the agent to change it.")
    return found[0]


def _views_statement(tree: ast.Module):
    """``top, front, right[, iso] = sheet.three_views(part[, iso=True])``."""
    for node in ast.walk(tree):
        if (isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Tuple)
                and _call_name(node.value) == "three_views"):
            return node
    return None


def read(text: str) -> dict:
    """The sheet as the panel opens on it: its size, scale (as ``1:2``), title block fields and
    whether the isometric is drawn; and the PDF it writes (``out``)."""
    tree = ast.parse(text)
    call = _sheet_call(tree)
    values = {"size": "A3", "scale": "1:1", **dict.fromkeys(FIELDS, "")}
    if call.args and isinstance(call.args[0], ast.Constant):
        values["size"] = str(call.args[0].value)
    for keyword in call.keywords:
        if keyword.arg in ("size", *FIELDS) and isinstance(keyword.value, ast.Constant):
            values[keyword.arg] = str(keyword.value.value)
        elif keyword.arg == "scale" and isinstance(keyword.value, ast.Constant):
            values["scale"] = _ratio(float(keyword.value.value))
    statement = _views_statement(tree)
    values["iso"] = bool(statement and any(keyword.arg == "iso" and isinstance(keyword.value, ast.Constant) and keyword.value.value is True
                                           for keyword in statement.value.keywords))
    out = next((keyword.value.value for node in ast.walk(tree) if isinstance(node, ast.Call) and _call_name(node) == "eng_drawing"
                for keyword in node.keywords if keyword.arg == "out" and isinstance(keyword.value, ast.Constant)), None)
    values["out"] = out
    return values


def _ratio(scale: float) -> str:
    """A drawing scale as a sheet prints it: 0.5 is 1:2, 2 is 2:1."""
    if scale >= 1:
        return f"{_number(scale)}:1"
    return f"1:{_number(round(1 / scale, 6))}"


def _scale(typed: str) -> float:
    text = str(typed or "").strip()
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)", text)
    try:
        value = float(match.group(1)) / float(match.group(2)) if match else float(text)
    except (ValueError, ZeroDivisionError):
        raise DrawingError("A scale is written 1:2, 2:1, or as a number.") from None
    if not value > 0:
        raise DrawingError("A scale is more than zero.")
    return value


def change(text: str, sheet: dict) -> tuple[str, str]:
    """The script with its sheet set as ``sheet`` says (any of size, scale, the title block's
    fields, ``iso``), and what changed, in words."""
    tree = ast.parse(text)
    call = _sheet_call(tree)
    was = read(text)
    size = str(sheet.get("size") or was["size"]).upper()
    if size not in SIZES:
        raise DrawingError(f"A sheet is {', '.join(SIZES)}.")
    kept = [keyword for keyword in call.keywords if keyword.arg not in ("size", "scale", *FIELDS)]
    written = [f'"{size}"']
    for field in FIELDS:
        value = str(sheet.get(field, was[field]) or "").strip()
        if '"' in value or "\n" in value:
            raise DrawingError("A title block field is one line, without double quotes.")
        if value:
            written.append(f'{field}="{value}"')
    scale = _scale(sheet.get("scale") or was["scale"])
    if abs(scale - 1) > 1e-12:
        written.append(f"scale={_number(round(scale, 6))}")
    written += [ast.get_source_segment(text, keyword) for keyword in kept]
    swaps: list[tuple[int, int, str]] = []  # whole lines put as one: (first, last, the line)
    lines = text.splitlines()
    head = f"{ast.get_source_segment(text, call.func)}({', '.join(written)})"
    prefix = lines[call.lineno - 1].encode("utf-8")[:call.col_offset].decode("utf-8")
    suffix = lines[call.end_lineno - 1].encode("utf-8")[call.end_col_offset:].decode("utf-8")
    swaps.append((call.lineno, call.end_lineno, f"{prefix}{head}{suffix}"))
    iso = sheet.get("iso")
    statement = _views_statement(tree)
    if iso is not None and statement is not None and bool(iso) != was["iso"]:
        targets = [element.id for element in statement.targets[0].elts if isinstance(element, ast.Name)][:3]
        shape = ast.get_source_segment(text, statement.value.args[0]) if statement.value.args else "part"
        owner = ast.get_source_segment(text, statement.value.func.value) if isinstance(statement.value.func, ast.Attribute) else "sheet"
        line = (f"{', '.join(targets + ['iso'])} = {owner}.three_views({shape}, iso=True)" if iso
                else f"{', '.join(targets)} = {owner}.three_views({shape})")
        swaps.append((statement.lineno, statement.end_lineno, f"{' ' * statement.col_offset}{line}"))
    for first, last, line in sorted(swaps, reverse=True):
        lines[first - 1:last] = [line]
    made = "\n".join(lines) + ("\n" if text.endswith("\n") else "")
    now = read(made)
    said = [f"{key.replace('_', ' ')} {now[key]}" for key in ("size", "scale", *FIELDS) if now[key] != was[key]]
    if now["iso"] != was["iso"]:
        said.append("the isometric drawn" if now["iso"] else "the isometric taken off")
    return made, ", ".join(said) or "nothing"


def build(script: Path, timeout: float = 240.0) -> Path:
    """The drawing's script run, as its ``__main__`` runs it: the PDF it wrote."""
    environment = {**os.environ, "MPLCONFIGDIR": os.environ.get("MPLCONFIGDIR") or str(Path(os.environ.get("TMPDIR", "/tmp")) / "cadgen-mpl")}
    try:
        ran = subprocess.run([sys.executable, str(script)], cwd=str(script.parent), capture_output=True, text=True, timeout=timeout,
                             env=environment, check=False)
    except subprocess.TimeoutExpired:
        raise DrawingError("The drawing took too long to draw. Ask the agent to look at it.") from None
    wrote = re.findall(r"^wrote (.+?\.pdf) \(", ran.stdout, flags=re.MULTILINE)
    if ran.returncode != 0 or not wrote:
        last = (ran.stderr or ran.stdout).strip().splitlines()
        raise DrawingError(f"The drawing did not draw: {last[-1] if last else 'it wrote no PDF'}")
    return Path(wrote[-1])


# ---------------------------------------------------------------------------------------------
# The sheet, edited on it, as a SolidWorks drawing is: a view dragged where it goes, a dimension
# picked and deleted, Smart Dimension between two points of a view or on a circle. Each is a change
# to the drawing's script, which is then drawn again.

def _environment() -> dict:
    return {**os.environ, "MPLCONFIGDIR": os.environ.get("MPLCONFIGDIR") or str(Path(os.environ.get("TMPDIR", "/tmp")) / "cadgen-mpl")}


def sheet(script: Path, index: int = 1, *, pdf: bool = False, timeout: float = 240.0) -> dict:
    """The drawing's sheet ``index`` as its editor draws it (``cadgen.eng_drawing.sheet_payload``),
    from a process of its own, as the kernel never loads here; with ``pdf``, its PDF drawn too."""
    command = [sys.executable, "-c", "from cadgen.eng_drawing import _sheet_main; _sheet_main()", str(script), str(int(index)),
               *(["pdf"] if pdf else [])]
    try:
        ran = subprocess.run(command, cwd=str(Path(script).parent), capture_output=True, text=True, timeout=timeout,
                             env=_environment(), check=False)
    except subprocess.TimeoutExpired:
        raise DrawingError("The drawing took too long to draw. Ask the agent to look at it.") from None
    marked = [line for line in ran.stdout.splitlines() if line.startswith(SHEET_MARK)]
    if ran.returncode != 0 or not marked:
        last = (ran.stderr or ran.stdout).strip().splitlines()
        raise DrawingError(f"The drawing did not draw: {last[-1] if last else 'it drew no sheet'}")
    return json.loads(marked[-1][len(SHEET_MARK):])


def digest(text: str) -> str:
    """The drawing script's text as the sheet was drawn from it: an edit made on an older one is refused."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def hunks(old: str, new: str) -> list[dict]:
    """The lines that differ between two texts (``cadgen.edit.commands.hunks``, which this process
    cannot import): each run at ``start`` (from 1) that reads ``old`` and becomes ``new``."""
    a, b = old.splitlines(keepends=True), new.splitlines(keepends=True)
    return [{"start": i1 + 1, "old": a[i1:i2], "new": b[j1:j2]}
            for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(a=a, b=b, autojunk=False).get_opcodes() if tag != "equal"]


def _splice(text: str, changes: list) -> str:
    lines = text.splitlines(keepends=True)
    for change in sorted(changes, key=lambda change: int(change["start"]), reverse=True):
        start, old = int(change["start"]) - 1, list(change["old"])
        if start < 0 or lines[start:start + len(old)] != old:
            raise DrawingError(f"Line {start + 1} of the drawing's script no longer reads as the change left it. Look again.")
        lines[start:start + len(old)] = list(change["new"])
    return "".join(lines)


_CHANGED = "The drawing's script changed since the sheet was drawn. Look again."


def _call_ending(tree: ast.Module, end) -> ast.Call:
    """The call whose closing parenthesis is at ``end`` (line, column): the one the sheet says
    placed a view or a dimension, which picks it out of a chain of them."""
    try:
        line, column = int(end[0]), int(end[1])
    except (TypeError, ValueError, IndexError):
        raise DrawingError("The drawing's script does not say where that is. Ask the agent to change it.") from None
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and node.end_lineno == line and node.end_col_offset == column:
            return node
    raise DrawingError(_CHANGED)


def _span(text: str, node) -> tuple[int, int]:
    """A node's start and end as offsets into ``text`` (the tree's columns are UTF-8 bytes)."""
    lines = text.splitlines(keepends=True)
    at = lambda line, column: sum(len(each) for each in lines[:line - 1]) + len(lines[line - 1].encode("utf-8")[:column].decode("utf-8"))
    return at(node.lineno, node.col_offset), at(node.end_lineno, node.end_col_offset)


def _put(text: str, start: int, end: int, new: str) -> str:
    return text[:start] + new + text[end:]


def _statement(tree: ast.Module, node) -> tuple[list, int]:
    """The statement holding ``node``: the body it is in, and where."""
    found = None
    for parent in ast.walk(tree):
        for field in ("body", "orelse", "finalbody"):
            body = getattr(parent, field, None)
            if not isinstance(body, list):
                continue
            for position, statement in enumerate(body):
                if isinstance(statement, ast.stmt) and (statement.lineno, statement.col_offset) <= (node.lineno, node.col_offset) \
                        and (statement.end_lineno, statement.end_col_offset) >= (node.end_lineno, node.end_col_offset):
                    found = (body, position)  # the innermost wins: ast.walk reaches it later
    if found is None:
        raise DrawingError(_CHANGED)
    return found


def _point(value) -> tuple[float, float, float]:
    try:
        point = tuple(float(each) for each in value)
    except (TypeError, ValueError):
        point = ()
    if len(point) != 3 or not all(math.isfinite(each) for each in point):
        raise DrawingError("A point on the part is three numbers.")
    return point


def _tuple(point) -> str:
    return f"({', '.join(_number(each) for each in point)})"


def _shift(by) -> tuple[float, float]:
    try:
        dx, dy = float(by[0]), float(by[1])
    except (TypeError, ValueError, IndexError):
        raise DrawingError("A view moves by two numbers, across and up.") from None
    if not (math.isfinite(dx) and math.isfinite(dy)):
        raise DrawingError("A view moves by two numbers, across and up.")
    return dx, dy


def _how_far(dx: float, dy: float) -> str:
    said = [f"{_number(abs(round(dx, 1)))} mm {'right' if dx > 0 else 'left'}" if abs(dx) >= 0.05 else "",
            f"{_number(abs(round(dy, 1)))} mm {'up' if dy > 0 else 'down'}" if abs(dy) >= 0.05 else ""]
    return " and ".join(each for each in said if each) or "nowhere"


def _keyword(text: str, call: ast.Call, name: str, value: str | None) -> str:
    """``call`` with its keyword ``name`` set to ``value`` (source text), or taken out (None)."""
    found = next((keyword for keyword in call.keywords if keyword.arg == name), None)
    if found is not None:
        if value is not None:
            start, end = _span(text, found.value)
            return _put(text, start, end, value)
        items = sorted([*call.args, *call.keywords], key=lambda node: (node.lineno, node.col_offset))
        before = items[items.index(found) - 1] if items.index(found) > 0 else None
        if before is None:
            raise DrawingError(f"The drawing's script gives {name} first. Ask the agent to change it.")
        return _put(text, _span(text, before)[1], _span(text, found)[1], "")
    if value is None:
        return text
    items = [*call.args, *call.keywords]
    if not items:
        close = _span(text, call)[1] - 1  # the call's closing parenthesis
        return _put(text, close, close, f"{name}={value}")
    # After the last argument, so a call written one argument a line keeps its shape.
    after = max(_span(text, item)[1] for item in items)
    return _put(text, after, after, f", {name}={value}")


def _moved(text: str, tree: ast.Module, edit: dict) -> tuple[str, str]:
    view = edit.get("view") or {}
    dx, dy = _shift(edit.get("by"))
    call = _call_ending(tree, view.get("end"))
    if view.get("arranged"):
        # three_views moves its top, front and right views together, and its isometric on its own.
        if _call_name(call) != "three_views":
            raise DrawingError(_CHANGED)
        iso = view.get("name") == "iso"
        was = _shift(view.get("offset") or (0.0, 0.0))
        now = (round(was[0] + dx, 1), round(was[1] + dy, 1))
        made = _keyword(text, call, "iso_offset" if iso else "offset", None if now == (0.0, 0.0) else _tuple(now))
        return made, f"moved its {'isometric view' if iso else 'top, front and right views'} {_how_far(dx, dy)}"
    if _call_name(call) != "view":
        raise DrawingError(_CHANGED)
    was = _shift(view.get("at"))
    now = (round(was[0] + dx, 1), round(was[1] + dy, 1))
    return _keyword(text, call, "at", _tuple(now)), f"moved its {view.get('name') or ''} view {_how_far(dx, dy)}".replace("its  view", "a view")


def _deleted(text: str, tree: ast.Module, edit: dict) -> tuple[str, str]:
    call = _call_ending(tree, edit.get("end"))
    if not isinstance(call.func, ast.Attribute) or call.func.attr not in DIMENSION_CALLS:
        raise DrawingError(_CHANGED)
    receiver = call.func.value
    body, position = _statement(tree, call)
    statement = body[position]
    start, end = _span(text, statement)
    line_start = text.rfind("\n", 0, start) + 1
    line_end = text.find("\n", end)
    line_end = len(text) if line_end == -1 else line_end + 1
    alone = not text[line_start:start].strip() and (not text[end:line_end].strip() or text[end:line_end].strip().startswith("#"))
    if (isinstance(statement, ast.Expr) and statement.value is call and not isinstance(receiver, ast.Call)
            and len(body) > 1 and alone):
        made = _put(text, line_start, line_end, "")
    else:
        # In a chain, or its view used for more: the call taken out, what it was called on left.
        call_start, call_end = _span(text, call)
        made = _put(text, call_start, call_end, ast.get_source_segment(text, receiver))
    name = edit.get("name") or ""
    where = f"its {name} view" if name else "a view"
    words = f"took the overall size off {where}" if call.func.attr == "overall" else f"took a dimension off {where}"
    return made, words


def _view_name(text: str, tree: ast.Module, view: dict) -> tuple[str, ast.stmt, list, int]:
    """What the drawing's script calls a view, by the call that placed it: ``front`` of
    ``top, front, right = sheet.three_views(part)``, ``views[1]`` of ``views = ...``."""
    call = _call_ending(tree, view.get("end"))
    if _call_name(call) not in ("three_views", "view"):
        raise DrawingError(_CHANGED)
    body, position = _statement(tree, call)
    statement = body[position]
    nth = int(view.get("nth") or 0)
    named = None
    if isinstance(statement, ast.Assign) and statement.value is call and len(statement.targets) == 1:
        target = statement.targets[0]
        if isinstance(target, ast.Name):
            named = f"{target.id}[{nth}]" if _call_name(call) == "three_views" else target.id
        elif isinstance(target, (ast.Tuple, ast.List)) and nth < len(target.elts) and isinstance(target.elts[nth], ast.Name):
            named = target.elts[nth].id
    if named is None:
        raise DrawingError(f"The {view.get('name') or ''} view has no name in the drawing's script to dimension it by. "
                           "Ask the agent to name it.".replace("The  view", "That view"))
    return named, statement, body, position


def _added(text: str, tree: ast.Module, view: dict, line: str) -> str:
    """``line`` written with the view's other dimensions: after the last statement that uses the
    view, before the sheet is returned."""
    named, statement, body, position = _view_name(text, tree, view)
    root = re.match(r"[A-Za-z_]\w*", named).group(0)
    last = statement
    for later in body[position + 1:]:
        if isinstance(later, ast.Return):
            break
        if any(isinstance(node, ast.Name) and node.id == root for node in ast.walk(later)):
            last = later
    end = _span(text, last)[1]
    line_end = text.find("\n", end)
    line_end = len(text) if line_end == -1 else line_end + 1
    first = text[text.rfind("\n", 0, _span(text, statement)[0]) + 1:]
    indent = first[:len(first) - len(first.lstrip())]
    return text[:line_end] + f"{indent}{named}.{line}\n" + text[line_end:]


def _dimensioned(text: str, tree: ast.Module, edit: dict) -> tuple[str, str]:
    view = edit.get("view") or {}
    first, second = _point(edit.get("from")), _point(edit.get("to"))
    if first == second:
        raise DrawingError("A dimension is between two different points.")
    written = [_tuple(first), _tuple(second)]
    if edit.get("orientation") in ("h", "v"):
        written.append(f'orientation="{edit["orientation"]}"')
    if edit.get("offset") is not None:
        offset = float(edit["offset"])
        if not math.isfinite(offset):
            raise DrawingError("A dimension's place is a number.")
        written.append(f"offset={_number(round(offset, 1))}")
    name = view.get("name") or ""
    return _added(text, tree, view, f"dim({', '.join(written)})"), f"dimensioned its {name} view".replace("its  view", "a view")


def _round_one(text: str, tree: ast.Module, edit: dict) -> tuple[str, str]:
    view = edit.get("view") or {}
    centre = _point(edit.get("center"))
    try:
        radius, angle = float(edit.get("radius")), float(edit.get("angle", 45.0))
    except (TypeError, ValueError):
        raise DrawingError("A circle's size is a number.") from None
    if not (radius > 0 and math.isfinite(radius) and math.isfinite(angle)):
        raise DrawingError("A circle's size is more than zero.")
    verb = "radius" if edit.get("kind") == "radius" else "diameter"
    # The size picks the circle among any others on that centre, and the drawing checks it against the part.
    written = [_tuple(centre), f"size={_number(radius if verb == 'radius' else 2 * radius)}"]
    if abs(angle - 45.0) > 0.5:
        written.append(f"angle={_number(round(angle))}")
    name = view.get("name") or ""
    words = f"gave the {verb} of a {'hole' if verb == 'diameter' else 'round'} on its {name} view"
    return _added(text, tree, view, f"{verb}({', '.join(written)})"), words.replace("its  view", "a view")


def edit(text: str, change: dict) -> tuple[str, str]:
    """The drawing's script with one change made on its sheet, and what it did, in words:
    ``move`` a view (or the views ``three_views`` placed together) ``by`` sheet millimetres;
    ``delete`` the dimension whose call ends at ``end``; ``dim`` between two model points of a view,
    ``orientation`` and ``offset`` where it was placed; ``diameter`` or ``radius`` of a circle seen
    round; ``splice`` hunks back (Undo) or again (Redo)."""
    kind = change.get("kind")
    if kind == "splice":
        made = _splice(text, change.get("hunks") or [])
        words = "took back a change to its sheet" if change.get("undo") else "made a change to its sheet again"
    else:
        tree = ast.parse(text)
        if kind == "move":
            made, words = _moved(text, tree, change)
        elif kind == "delete":
            made, words = _deleted(text, tree, change)
        elif kind == "dim":
            made, words = _dimensioned(text, tree, change)
        elif kind in ("diameter", "radius"):
            made, words = _round_one(text, tree, change)
        else:
            raise DrawingError("The sheet does not make that change.")
    try:
        ast.parse(made)
    except SyntaxError:
        raise DrawingError("That change would break the drawing's script. Ask the agent to make it.") from None
    return made, words
