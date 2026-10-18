"""Open a STEP document and pick the part occurrence a verb works on, for ``cadgen fea`` and ``cadgen cam``.

Stdlib only at import: :func:`cadgen.step_scene.read_scene` loads the kernel when it is called.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from cadgen.step_scene import Selection, StepScene

__all__ = ["open_scene", "pick_occurrence"]


def open_scene(target: Path) -> "StepScene":
    """The document at ``target`` (a .step or .stp), opened as a scene."""
    from cadgen._internal.doors import STEP_SUFFIXES, document_target
    from cadgen.step_scene import read_scene

    return read_scene(document_target(target, suffixes=STEP_SUFFIXES))


def resolve_one(scene: "StepScene", ref: str) -> "Selection":
    """The one selection ``ref`` names: ``scene.resolve`` answers one per ref on a line, and a study's face, a
    fixture's or an ``--occurrence`` is one."""
    selections = scene.resolve(ref)
    if len(selections) != 1:
        raise ValueError(f"{ref} names {len(selections)} references; give one")
    return selections[0]


def pick_occurrence(scene: "StepScene", occurrence: str | None) -> "Selection":
    """The occurrence ``--occurrence`` names, else the document's only part (an error naming the choices if it has
    several)."""
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
