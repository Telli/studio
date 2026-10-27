"""Open a part's document as a scene, and pick the occurrence a verb works on: what ``cadgen fea``,
``cadgen cam``, ``cadgen manufacturing``, work instructions and drawings read a part through.

A document is a ``.step``/``.stp`` or ``.xbf`` file, read in this process (``engine.document.Loaded``),
or a cadgen 0.8 document id (a model's, which ``python model.py`` prints, or a file's), which the
engine holds: it is exported once to an xbf in a temporary folder and read the same way, so a model's
document needs no file of its own.

Studio-owned. cadgen 0.8 removed 0.7's ``step_scene`` (``read_scene`` and ``StepScene``); a scene here
keeps the small surface Studio's tools use of one: ``leaves()``, ``roots`` and ``resolve(ref)``, and
occurrences and selections with ``ref``, ``kind``, ``occurrence_ref``, ``ordinal``, ``label``,
``children``, ``shape()`` and ``entities(kind)``.

``resolve`` reads both grammars. The engine's (``cadgen.engine.refs``): ``plate/face 17``, ``face 17``,
``f:plate.body.3``, a file or a document id first (``<id>#face 1``). And 0.7's (``cad_ref_syntax``):
``#o1.f17``, ``#o1.2``, ``part.step#o1.f1,o1.f2``, ``#bracket.f3``, which the study and job files
already in projects carry. Both number a part's elements by ``TopExp.MapShapes`` (``entity_ordinals``),
so a face is one ordinal in either. The refs a scene hands out are 0.7's (``#o1.f17``): the results'
sidecars and the viewer's FEA and CAM layers key faces by them.

Stdlib only at import: the kernel loads when a document is opened.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

__all__ = ["DOCUMENT_SUFFIXES", "Occurrence", "Scene", "Selection", "open_scene", "pick_occurrence", "resolve_one"]

#: The files a scene opens; anything else is a document id or refused.
DOCUMENT_SUFFIXES = (".step", ".stp", ".xbf")

_LETTERS = {"shape": "s", "face": "f", "edge": "e", "vertex": "v"}
# 0.7 selectors the 0.7 grammar reads; a bare label or anything else is read as the engine's grammar.
_NUMBERED = frozenset({"occurrence", "shape", "face", "edge", "vertex"})


def open_scene(source: Any) -> "Scene":
    """The document ``source`` names, opened as a scene: a STEP or xbf path, or a document id.

    A missing file is a ``FileNotFoundError``, a file of another kind or one the kernel cannot read a
    ``ValueError``; an id the engine holds no document for raises as the engine refuses it."""
    from cadgen.engine.ids import is_id

    text = os.fspath(source)
    if is_id(text):
        return _held(text)
    path = Path(text).expanduser().resolve()
    if path.suffix.lower() not in DOCUMENT_SUFFIXES:
        raise ValueError(f"{path.name} is no part document: open a .step, .stp or .xbf, or a model's document id "
                         "(what `python model.py` prints)")
    if not path.is_file():
        raise FileNotFoundError(f"no document at {path}")
    return _read(path, str(path), path.stem)


def _read(path: Path, document: str, stem: str) -> "Scene":
    from cadgen._internal.kernel_messages import kernel_messages_on_stderr
    from cadgen.engine.document import Loaded

    with kernel_messages_on_stderr():  # a STEP reader's diagnostics are no part of a command's JSON
        loaded = Loaded(path)
    # A file of several free shapes is read under a root of the file's own making: no occurrence of it.
    return Scene(document, stem, loaded.structure(), {p.key: p.shape for p in loaded.prototypes},
                 top=() in loaded.worlds)


def _held(ident: str) -> "Scene":
    """A document the engine holds, by its id: exported to an xbf (the engine's own names, colours and
    element names, losslessly) and read from it."""
    import tempfile

    from cadgen.engine.api import export

    with tempfile.TemporaryDirectory(prefix="cadgen-scene-") as folder:
        written = Path(folder) / "document.xbf"
        export(ident, written, progress=False)
        scene = _read(written, ident, ident)
    scene.stem = str(scene.structure.get("name") or ident)
    return scene


def resolve_one(scene: "Scene", ref: str) -> "Selection":
    """The one selection ``ref`` names: ``scene.resolve`` answers one per ref on a line, and a study's face,
    a fixture's or an ``--occurrence`` is one."""
    selections = scene.resolve(ref)
    if len(selections) != 1:
        raise ValueError(f"{ref} names {len(selections)} references; give one")
    return selections[0]


def pick_occurrence(scene: "Scene", occurrence: str | None) -> "Selection":
    """The occurrence ``--occurrence`` names, else the document's only part (an error naming the choices if it
    has several)."""
    if occurrence:
        owner = resolve_one(scene, occurrence)
        if owner.kind != "occurrence":
            raise ValueError(f"{occurrence} is not an occurrence reference")
        return owner
    leaves = list(scene.leaves())
    if len(leaves) != 1:
        raise ValueError(
            f"the document has {len(leaves)} part occurrences; pass --occurrence "
            f"{' or '.join(leaf.ref for leaf in leaves[:4])}{' ...' if len(leaves) > 4 else ''}"
        )
    return leaves[0]


@dataclass(frozen=True)
class Selection:
    """An occurrence, or one element of a part occurrence, in one scene; ``shape()`` is an owned copy."""

    _scene: "Scene" = field(repr=False)
    occurrence_ref: str
    kind: str  # occurrence, shape, face, edge or vertex
    _ordinal: int | None = None

    @property
    def ordinal(self) -> int | None:
        """The element's 1-based ordinal in its part (``f17`` is 17); None for an occurrence."""
        return self._ordinal

    @property
    def ref(self) -> str:
        """Its 0.7 ref: ``#o1.2`` for an occurrence, ``#o1.2.f17`` for an element."""
        if self.kind == "occurrence":
            return self.occurrence_ref
        return f"{self.occurrence_ref}.{_LETTERS[self.kind]}{self._ordinal}"

    def shape(self) -> Any:
        """Its geometry in the document's frame, a build123d shape the caller owns, labelled and coloured as
        its occurrence is. An assembly occurrence is an unfused compound of the parts below it."""
        from cadgen.engine.colors import color
        from cadgen.geometry import _cast, _copy

        result = _cast(_copy(self._scene._placed(self)))
        occurrence = self._scene._occurrences[self.occurrence_ref]
        result.label = occurrence.label or ""
        if occurrence._color is not None:
            result.color = color(occurrence._color)
        return result

    def entities(self, kind: str) -> Iterator["Selection"]:
        """Its elements of ``kind`` (shape, face, edge or vertex), each numbered in its part: an occurrence's
        all, an element's own (a face's edges keep their part's edge ordinals)."""
        if kind not in _LETTERS:
            raise ValueError(f"unknown entity kind: {kind!r}")
        yield from self._scene._entities(self, kind)


@dataclass(frozen=True)
class Occurrence(Selection):
    """A part or an assembly where the document places it."""

    _entry: dict = field(default_factory=dict, repr=False, compare=False)
    _color: Any = field(default=None, repr=False, compare=False)
    _children: list = field(default_factory=list, repr=False, compare=False)

    @property
    def label(self) -> str | None:
        return self._entry.get("name") or None

    @property
    def prototype_id(self) -> str | None:
        """The geometry it shares with the other placements of the same part (``p1``); None for an assembly."""
        index = self._entry.get("prototype")
        return None if index is None else f"p{index + 1}"

    @property
    def children(self) -> tuple["Occurrence", ...]:
        return tuple(self._children)

    @property
    def path(self) -> str:
        """Its canonical ref in the engine's grammar (``kit/post``): what ``cadgen inspect`` names it by, and
        what a snapshot's ``hidden`` takes."""
        return self._scene._owner(self)


class Scene:
    """One document's occurrences and elements as they are now. ``document`` is the file's path or the
    document's id; ``stem`` what a tool's outputs are named after: a file's stem, a held document's name."""

    def __init__(self, document: str, stem: str, structure: dict[str, Any], shapes: dict[str, Any], *,
                 top: bool) -> None:
        self.document = document
        self.stem = stem
        self.structure = structure
        self._shapes = shapes
        self._maps: dict[tuple[str, str], Any] = {}
        self._occurrences: dict[str, Occurrence] = {}
        self._by_entry: dict[int, Occurrence] = {}
        prototypes, instances = structure["prototypes"], structure["instances"]

        def visit(entry: dict[str, Any], ref: str) -> Occurrence:
            if "prototype" in entry:
                instance = instances[entry["instance"]]
                rgba = instance.get("color") or prototypes[entry["prototype"]].get("color")
            else:
                rgba = None
            occurrence = Occurrence(self, ref, "occurrence", _entry=entry, _color=rgba)
            self._occurrences[ref] = occurrence
            self._by_entry[id(entry)] = occurrence
            for at, child in enumerate(entry.get("children") or (), 1):
                occurrence._children.append(visit(child, f"{ref}.{at}"))
            return occurrence

        tree = structure["tree"]
        # 0.7 numbered occurrences by their place from the file's free shapes: ``#o1`` the first, ``#o1.2``
        # its second component. A file of several free shapes has a root of the reader's own above them.
        if top:
            self._roots = (visit(tree, "#o1"),)
        else:
            self._roots = tuple(visit(child, f"#o{at}") for at, child in enumerate(tree.get("children") or (), 1))
        self._leaves = tuple(o for o in self._occurrences.values() if "prototype" in o._entry)
        self._tree: Any = None

    @property
    def name(self) -> str:
        """The document as messages name it: a file's name, or the id it was opened by."""
        return os.path.basename(self.document)

    @property
    def roots(self) -> tuple[Occurrence, ...]:
        return self._roots

    def leaves(self) -> Iterator[Occurrence]:
        """The part occurrences, in the document's order; a part may hold several solids."""
        return iter(self._leaves)

    def resolve(self, ref: str) -> tuple[Selection, ...]:
        """What a ref line names: one selection per selector on it, in order (see the module for both
        grammars). A ``FILE`` before the ``#`` must name this document. Every selector must name one thing,
        or this raises ``ValueError`` saying why."""
        from cadgen._internal.cad_ref_syntax import parse_selector_list, split_cad_ref
        from cadgen.engine import refs

        prefix, text = split_cad_ref(ref)
        parsed = parse_selector_list(text)
        if parsed and all(p is not None and p.selector_type in _NUMBERED for p in parsed):
            refs.check_file(prefix or None, Path(self.document))
            return tuple(self._numbered(p) for p in parsed if p is not None)
        return tuple(self._hit(hit) for hit in refs.resolve_structure(self.structure, ref, Path(self.document)))

    def _owner(self, occurrence: Occurrence) -> str:
        from cadgen.engine import refs

        if self._tree is None:
            root = refs.structure_tree(self.structure)
            self._tree = (root, {id(node.payload): node for node in root.walk()})
        root, nodes = self._tree
        return refs.owner_text(root, nodes[id(occurrence._entry)])

    def _numbered(self, parsed: Any) -> Selection:
        """A 0.7 selector resolved: an occurrence by its position or its label, then an element by ordinal."""
        ref = "#" + parsed.canonical
        if parsed.label:
            named = [o for o in self._occurrences.values() if o.label == parsed.label]
            if len(named) != 1:
                raise ValueError(f"{ref!r}: {parsed.label!r} names {len(named)} occurrences"
                                 + (f" ({', '.join(o.ref for o in named)}); use one of their refs" if named else ""))
            occurrence = named[0]
        elif parsed.occurrence_id:
            found = self._occurrences.get("#" + parsed.occurrence_id)
            if found is None:
                raise ValueError(f"unknown occurrence: #{parsed.occurrence_id}")
            occurrence = found
        else:
            if len(self._leaves) != 1:
                raise ValueError(f"{ref!r} needs an occurrence prefix in an assembly")
            occurrence = self._leaves[0]
        if parsed.selector_type == "occurrence":
            return occurrence
        below = [leaf for leaf in self._leaves if leaf.ref.startswith(occurrence.ref + ".")]
        if "prototype" not in occurrence._entry and len(below) == 1:
            # An element of an assembly holding one part is that part's, as the engine's grammar reads it: a
            # model's document of one part is its root assembly with the part below it (``#o1.1``).
            occurrence = below[0]
        return self._element(occurrence, parsed.selector_type, parsed.ordinal, ref)

    def _hit(self, hit: Any) -> Selection:
        """What the engine's grammar named (``refs.Hit``), as this scene's occurrence or element."""
        occurrence = self._by_entry.get(id(hit.node.payload))
        if occurrence is None:
            raise ValueError(f"{hit.ref or self.name} names the whole file of several parts; name one of them "
                             f"({', '.join(root.ref for root in self._roots)})")
        if hit.kind is None:
            return occurrence
        return self._element(occurrence, hit.kind, hit.ordinal, hit.ref)

    def _element(self, occurrence: Occurrence, kind: str, ordinal: int | None, ref: str) -> Selection:
        if "prototype" not in occurrence._entry:
            raise ValueError(f"{occurrence.ref} is a group; enumerate its entities or specify a leaf occurrence")
        size = self._size(occurrence, kind)
        if ordinal is None or not 1 <= ordinal <= size:
            raise ValueError(f"unknown {kind} reference: {ref!r} (available: 1..{size})")
        return Selection(self, occurrence.ref, kind, ordinal)

    def _prototype(self, occurrence: Occurrence) -> Any:
        """A part occurrence's geometry at its own origin, the shape its ordinals number."""
        from cadgen.engine.mesh import read_shape

        key = self.structure["prototypes"][occurrence._entry["prototype"]]["key"]
        shape = self._shapes[key]
        if isinstance(shape, (bytes, bytearray)):
            shape = self._shapes[key] = read_shape(shape)
        return shape

    def _table(self, occurrence: Occurrence, kind: str) -> Any:
        from cadgen._internal.entity_ordinals import entity_map, shape_entities

        key = (self.structure["prototypes"][occurrence._entry["prototype"]]["key"], kind)
        if key not in self._maps:
            prototype = self._prototype(occurrence)
            self._maps[key] = shape_entities(prototype) if kind == "shape" else entity_map(prototype, kind)
        return self._maps[key]

    def _size(self, occurrence: Occurrence, kind: str) -> int:
        table = self._table(occurrence, kind)
        return len(table) if kind == "shape" else table.Extent()

    def _local(self, selection: Selection) -> Any:
        occurrence = self._occurrences[selection.occurrence_ref]
        if selection.kind == "occurrence":
            return self._prototype(occurrence)
        table = self._table(occurrence, selection.kind)
        return table[selection.ordinal - 1] if selection.kind == "shape" else table.FindKey(selection.ordinal)

    def _placed(self, selection: Selection) -> Any:
        """A selection's geometry where its occurrence stands: its part's placement in the document."""
        occurrence = self._occurrences[selection.occurrence_ref]
        if "prototype" not in occurrence._entry:
            from OCP.BRep import BRep_Builder
            from OCP.TopoDS import TopoDS_Compound

            compound, builder = TopoDS_Compound(), BRep_Builder()
            builder.MakeCompound(compound)
            for child in occurrence.children:
                builder.Add(compound, self._placed(child))
            return compound
        local = self._local(selection)
        location = _location(self.structure["instances"][occurrence._entry["instance"]]["matrix"])
        return local.Moved(location) if location is not None else local

    def _entities(self, selection: Selection, kind: str) -> Iterator[Selection]:
        from cadgen._internal.entity_ordinals import entity_map

        occurrence = self._occurrences[selection.occurrence_ref]
        if "prototype" not in occurrence._entry:
            for child in occurrence.children:
                yield from self._entities(child, kind)
            return
        table = self._table(occurrence, kind)
        if selection.kind == "occurrence":
            ordinals: Any = range(1, self._size(occurrence, kind) + 1)
        elif selection.kind == kind:
            ordinals = [selection.ordinal]
        else:
            local = self._local(selection)
            if kind == "shape":
                ordinals = [i for i, entity in enumerate(table, 1) if entity.IsSame(local)]
            else:
                subset = entity_map(local, kind)
                ordinals = [table.FindIndex(subset.FindKey(i)) for i in range(1, subset.Extent() + 1)]
        for ordinal in ordinals:
            yield Selection(self, occurrence.ref, kind, ordinal)


def _location(matrix: list[float]) -> Any:
    """A placement (4x4, column-major, as the structure holds it) as a ``TopLoc_Location``; None for the
    identity."""
    if [round(value, 12) for value in matrix] == [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]:
        return None
    from OCP.gp import gp_Trsf
    from OCP.TopLoc import TopLoc_Location

    m = matrix
    trsf = gp_Trsf()
    trsf.SetValues(m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13], m[2], m[6], m[10], m[14])
    return TopLoc_Location(trsf)
