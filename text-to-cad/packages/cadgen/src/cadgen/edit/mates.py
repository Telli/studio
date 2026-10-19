"""Mates, as SolidWorks' Mate places the parts of an assembly.

Two faces or edges are picked on two parts: the first part stays, the second is moved to it by a
pair of build123d rigid joints written in the assembly's script, each on the face or edge picked
(found again by selector each run), so the mate holds as the parts change::

    RigidJoint("coincident1", base_part, Location(Plane(base_part.faces().sort_by(Axis.Z)[-1])))
    RigidJoint("coincident1", pin_part, Location(-Plane(pin_part.faces().sort_by(Axis.Z)[0])))
    base_part.joints["coincident1"].connect_to(pin_part.joints["coincident1"])

Coincident puts two flat faces face to face, Distance a gap apart; Concentric puts two round faces
(or circular edges) on one axis, and two circular edges centre on centre, as a pin seats in a
hole. What a mate leaves free stays as the part was: where it is along the face or the axis, and
how it is turned about it (``* Pos(...) * Rot(...)`` on the first part's joint). The joints are
labelled with the mate's name (Coincident1), which the design tree lists under Mates.
"""

from __future__ import annotations

import ast
import math
import re

import build123d as B

from cadgen.edit import commands

MATES = {"coincident": "Coincident", "concentric": "Concentric", "distance": "Distance"}
_LABEL = re.compile(r"^(coincident|concentric|distance)(\d+)$")


class MateError(Exception):
    """A mate that cannot be made, said to the engineer."""


def assembly_of(tree: ast.Module):
    """The assembly's function, its ``return Compound(children=[...])`` and that list."""
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for statement in node.body:
            if isinstance(statement, ast.Return) and commands._call_name(statement.value) == "Compound":
                call = statement.value
                children = next((keyword.value for keyword in call.keywords if keyword.arg == "children"), call.args[0] if call.args else None)
                if isinstance(children, ast.List):
                    return node, statement, children
    raise MateError("Mates place the parts an assembly returns as Compound(children=[...]). Ask the agent to write it that way.")


def _occurrence(selector) -> int | None:
    """Which part of the assembly a selector names (``o1.2.f3``: the second), from 0."""
    match = re.match(r"^o\d+\.(\d+)\.", str(selector or ""))
    return int(match.group(1)) - 1 if match else None


def _picked(children: list, item: dict, scale: float) -> tuple[int, str, int]:
    """Which part a pick is on, and which face or edge of it: (part, kind, number)."""
    kind, _number = commands.selector_ordinal(item.get("selector"))
    if kind is None:
        raise MateError("Pick faces or edges on the parts to mate.")
    tolerance = 1e-4 + 1e-6 * scale
    found = []
    for index, child in enumerate(children):
        topology = commands.Topology(child, kind)
        for candidate in range(1, len(topology) + 1):
            if commands._distance(topology.describe(candidate), item, tolerance) is not None:
                found.append((index, candidate))
                break
    if not found:
        raise MateError("A pick is not on the assembly as it is now. Wait for it to update, then pick it again.")
    hint = _occurrence(item.get("selector"))
    index, number = next((each for each in found if each[0] == hint), found[0])
    return index, kind, number


def _place(item, kind: str) -> tuple[str, B.Location]:
    """What a pick stands for to a mate, and where: a flat face's plane, a round face's axis, a
    circular edge's centre and axis."""
    if kind == "face":
        if item.geom_type == B.GeomType.PLANE:
            return "plane", B.Location(B.Plane(item))
        if item.geom_type in (B.GeomType.CYLINDER, B.GeomType.CONE):
            return "axis", item.axis_of_rotation.location
    elif item.geom_type == B.GeomType.CIRCLE:
        return "circle", B.Axis(item.arc_center, item.normal()).location
    raise MateError("A mate takes flat faces, round faces and circular edges.")


def _code(what: str, picked: str, flipped: bool, names) -> str:
    """A pick's place as the joint is written: a face's plane (turned over with a minus), a round
    face's axis, a circular edge's centre and axis (turned over by ``* Rot(180, 0, 0)``)."""
    if what == "plane":
        return f"{names('Location')}({'-' if flipped else ''}{names('Plane')}({picked}))"
    placed = f"{picked}.axis_of_rotation.location" if what == "axis" else f"{names('Axis')}({picked}.arc_center, {picked}.normal()).location"
    return f"{placed} * {names('Rot')}(180, 0, 0)" if flipped else placed


def _turned(place: B.Location, what: str, flipped: bool) -> B.Location:
    if what == "plane":
        return B.Location(-B.Plane(place)) if flipped else place
    return place * B.Rot(180, 0, 0) if flipped else place


def labels(text: str) -> list[str]:
    """The mates' names the script holds, as its joints are labelled (``coincident1``)."""
    return sorted({node.value for node in ast.walk(ast.parse(text)) if isinstance(node, ast.Constant) and isinstance(node.value, str)
                   and _LABEL.match(node.value)})


def read(text: str, components=()) -> list[dict]:
    """The mates in an assembly's script, in order: each joint pair's connection, by its label, and
    the parts it places by the part functions (``components``) their names were made by."""
    try:
        tree = ast.parse(text)
        function, _returned, _children = assembly_of(tree)
    except (SyntaxError, MateError):
        return []
    made_by = {}
    for statement in function.body:
        if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
            called = [commands._call_name(node) for node in ast.walk(statement.value) if isinstance(node, ast.Call)]
            part = next((name for name in called if name in components), None)
            if part:
                made_by[statement.targets[0].id] = part
    found = []
    for statement in function.body:
        call = statement.value if isinstance(statement, ast.Expr) else None
        if commands._call_name(call) != "connect_to" or not isinstance(call.func, ast.Attribute):
            continue
        fixed = _joint_of(call.func.value)
        moving = _joint_of(call.args[0]) if call.args else None
        if fixed is None or moving is None or fixed[1] != moving[1] or not _LABEL.match(fixed[1]):
            continue
        kind, number = _LABEL.match(fixed[1]).groups()
        found.append({"name": f"{MATES[kind]}{number}", "label": fixed[1], "type": kind,
                      "parts": [made_by.get(fixed[0], fixed[0]), made_by.get(moving[0], moving[0])], "line": statement.lineno})
    return found


def _joint_of(node) -> tuple[str, str] | None:
    """``base_part.joints["coincident1"]`` as (part, label)."""
    if (isinstance(node, ast.Subscript) and isinstance(node.value, ast.Attribute) and node.value.attr == "joints"
            and isinstance(node.value.value, ast.Name) and isinstance(node.slice, ast.Constant) and isinstance(node.slice.value, str)):
        return node.value.value.id, node.slice.value
    return None


def delete(text: str, label: str) -> str:
    """The script with a mate's joints and its connection taken out: its part goes back where it was."""
    tree = ast.parse(text)
    function, _returned, _children = assembly_of(tree)
    gone = []
    for statement in function.body:
        mentioned = {node.value for node in ast.walk(statement) if isinstance(node, ast.Constant) and isinstance(node.value, str)}
        if label in mentioned and isinstance(statement, ast.Expr):
            gone.append(statement)
    if not gone:
        raise MateError(f"{label} is no longer in the assembly. Look again.")
    lines = text.splitlines(keepends=True)
    for statement in sorted(gone, key=lambda each: each.lineno, reverse=True):
        del lines[statement.lineno - 1:statement.end_lineno]
    return "".join(lines)


def change(text: str, assembly, spec: dict, units: str, components: list[str]) -> tuple[str, int, str]:
    """The script with a mate added: ``spec`` has its ``type``, the two picks (``selection``, the
    second's part moved to the first's), a Distance's ``distance`` in the part's units and ``flip``
    to turn the moved part the other way. ``components`` are the part functions the assembly
    calls, in order. Returns the text, the line of its connection and what it did, in words."""
    kind = str(spec.get("type") or "").lower()
    if kind not in MATES:
        raise MateError("A mate is Coincident, Concentric or Distance.")
    picks = [item for item in spec.get("selection") or [] if isinstance(item, dict)]
    if len(picks) != 2:
        raise MateError("Pick a face or an edge on each of two parts.")
    tree = ast.parse(text)
    function, returned, listed = assembly_of(tree)
    children = list(getattr(assembly, "children", []) or [])
    if len(children) != len(listed.elts):
        raise MateError("The assembly's parts are not the ones its Compound lists. Ask the agent to list them there.")
    scale = assembly.bounding_box().diagonal or 1.0
    (first, first_kind, first_number), (second, second_kind, second_number) = (_picked(children, item, scale) for item in picks)
    if first == second:
        raise MateError("Pick the faces or edges on two different parts.")
    fixed_item = commands.Topology(children[first], first_kind).item(first_number)
    moving_item = commands.Topology(children[second], second_kind).item(second_number)
    fixed_what, fixed_place = _place(fixed_item, first_kind)
    moving_what, moving_place = _place(moving_item, second_kind)
    planes = fixed_what == moving_what == "plane"
    if kind in ("coincident", "distance") and not planes:
        raise MateError(f"{MATES[kind]} puts two flat faces together. Pick a flat face on each part.")
    if kind == "concentric" and (fixed_what == "plane" or moving_what == "plane"):
        raise MateError("Concentric puts two round faces or circular edges on one axis. Pick one on each part.")
    # The moved part's place turned over or not: face to face for flat faces, and for an axis the
    # way it points now, unless Flip asks for the other.
    if planes:
        flipped = True
    else:
        unturned = B.Plane(fixed_place.inverse() * moving_place)
        flipped = unturned.z_dir.Z < 0
    if spec.get("flip") in (True, "true", "1", 1):
        flipped = not flipped
    # Where the moved part's place is now, seen from the first part's: what the mate leaves free stays.
    seen = B.Plane(fixed_place.inverse() * _turned(moving_place, moving_what, flipped))
    unit = 25.4 if units == "in" else 1.0
    along = [seen.origin.X / unit, seen.origin.Y / unit, seen.origin.Z / unit]
    turn = math.degrees(math.atan2(seen.x_dir.Y, seen.x_dir.X))
    if kind == "coincident":
        along[2] = 0.0
    elif kind == "distance":
        try:
            gap = float(str(spec.get("distance") or "").strip())
        except ValueError:
            raise MateError("Type the distance as a number.") from None
        if gap < 0:
            raise MateError("A distance is 0 or more; Flip turns the part the other way.")
        along[2] = gap
    elif fixed_what == "circle" and moving_what == "circle":
        along = [0.0, 0.0, 0.0]  # centre on centre, as a pin seats in a hole
    else:
        along[0] = along[1] = 0.0
    # The parts named in the script: each in the Compound as a name, or given one before the return.
    module, named_import = commands.build123d_names(tree)
    names = commands.Names(module or "")
    edits = commands.Edits(text)
    indent = " " * returned.col_offset
    lines: list[str] = []
    variables = []
    for index in (first, second):
        element = listed.elts[index]
        if isinstance(element, ast.Name):
            variables.append(element.id)
            continue
        wanted = components[index] if index < len(components) else f"part{index + 1}"
        var = commands.fresh_name(tree, f"{wanted}_part")
        while var in variables:
            var = commands.fresh_name(tree, f"{var}_2")
        lines.append(f"{indent}{var} = {ast.get_source_segment(text, element)}")
        edits.put(element.lineno, element.col_offset, var, until=element.end_col_offset)
        variables.append(var)
    fixed_var, moving_var = variables
    taken = labels(text)
    label = next(f"{kind}{n}" for n in range(1, 1000) if f"{kind}{n}" not in taken)
    fixed_code = commands.Selections(children[first], fixed_var, names).write(first_kind, [first_number], one=True)
    moving_code = commands.Selections(children[second], moving_var, names).write(second_kind, [second_number], one=True)
    writer = _Lengths(tree, units)
    shift = ""
    if any(abs(value) > 1e-9 for value in along):
        given = [writer.length(value) for value in along]
        shift = f" * {names('Pos')}({', '.join(given if abs(along[2]) > 1e-9 else given[:2])})"
    if abs(turn) > 1e-6:
        shift += f" * {names('Rot')}(0, 0, {commands._number(round(turn, 6), False)})"
    lines += [
        f'{indent}{names("RigidJoint")}("{label}", {fixed_var}, {_code(fixed_what, fixed_code, False, names)}{shift})',
        f'{indent}{names("RigidJoint")}("{label}", {moving_var}, {_code(moving_what, moving_code, flipped, names)})',
        f'{indent}{fixed_var}.joints["{label}"].connect_to({moving_var}.joints["{label}"])',
    ]
    edits.after(returned.lineno - 1, lines)
    body = _Tree(tree)
    added = commands._imports(edits, body, module, named_import, names)
    made = edits.apply()
    line = returned.lineno - 1 + len(lines) + added
    name = f"{MATES[kind]}{label[len(kind):]}"
    words = {"coincident": "face to face", "distance": f"{commands._number(along[2], False)} {units or 'mm'} apart",
             "concentric": "centre on centre" if fixed_what == moving_what == "circle" else "on one axis"}[kind]
    return made, line, f"{name}: {components[second] if second < len(components) else 'a part'} {words} with {components[first] if first < len(components) else 'a part'}"


class _Tree:
    """What ``commands._imports`` reads of a file: its parsed tree."""

    def __init__(self, tree: ast.Module):
        self.tree = tree


class _Lengths:
    """Lengths in the part's units, as its other lines write them: ``.5*INCH`` in an inch part."""

    def __init__(self, tree: ast.Module, units: str):
        self.units = units
        self.unit = commands.unit_name(tree) if units == "in" else None

    def length(self, value: float) -> str:
        value = round(value, 6)
        if self.units == "in":
            return f"{commands._number(value, False)}*{self.unit}" if self.unit else commands._number(value * 25.4, False)
        return commands._number(value, False)
