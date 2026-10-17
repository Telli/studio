"""A feature taken out of a part's script, as SolidWorks' Delete takes one out of the design tree.

The lines that make the feature go. A line that changes the body in place (`part += ...`,
`tray = bd.fillet(tray.edges(), ...)`) goes whole, so the body reads as it did before it. A boolean
that starts a name of its own keeps the name, as the body it was made from (`tray = outer - cavity`
becomes `tray = outer`), so the features after it still read. The sketch a feature was made from
stays, as SolidWorks keeps an absorbed sketch; a sketch of its own goes with its lines.

A line whose name a later line still uses is not taken out: the engineer is told which, and
deletes that first. The tracer then runs the part again, and puts the script back if it no longer
builds (`tracer.py`).
"""

from __future__ import annotations

import ast
from dataclasses import dataclass, field

from cadgen.edit.sketching import SketchEditError, TextEdits, find_block


class DeleteError(ValueError):
    """Why a feature is not taken out, in an engineer's words. ``dependents``: the name it makes
    and the lines that still use it, for the viewer to say as the features they are."""

    def __init__(self, message: str, dependents: dict | None = None):
        super().__init__(message)
        self.dependents = dependents


# A boolean's operators: a cut, a join, an intersect.
_BOOLEANS = (ast.Sub, ast.Add, ast.BitAnd)
_COMPOUND = (ast.For, ast.AsyncFor, ast.While, ast.If, ast.With, ast.AsyncWith, ast.Try)


@dataclass
class _Plan:
    edits: TextEdits
    # Statements taken out whole; booleans kept as one operand (statement, the operand kept).
    removed: list = field(default_factory=list)
    kept: list = field(default_factory=list)
    # The names nothing left makes.
    gone: set = field(default_factory=set)


def _function_at(tree: ast.Module, line: int):
    function = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.lineno <= line <= node.end_lineno:
            if function is None or node.lineno > function.lineno:
                function = node
    return function


def _simple(statement: ast.stmt) -> list:
    """The plain statements a statement is: itself, or those inside a loop, a condition or a with."""
    if not isinstance(statement, _COMPOUND):
        return [statement]
    inner = []
    for name in ("body", "orelse", "finalbody"):
        for each in getattr(statement, name, None) or []:
            inner += _simple(each)
    for handler in getattr(statement, "handlers", None) or []:
        for each in handler.body:
            inner += _simple(each)
    return inner


def _names(node: ast.AST, ctx=ast.Load) -> set:
    return {each.id for each in ast.walk(node) if isinstance(each, ast.Name) and isinstance(each.ctx, ctx)}


def _module_names(tree: ast.Module) -> set:
    """The names a module makes at its own level: its imports, sizes, functions and classes."""
    names = set()
    for statement in tree.body:
        if isinstance(statement, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(statement.name)
        elif isinstance(statement, (ast.Import, ast.ImportFrom)):
            names |= {(alias.asname or alias.name).split(".")[0] for alias in statement.names}
        elif isinstance(statement, ast.Assign):
            names |= set().union(*(_names(target, ast.Store) for target in statement.targets))
        elif isinstance(statement, (ast.AnnAssign, ast.AugAssign)):
            names |= _names(statement.target, ast.Store)
    return names


def _remove(plan: _Plan, body: list, statement: ast.stmt, title: str) -> None:
    for other in body:
        if other is not statement and other.lineno <= statement.end_lineno and statement.lineno <= other.end_lineno:
            raise DeleteError(f"{title} shares its line with another statement. Ask the agent to remove it.")
    plan.edits.remove_lines(statement.lineno, statement.end_lineno)
    plan.removed.append(statement)
    plan.gone |= _names(statement, ast.Store)


def _take(plan: _Plan, body: list, statement: ast.stmt, lines: set, title: str, text: str) -> None:
    """One statement of the feature taken out, or a boolean kept as the body it was made from."""
    if isinstance(statement, _COMPOUND):
        # A loop or a condition goes whole only when every line in it is the feature's.
        if not all(any(each.lineno <= line <= each.end_lineno for line in lines) for each in _simple(statement)):
            raise DeleteError(f"{title} is made in a loop or a condition with other lines. Ask the agent to remove it.")
        _remove(plan, body, statement, title)
        return
    if isinstance(statement, ast.AugAssign) and isinstance(statement.target, ast.Name):
        _remove(plan, body, statement, title)
        plan.gone.discard(statement.target.id)  # the body it changed is still made before it
        return
    if isinstance(statement, ast.Assign) and len(statement.targets) == 1 and isinstance(statement.targets[0], ast.Name):
        name, value = statement.targets[0].id, statement.value
        if name in _names(value):
            # The name changed in place (`tray = bd.fillet(tray.edges(), ...)`): it reads as before.
            _remove(plan, body, statement, title)
            plan.gone.discard(name)
            return
        if isinstance(value, ast.BinOp) and isinstance(value.op, _BOOLEANS):
            # A boolean that starts a name keeps the name, as the body it was made from: a cut's
            # left side, or the side of a join this feature did not make.
            kept = value.left
            if not isinstance(value.op, ast.Sub) and _names(value.left) & plan.gone and not _names(value.right) & plan.gone:
                kept = value.right
            plan.edits.replace_node(value, ast.get_source_segment(text, kept) or "")
            plan.kept.append((statement, kept))
            dropped = value.right if kept is value.left else value.left
            plan.gone |= _names(dropped, ast.Store)  # a `name := ...` in the side that went
            return
        _remove(plan, body, statement, title)
        return
    if isinstance(statement, ast.Expr):
        _remove(plan, body, statement, title)
        return
    raise DeleteError(f"{title} is made by a line edit mode cannot take out. Ask the agent to remove it.")


def _check_uses(plan: _Plan, scope: ast.AST, tree: ast.Module, title: str) -> None:
    """Refuses when a line left still uses a name only the feature made."""
    if not plan.gone:
        return
    skip = {id(node) for statement in plan.removed for node in ast.walk(statement)}
    for statement, kept in plan.kept:
        skip |= {id(node) for node in ast.walk(statement.value)} - {id(node) for node in ast.walk(kept)}
    # Where each name is still made: the module's names and the function's arguments from the start.
    made: dict[str, list[int]] = {}
    if scope is not tree:
        for name in _module_names(tree):
            made.setdefault(name, []).append(0)
        for argument in [*scope.args.posonlyargs, *scope.args.args, *scope.args.kwonlyargs]:
            made.setdefault(argument.arg, []).append(0)
    uses: dict[str, list[int]] = {}
    for node in ast.walk(scope):
        if id(node) in skip:
            continue
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            made.setdefault(node.id, []).append(node.lineno)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load) and node.id in plan.gone:
            uses.setdefault(node.id, []).append(node.lineno)
        if isinstance(node, ast.AugAssign) and isinstance(node.target, ast.Name) and node.target.id in plan.gone:
            uses.setdefault(node.target.id, []).append(node.lineno)  # `x += ...` reads x first
    for name in sorted(uses):
        unmade = sorted({line for line in uses[name] if not any(at < line for at in made.get(name, []))})
        if unmade:
            said = f"line {unmade[0]}" if len(unmade) == 1 else f"lines {', '.join(map(str, unmade))}"
            raise DeleteError(f"{title} makes {name}, which {said} still use{'s' if len(unmade) == 1 else ''}. "
                              "Delete what uses it first, or ask the agent.", {"name": name, "lines": unmade})


def delete(text: str, lines: list[int], title: str, path: str = "<part>") -> tuple[str, int]:
    """``text`` with the feature made on ``lines`` taken out, and the first line that changed."""
    if not lines:
        raise DeleteError(f"{title} is not made on a line of the script. Ask the agent to remove it.")
    tree = ast.parse(text, path)
    function = _function_at(tree, min(lines))
    body = function.body if function is not None else tree.body
    chosen = {}
    for line in sorted(set(lines)):
        index = next((at for at, statement in enumerate(body) if statement.lineno <= line <= statement.end_lineno), None)
        if index is None:
            raise DeleteError(f"{title} is not made in the function that makes the part. Ask the agent to remove it.")
        chosen[index] = body[index]
    plan = _Plan(TextEdits(text))
    for index in sorted(chosen):
        _take(plan, body, chosen[index], set(lines), title, text)
    _check_uses(plan, function or tree, tree, title)
    return plan.edits.apply(), min(statement.lineno for statement in chosen.values())


def delete_sketch(text: str, line: int, title: str, path: str = "<part>") -> tuple[str, int]:
    """``text`` without the sketch made at ``line``: its `Sketch(...)` line and every line of its
    block that draws on it, relates or dimensions it."""
    try:
        block = find_block(text, line, path)
    except SketchEditError as error:
        raise DeleteError(str(error)) from None
    plan = _Plan(TextEdits(text))
    for index, statement in enumerate(block.statements):
        if index == 0 or block.var in _names(statement):
            _remove(plan, block.body, statement, title)
    _check_uses(plan, block.function or block.tree, block.tree, title)
    return plan.edits.apply(), block.first_line
